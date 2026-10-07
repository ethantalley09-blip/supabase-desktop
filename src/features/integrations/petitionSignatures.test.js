import { describe, expect, it } from 'vitest';
import { computePetitionSignatures, computeSignatureVelocity } from './petitionSignatures';
describe('computePetitionSignatures', () => {
    it('returns nothing for an empty signature list', () => {
        expect(computePetitionSignatures([])).toEqual([]);
    });
    it('dedupes the same real signer signing twice (a re-delivered webhook, or a genuine resubmit)', () => {
        const rows = [
            { external_petition_id: 'p1', external_petition_name: 'Fix the crosswalk', signer_email: 'a@x.com', signed_at: '2026-07-01T00:00:00Z' },
            { external_petition_id: 'p1', external_petition_name: 'Fix the crosswalk', signer_email: 'a@x.com', signed_at: '2026-07-01T00:05:00Z' }
        ];
        const result = computePetitionSignatures(rows);
        expect(result).toHaveLength(1);
        expect(result[0].totalSignatures).toBe(1);
    });
    it('counts distinct real signers and tracks first/last signed timestamps', () => {
        const rows = [
            { external_petition_id: 'p1', signer_email: 'a@x.com', signed_at: '2026-07-01T00:00:00Z' },
            { external_petition_id: 'p1', signer_email: 'b@x.com', signed_at: '2026-07-03T00:00:00Z' }
        ];
        const result = computePetitionSignatures(rows);
        expect(result[0].totalSignatures).toBe(2);
        expect(result[0].firstSignedAt).toBe('2026-07-01T00:00:00.000Z');
        expect(result[0].lastSignedAt).toBe('2026-07-03T00:00:00.000Z');
    });
    it('sorts multiple petitions by real signature count descending', () => {
        const rows = [
            { external_petition_id: 'small', signer_email: 'a@x.com', signed_at: '2026-07-01T00:00:00Z' },
            { external_petition_id: 'big', signer_email: 'b@x.com', signed_at: '2026-07-01T00:00:00Z' },
            { external_petition_id: 'big', signer_email: 'c@x.com', signed_at: '2026-07-01T00:00:00Z' }
        ];
        expect(computePetitionSignatures(rows).map((p) => p.petitionId)).toEqual(['big', 'small']);
    });
});
describe('computeSignatureVelocity', () => {
    it('reports zero velocity with no signatures', () => {
        expect(computeSignatureVelocity([], new Date('2026-07-28'))).toEqual({ count: 0, perDay: 0 });
    });
    it('only counts real signatures inside the trailing window', () => {
        const now = new Date('2026-07-28T00:00:00Z');
        const rows = [
            { signed_at: '2026-07-27T00:00:00Z' }, // inside 7-day window
            { signed_at: '2026-07-01T00:00:00Z' } // outside
        ];
        const result = computeSignatureVelocity(rows, now, 7);
        expect(result.count).toBe(1);
        expect(result.perDay).toBeCloseTo(0.1, 5);
    });
});
