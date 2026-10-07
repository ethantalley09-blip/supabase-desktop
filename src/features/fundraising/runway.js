// Pure fundraising-growth math: runway projection, lapse scoring, and warm
// segment detection. No Supabase imports (pattern: turf/route.ts) so it's
// unit-testable in isolation — see runway.test.ts. The AI layer only ever
// receives these computed aggregates, never raw rows.
// Project the cash balance forward day by day: subtract daily burn, subtract
// planned expenses on their dates, add observed daily raise. First day the
// balance goes negative is the shortfall.
export function computeRunway(cashOnHandCents, dailyBurnCents, dailyRaiseCents, plannedExpenses, horizonDays = 90, today = new Date()) {
    const expensesByDate = new Map();
    for (const e of plannedExpenses) {
        expensesByDate.set(e.date, (expensesByDate.get(e.date) ?? 0) + e.amount_cents);
    }
    let balance = cashOnHandCents;
    let worst = 0;
    let shortfallDate = null;
    let daysUntilShortfall = null;
    for (let day = 1; day <= horizonDays; day++) {
        const d = new Date(today);
        d.setDate(d.getDate() + day);
        const iso = d.toISOString().split('T')[0];
        balance += dailyRaiseCents - dailyBurnCents - (expensesByDate.get(iso) ?? 0);
        if (balance < 0) {
            if (shortfallDate === null) {
                shortfallDate = iso;
                daysUntilShortfall = day;
            }
            if (balance < worst)
                worst = balance;
        }
    }
    return {
        daysUntilShortfall,
        shortfallDate,
        shortfallCents: Math.abs(worst),
        endBalanceCents: balance
    };
}
// Score how lapsed a donor is from their own giving rhythm — a donor who gave
// monthly and is 60 days quiet is more lapsed than an annual donor at 60 days.
export function scoreLapse(history, today = new Date()) {
    const sorted = [...history.gifts].sort((a, b) => new Date(a.donatedAt).getTime() - new Date(b.donatedAt).getTime());
    const last = sorted[sorted.length - 1];
    const daysSince = last
        ? Math.floor((today.getTime() - new Date(last.donatedAt).getTime()) / 86_400_000)
        : Infinity;
    if (!last) {
        return { donorId: history.donorId, lapseScore: 0, daysSinceLastGift: -1, triggerReason: 'never gave' };
    }
    // Typical interval between this donor's own gifts (default 90 days for one-time donors).
    let typicalIntervalDays = 90;
    if (sorted.length >= 2) {
        const gaps = [];
        for (let i = 1; i < sorted.length; i++) {
            gaps.push((new Date(sorted[i].donatedAt).getTime() - new Date(sorted[i - 1].donatedAt).getTime()) / 86_400_000);
        }
        typicalIntervalDays = Math.max(7, gaps.reduce((s, g) => s + g, 0) / gaps.length);
    }
    // 0 at their typical interval, 100 at 3x their interval, linear between.
    const overdueRatio = daysSince / typicalIntervalDays;
    const lapseScore = Math.max(0, Math.min(100, Math.round(((overdueRatio - 1) / 2) * 100)));
    const triggerReason = lapseScore === 0
        ? 'giving on schedule'
        : `no gift in ${daysSince} days (usually gives every ~${Math.round(typicalIntervalDays)} days)`;
    return { donorId: history.donorId, lapseScore, daysSinceLastGift: daysSince, triggerReason };
}
// Donors who gave within `windowDays` — the segment most likely to respond to
// a real-time event ask (recency is the strongest response predictor we have
// in first-party data). Returns donor ids, most recent first.
export function warmSegment(gifts, windowDays = 45, today = new Date()) {
    const cutoff = today.getTime() - windowDays * 86_400_000;
    const latestByDonor = new Map();
    for (const g of gifts) {
        const t = new Date(g.donatedAt).getTime();
        if (t >= cutoff && t > (latestByDonor.get(g.donorId) ?? 0)) {
            latestByDonor.set(g.donorId, t);
        }
    }
    return [...latestByDonor.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
