import { describe, expect, it } from 'vitest';
import { computeRunway, scoreLapse, warmSegment } from './runway';

// Midnight UTC so day arithmetic against date-only gift stamps is exact.
const TODAY = new Date('2026-07-13T00:00:00Z');

function daysFromToday(n: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

describe('computeRunway', () => {
  it('projects no shortfall when raise covers burn', () => {
    const r = computeRunway(100_000, 1_000, 2_000, [], 90, TODAY);
    expect(r.shortfallDate).toBeNull();
    expect(r.daysUntilShortfall).toBeNull();
    expect(r.endBalanceCents).toBe(100_000 + 90 * 1_000); // net +$10/day
  });

  it('finds the day the balance goes negative from burn alone', () => {
    // $100 cash, $10/day burn, $0 raise -> negative on day 11.
    const r = computeRunway(10_000, 1_000, 0, [], 90, TODAY);
    expect(r.daysUntilShortfall).toBe(11);
    expect(r.shortfallDate).toBe(daysFromToday(11));
  });

  it('a large planned expense triggers the shortfall on its date', () => {
    // $1000 cash, break-even daily, $5000 TV buy on day 20.
    const r = computeRunway(
      100_000,
      1_000,
      1_000,
      [{ date: daysFromToday(20), label: 'TV buy', amount_cents: 500_000 }],
      90,
      TODAY
    );
    expect(r.shortfallDate).toBe(daysFromToday(20));
    expect(r.shortfallCents).toBe(400_000); // $5000 - $1000 cash
  });

  it('sums multiple expenses on the same date', () => {
    const r = computeRunway(
      100_000,
      0,
      0,
      [
        { date: daysFromToday(5), label: 'a', amount_cents: 60_000 },
        { date: daysFromToday(5), label: 'b', amount_cents: 60_000 }
      ],
      30,
      TODAY
    );
    expect(r.shortfallDate).toBe(daysFromToday(5));
    expect(r.shortfallCents).toBe(20_000);
  });
});

describe('scoreLapse', () => {
  it('a monthly donor 90 days quiet scores high', () => {
    const a = scoreLapse(
      {
        donorId: 'a',
        gifts: [
          { amountCents: 5000, donatedAt: '2026-01-13' },
          { amountCents: 5000, donatedAt: '2026-02-13' },
          { amountCents: 5000, donatedAt: '2026-03-13' },
          { amountCents: 5000, donatedAt: '2026-04-13' } // 90 days before TODAY
        ]
      },
      TODAY
    );
    expect(a.daysSinceLastGift).toBe(91); // Apr 13 -> Jul 13
    expect(a.lapseScore).toBeGreaterThan(50); // 3x their ~30-day rhythm
    expect(a.triggerReason).toContain('91 days');
  });

  it('the same 90-day quiet is NOT lapsed for a ~quarterly donor', () => {
    const a = scoreLapse(
      {
        donorId: 'b',
        gifts: [
          { amountCents: 5000, donatedAt: '2025-10-15' },
          { amountCents: 5000, donatedAt: '2026-01-13' },
          { amountCents: 5000, donatedAt: '2026-04-13' }
        ]
      },
      TODAY
    );
    expect(a.lapseScore).toBeLessThan(5); // 91 days vs their own ~90-day rhythm: barely overdue
  });

  it('handles a donor with no gifts', () => {
    const a = scoreLapse({ donorId: 'c', gifts: [] }, TODAY);
    expect(a.lapseScore).toBe(0);
    expect(a.triggerReason).toBe('never gave');
  });
});

describe('warmSegment', () => {
  it('returns only donors who gave within the window, most recent first', () => {
    const ids = warmSegment(
      [
        { donorId: 'old', donatedAt: '2026-01-01' },
        { donorId: 'warm1', donatedAt: '2026-07-01' },
        { donorId: 'warm2', donatedAt: '2026-06-20' },
        { donorId: 'warm1', donatedAt: '2026-05-01' } // duplicate donor, older gift
      ],
      45,
      TODAY
    );
    expect(ids).toEqual(['warm1', 'warm2']);
  });

  it('empty when nobody is recent', () => {
    expect(warmSegment([{ donorId: 'x', donatedAt: '2025-01-01' }], 45, TODAY)).toEqual([]);
  });
});
