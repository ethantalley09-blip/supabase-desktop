// Walk-list scoring: safety, access efficiency, and voter density. No Supabase
// import — see walkListScore.test.ts.
//
// The three sub-scores are always reported alongside the composite, never
// replaced by it. A single number hides the trade-off a captain is actually
// making, and the whole point of showing them a score is so they can disagree
// with it.
import { tierAtLeast } from './doorAttributes';
import { normalizeAddress } from './households';
import { ACCESS_FRICTION_MINUTES } from './streetRisk';

const HAZARD_CLASS_WEIGHT = { safety: 1.0, hazard: 0.35 };
// Hazard-weighted density at which the safety score hits zero.
const HAZARD_DENSITY_FLOOR = 0.25;
// Below this safety score the list is flagged for review no matter how well it
// scores elsewhere.
const SAFETY_GATE = 40;
// Density is capped at twice the project's own median: past that, more doors
// per km makes very little practical difference to a shift.
const DENSITY_CAP_MULTIPLE = 2;

const WEIGHTS = { safety: 0.45, access: 0.3, density: 0.25 };

/**
 * Scores one walk list. `pathMeters` comes from optimizeWalkOrder, and
 * `projectMedianMinutes` / `projectMedianDensity` come from the project's own
 * history — every comparison here is against this campaign's normal, never an
 * invented benchmark.
 */
export function scoreWalkList({ doors, profilesByAddress = new Map(), pathMeters = 0, projectMedianMinutes = null, projectMedianDensity = null }) {
    const doorCount = doors.length;
    if (doorCount === 0)
        return emptyScore();

    let hazardLoad = 0;
    let frictionMinutes = 0;
    let safetyDoors = 0;
    const constraintCounts = new Map();

    for (const door of doors) {
        const addr = door.address_line?.trim();
        const profile = addr ? profilesByAddress.get(normalizeAddress(addr)) : null;
        if (!profile)
            continue;
        let doorHasSafety = false;
        for (const scored of profile.attributes) {
            const weight = HAZARD_CLASS_WEIGHT[scored.class];
            if (weight) {
                hazardLoad += scored.confidence * weight;
                if (scored.class === 'safety')
                    doorHasSafety = true;
            }
            if (tierAtLeast(scored.tier, 'actionable')) {
                const friction = ACCESS_FRICTION_MINUTES[scored.attribute.tag];
                if (friction) {
                    frictionMinutes += friction;
                    constraintCounts.set(scored.attribute.tag, (constraintCounts.get(scored.attribute.tag) ?? 0) + 1);
                }
            }
        }
        if (doorHasSafety)
            safetyDoors += 1;
    }

    const hazardDensity = hazardLoad / doorCount;
    const safety = clamp100(100 * Math.max(0, 1 - hazardDensity / HAZARD_DENSITY_FLOOR));

    const avgFriction = frictionMinutes / doorCount;
    // Anchored to the project's own median minutes/door, so access efficiency
    // reads as "how much slower than YOUR normal door", not a comparison to a
    // number we made up. With no real pace data yet, friction alone can't be
    // turned into a ratio, so the sub-score is honestly null.
    const access = projectMedianMinutes && projectMedianMinutes > 0
        ? clamp100(100 * (projectMedianMinutes / (projectMedianMinutes + avgFriction)))
        : null;

    const km = pathMeters / 1000;
    const density = km > 0 ? doorCount / km : null;
    const densityScore = density !== null && projectMedianDensity && projectMedianDensity > 0
        ? clamp100((100 * Math.min(density / projectMedianDensity, DENSITY_CAP_MULTIPLE)) / DENSITY_CAP_MULTIPLE)
        : null;

    // Renormalize over whatever sub-scores we actually have, rather than
    // scoring a missing component as zero and quietly punishing a new project
    // for having no history yet.
    const parts = [
        { value: safety, weight: WEIGHTS.safety },
        { value: access, weight: WEIGHTS.access },
        { value: densityScore, weight: WEIGHTS.density }
    ].filter((p) => p.value !== null);
    const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
    const composite = Math.round(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / totalWeight);

    const reasons = [];
    for (const [tag, count] of [...constraintCounts].sort((a, b) => b[1] - a[1])) {
        const total = Math.round(count * ACCESS_FRICTION_MINUTES[tag]);
        reasons.push(`${count} ${tag.replace(/_/g, ' ')} door${count === 1 ? '' : 's'} add ~${total} min`);
    }
    if (safetyDoors > 0)
        reasons.push(`${safetyDoors} door${safetyDoors === 1 ? '' : 's'} with a safety observation on this route`);
    if (reasons.length === 0)
        reasons.push('No logged access or safety constraints on this route');

    return {
        doorCount,
        safety: Math.round(safety),
        access: access === null ? null : Math.round(access),
        density: densityScore === null ? null : Math.round(densityScore),
        composite,
        grade: grade(composite, safety),
        hazardDensity: Math.round(hazardDensity * 1000) / 1000,
        frictionMinutes: Math.round(frictionMinutes),
        doorsPerKm: density === null ? null : Math.round(density * 10) / 10,
        reasons
    };
}

/**
 * The safety gate is a branch, not a weight. Without it a very dense, very
 * accessible, moderately dangerous list scores well and gets handed to a
 * volunteer. Safety is a floor that the other terms cannot outvote, so it
 * must not be expressible as a coefficient someone can tune down later.
 */
export function grade(composite, safety) {
    if (safety < SAFETY_GATE)
        return 'REVIEW';
    if (composite >= 80 && safety >= 60)
        return 'A';
    if (composite >= 65 && safety >= 50)
        return 'B';
    if (composite >= 45)
        return 'C';
    return 'D';
}

/** Median doors/km across this project's own lists, for the density anchor. */
export function projectMedianDensity(lists) {
    const densities = lists
        .map((l) => (l.meters > 0 ? l.ordered.length / (l.meters / 1000) : null))
        .filter((d) => d !== null && Number.isFinite(d));
    if (densities.length === 0)
        return null;
    const sorted = densities.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function emptyScore() {
    return {
        doorCount: 0, safety: 100, access: null, density: null, composite: 100,
        grade: 'A', hazardDensity: 0, frictionMinutes: 0, doorsPerKm: null,
        reasons: ['No doors on this list']
    };
}

const clamp100 = (n) => Math.max(0, Math.min(100, n));
