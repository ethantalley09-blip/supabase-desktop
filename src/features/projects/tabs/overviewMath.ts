// Pure helpers for the Overview command center. No Supabase imports; unit
// tested in overviewMath.test.ts. All Overview visuals are client-side math
// on already-cached queries — the tab renders instantly, no AI calls.

// Sum donations into a fixed-length daily series ending today (oldest first).
export function dailySeries(
  donations: { amount_cents: number; donated_at: string }[],
  days = 30,
  today: Date = new Date()
): number[] {
  const series = new Array<number>(days).fill(0);
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  for (const d of donations) {
    const t = new Date(d.donated_at);
    const day = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
    const ago = Math.round((end - day) / 86_400_000);
    if (ago >= 0 && ago < days) series[days - 1 - ago] += d.amount_cents;
  }
  return series;
}

// Polyline points for an SVG sparkline (viewBox 0 0 width height). A flat
// all-zero series draws along the baseline instead of dividing by zero.
export function sparklinePoints(series: number[], width = 240, height = 48, pad = 2): string {
  if (series.length === 0) return '';
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

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
