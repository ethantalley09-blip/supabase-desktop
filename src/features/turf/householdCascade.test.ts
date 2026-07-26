import { describe, expect, it } from 'vitest';
import type { Household } from './households';
import { findHouseholdCascadeTargets, type DonationForCascade } from './householdCascade';
import type { VoterRecord } from './useTurf';

const voter = (id: string, name: string): VoterRecord => ({ id, full_name: name }) as VoterRecord;

const household = (key: string, members: VoterRecord[]): Household => ({
  key,
  address: '1 Main St',
  lat: 0,
  lng: 0,
  members,
  memberCount: members.length
});

describe('findHouseholdCascadeTargets', () => {
  it('flags the un-asked members when one household member has given', () => {
    const households = [household('h1', [voter('v1', 'Alice'), voter('v2', 'Bob')])];
    const donations: DonationForCascade[] = [{ voter_id: 'v1', amount_cents: 5000 }];
    const targets = findHouseholdCascadeTargets(households, donations);
    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({ givingMemberName: 'Alice', givingMemberAmountCents: 5000 });
    expect(targets[0].askTargets).toEqual([{ voterId: 'v2', name: 'Bob' }]);
  });

  it('skips a single-member household — no one else to cross-sell to', () => {
    const households = [household('h1', [voter('v1', 'Alice')])];
    const targets = findHouseholdCascadeTargets(households, [{ voter_id: 'v1', amount_cents: 5000 }]);
    expect(targets).toEqual([]);
  });

  it('skips a household where no one has given yet', () => {
    const households = [household('h1', [voter('v1', 'Alice'), voter('v2', 'Bob')])];
    expect(findHouseholdCascadeTargets(households, [])).toEqual([]);
  });

  it('skips a household where everyone has already given', () => {
    const households = [household('h1', [voter('v1', 'Alice'), voter('v2', 'Bob')])];
    const donations: DonationForCascade[] = [
      { voter_id: 'v1', amount_cents: 5000 },
      { voter_id: 'v2', amount_cents: 2500 }
    ];
    expect(findHouseholdCascadeTargets(households, donations)).toEqual([]);
  });

  it('sums multiple gifts from the same giving member', () => {
    const households = [household('h1', [voter('v1', 'Alice'), voter('v2', 'Bob')])];
    const donations: DonationForCascade[] = [
      { voter_id: 'v1', amount_cents: 2000 },
      { voter_id: 'v1', amount_cents: 3000 }
    ];
    const targets = findHouseholdCascadeTargets(households, donations);
    expect(targets[0].givingMemberAmountCents).toBe(5000);
  });

  it('ignores donations with no linked voter_id', () => {
    const households = [household('h1', [voter('v1', 'Alice'), voter('v2', 'Bob')])];
    const targets = findHouseholdCascadeTargets(households, [{ voter_id: null, amount_cents: 5000 }]);
    expect(targets).toEqual([]);
  });

  it('sorts richer giving households first', () => {
    const households = [
      household('h1', [voter('v1', 'Alice'), voter('v2', 'Bob')]),
      household('h2', [voter('v3', 'Carla'), voter('v4', 'Dan')])
    ];
    const donations: DonationForCascade[] = [
      { voter_id: 'v1', amount_cents: 1000 },
      { voter_id: 'v3', amount_cents: 9000 }
    ];
    const targets = findHouseholdCascadeTargets(households, donations);
    expect(targets.map((t) => t.householdKey)).toEqual(['h2', 'h1']);
  });
});
