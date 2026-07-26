import { describe, expect, it } from 'vitest';
import { findPriorityDoors, type PriorityDoorInput } from './priorityDoor';
import type { RevisitCandidate } from './revisitQueue';

function door(overrides: Partial<PriorityDoorInput> & { id: string }): PriorityDoorInput {
  return {
    full_name: 'Voter',
    address_line: '1 Main St',
    bucket: 'persuadable',
    ballot_status: null,
    ...overrides
  };
}

describe('findPriorityDoors', () => {
  it('excludes doors that already returned a ballot', () => {
    const doors = [door({ id: 'v1', ballot_status: 'returned' })];
    expect(findPriorityDoors(doors, [], null)).toHaveLength(0);
  });

  it('excludes opposed and unknown doors', () => {
    const doors = [door({ id: 'v1', bucket: 'opposed' }), door({ id: 'v2', bucket: 'unknown' })];
    expect(findPriorityDoors(doors, [], null)).toHaveLength(0);
  });

  it('ranks a persuadable door above a base-support door, all else equal', () => {
    const doors = [door({ id: 'v1', bucket: 'base_support' }), door({ id: 'v2', bucket: 'persuadable' })];
    const result = findPriorityDoors(doors, [], null);
    expect(result[0].voterId).toBe('v2');
    expect(result[1].voterId).toBe('v1');
  });

  it('boosts a door that is also in the revisit queue, with a real reason', () => {
    const doors = [door({ id: 'v1', bucket: 'persuadable' }), door({ id: 'v2', bucket: 'persuadable' })];
    const revisits: RevisitCandidate[] = [{ voterId: 'v1', name: 'Voter', attempts: 3, lastAttemptAt: '2026-01-01' }];
    const result = findPriorityDoors(doors, revisits, null);
    expect(result[0].voterId).toBe('v1');
    expect(result[0].reasons).toContain('already 3 attempts without contact');
  });

  it('boosts every eligible door when the election is inside the urgency window', () => {
    const doors = [door({ id: 'v1', bucket: 'persuadable' })];
    const withoutUrgency = findPriorityDoors(doors, [], 30)[0];
    const withUrgency = findPriorityDoors(doors, [], 7)[0];
    expect(withUrgency.score).toBeGreaterThan(withoutUrgency.score);
    expect(withUrgency.reasons).toContain('only 7 days until the election');
  });

  it('does not apply election urgency once the election has passed', () => {
    const doors = [door({ id: 'v1', bucket: 'persuadable' })];
    const past = findPriorityDoors(doors, [], -1)[0];
    const none = findPriorityDoors(doors, [], null)[0];
    expect(past.score).toBe(none.score);
  });

  it('respects the limit and sorts highest score first', () => {
    const doors = [
      door({ id: 'v1', bucket: 'base_support' }),
      door({ id: 'v2', bucket: 'persuadable' }),
      door({ id: 'v3', bucket: 'persuadable' })
    ];
    const revisits: RevisitCandidate[] = [{ voterId: 'v3', name: 'Voter', attempts: 2, lastAttemptAt: '2026-01-01' }];
    const result = findPriorityDoors(doors, revisits, null, 2);
    expect(result).toHaveLength(2);
    expect(result[0].voterId).toBe('v3');
  });

  it('returns an empty list for no doors', () => {
    expect(findPriorityDoors([], [], null)).toHaveLength(0);
  });
});
