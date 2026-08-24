// Exported for reuse by peakAskWindow.ts, which formats hour-of-day ranges
// the same way for its $-per-hour analog of this file's contact-rate stat.
export function hourLabel(h) {
    const start = h % 12 === 0 ? 12 : h % 12;
    const startSuffix = h < 12 ? 'AM' : 'PM';
    const endHour = (h + 1) % 24;
    const end = endHour % 12 === 0 ? 12 : endHour % 12;
    const endSuffix = endHour < 12 ? 'AM' : 'PM';
    return startSuffix === endSuffix ? `${start}–${end} ${endSuffix}` : `${start} ${startSuffix}–${end} ${endSuffix}`;
}
const MIN_SAMPLE = 5; // total visits before saying anything at all
const MIN_HOUR_ATTEMPTS = 3; // minimum attempts in an hour bucket before it's eligible as "best" — a single lucky knock at 6am shouldn't win
// Real contact-success rate by hour of day — the door-knocking analog of
// comms/sendTime.ts's donation-timestamp insight, but a genuine RATE
// (contacts / attempts) rather than a raw count, since canvass_visits
// captures every attempt, not just successes. minSample/minHourAttempts
// default to the constants above but are customizable per user
// (turf_briefing_preferences -> bestTimeToKnock) via turfPreferences.ts.
export function computeBestTimeToKnock(visits, opts) {
    const minSample = opts?.minSample ?? MIN_SAMPLE;
    const minHourAttempts = opts?.minHourAttempts ?? MIN_HOUR_ATTEMPTS;
    if (visits.length < minSample)
        return null;
    const hourlyAttempts = new Array(24).fill(0);
    const hourlyContacts = new Array(24).fill(0);
    for (const v of visits) {
        const h = new Date(v.occurred_at).getHours();
        hourlyAttempts[h] += 1;
        if (v.outcome === 'contacted')
            hourlyContacts[h] += 1;
    }
    let bestHour = -1;
    let bestRate = -1;
    for (let h = 0; h < 24; h++) {
        if (hourlyAttempts[h] < minHourAttempts)
            continue;
        const rate = hourlyContacts[h] / hourlyAttempts[h];
        if (rate > bestRate) {
            bestRate = rate;
            bestHour = h;
        }
    }
    if (bestHour === -1)
        return null; // no hour has a large enough sample yet
    return {
        bestHour,
        bestHourLabel: hourLabel(bestHour),
        contactRatePct: Math.round(bestRate * 100),
        hourlyAttempts,
        hourlyContacts,
        sampleSize: visits.length
    };
}
// Flags doors whose lean genuinely changed between the two most recent real
// visits — impossible without the visit log. Deliberately narrow: only
// opposed <-> persuadable/base_support transitions count (a shift between
// persuadable and base_support is too minor to page anyone about), and
// anything touching 'unknown' is skipped — no signal at a visit isn't a
// neutral stance, so it can't be evidence of a drift either direction.
export function detectPersuasionDrift(visits) {
    const byVoter = new Map();
    for (const v of visits) {
        const list = byVoter.get(v.voter_id) ?? [];
        list.push(v);
        byVoter.set(v.voter_id, list);
    }
    const alerts = [];
    for (const [voterId, list] of byVoter) {
        if (list.length < 2)
            continue;
        const sorted = [...list].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
        const prev = sorted[sorted.length - 2];
        const latest = sorted[sorted.length - 1];
        if (prev.persuadability_bucket === 'unknown' || latest.persuadability_bucket === 'unknown')
            continue;
        if (prev.persuadability_bucket === latest.persuadability_bucket)
            continue;
        const prevWarm = prev.persuadability_bucket !== 'opposed';
        const latestWarm = latest.persuadability_bucket !== 'opposed';
        if (prevWarm === latestWarm)
            continue; // persuadable <-> base_support — too minor to flag
        alerts.push({
            voterId,
            name: latest.voter_name || 'Voter',
            from: prev.persuadability_bucket,
            to: latest.persuadability_bucket,
            direction: latestWarm ? 'warmed' : 'cooled',
            occurredAt: latest.occurred_at
        });
    }
    return alerts.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}
