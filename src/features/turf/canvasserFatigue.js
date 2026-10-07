const DAY_MS = 24 * 60 * 60 * 1000;
// Each half of the shift needs a real sample — two or three knocks either
// side of noon isn't evidence of anything.
const MIN_ATTEMPTS_PER_HALF = 4;
// A one-off dip isn't fatigue; this is a genuine, sizeable drop.
const DECLINE_THRESHOLD_PCT = 25;
// Ranked by the size of the real decline, largest drop first.
export function detectCanvasserFatigue(visits, now = new Date()) {
    const todayStart = new Date(now.getTime());
    todayStart.setHours(0, 0, 0, 0);
    const todayStartMs = todayStart.getTime();
    const todayEndMs = todayStartMs + DAY_MS;
    const byCanvasser = new Map();
    for (const v of visits) {
        const t = new Date(v.occurred_at).getTime();
        if (t < todayStartMs || t >= todayEndMs)
            continue;
        const list = byCanvasser.get(v.canvasser_id) ?? [];
        list.push(v);
        byCanvasser.set(v.canvasser_id, list);
    }
    const alerts = [];
    for (const [canvasserId, list] of byCanvasser) {
        if (list.length < MIN_ATTEMPTS_PER_HALF * 2)
            continue;
        const sorted = [...list].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
        const mid = Math.floor(sorted.length / 2);
        const early = sorted.slice(0, mid);
        const later = sorted.slice(mid);
        if (early.length < MIN_ATTEMPTS_PER_HALF || later.length < MIN_ATTEMPTS_PER_HALF)
            continue;
        const earlyRate = early.filter((v) => v.outcome === 'contacted').length / early.length;
        const laterRate = later.filter((v) => v.outcome === 'contacted').length / later.length;
        const dropPct = (earlyRate - laterRate) * 100;
        if (dropPct < DECLINE_THRESHOLD_PCT)
            continue;
        alerts.push({
            canvasserId,
            name: sorted.find((v) => v.canvasser_name)?.canvasser_name || 'Canvasser',
            earlyContactRatePct: Math.round(earlyRate * 100),
            laterContactRatePct: Math.round(laterRate * 100),
            attemptsConsidered: sorted.length
        });
    }
    return alerts.sort((a, b) => b.earlyContactRatePct - b.laterContactRatePct - (a.earlyContactRatePct - a.laterContactRatePct));
}
