import { describe, expect, it } from 'vitest';
import { buildFundraisingSnapshot } from './fundraisingSnapshot';
function donation(partial) {
    return {
        project_id: 'p1',
        donated_at: '2026-01-01',
        payment_method: null,
        voter_id: null,
        ...partial
    };
}
describe('buildFundraisingSnapshot', () => {
    it('aggregates totals, donor count, and compliance progress', () => {
        const donations = [
            donation({ id: '1', donor_id: 'a', amount_cents: 25000 }),
            donation({ id: '2', donor_id: 'a', amount_cents: 25000 }),
            donation({ id: '3', donor_id: 'b', amount_cents: 50000 })
        ];
        const snap = buildFundraisingSnapshot(donations, 100000, 100000);
        expect(snap.totalRaisedUsd).toBe(1000);
        expect(snap.donationCount).toBe(3);
        expect(snap.uniqueDonors).toBe(2);
        expect(snap.averageDonationUsd).toBeCloseTo(333.33, 2);
        expect(snap.largestDonationUsd).toBe(500);
        expect(snap.progressToCompliancePct).toBe(100);
        expect(snap.complianceUnlocked).toBe(true);
    });
    it('caps progress at 100 and handles an empty project', () => {
        expect(buildFundraisingSnapshot([], 0, 100000)).toMatchObject({
            totalRaisedUsd: 0,
            donationCount: 0,
            uniqueDonors: 0,
            averageDonationUsd: 0,
            progressToCompliancePct: 0,
            complianceUnlocked: false
        });
        const over = buildFundraisingSnapshot([{ id: '1', donor_id: 'a', amount_cents: 500000, project_id: 'p1', donated_at: '', payment_method: null, voter_id: null }], 500000, 100000);
        expect(over.progressToCompliancePct).toBe(100);
    });
});
