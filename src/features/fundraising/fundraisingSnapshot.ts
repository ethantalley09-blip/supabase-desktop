// Pure, Supabase-free aggregate of a project's fundraising state — the only
// fundraising data the AI features send to the model (never individual donor
// rows). Unit-tested; kept out of useFundraising.ts (which imports the client).
import type { Donation } from './useFundraising';

export type FundraisingSnapshot = {
  totalRaisedUsd: number;
  donationCount: number;
  uniqueDonors: number;
  averageDonationUsd: number;
  largestDonationUsd: number;
  complianceThresholdUsd: number;
  progressToCompliancePct: number; // capped at 100
  complianceUnlocked: boolean;
};

const usd = (cents: number) => Math.round(cents) / 100;

export function buildFundraisingSnapshot(
  donations: Donation[],
  totalCents: number,
  thresholdCents: number
): FundraisingSnapshot {
  const donationCount = donations.length;
  const uniqueDonors = new Set(donations.map((d) => d.donor_id)).size;
  const largest = donations.reduce((max, d) => Math.max(max, d.amount_cents), 0);
  const average = donationCount > 0 ? totalCents / donationCount : 0;
  const pct = thresholdCents > 0 ? Math.min(100, Math.round((totalCents / thresholdCents) * 100)) : 0;

  return {
    totalRaisedUsd: usd(totalCents),
    donationCount,
    uniqueDonors,
    averageDonationUsd: usd(average),
    largestDonationUsd: usd(largest),
    complianceThresholdUsd: usd(thresholdCents),
    progressToCompliancePct: pct,
    complianceUnlocked: totalCents >= thresholdCents
  };
}
