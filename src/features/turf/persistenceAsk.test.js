import { describe, expect, it } from 'vitest';
import { findPersistenceAskTargets } from './persistenceAsk';
const visit = (over) => ({
    voter_id: 'v1',
    voter_name: 'Pat Voter',
    occurred_at: new Date().toISOString(),
    outcome: 'no_answer',
    ...over
});
describe('findPersistenceAskTargets', () => {
    it('flags a door reached after enough real prior no-answers', () => {
        const visits = [
            visit({ occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-05T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', outcome: 'contacted' })
        ];
        const targets = findPersistenceAskTargets(visits, []);
        expect(targets).toEqual([{ voterId: 'v1', name: 'Pat Voter', priorAttempts: 2 }]);
    });
    it('excludes a door below the minimum prior-attempts threshold', () => {
        const visits = [
            visit({ occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', outcome: 'contacted' })
        ];
        expect(findPersistenceAskTargets(visits, [])).toEqual([]);
    });
    it('excludes a door whose latest visit was not a real contact', () => {
        const visits = [
            visit({ occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-05T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', outcome: 'no_answer' })
        ];
        expect(findPersistenceAskTargets(visits, [])).toEqual([]);
    });
    it('excludes a door that has already given', () => {
        const visits = [
            visit({ occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-05T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', outcome: 'contacted' })
        ];
        expect(findPersistenceAskTargets(visits, [{ voter_id: 'v1' }])).toEqual([]);
    });
    it('ranks doors with more prior attempts first', () => {
        const visits = [
            visit({ voter_id: 'v1', occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ voter_id: 'v1', occurred_at: '2026-07-05T00:00:00Z', outcome: 'no_answer' }),
            visit({ voter_id: 'v1', occurred_at: '2026-07-10T00:00:00Z', outcome: 'contacted' }),
            visit({ voter_id: 'v2', occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ voter_id: 'v2', occurred_at: '2026-07-02T00:00:00Z', outcome: 'no_answer' }),
            visit({ voter_id: 'v2', occurred_at: '2026-07-03T00:00:00Z', outcome: 'no_answer' }),
            visit({ voter_id: 'v2', occurred_at: '2026-07-10T00:00:00Z', outcome: 'contacted' })
        ];
        const targets = findPersistenceAskTargets(visits, []);
        expect(targets.map((t) => t.voterId)).toEqual(['v2', 'v1']);
    });
    it('ignores a door with no contact yet at all', () => {
        const visits = [
            visit({ occurred_at: '2026-07-01T00:00:00Z', outcome: 'no_answer' }),
            visit({ occurred_at: '2026-07-05T00:00:00Z', outcome: 'no_answer' })
        ];
        expect(findPersistenceAskTargets(visits, [])).toEqual([]);
    });
});
