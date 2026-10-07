// Pure logic for the Volunteer Cadence Detector: VolunteerPipeline.tsx's own
// comment used to say "no shift-tracking table exists yet, so this is
// honestly input-driven" — that's now stale. canvass_visits (migration 0030)
// has exactly the real per-canvasser shift history needed to detect a
// lapsing or accelerating volunteer automatically instead of requiring staff
// to notice and type a description by hand. Reuses the existing
// volunteer_pipeline purpose (the situation string this module produces
// slots directly into it) — no new AI purpose needed. No Supabase import
// (pattern: overlapGuard.ts) — see canvasserCadence.test.ts.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const RECENT_WEEKS = 2;
const PRIOR_WEEKS = 6;
// Must have shown up in at least this many of the prior weeks to count as an
// established pattern — one shift two months ago isn't a "regular" volunteer.
const LAPSE_MIN_PRIOR_WEEKS = 3;
// Must have been active in at most this many prior weeks to count as newly
// accelerating — a volunteer who was already regular isn't "ready for more,"
// they're just continuing.
const ACCELERATE_MAX_PRIOR_WEEKS = 1;
function weekIndex(dateStr, now) {
    return Math.floor((now.getTime() - new Date(dateStr).getTime()) / WEEK_MS);
}
// Ranked lapsing-first (a volunteer at risk of disengaging is more time-
// sensitive to catch than one who's simply ready for more).
export function detectCanvasserCadence(visits, now = new Date()) {
    const byCanvasser = new Map();
    for (const v of visits) {
        const wIdx = weekIndex(v.occurred_at, now);
        if (wIdx < 0 || wIdx >= RECENT_WEEKS + PRIOR_WEEKS)
            continue;
        const entry = byCanvasser.get(v.canvasser_id) ?? {
            name: v.canvasser_name,
            recentWeeks: new Set(),
            priorWeeks: new Set()
        };
        if (wIdx < RECENT_WEEKS)
            entry.recentWeeks.add(wIdx);
        else
            entry.priorWeeks.add(wIdx - RECENT_WEEKS);
        if (!entry.name && v.canvasser_name)
            entry.name = v.canvasser_name;
        byCanvasser.set(v.canvasser_id, entry);
    }
    const lapsing = [];
    const accelerating = [];
    for (const [canvasserId, entry] of byCanvasser) {
        const name = entry.name || 'Canvasser';
        const priorActive = entry.priorWeeks.size;
        const recentActive = entry.recentWeeks.size;
        if (priorActive >= LAPSE_MIN_PRIOR_WEEKS && recentActive === 0) {
            lapsing.push({
                canvasserId,
                name,
                pattern: 'lapsing',
                situation: `Canvassed ${priorActive} of the last ${PRIOR_WEEKS} weeks, then went quiet for the last ${RECENT_WEEKS} weeks — no explanation given.`
            });
            continue;
        }
        if (recentActive === RECENT_WEEKS && priorActive <= ACCELERATE_MAX_PRIOR_WEEKS) {
            accelerating.push({
                canvasserId,
                name,
                pattern: 'accelerating',
                situation: priorActive === 0
                    ? `Canvassed every week for the last ${RECENT_WEEKS} weeks after not canvassing at all in the ${PRIOR_WEEKS} weeks before that — may be ready for a bigger role.`
                    : `Canvassed every week for the last ${RECENT_WEEKS} weeks after only ${priorActive} active week in the ${PRIOR_WEEKS} weeks before that — may be ready for a bigger role.`
            });
        }
    }
    return [...lapsing, ...accelerating];
}
