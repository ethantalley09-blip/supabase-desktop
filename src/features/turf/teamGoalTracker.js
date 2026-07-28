// Pure logic for the Live Team Fundraising Goal Tracker: real progress
// today's actual doorstep gifts (donations.voter_id, migration 0032) have
// made toward a staff-set dollar goal for the shift, plus an honest pace-
// based projection using the real elapsed time and real remaining daylight
// (daylight.ts). Distinct from the Overview tab's 15-day Momentum
// (long-run trend) and Funding Runway (cash-shortfall forecast) — this is
// intraday, shift-scoped, goal-vs-actual, team-level motivation rather than
// individual-canvasser coaching. No Supabase import (pattern: doorstep.ts)
// — see teamGoalTracker.test.ts.
export function computeGoalProgress(donations, goalCents, now = new Date(), minutesOfDaylightLeft = null) {
    const todayStart = new Date(now.getTime());
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    // Doorstep gifts only (voter_id set) — this tracker is about door-to-door
    // fundraising momentum, not online/mail gifts that don't happen at a door.
    const todaysDoorstepGifts = donations.filter((d) => d.voter_id && new Date(d.donated_at).getTime() >= todayStartMs);
    const raisedCentsToday = todaysDoorstepGifts.reduce((sum, d) => sum + d.amount_cents, 0);
    const giftCountToday = todaysDoorstepGifts.length;
    const progressPct = goalCents > 0 ? Math.round((raisedCentsToday / goalCents) * 100) : 0;
    let projectedCentsByEndOfDay = null;
    if (giftCountToday > 0 && minutesOfDaylightLeft !== null) {
        const minutesElapsedToday = (now.getTime() - todayStartMs) / 60000;
        if (minutesElapsedToday > 0) {
            const centsPerMinute = raisedCentsToday / minutesElapsedToday;
            projectedCentsByEndOfDay = Math.round(raisedCentsToday + centsPerMinute * minutesOfDaylightLeft);
        }
    }
    return { raisedCentsToday, goalCents, progressPct, giftCountToday, projectedCentsByEndOfDay };
}
