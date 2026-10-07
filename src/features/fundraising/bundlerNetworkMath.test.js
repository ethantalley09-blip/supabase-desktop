import { describe, expect, it } from 'vitest';
import { findBundlerClusters } from './bundlerNetworkMath';
function donor(id, name, employer) {
    return { id, full_name: name, employer };
}
describe('findBundlerClusters', () => {
    it('forms a cluster when two real donors at the same employer have both given', () => {
        const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp')];
        const donations = [
            { donor_id: 'd1', amount_cents: 5000 },
            { donor_id: 'd2', amount_cents: 3000 }
        ];
        const clusters = findBundlerClusters(donors, donations);
        expect(clusters).toHaveLength(1);
        expect(clusters[0]).toMatchObject({
            employer: 'Acme Corp',
            donorCount: 2,
            totalCents: 8000,
            anchorDonorId: 'd1',
            anchorDonorName: 'Alice',
            anchorDonorCents: 5000
        });
    });
    it('excludes an employer with only one real giver', () => {
        const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp')];
        const donations = [{ donor_id: 'd1', amount_cents: 5000 }];
        expect(findBundlerClusters(donors, donations)).toHaveLength(0);
    });
    it('excludes an employer where donors exist but nobody has given yet', () => {
        const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp')];
        expect(findBundlerClusters(donors, [])).toHaveLength(0);
    });
    it('normalizes employer casing/whitespace so they collapse into one cluster', () => {
        const donors = [donor('d1', 'Alice', ' Acme Corp '), donor('d2', 'Bob', 'ACME CORP')];
        const donations = [
            { donor_id: 'd1', amount_cents: 5000 },
            { donor_id: 'd2', amount_cents: 3000 }
        ];
        expect(findBundlerClusters(donors, donations)).toHaveLength(1);
    });
    it('ignores donors with no employer on file', () => {
        const donors = [donor('d1', 'Alice', null), donor('d2', 'Bob', null)];
        const donations = [
            { donor_id: 'd1', amount_cents: 5000 },
            { donor_id: 'd2', amount_cents: 3000 }
        ];
        expect(findBundlerClusters(donors, donations)).toHaveLength(0);
    });
    it('picks the highest real giver as the anchor, and sums multiple gifts per donor', () => {
        const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp'), donor('d3', 'Cara', 'Acme Corp')];
        const donations = [
            { donor_id: 'd1', amount_cents: 1000 },
            { donor_id: 'd1', amount_cents: 1000 },
            { donor_id: 'd2', amount_cents: 9000 },
            { donor_id: 'd3', amount_cents: 500 }
        ];
        const clusters = findBundlerClusters(donors, donations);
        expect(clusters[0].anchorDonorId).toBe('d2');
        expect(clusters[0].totalCents).toBe(11500);
    });
    it('sorts multiple clusters by total dollars descending', () => {
        const donors = [
            donor('d1', 'Alice', 'Small Co'),
            donor('d2', 'Bob', 'Small Co'),
            donor('d3', 'Cara', 'Big Co'),
            donor('d4', 'Dan', 'Big Co')
        ];
        const donations = [
            { donor_id: 'd1', amount_cents: 1000 },
            { donor_id: 'd2', amount_cents: 1000 },
            { donor_id: 'd3', amount_cents: 50000 },
            { donor_id: 'd4', amount_cents: 50000 }
        ];
        const clusters = findBundlerClusters(donors, donations);
        expect(clusters[0].employer).toBe('Big Co');
    });
    it('returns an empty list for no donors', () => {
        expect(findBundlerClusters([], [])).toHaveLength(0);
    });
});
