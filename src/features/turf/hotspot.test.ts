import { describe, expect, it } from 'vitest';
import { findHotspot } from './hotspot';
import type { VoterRecord } from './useTurf';

function voter(
  id: string,
  lat: number | null,
  lng: number | null,
  overrides: Partial<VoterRecord> = {}
): VoterRecord {
  return {
    id,
    project_id: 'p1',
    data: {},
    full_name: 'Voter',
    address_line: '1 Main St',
    lat,
    lng,
    territory_id: null,
    contact_status: 'active',
    ballot_status: 'none',
    ballot_updated_at: null,
    canvass_notes: null,
    geocode_status: 'matched',
    geocode_checked_at: null,
    last_contacted_at: null,
    ...overrides
  } as VoterRecord;
}

describe('findHotspot', () => {
  it('picks the cell with the highest total real weight', () => {
    const voters = [
      voter('v1', 40.1234, -75.4321, { address_line: '100 Main St', canvass_notes: 'undecided' }),
      voter('v2', 40.1236, -75.4322, { address_line: '102 Main St', canvass_notes: 'undecided' }),
      voter('v3', 41.9876, -76.6543, { address_line: '1 Oak Ave', canvass_notes: 'undecided' })
    ];
    const hotspot = findHotspot(voters, 'persuadability');
    expect(hotspot).not.toBeNull();
    expect(hotspot!.voterCount).toBe(2);
    expect(hotspot!.sampleAddresses).toEqual(expect.arrayContaining(['100 Main St', '102 Main St']));
  });

  it('excludes unmapped voters', () => {
    const voters = [voter('v1', null, null, { canvass_notes: 'undecided' })];
    expect(findHotspot(voters, 'persuadability')).toBeNull();
  });

  it('returns null when no cell has any real weight (fundraising mode, no signal, ballot not returned)', () => {
    const voters = [voter('v1', 40.1234, -75.4321, { canvass_notes: null, ballot_status: 'none' })];
    expect(findHotspot(voters, 'fundraising')).toBeNull();
  });

  it('averages the real coordinates of the cell', () => {
    const voters = [
      voter('v1', 40.1234, -75.4321),
      voter('v2', 40.1236, -75.4323)
    ];
    const hotspot = findHotspot(voters, 'density');
    expect(hotspot!.cellLat).toBeCloseTo(40.1235, 3);
    expect(hotspot!.cellLng).toBeCloseTo(-75.4322, 3);
  });

  it('dedupes repeated addresses in the sample', () => {
    const voters = [
      voter('v1', 40.1234, -75.4321, { address_line: '100 Main St' }),
      voter('v2', 40.1236, -75.4322, { address_line: '100 Main St' })
    ];
    const hotspot = findHotspot(voters, 'density');
    expect(hotspot!.sampleAddresses).toEqual(['100 Main St']);
  });

  it('returns null for no voters', () => {
    expect(findHotspot([], 'density')).toBeNull();
  });
});
