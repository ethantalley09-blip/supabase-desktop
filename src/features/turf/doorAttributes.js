// Pure logic for Door Intelligence: turns raw door_attributes rows (migration
// 0039) plus the canvass_visits history into a confidence-scored, tiered view
// of what is actually known about each physical door. No Supabase import
// (pattern: route.ts, doorstep.ts, turfBriefingMath.ts) — see
// doorAttributes.test.ts.
//
// The whole point of this module is that confidence is DERIVED, never stored:
// a tag's weight is a function of how much real evidence exists, how many
// DIFFERENT people saw it, whether anyone has since contradicted it, and how
// long ago it was last confirmed. A stored score would go stale relative to
// its own evidence and would need a nightly job to re-decay.
import { normalizeAddress } from './households';
import { streetName } from './neighborhoodProof';

export const DOOR_TAGS = [
    'no_trespassing',
    'hostile',
    'dogs',
    'gated_home',
    'hoa_community',
    'apartment',
    'senior_center'
];

// Class is the single most important field on a tag. It decides decay rate,
// evidence threshold, routing authority, and — critically — whether the AI is
// allowed to see it at all (see getRoutingAttributes below). A posted legal
// notice and a dog are not the same kind of fact.
export const TAG_CLASS = {
    no_trespassing: 'legal',
    hostile: 'safety',
    dogs: 'hazard',
    gated_home: 'access',
    hoa_community: 'access',
    apartment: 'facility',
    senior_center: 'facility'
};

export const TAG_LABELS = {
    no_trespassing: 'No trespassing',
    hostile: 'Hostile',
    dogs: 'Dogs',
    gated_home: 'Gated',
    hoa_community: 'HOA',
    apartment: 'Apartment',
    senior_center: 'Senior facility'
};

// The three tags a canvasser can't predict from the neighbours, so they stay
// visible at all times; the other four are usually inherited already.
export const HOT_TAGS = ['dogs', 'hostile', 'no_trespassing'];
export const MORE_TAGS = ['gated_home', 'hoa_community', 'apartment', 'senior_center'];

// Tags that are safe to bulk-apply to a whole street: an HOA covers a
// subdivision and a building covers its own doors. Deliberately excludes
// dogs/hostile/no_trespassing — those are parcel- or household-specific, and
// bulk-applying them would manufacture exactly the clusters streetRisk.ts
// exists to detect.
export const STREET_APPLICABLE_TAGS = ['hoa_community', 'apartment'];

// legal never decays: a posted sign is a standing legal notice, and a campaign
// should not resume knocking a posted door because nine months went by. It
// clears only by an attributed human retraction.
export const CLASS_HALF_LIFE_DAYS = {
    legal: null,
    safety: 180,
    hazard: 270,
    access: 540,
    facility: 730
};

// Conditions physically impossible to miss when standing at the door. Only
// these count a later un-tagged visit as evidence AGAINST the tag: a dog may
// be indoors, and a different household member may answer, so treating their
// absence as disconfirming would quietly destroy both signals.
export const UNMISSABLE_TAGS = new Set([
    'apartment',
    'senior_center',
    'gated_home',
    'no_trespassing'
]);

export const TIER_THRESHOLDS = { advisory: 0.3, actionable: 0.55, hard: 0.75 };

const TIER_RANK = { none: 0, advisory: 1, actionable: 2, hard: 3 };
const DAY_MS = 86_400_000;
// Saturation constant: the 9th report is worth far less than the 2nd. Tuned so
// two independent observers (E = 2.0) land at 0.57 — just over `actionable`.
const SATURATION = 1.5;

const W_DISTINCT_OBSERVER = 1.0;
const W_REPEAT_OBSERVATION = 0.35;
const W_NOTED = 0.25;
const W_STAFF_CONFIRMED = 0.5;
const W_CONTRADICTION = -0.5;
const W_SILENT_NON_CONFIRMATION = -0.15;

export function tierAtLeast(tier, minimum) {
    return TIER_RANK[tier] >= TIER_RANK[minimum];
}

/**
 * Raw evidence weight for one attribute row, before decay. Exported for the
 * Review Queue, which shows the arithmetic so a manager can sanity-check a
 * flag rather than trusting a bare number.
 */
export function evidenceWeight(attr, silentNonConfirmations = 0) {
    const distinct = attr.observer_ids?.length ?? 0;
    const repeats = Math.max(0, (attr.observation_count ?? 0) - distinct);
    let e = distinct * W_DISTINCT_OBSERVER + repeats * W_REPEAT_OBSERVATION;
    e += (attr.noted_observation_count ?? 0) * W_NOTED;
    if (attr.status === 'staff_confirmed')
        e += W_STAFF_CONFIRMED;
    e += (attr.contradiction_count ?? 0) * W_CONTRADICTION;
    if (UNMISSABLE_TAGS.has(attr.tag))
        e += silentNonConfirmations * W_SILENT_NON_CONFIRMATION;
    return e;
}

/**
 * Counts visits to this door that happened AFTER the tag was last confirmed
 * and did not re-observe it. Only meaningful for UNMISSABLE_TAGS; callers pass
 * the result straight into evidenceWeight, which ignores it otherwise.
 */
export function countSilentNonConfirmations(attr, visitsAtAddress) {
    if (!UNMISSABLE_TAGS.has(attr.tag))
        return 0;
    const confirmedAt = new Date(attr.last_confirmed_at).getTime();
    let count = 0;
    for (const v of visitsAtAddress) {
        if (new Date(v.occurred_at).getTime() <= confirmedAt)
            continue;
        if ((v.observed_attributes ?? []).includes(attr.tag))
            continue;
        count += 1;
    }
    return count;
}

/**
 * Confidence + tier for one attribute, with human-readable reasons. Every
 * score in this app ships its reasons (doorstep.ts scoreDoors,
 * turfBriefingMath.ts classifyPersuadability) and here it is non-negotiable:
 * an unexplainable safety flag is worse than no flag, because nobody can
 * check it.
 */
export function scoreAttribute(attr, opts = {}) {
    const now = opts.now ?? Date.now();
    const silent = opts.silentNonConfirmations ?? 0;
    const cls = attr.class ?? TAG_CLASS[attr.tag];
    const distinct = attr.observer_ids?.length ?? 0;
    const daysSinceConfirmed = Math.max(0, (now - new Date(attr.last_confirmed_at).getTime()) / DAY_MS);
    const reasons = [];

    // A human retraction outranks everything, including fresh evidence — the
    // trigger deliberately does not auto-revive a retracted tag.
    if (attr.status === 'retracted') {
        return {
            attribute: attr,
            class: cls,
            confidence: 0,
            tier: 'none',
            daysSinceConfirmed,
            reasons: [attr.status_reason ? `Retracted: ${attr.status_reason}` : 'Retracted by staff']
        };
    }

    const e = evidenceWeight(attr, silent);
    const base = e > 0 ? e / (e + SATURATION) : 0;
    const halfLife = CLASS_HALF_LIFE_DAYS[cls];
    const decay = halfLife === null ? 1 : Math.pow(0.5, daysSinceConfirmed / halfLife);
    const confidence = Math.max(0, Math.min(1, base * decay));

    if (distinct === 1)
        reasons.push('Reported by 1 canvasser');
    else if (distinct > 1)
        reasons.push(`Reported by ${distinct} different canvassers`);
    if ((attr.observation_count ?? 0) > distinct)
        reasons.push(`Seen ${attr.observation_count} times total`);
    if ((attr.noted_observation_count ?? 0) > 0)
        reasons.push('Backed by a written note');
    if ((attr.contradiction_count ?? 0) > 0)
        reasons.push(`Contradicted ${attr.contradiction_count}x by a later visit`);
    if (silent > 0 && UNMISSABLE_TAGS.has(attr.tag))
        reasons.push(`Not seen on ${silent} later visit${silent === 1 ? '' : 's'}`);
    if (attr.status === 'staff_confirmed')
        reasons.push('Confirmed by staff');
    if (attr.source === 'backfill')
        reasons.push('Inferred from older free-text notes — confirm on next visit');
    if (halfLife !== null && daysSinceConfirmed >= halfLife)
        reasons.push(`Last confirmed ${Math.round(daysSinceConfirmed)} days ago`);

    return {
        attribute: attr,
        class: cls,
        confidence,
        tier: resolveTier({ cls, confidence, attr, distinct }),
        daysSinceConfirmed,
        reasons
    };
}

// Two hard overrides live here rather than in the threshold table, so they
// can't be tuned away by nudging a constant:
//   1. A posted no-trespass notice is authoritative from ONE observer.
//      Waiting for a second report means knowingly sending a second person to
//      a posted door.
//   2. `hostile` can never reach `hard` on one person's word, whatever the
//      arithmetic says. One canvasser's bad afternoon must not permanently
//      mark a household.
function resolveTier({ cls, confidence, attr, distinct }) {
    if (attr.status === 'staff_confirmed')
        return 'hard';
    if (cls === 'legal')
        return 'hard';
    // Disputed = a later visit produced real contradicting evidence. It stays
    // visible but must not drive routing until a human resolves it.
    if (attr.status === 'disputed')
        return confidence >= TIER_THRESHOLDS.advisory ? 'advisory' : 'none';

    let tier = 'none';
    if (confidence >= TIER_THRESHOLDS.hard)
        tier = 'hard';
    else if (confidence >= TIER_THRESHOLDS.actionable)
        tier = 'actionable';
    else if (confidence >= TIER_THRESHOLDS.advisory)
        tier = 'advisory';

    if (cls === 'safety' && tier === 'hard' && distinct < 2)
        return 'actionable';
    return tier;
}

/** voter id -> normalized address key, for joining visits to doors. */
export function buildVoterAddressIndex(voters) {
    const index = new Map();
    for (const v of voters) {
        const addr = v.address_line?.trim();
        if (addr)
            index.set(v.id, normalizeAddress(addr));
    }
    return index;
}

/**
 * Scores every attribute against the real visit history. Returns a flat array;
 * use rollUpAddress to group. `visits` should carry observed_attributes (see
 * useCanvassVisits) — without it, silent non-confirmation simply never fires,
 * which fails safe rather than inventing disconfirmation.
 */
export function scoreAllAttributes({ attributes, visits = [], voters = [], now = Date.now() }) {
    const addressOf = buildVoterAddressIndex(voters);
    const visitsByAddress = new Map();
    for (const v of visits) {
        const key = addressOf.get(v.voter_id);
        if (!key)
            continue;
        const list = visitsByAddress.get(key) ?? [];
        list.push(v);
        visitsByAddress.set(key, list);
    }
    return attributes.map((attr) => scoreAttribute(attr, {
        now,
        silentNonConfirmations: countSilentNonConfirmations(attr, visitsByAddress.get(attr.address_key) ?? [])
    }));
}

/** Groups scored attributes into one profile per physical door. */
export function rollUpAddress(scored) {
    const byAddress = new Map();
    for (const s of scored) {
        if (s.tier === 'none')
            continue;
        const key = s.attribute.address_key;
        const existing = byAddress.get(key);
        if (existing) {
            existing.attributes.push(s);
            continue;
        }
        byAddress.set(key, {
            addressKey: key,
            streetKey: s.attribute.street_key ?? null,
            lat: s.attribute.lat ?? null,
            lng: s.attribute.lng ?? null,
            attributes: [s]
        });
    }
    for (const profile of byAddress.values()) {
        profile.attributes.sort((a, b) => b.confidence - a.confidence);
        profile.hardExclusion = profile.attributes.find((a) => a.tier === 'hard' && (a.class === 'legal' || a.class === 'safety')) ?? null;
    }
    return byAddress;
}

/**
 * THE CLASS FIREWALL. Strips safety-class attributes.
 *
 * Everything that is not an explicit safety surface must read door conditions
 * through this function — routing, ETA, scoring, snapshots, and every AI
 * payload. Structured "hostile" flags on identified households are exactly
 * the shape of data that turns into discriminatory targeting, and it happens
 * by drift and convenience, not intent: some future feature wants "all
 * signals about this door" and quietly picks up safety with the rest.
 *
 * doorAttributes.firewall.test.ts asserts the snapshot builders produce
 * identical output with and without safety tags present. Keep that test.
 */
export function getRoutingAttributes(scored) {
    return scored.filter((s) => s.class !== 'safety');
}

/** True when this door must not appear on any walk list. */
export function hasHardExclusion(profile) {
    return Boolean(profile?.hardExclusion);
}

/**
 * Tags at `actionable`+ for a door, used to pre-fill the capture chips so the
 * common case costs zero taps. Safety tags are included here deliberately —
 * this is a canvasser-facing safety surface, not a routing or AI consumer.
 */
export function inheritedTagsForAddress(profile) {
    if (!profile)
        return [];
    return profile.attributes
        .filter((a) => tierAtLeast(a.tier, 'actionable'))
        .map((a) => a.attribute.tag);
}

/**
 * Street-level inheritance for the block-scoped tags only. A gate is a parcel
 * fact and never inherits from neighbours; an HOA genuinely covers a
 * subdivision.
 */
export function inheritedStreetTags(scored, streetKey) {
    if (!streetKey)
        return [];
    const tags = new Set();
    for (const s of scored) {
        if (s.attribute.street_key !== streetKey)
            continue;
        if (!STREET_APPLICABLE_TAGS.includes(s.attribute.tag))
            continue;
        if (tierAtLeast(s.tier, 'actionable'))
            tags.add(s.attribute.tag);
    }
    return [...tags];
}

export { normalizeAddress, streetName };
