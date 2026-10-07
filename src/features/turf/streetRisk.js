// Street-level rollup of door conditions, plus the ONLY function allowed to
// build an AI payload out of them. No Supabase import — see streetRisk.test.ts.
//
// Two rules are enforced here rather than left to callers:
//   1. k-anonymity. A street's safety signal is exposed only when at least two
//      DIFFERENT addresses on it carry one. Below that, a "hostile street"
//      card on a three-door cul-de-sac identifies one household by name to the
//      whole organization — and the AI-narrated version of that card would be
//      prose about an identifiable private individual's political hostility.
//   2. No PII reaches the model. buildConditionSnapshot emits street names and
//      counts only: no voter names, no house numbers, no notes text, and no
//      party/lean/giving data (that firewall is getRoutingAttributes in
//      doorAttributes.ts). Same boundary buildTurfSnapshot already keeps.
import { tierAtLeast } from './doorAttributes';

// Weight per class inside the hazard density figure. Legal-class doors are
// excluded from a walk list entirely before scoring, so they never appear here.
const HAZARD_CLASS_WEIGHT = { safety: 1.0, hazard: 0.35 };

// Per-tag access friction in minutes, applied per door at `actionable`+.
// These are the only hand-set constants in Door Intelligence; everything else
// is measured from the project's own data. They describe physical procedure
// (walk to a gate, wait, no answer; check in at a front desk), not behaviour,
// which is why they can be constants at all.
export const ACCESS_FRICTION_MINUTES = {
    gated_home: 4.0,
    hoa_community: 2.0,
    senior_center: 6.0,
    apartment: 1.5,
    dogs: 0.5
};

// k-anonymity floor: distinct addresses with a safety observation before a
// street's safety situation may be aggregated, displayed, or narrated.
export const SAFETY_K_ANONYMITY = 2;

// Advisory trigger thresholds. The two-distinct-OBSERVER requirement is the
// false-report circuit breaker: one canvasser having a rough afternoon can
// flag five doors and will still generate no manager alert.
export const ADVISORY_HAZARD_DENSITY = 0.25;
export const ADVISORY_MIN_ADDRESSES = 2;
export const ADVISORY_MIN_OBSERVERS = 2;
export const ADVISORY_COOLDOWN_DAYS = 14;

const DAY_MS = 86_400_000;

/**
 * Aggregates per-door profiles (from rollUpAddress) into per-street rows.
 * `doorCountsByStreet` is the real number of doors on each street from the
 * voter file — without it a street with 3 tagged doors out of 40 would look
 * identical to one with 3 out of 3.
 */
export function rollUpStreet(profiles, doorCountsByStreet = new Map()) {
    const byStreet = new Map();

    for (const profile of profiles) {
        const street = profile.streetKey;
        if (!street)
            continue;
        const row = byStreet.get(street) ?? {
            streetKey: street,
            taggedDoors: 0,
            doorCount: doorCountsByStreet.get(street) ?? 0,
            hazardLoad: 0,
            frictionMinutes: 0,
            safetyAddresses: new Set(),
            safetyObservers: new Set(),
            constraintCounts: new Map(),
            reasons: []
        };
        row.taggedDoors += 1;

        for (const scored of profile.attributes) {
            const tag = scored.attribute.tag;
            const weight = HAZARD_CLASS_WEIGHT[scored.class];
            if (weight)
                row.hazardLoad += scored.confidence * weight;
            if (scored.class === 'safety' && tierAtLeast(scored.tier, 'advisory')) {
                row.safetyAddresses.add(profile.addressKey);
                for (const id of scored.attribute.observer_ids ?? [])
                    row.safetyObservers.add(id);
            }
            if (tierAtLeast(scored.tier, 'actionable')) {
                const friction = ACCESS_FRICTION_MINUTES[tag];
                if (friction)
                    row.frictionMinutes += friction;
                if (scored.class === 'access' || scored.class === 'facility')
                    row.constraintCounts.set(tag, (row.constraintCounts.get(tag) ?? 0) + 1);
            }
        }
        byStreet.set(street, row);
    }

    return [...byStreet.values()]
        .map((row) => {
            // Fall back to tagged doors when the voter file gives us nothing —
            // a density over an unknown denominator would be meaningless.
            const denominator = row.doorCount > 0 ? row.doorCount : row.taggedDoors;
            const safetyDoors = row.safetyAddresses.size;
            const suppressed = safetyDoors > 0 && safetyDoors < SAFETY_K_ANONYMITY;
            let dominantConstraint = null;
            let dominantCount = 0;
            for (const [tag, count] of row.constraintCounts) {
                if (count > dominantCount) {
                    dominantCount = count;
                    dominantConstraint = tag;
                }
            }
            const reasons = [];
            if (dominantConstraint)
                reasons.push(`${dominantCount} door${dominantCount === 1 ? '' : 's'} with ${dominantConstraint.replace(/_/g, ' ')}`);
            if (!suppressed && safetyDoors > 0)
                reasons.push(`${safetyDoors} doors with a safety observation from ${row.safetyObservers.size} canvasser${row.safetyObservers.size === 1 ? '' : 's'}`);
            return {
                streetKey: row.streetKey,
                doorCount: denominator,
                taggedDoors: row.taggedDoors,
                // Suppressed streets report NO safety signal at all — not a
                // reduced one. A hazard density that quietly still includes it
                // would leak the thing the floor exists to protect.
                hazardDensity: suppressed ? 0 : round3(row.hazardLoad / denominator),
                accessFriction: round3(Math.min(1, row.frictionMinutes / (denominator * ACCESS_FRICTION_MINUTES.gated_home))),
                frictionMinutes: round1(row.frictionMinutes),
                safetyDoors: suppressed ? 0 : safetyDoors,
                safetyObserverCount: suppressed ? 0 : row.safetyObservers.size,
                safetySuppressed: suppressed,
                dominantConstraint,
                reasons
            };
        })
        .sort((a, b) => b.hazardDensity - a.hazardDensity || b.accessFriction - a.accessFriction);
}

/**
 * The aggregate-only payload for door_condition_briefing. This is the single
 * chokepoint between door conditions and the model — no other function may
 * assemble one, so the k-anonymity floor and the no-PII rule cannot be
 * bypassed by a future caller building its own object.
 */
export function buildConditionSnapshot({ territoryName = null, streets = [], profiles = [], doorCount = 0, paceStats = null }) {
    const facilities = [];
    let noTrespassing = 0;
    let hostileConfirmed = 0;

    for (const profile of profiles) {
        for (const scored of profile.attributes) {
            if (scored.tier !== 'hard')
                continue;
            if (scored.attribute.tag === 'no_trespassing')
                noTrespassing += 1;
            else if (scored.class === 'safety')
                hostileConfirmed += 1;
        }
    }

    for (const street of streets) {
        if (street.dominantConstraint === 'apartment' || street.dominantConstraint === 'senior_center') {
            facilities.push({
                type: street.dominantConstraint,
                street: street.streetKey,
                doors: street.doorCount
            });
        }
    }

    return {
        territory: territoryName,
        doorCount,
        streets: streets.slice(0, 12).map((s) => ({
            street: s.streetKey,
            doors: s.doorCount,
            accessFriction: s.accessFriction,
            dominantConstraint: s.dominantConstraint,
            hazardDensity: s.hazardDensity,
            safetySuppressed: s.safetySuppressed,
            safetyDoors: s.safetyDoors
        })),
        facilities,
        hardExclusions: { no_trespassing: noTrespassing, hostile_confirmed: hostileConfirmed },
        realMedianMinutesPerDoor: paceStats?.overall?.median ?? null,
        sampleSizeVisits: paceStats?.overall?.n ?? 0
    };
}

/**
 * Streets whose real safety signal has crossed every threshold. Returns the
 * payload for safety_cluster_advisory. `lastAdvisoryByStreet` carries the
 * cooldown so a manager isn't paged about the same street fortnightly — alert
 * fatigue is how safety tooling actually fails in the field, not by missing
 * signals but by producing so many that people stop reading them.
 */
export function findSafetyAdvisories(streets, opts = {}) {
    const now = opts.now ?? Date.now();
    const lastAdvisoryByStreet = opts.lastAdvisoryByStreet ?? new Map();
    const minDensity = opts.minDensity ?? ADVISORY_HAZARD_DENSITY;

    return streets
        .filter((s) => {
            if (s.safetySuppressed)
                return false;
            if (s.safetyDoors < ADVISORY_MIN_ADDRESSES)
                return false;
            if (s.safetyObserverCount < ADVISORY_MIN_OBSERVERS)
                return false;
            if (s.hazardDensity < minDensity)
                return false;
            const last = lastAdvisoryByStreet.get(s.streetKey);
            if (last && (now - new Date(last).getTime()) / DAY_MS < ADVISORY_COOLDOWN_DAYS)
                return false;
            return true;
        })
        .map((s) => ({
            street: s.streetKey,
            safetyDoors: s.safetyDoors,
            distinctReporters: s.safetyObserverCount,
            totalDoors: s.doorCount,
            hazardDensity: s.hazardDensity
        }));
}

/** Real door counts per street, from the voter file. */
export function countDoorsByStreet(voters, streetNameFn) {
    const counts = new Map();
    for (const v of voters) {
        const street = streetNameFn(v.address_line);
        if (!street)
            continue;
        counts.set(street, (counts.get(street) ?? 0) + 1);
    }
    return counts;
}

const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;
