import { describe, expect, it } from 'vitest';
import { findGoldenHourTargets } from './goldenHourPush';
const door = (over) => ({
    voterId: 'v1',
    name: 'Voter',
    address: '1 Main St',
    score: 50,
    reasons: ['noted as a supporter'],
    ...over
});
describe('findGoldenHourTargets', () => {
    it('includes a warm door that is still remaining and never given', () => {
        const targets = findGoldenHourTargets([door({ voterId: 'v1' })], new Set(['v1']), []);
        expect(targets).toHaveLength(1);
    });
    it('excludes a warm door that is no longer in the remaining set', () => {
        const targets = findGoldenHourTargets([door({ voterId: 'v1' })], new Set(['v2']), []);
        expect(targets).toEqual([]);
    });
    it('excludes a warm door that has already given', () => {
        const targets = findGoldenHourTargets([door({ voterId: 'v1' })], new Set(['v1']), [{ voter_id: 'v1' }]);
        expect(targets).toEqual([]);
    });
    it('ignores donations with no linked voter_id', () => {
        const targets = findGoldenHourTargets([door({ voterId: 'v1' })], new Set(['v1']), [{ voter_id: null }]);
        expect(targets).toHaveLength(1);
    });
    it('caps results at the given limit, preserving warmDoors order (already score-ranked)', () => {
        const doors = [door({ voterId: 'v1' }), door({ voterId: 'v2' }), door({ voterId: 'v3' }), door({ voterId: 'v4' })];
        const targets = findGoldenHourTargets(doors, new Set(['v1', 'v2', 'v3', 'v4']), [], 2);
        expect(targets.map((t) => t.voterId)).toEqual(['v1', 'v2']);
    });
});
