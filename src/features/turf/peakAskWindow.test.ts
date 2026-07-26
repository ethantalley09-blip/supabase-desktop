import { describe, expect, it } from 'vitest';
import { computePeakAskWindow, type DonationForPeakWindow } from './peakAskWindow';

const atLocalHour = (hour: number): string => new Date(2026, 6, 22, hour, 0, 0).toISOString();

const gift = (over: Partial<DonationForPeakWindow>): DonationForPeakWindow => ({
  voter_id: 'v1',
  amount_cents: 1000,
  donated_at: atLocalHour(18),
  ...over
});

describe('computePeakAskWindow', () => {
  it('returns null below the minimum sample size', () => {
    expect(computePeakAskWindow([gift({}), gift({})])).toBeNull();
  });

  it('returns null when there are no linked (doorstep) donations at all', () => {
    const donations = [gift({ voter_id: null }), gift({ voter_id: null }), gift({ voter_id: null })];
    expect(computePeakAskWindow(donations)).toBeNull();
  });

  it('ignores unlinked donations when finding the peak hour', () => {
    const donations: DonationForPeakWindow[] = [
      gift({ voter_id: 'v1', amount_cents: 500, donated_at: atLocalHour(18) }),
      gift({ voter_id: 'v2', amount_cents: 500, donated_at: atLocalHour(18) }),
      gift({ voter_id: 'v3', amount_cents: 500, donated_at: atLocalHour(18) }),
      // A huge unlinked (online) gift at a different hour should NOT win.
      gift({ voter_id: null, amount_cents: 100_000, donated_at: atLocalHour(9) })
    ];
    const result = computePeakAskWindow(donations);
    expect(result?.bestHour).toBe(18);
    expect(result?.sampleSize).toBe(3);
  });

  it('picks the hour with the highest total $ raised, not the most gifts', () => {
    const donations: DonationForPeakWindow[] = [
      // Hour 18: 3 small gifts totaling $15
      gift({ voter_id: 'v1', amount_cents: 500, donated_at: atLocalHour(18) }),
      gift({ voter_id: 'v2', amount_cents: 500, donated_at: atLocalHour(18) }),
      gift({ voter_id: 'v3', amount_cents: 500, donated_at: atLocalHour(18) }),
      // Hour 11: 1 big gift totaling $100
      gift({ voter_id: 'v4', amount_cents: 10_000, donated_at: atLocalHour(11) })
    ];
    const result = computePeakAskWindow(donations);
    expect(result?.bestHour).toBe(11);
    expect(result?.giftCountInBestHour).toBe(1);
    expect(result?.totalCentsInBestHour).toBe(10_000);
  });
});
