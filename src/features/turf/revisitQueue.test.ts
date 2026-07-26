import { describe, expect, it } from 'vitest';
import { buildRevisitQueue, type RevisitTarget, type VisitForRevisit } from './revisitQueue';

const target = (id: string): RevisitTarget => ({ id, full_name: `Voter ${id}` });
const visit = (over: Partial<VisitForRevisit>): VisitForRevisit => ({
  voter_id: 'v1',
  occurred_at: new Date().toISOString(),
  outcome: 'no_answer',
  ...over
});

describe('buildRevisitQueue', () => {
  it('excludes a door below the minimum attempt threshold', () => {
    const queue = buildRevisitQueue([target('v1')], [visit({ voter_id: 'v1' })]);
    expect(queue).toEqual([]);
  });

  it('excludes a door that was ever successfully contacted', () => {
    const queue = buildRevisitQueue(
      [target('v1')],
      [visit({ voter_id: 'v1' }), visit({ voter_id: 'v1' }), visit({ voter_id: 'v1', outcome: 'contacted' })]
    );
    expect(queue).toEqual([]);
  });

  it('includes a door with enough real failed attempts and no contact yet', () => {
    const queue = buildRevisitQueue([target('v1')], [visit({ voter_id: 'v1' }), visit({ voter_id: 'v1' })]);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ voterId: 'v1', attempts: 2 });
  });

  it('ranks by attempt count descending', () => {
    const queue = buildRevisitQueue(
      [target('v1'), target('v2')],
      [
        visit({ voter_id: 'v1' }),
        visit({ voter_id: 'v1' }),
        visit({ voter_id: 'v2' }),
        visit({ voter_id: 'v2' }),
        visit({ voter_id: 'v2' })
      ]
    );
    expect(queue.map((c) => c.voterId)).toEqual(['v2', 'v1']);
  });

  it('breaks a tie by longest-stale last attempt first', () => {
    const older = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const newer = new Date().toISOString();
    const queue = buildRevisitQueue(
      [target('v1'), target('v2')],
      [
        visit({ voter_id: 'v1', occurred_at: newer }),
        visit({ voter_id: 'v1', occurred_at: newer }),
        visit({ voter_id: 'v2', occurred_at: older }),
        visit({ voter_id: 'v2', occurred_at: older })
      ]
    );
    expect(queue.map((c) => c.voterId)).toEqual(['v2', 'v1']);
  });

  it('ignores a door with no visit history at all', () => {
    const queue = buildRevisitQueue([target('v1')], []);
    expect(queue).toEqual([]);
  });
});
