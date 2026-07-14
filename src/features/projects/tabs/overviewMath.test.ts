import { describe, expect, it } from 'vitest';
import { computeLanguageCoverage, computeMomentum, dailySeries, pct, sparklinePoints } from './overviewMath';

const TODAY = new Date('2026-07-13T00:00:00');

describe('dailySeries', () => {
  it('buckets gifts into the right days, oldest first', () => {
    const s = dailySeries(
      [
        { amount_cents: 100, donated_at: '2026-07-13T10:00:00' }, // today -> last slot
        { amount_cents: 200, donated_at: '2026-07-12T09:00:00' }, // yesterday
        { amount_cents: 999, donated_at: '2026-05-01T00:00:00' } // outside window
      ],
      7,
      TODAY
    );
    expect(s).toHaveLength(7);
    expect(s[6]).toBe(100);
    expect(s[5]).toBe(200);
    expect(s.reduce((a, b) => a + b, 0)).toBe(300);
  });
});

describe('sparklinePoints', () => {
  it('spans the width and keeps values in the viewBox', () => {
    const pts = sparklinePoints([0, 50, 100], 240, 48).split(' ');
    expect(pts).toHaveLength(3);
    const [x0, y0] = pts[0].split(',').map(Number);
    const [x2, y2] = pts[2].split(',').map(Number);
    expect(x0).toBe(2);
    expect(x2).toBe(238);
    expect(y0).toBe(46); // zero sits on the baseline
    expect(y2).toBe(2); // max touches the top
  });

  it('handles an all-zero series without NaN', () => {
    expect(sparklinePoints([0, 0, 0])).not.toContain('NaN');
  });
});

describe('pct', () => {
  it('rounds and survives divide-by-zero', () => {
    expect(pct(1, 3)).toBe(33);
    expect(pct(5, 0)).toBe(0);
  });
});

describe('computeMomentum', () => {
  const dayAgo = (n: number) => {
    const d = new Date(TODAY);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  };

  it('reads up when the last 15 days outraised the 15 before', () => {
    const m = computeMomentum(
      [
        { amount_cents: 10_000, donated_at: dayAgo(3) }, // last 15
        { amount_cents: 2_000, donated_at: dayAgo(20) } // prior 15
      ],
      TODAY
    );
    expect(m.direction).toBe('up');
    expect(m.last15Cents).toBe(10_000);
    expect(m.prev15Cents).toBe(2_000);
    expect(m.changePct).toBe(400);
  });

  it('reads flat with truly no giving in either window', () => {
    expect(computeMomentum([], TODAY)).toEqual({ direction: 'flat', changePct: 0, last15Cents: 0, prev15Cents: 0 });
  });

  it('reads up (not divide-by-zero) when the prior window was empty but recent giving exists', () => {
    const m = computeMomentum([{ amount_cents: 500, donated_at: dayAgo(1) }], TODAY);
    expect(m.direction).toBe('up');
    expect(m.prev15Cents).toBe(0);
  });
});

describe('computeLanguageCoverage', () => {
  it('excludes English and reports contacted rate per language, largest group first', () => {
    const rows = computeLanguageCoverage([
      { canvass_notes: 'note', data: { language: 'Spanish' } },
      { canvass_notes: null, data: { language: 'Spanish' } },
      { canvass_notes: null, data: { language: 'Spanish' } },
      { canvass_notes: 'note', data: { language: 'Vietnamese' } },
      { canvass_notes: null, data: { language: 'English' } }
    ]);
    expect(rows).toEqual([
      { language: 'Spanish', total: 3, contacted: 1, pct: 33 },
      { language: 'Vietnamese', total: 1, contacted: 1, pct: 100 }
    ]);
  });

  it('handles voters with no language on file', () => {
    expect(computeLanguageCoverage([{ canvass_notes: null, data: null }])).toEqual([]);
  });
});
