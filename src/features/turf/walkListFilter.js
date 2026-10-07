// Hard exclusions for walk-list generation. No Supabase import — see
// walkListFilter.test.ts.
//
// Excluded doors are moved into a separate array with a human-readable reason,
// never dropped. A walk list that quietly loses four doors teaches canvassers
// not to trust the tool, and a captain has to be able to see what was removed
// and why before they can disagree with it.
import { hasHardExclusion, TAG_LABELS } from './doorAttributes';
import { normalizeAddress } from './households';

const EXCLUSION_REASONS = {
    no_trespassing: 'No trespassing posted — do not visit',
    hostile: 'Confirmed safety exclusion (reported by 2+ canvassers or staff)'
};

/**
 * Splits voters into the doors a canvasser should be sent to and the doors
 * they should not. `profilesByAddress` is the output of rollUpAddress.
 */
export function applyHardExclusions(voters, profilesByAddress) {
    const included = [];
    const excluded = [];
    for (const voter of voters) {
        const addr = voter.address_line?.trim();
        const profile = addr ? profilesByAddress.get(normalizeAddress(addr)) : null;
        if (!hasHardExclusion(profile)) {
            included.push(voter);
            continue;
        }
        const tag = profile.hardExclusion.attribute.tag;
        excluded.push({
            voter,
            tag,
            label: TAG_LABELS[tag] ?? tag,
            reason: EXCLUSION_REASONS[tag] ?? `Excluded: ${TAG_LABELS[tag] ?? tag}`,
            confidence: profile.hardExclusion.confidence
        });
    }
    return { included, excluded };
}

/**
 * Doors that carry an access constraint, ordered so a canvasser attempts the
 * geographically-natural sequence but hits gates at the END of their cluster.
 * Standing at a locked gate first kills momentum; the door still gets one
 * honest attempt.
 *
 * Deliberately a stable partition rather than a re-optimization: the walk
 * order coming in is already distance-optimal (optimizeWalkOrder), and
 * re-solving it here would undo that work for a second-order gain.
 */
export function sequenceGatedLast(orderedDoors, profilesByAddress) {
    const open = [];
    const gated = [];
    for (const door of orderedDoors) {
        const addr = door.address_line?.trim();
        const profile = addr ? profilesByAddress.get(normalizeAddress(addr)) : null;
        const isGated = profile?.attributes.some((a) => (a.attribute.tag === 'gated_home' || a.attribute.tag === 'hoa_community') &&
            (a.tier === 'actionable' || a.tier === 'hard'));
        (isGated ? gated : open).push(door);
    }
    return [...open, ...gated];
}
