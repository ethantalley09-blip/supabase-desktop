import { describe, expect, it } from 'vitest';
import { dedupeHouseholds, groupIntoHouseholds, normalizeAddress } from './households';
import type { VoterRecord } from './useTurf';

const voter = (over: Partial<VoterRecord>): VoterRecord => ({
  id: 'v1',
  project_id: 'p1',
  data: {},
  full_name: 'Pat Voter',
  address_line: '100 Main St',
  lat: 39.9,
  lng: -83.0,
  territory_id: null,
  contact_status: 'active',
  ballot_status: 'none',
  ballot_updated_at: null,
  canvass_notes: null,
  geocode_status: 'matched',
  geocode_checked_at: null,
  last_contacted_at: null,
  ...over
});

describe('normalizeAddress', () => {
  it('trims, lowercases, and collapses whitespace', () => {
    expect(normalizeAddress('  100   Main St  ')).toBe('100 main st');
  });

  it('does not strip unit numbers', () => {
    expect(normalizeAddress('100 Main St Apt 1')).not.toBe(normalizeAddress('100 Main St Apt 2'));
  });
});

describe('groupIntoHouseholds', () => {
  it('groups voters at the identical address into one household', () => {
    const households = groupIntoHouseholds([
      voter({ id: 'a', address_line: '100 Main St' }),
      voter({ id: 'b', address_line: '100 MAIN ST' }),
      voter({ id: 'c', address_line: '102 Main St' })
    ]);
    expect(households).toHaveLength(2);
    const main100 = households.find((h) => h.memberCount === 2)!;
    expect(main100.members.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('keeps different apartment units as separate households', () => {
    const households = groupIntoHouseholds([
      voter({ id: 'a', address_line: '100 Main St Apt 1' }),
      voter({ id: 'b', address_line: '100 Main St Apt 2' })
    ]);
    expect(households).toHaveLength(2);
  });

  it('gives voters with no address their own household rather than merging', () => {
    const households = groupIntoHouseholds([
      voter({ id: 'a', address_line: null }),
      voter({ id: 'b', address_line: null })
    ]);
    expect(households).toHaveLength(2);
  });
});

describe('dedupeHouseholds', () => {
  it('returns one representative voter per unique address', () => {
    const deduped = dedupeHouseholds([
      voter({ id: 'a', address_line: '100 Main St' }),
      voter({ id: 'b', address_line: '100 Main St' }),
      voter({ id: 'c', address_line: '102 Main St' })
    ]);
    expect(deduped).toHaveLength(2);
  });
});
