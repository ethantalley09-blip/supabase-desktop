import { describe, expect, it } from 'vitest';
import {
  buildBriefingSnapshot,
  classifyPersuadability,
  heatmapWeight,
  voterParty
} from './turfBriefingMath';
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

describe('voterParty', () => {
  it('normalizes common party aliases case-insensitively', () => {
    expect(voterParty(voter({ data: { Party: 'DEM' } }))).toBe('democrat');
    expect(voterParty(voter({ data: { party: 'republican' } }))).toBe('republican');
    expect(voterParty(voter({ data: { 'Party Affiliation': 'unaffiliated' } }))).toBe('independent');
  });

  it('buckets an unrecognized but present value as other rather than dropping it', () => {
    expect(voterParty(voter({ data: { party: 'Green' } }))).toBe('other');
  });

  it('returns null when no party field is present, instead of guessing', () => {
    expect(voterParty(voter({ data: { city: 'Columbus' } }))).toBeNull();
    expect(voterParty(voter({ data: { party: '' } }))).toBeNull();
  });
});

describe('classifyPersuadability', () => {
  it('classifies a noted supporter as base_support with a reason', () => {
    const result = classifyPersuadability(voter({ canvass_notes: 'Big supporter, wants a yard sign.' }));
    expect(result.bucket).toBe('base_support');
    expect(result.reasons).toContain('noted as a big supporter');
  });

  it('classifies an undecided voter as persuadable', () => {
    const result = classifyPersuadability(voter({ canvass_notes: 'Still undecided, wants more info.' }));
    expect(result.bucket).toBe('persuadable');
  });

  it('classifies a hostile note as opposed', () => {
    const result = classifyPersuadability(voter({ canvass_notes: 'Opposed, asked us to leave.' }));
    expect(result.bucket).toBe('opposed');
  });

  it('returns unknown for a door with no signal', () => {
    expect(classifyPersuadability(voter({ canvass_notes: 'Not home.' })).bucket).toBe('unknown');
  });

  it('returns unknown for non-active doors regardless of notes', () => {
    const result = classifyPersuadability(voter({ contact_status: 'moved', canvass_notes: 'Big supporter!' }));
    expect(result.bucket).toBe('unknown');
    expect(result.score).toBe(0);
  });
});

describe('heatmapWeight', () => {
  const now = Date.now();

  it('stays within [0,1] for every mode', () => {
    const v = voter({ canvass_notes: 'undecided', last_contacted_at: new Date(now - 100000).toISOString() });
    for (const mode of ['density', 'persuadability', 'fundraising', 'staleness'] as const) {
      const w = heatmapWeight(v, mode, now);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });

  it('weighs a never-contacted door as hottest for staleness', () => {
    expect(heatmapWeight(voter({ last_contacted_at: null }), 'staleness', now)).toBe(1);
  });

  it('weighs a just-contacted door as coolest for staleness', () => {
    const w = heatmapWeight(voter({ last_contacted_at: new Date(now).toISOString() }), 'staleness', now);
    expect(w).toBeCloseTo(0, 1);
  });

  it('weighs a persuadable door hottest for the persuadability mode', () => {
    const persuadable = heatmapWeight(voter({ canvass_notes: 'undecided' }), 'persuadability', now);
    const opposed = heatmapWeight(voter({ canvass_notes: 'opposed to us' }), 'persuadability', now);
    expect(persuadable).toBeGreaterThan(opposed);
  });
});

describe('buildBriefingSnapshot', () => {
  const territories: Territory[] = [
    { id: 't1', project_id: 'p1', name: 'Ward 3', assigned_to: null, geometry: { type: 'Polygon', coordinates: [] }, area_sq_meters: null, profiles: null }
  ];

  it('counts doors remaining as knockable, mapped doors not contacted in the last 24h', () => {
    const now = Date.now();
    const snapshot = buildBriefingSnapshot(
      [
        voter({ id: 'a', territory_id: 't1' }), // never contacted -> remaining
        voter({ id: 'b', territory_id: 't1', last_contacted_at: new Date(now - 1000).toISOString() }), // just contacted -> not remaining
        voter({ id: 'c', contact_status: 'moved' }) // excluded entirely
      ],
      territories,
      now
    );
    expect(snapshot.doorsRemainingToday).toBe(1);
    expect(snapshot.totalActive).toBe(2);
    expect(snapshot.topRemainingTerritories).toEqual([{ name: 'Ward 3', remaining: 1 }]);
  });

  it('tallies persuadability buckets across active voters', () => {
    const snapshot = buildBriefingSnapshot(
      [
        voter({ id: 'a', canvass_notes: 'big supporter' }),
        voter({ id: 'b', canvass_notes: 'undecided' }),
        voter({ id: 'c', canvass_notes: 'opposed' }),
        voter({ id: 'd', canvass_notes: null })
      ],
      [],
      Date.now()
    );
    expect(snapshot.baseSupport).toBe(1);
    expect(snapshot.persuadable).toBe(1);
    expect(snapshot.opposed).toBe(1);
    expect(snapshot.directionUnknown).toBe(1);
  });

  it('computes a contact rate from doors touched in the last 4 hours', () => {
    const now = Date.now();
    const snapshot = buildBriefingSnapshot(
      [
        voter({ id: 'a', last_contacted_at: new Date(now - 60 * 60 * 1000).toISOString() }),
        voter({ id: 'b', last_contacted_at: new Date(now - 60 * 60 * 1000).toISOString() })
      ],
      [],
      now
    );
    expect(snapshot.contactedLast4h).toBe(2);
    expect(snapshot.contactRatePerHour).toBe(0.5);
  });
});
