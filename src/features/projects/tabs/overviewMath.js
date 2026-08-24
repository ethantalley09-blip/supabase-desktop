// Pure helpers for the Overview command center. No Supabase imports; unit
// tested in overviewMath.test.ts. All Overview visuals are client-side math
// on already-cached queries — the tab renders instantly, no AI calls.
// Sum donations into a fixed-length daily series ending today (oldest first).
export function dailySeries(donations, days = 30, today = new Date()) {
    const series = new Array(days).fill(0);
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    for (const d of donations) {
        const t = new Date(d.donated_at);
        const day = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
        const ago = Math.round((end - day) / 86_400_000);
        if (ago >= 0 && ago < days)
            series[days - 1 - ago] += d.amount_cents;
    }
    return series;
}
// Polyline points for an SVG sparkline (viewBox 0 0 width height). A flat
// all-zero series draws along the baseline instead of dividing by zero.
export function sparklinePoints(series, width = 240, height = 48, pad = 2) {
    if (series.length === 0)
        return '';
    const max = Math.max(...series, 1);
    const stepX = series.length > 1 ? (width - pad * 2) / (series.length - 1) : 0;
    return series
        .map((v, i) => {
        const x = pad + i * stepX;
        const y = height - pad - (v / max) * (height - pad * 2);
        return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
        .join(' ');
}
export function pct(part, whole) {
    return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
// Medium-term fundraising trend: last 15 days of giving vs. the 15 days
// before that. Distinct from the fundraising tab's Momentum Detector, which
// watches hour-to-hour velocity for a real-time spike — this is the
// 2-week read for "are we building or losing steam."
export function computeMomentum(donations, today = new Date()) {
    const last30 = dailySeries(donations, 30, today);
    const last15Cents = last30.slice(15).reduce((a, b) => a + b, 0);
    const prev15Cents = last30.slice(0, 15).reduce((a, b) => a + b, 0);
    if (prev15Cents === 0) {
        return { direction: last15Cents > 0 ? 'up' : 'flat', changePct: last15Cents > 0 ? 100 : 0, last15Cents, prev15Cents };
    }
    const changePct = Math.round((Math.abs(last15Cents - prev15Cents) / prev15Cents) * 100);
    const direction = last15Cents === prev15Cents ? 'flat' : last15Cents > prev15Cents ? 'up' : 'down';
    return { direction, changePct, last15Cents, prev15Cents };
}
// Outreach equity by language: of the voters who speak each non-English
// language on file, how many have a canvass note on record. Surfaces gaps a
// single-language operation would never see.
export function computeLanguageCoverage(voters) {
    const byLang = new Map();
    for (const v of voters) {
        const lang = v.data?.language;
        if (!lang || lang === 'English')
            continue;
        const row = byLang.get(lang) ?? { total: 0, contacted: 0 };
        row.total += 1;
        if (v.canvass_notes)
            row.contacted += 1;
        byLang.set(lang, row);
    }
    return [...byLang.entries()]
        .map(([language, r]) => ({ language, total: r.total, contacted: r.contacted, pct: pct(r.contacted, r.total) }))
        .sort((a, b) => b.total - a.total);
}
