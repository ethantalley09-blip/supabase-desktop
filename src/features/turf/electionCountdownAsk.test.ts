import { describe, expect, it } from 'vitest';
import { daysUntilElection, findCountdownAskTargets } from './electionCountdownAsk';
import type { WarmDoor } from './doorstep';

const door = (voterId: string): WarmDoor => ({
  voterId,
  name: 'Voter',
  address: '1 Main St',
  score: 40,
  reasons: ['noted as a supporter']
});

describe('daysUntilElection', () => {
  it('computes whole days between today and a future date', () => {
    const now = new Date(2026, 6, 1, 15, 0, 0); // July 1, 2026, 3pm local
    expect(daysUntilElection('2026-07-08', now)).toBe(7);
  });

  it('returns 0 on election day itself', () => {
    const now = new Date(2026, 6, 8, 9, 0, 0);
    expect(daysUntilElection('2026-07-08', now)).toBe(0);
  });

  it('returns a negative number once the election has passed', () => {
    const now = new Date(2026, 6, 10, 9, 0, 0);
    expect(daysUntilElection('2026-07-08', now)).toBe(-2);
  });
});

describe('findCountdownAskTargets', () => {
  const now = new Date(2026, 6, 1);

  it('attaches the real days-remaining figure to each ungiven warm door', () => {
    const targets = findCountdownAskTargets([door('v1')], [], '2026-07-08', now);
    expect(targets).toEqual([{ ...door('v1'), daysUntilElection: 7 }]);
  });

  it('excludes a warm door that has already given', () => {
    const targets = findCountdownAskTargets([door('v1')], [{ voter_id: 'v1' }], '2026-07-08', now);
    expect(targets).toEqual([]);
  });

  it('returns nothing once the election date has passed', () => {
    const targets = findCountdownAskTargets([door('v1')], [], '2026-06-01', now);
    expect(targets).toEqual([]);
  });

  it('caps results at the given limit', () => {
    const doors = [door('v1'), door('v2'), door('v3')];
    const targets = findCountdownAskTargets(doors, [], '2026-07-08', now, 2);
    expect(targets).toHaveLength(2);
  });
});
