import { describe, expect, it } from 'vitest';
import { computeGoalProgress, type DonationForGoal } from './teamGoalTracker';

const NOW = new Date('2026-07-24T18:00:00');

function hoursAgo(hours: number): string {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}

describe('computeGoalProgress', () => {
  it('sums only real doorstep gifts (voter_id set) from today', () => {
    const donations: DonationForGoal[] = [
      { voter_id: 'v1', amount_cents: 1000, donated_at: hoursAgo(2) },
      { voter_id: 'v2', amount_cents: 500, donated_at: hoursAgo(1) },
      { voter_id: null, amount_cents: 5000, donated_at: hoursAgo(1) }, // online gift — excluded
      { voter_id: 'v3', amount_cents: 2000, donated_at: hoursAgo(30) } // yesterday — excluded
    ];
    const result = computeGoalProgress(donations, 10000, NOW, null);
    expect(result.raisedCentsToday).toBe(1500);
    expect(result.giftCountToday).toBe(2);
    expect(result.progressPct).toBe(15);
  });

  it('allows progress to exceed 100% once the goal is beaten', () => {
    const donations: DonationForGoal[] = [{ voter_id: 'v1', amount_cents: 15000, donated_at: hoursAgo(1) }];
    const result = computeGoalProgress(donations, 10000, NOW, null);
    expect(result.progressPct).toBe(150);
  });

  it('returns 0% progress and no projection with no gifts today', () => {
    const result = computeGoalProgress([], 10000, NOW, 60);
    expect(result.progressPct).toBe(0);
    expect(result.projectedCentsByEndOfDay).toBeNull();
  });

  it('projects an honest end-of-day total from real pace and real remaining daylight', () => {
    // $10 raised over the last 2 hours (120 minutes) = $0.0833/min, times 60 remaining minutes = ~$5 more
    const donations: DonationForGoal[] = [{ voter_id: 'v1', amount_cents: 1000, donated_at: hoursAgo(2) }];
    const nowAt18 = new Date('2026-07-24T18:00:00'); // today started at 00:00, so 18h = 1080 min elapsed
    const result = computeGoalProgress(donations, 10000, nowAt18, 60);
    // rate = 1000 cents / 1080 min ~= 0.9259 cents/min; projected = 1000 + 0.9259*60 ~= 1056
    expect(result.projectedCentsByEndOfDay).toBeGreaterThan(1000);
    expect(result.projectedCentsByEndOfDay).toBeLessThan(1100);
  });

  it('returns no projection when daylight info is unavailable', () => {
    const donations: DonationForGoal[] = [{ voter_id: 'v1', amount_cents: 1000, donated_at: hoursAgo(1) }];
    const result = computeGoalProgress(donations, 10000, NOW, null);
    expect(result.projectedCentsByEndOfDay).toBeNull();
  });

  it('handles a zero goal without dividing by zero', () => {
    const result = computeGoalProgress([], 0, NOW, null);
    expect(result.progressPct).toBe(0);
  });
});
