// Specialization partitioning and canvasser assignment. No Supabase import —
// see walkListAssign.test.ts.
import { tierAtLeast } from './doorAttributes';
import { normalizeAddress } from './households';
import { ADVISORY_HAZARD_DENSITY } from './streetRisk';

export const CAPABILITY_FOR_TAG = {
    apartment: 'multi_unit',
    senior_center: 'senior_facility'
};

export const CAPABILITY_LABELS = {
    multi_unit: 'Multi-unit buildings',
    senior_facility: 'Senior facilities',
    de_escalation: 'De-escalation trained',
    spanish: 'Spanish'
};

// A building has to be worth splitting out before it becomes its own list;
// below this a canvasser just walks it as part of the block.
const MIN_CLUSTER_DOORS = 12;

/**
 * Splits doors into specialized sub-lists (one per apartment building or
 * senior facility large enough to matter) plus the general remainder.
 * Grouping is by address for a building and by street for a facility, since a
 * care facility's units frequently carry distinct address lines.
 */
export function partitionBySpecialization(voters, profilesByAddress, opts = {}) {
    const minClusterDoors = opts.minClusterDoors ?? MIN_CLUSTER_DOORS;
    const clusters = new Map();
    const general = [];

    for (const voter of voters) {
        const addr = voter.address_line?.trim();
        const profile = addr ? profilesByAddress.get(normalizeAddress(addr)) : null;
        const facility = profile?.attributes.find((a) => CAPABILITY_FOR_TAG[a.attribute.tag] && tierAtLeast(a.tier, 'actionable'));
        if (!facility) {
            general.push(voter);
            continue;
        }
        const tag = facility.attribute.tag;
        // An apartment building is one address; a senior facility can sprawl
        // across several, so it clusters by street instead.
        const key = tag === 'apartment'
            ? `${tag}:${profile.addressKey}`
            : `${tag}:${profile.streetKey ?? profile.addressKey}`;
        const cluster = clusters.get(key) ?? {
            key,
            tag,
            capability: CAPABILITY_FOR_TAG[tag],
            label: profile.streetKey ?? profile.addressKey,
            doors: []
        };
        cluster.doors.push(voter);
        clusters.set(key, cluster);
    }

    const specialized = [];
    for (const cluster of clusters.values()) {
        // A senior facility is always split out regardless of size — the
        // assignment rules for it are about who may be sent, not efficiency.
        if (cluster.tag === 'senior_center' || cluster.doors.length >= minClusterDoors)
            specialized.push(cluster);
        else
            general.push(...cluster.doors);
    }

    specialized.sort((a, b) => b.doors.length - a.doors.length || a.key.localeCompare(b.key));
    return { specialized, general };
}

/**
 * Greedy assignment, most-constrained list first, deterministic id tie-break —
 * same determinism convention as splitIntoWalkLists' west-to-east seeding, so
 * identical inputs always produce an identical walk book.
 *
 * One hard stop: a senior facility is never auto-assigned to someone without
 * the capability. Sending an untrained volunteer into a care facility is a
 * real duty-of-care risk that a scheduling algorithm should not take on its
 * own authority — it goes to a human instead.
 */
export function assignWalkLists(lists, canvassers, opts = {}) {
    const hazardThreshold = opts.hazardThreshold ?? ADVISORY_HAZARD_DENSITY;
    const available = [...canvassers].sort((a, b) => String(a.profile_id).localeCompare(String(b.profile_id)));
    const used = new Set();

    const ordered = [...lists].sort((a, b) => (b.requiredCapability ? 1 : 0) - (a.requiredCapability ? 1 : 0) ||
        String(a.id).localeCompare(String(b.id)));

    const assignments = [];
    for (const list of ordered) {
        const flags = [];
        if ((list.hazardDensity ?? 0) >= hazardThreshold)
            flags.push('pairing_recommended');
        if (list.language && list.language !== 'en')
            flags.push('language_gap');

        let assignedTo = null;
        const qualified = available.filter((c) => !used.has(c.profile_id) &&
            (!list.requiredCapability || (c.capabilities ?? []).includes(list.requiredCapability)));

        if (qualified.length > 0) {
            // Prefer someone who also matches the list's language, but never
            // let that override the hard capability requirement above.
            const languageMatch = list.language
                ? qualified.find((c) => (c.capabilities ?? []).includes(list.language))
                : null;
            const pick = languageMatch ?? qualified[0];
            assignedTo = pick.profile_id;
            used.add(pick.profile_id);
            if (languageMatch) {
                const gapIndex = flags.indexOf('language_gap');
                if (gapIndex >= 0)
                    flags.splice(gapIndex, 1);
            }
        }
        else if (list.requiredCapability === 'senior_facility') {
            flags.push('needs_manual_assignment');
        }
        else if (list.requiredCapability) {
            // Nobody trained is free — assign anyway but say so out loud.
            const fallback = available.find((c) => !used.has(c.profile_id));
            if (fallback) {
                assignedTo = fallback.profile_id;
                used.add(fallback.profile_id);
            }
            flags.push('unspecialized');
        }
        else {
            const fallback = available.find((c) => !used.has(c.profile_id));
            if (fallback) {
                assignedTo = fallback.profile_id;
                used.add(fallback.profile_id);
            }
        }

        assignments.push({ listId: list.id, assignedTo, flags, requiredCapability: list.requiredCapability ?? null });
    }

    return assignments.sort((a, b) => String(a.listId).localeCompare(String(b.listId)));
}
