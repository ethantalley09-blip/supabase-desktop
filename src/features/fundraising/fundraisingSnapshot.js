const usd = (cents) => Math.round(cents) / 100;
export function buildFundraisingSnapshot(donations, totalCents, thresholdCents) {
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
