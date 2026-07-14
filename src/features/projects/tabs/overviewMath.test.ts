import { describe, expect, it } from 'vitest';
import { dailySeries, pct, sparklinePoints } from './overviewMath';

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
