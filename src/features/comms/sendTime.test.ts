import { describe, expect, it } from 'vitest';
import { computeSendTimeInsights } from './sendTime';

function gift(iso: string) {
  return { donated_at: iso };
}

describe('computeSendTimeInsights', () => {
  it('returns null below the minimum sample size', () => {
    expect(computeSendTimeInsights([gift('2026-07-01T14:00:00'), gift('2026-07-02T14:00:00')])).toBeNull();
  });

  it('finds the hour and day with the most gifts', () => {
    // 2026-07-14 is a Tuesday. Stack 3 gifts at 2pm Tuesday, 1 elsewhere.
    const insight = computeSendTimeInsights([
      gift('2026-07-14T14:10:00'),
      gift('2026-07-14T14:20:00'),
      gift('2026-07-14T14:30:00'),
      gift('2026-07-15T09:00:00'),
      gift('2026-07-08T20:00:00')
    ]);
    expect(insight).not.toBeNull();
    expect(insight!.bestHour).toBe(14);
    expect(insight!.bestHourLabel).toBe('2–3 PM');
    expect(insight!.bestDay).toBe('Tuesday');
    expect(insight!.sampleSize).toBe(5);
    expect(insight!.hourlyCounts[14]).toBe(3);
  });

  it('labels midnight and noon boundaries correctly', () => {
    const midnight = computeSendTimeInsights(Array(5).fill(gift('2026-07-13T00:15:00')));
    expect(midnight!.bestHourLabel).toBe('12–1 AM');
    const noon = computeSendTimeInsights(Array(5).fill(gift('2026-07-13T12:15:00')));
    expect(noon!.bestHourLabel).toBe('12–1 PM');
  });
});
