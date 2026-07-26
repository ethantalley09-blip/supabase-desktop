import { describe, expect, it } from 'vitest';
import { computeTerritoryDifficulty, type TerritoryVisit } from './territoryDifficulty';
import type { Territory, VoterRecord } from './useTurf';

const voter = (over: Partial<VoterRecord>): VoterRecord => ({
  id: 'v1',
  project_id: 'p1',
  data: {},
  full_name: 'Pat Voter',
  address_line: '12 Oak St',
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

const territories: Territory[] = [
  { id: 't-easy', project_id: 'p1', name: 'Easy Ward', assigned_to: null, geometry: { type: 'Polygon', coordinates: [] }, area_sq_meters: null, profiles: null },
  { id: 't-hard', project_id: 'p1', name: 'Hard Ward', assigned_to: null, geometry: { type: 'Polygon', coordinates: [] }, area_sq_meters: null, profiles: null }
];

const visit = (over: Partial<TerritoryVisit>): TerritoryVisit => ({
  voter_id: 'v1',
  outcome: 'contacted',
  persuadability_bucket: 'unknown',
  ...over
});

describe('computeTerritoryDifficulty', () => {
  it('excludes territories below the minimum-attempts threshold', () => {
    const voters = [voter({ id: 'a', territory_id: 't-easy' })];
    const visits = [visit({ voter_id: 'a', outcome: 'contacted' }), visit({ voter_id: 'a', outcome: 'contacted' })];
    expect(computeTerritoryDifficulty(voters, visits, territories)).toEqual([]);
  });

  it('ranks the hardest territory (opposition + dead-door rate) first', () => {
    const voters = [
      voter({ id: 'a1', territory_id: 't-easy' }),
      voter({ id: 'a2', territory_id: 't-easy' }),
      voter({ id: 'a3', territory_id: 't-easy' }),
      voter({ id: 'b1', territory_id: 't-hard' }),
      voter({ id: 'b2', territory_id: 't-hard' }),
      voter({ id: 'b3', territory_id: 't-hard' })
    ];
    const visits = [
      // Easy ward: all contacted, no opposition
      visit({ voter_id: 'a1', outcome: 'contacted', persuadability_bucket: 'base_support' }),
      visit({ voter_id: 'a2', outcome: 'contacted', persuadability_bucket: 'base_support' }),
      visit({ voter_id: 'a3', outcome: 'contacted', persuadability_bucket: 'base_support' }),
      // Hard ward: mostly opposed/dead doors
      visit({ voter_id: 'b1', outcome: 'contacted', persuadability_bucket: 'opposed' }),
      visit({ voter_id: 'b2', outcome: 'dead_door', persuadability_bucket: 'unknown' }),
      visit({ voter_id: 'b3', outcome: 'contacted', persuadability_bucket: 'opposed' })
    ];
    const result = computeTerritoryDifficulty(voters, visits, territories);
    expect(result[0].name).toBe('Hard Ward');
    expect(result[0].oppositionPct).toBeGreaterThan(0);
    expect(result[1].name).toBe('Easy Ward');
    expect(result[1].oppositionPct).toBe(0);
  });

  it('ignores visits for doors with no territory assignment', () => {
    const voters = [voter({ id: 'a', territory_id: null })];
    const visits = [visit({ voter_id: 'a' }), visit({ voter_id: 'a' }), visit({ voter_id: 'a' })];
    expect(computeTerritoryDifficulty(voters, visits, territories)).toEqual([]);
  });

  it('counts real remaining doors per territory', () => {
    const voters = [
      voter({ id: 'a1', territory_id: 't-easy' }),
      voter({ id: 'a2', territory_id: 't-easy' }),
      voter({ id: 'a3', territory_id: 't-easy' }),
      voter({ id: 'a4', territory_id: 't-easy', last_contacted_at: null }) // remaining
    ];
    const visits = [visit({ voter_id: 'a1' }), visit({ voter_id: 'a2' }), visit({ voter_id: 'a3' })];
    const result = computeTerritoryDifficulty(voters, visits, territories);
    expect(result[0].remainingDoors).toBeGreaterThanOrEqual(1);
  });
});
