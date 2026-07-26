import { describe, expect, it } from 'vitest';
import {
  applySegment,
  buildTurfSnapshot,
  dominantVoterLanguage,
  optimizeWalkOrder,
  splitIntoWalkLists,
  voterCity,
  voterLanguage,
  voterWard
} from './route';
import type { Territory, VoterRecord } from './useTurf';

function voter(
  partial: Partial<VoterRecord> & Pick<VoterRecord, 'id'>
): VoterRecord {
  return {
    project_id: 'p1',
    data: {},
    full_name: null,
    address_line: null,
    lat: null,
    lng: null,
    territory_id: null,
    contact_status: 'active',
    ballot_status: 'none',
    ballot_updated_at: null,
    canvass_notes: null,
    geocode_status: 'unattempted',
    geocode_checked_at: null,
    last_contacted_at: null,
    ...partial
  };
}

function at(id: string, lng: number, lat: number): VoterRecord {
  return voter({ id, lng, lat });
}

describe('voterCity / voterWard', () => {
  it('reads standard City and Ward headers', () => {
    const v = voter({ id: '1', data: { City: 'Springfield', Ward: '3' } });
    expect(voterCity(v)).toBe('Springfield');
    expect(voterWard(v)).toBe('3');
  });

  it('matches headers case-insensitively and treats Precinct as ward', () => {
    const v = voter({ id: '1', data: { city: 'Shelbyville', PRECINCT: '12B' } });
    expect(voterCity(v)).toBe('Shelbyville');
    expect(voterWard(v)).toBe('12B');
  });

  it('trims whitespace and returns null when absent or blank', () => {
    expect(voterCity(voter({ id: '1', data: { City: '  Ogdenville  ' } }))).toBe('Ogdenville');
    expect(voterCity(voter({ id: '1', data: { City: '   ' } }))).toBeNull();
    expect(voterWard(voter({ id: '1', data: { Party: 'D' } }))).toBeNull();
  });
});

describe('optimizeWalkOrder', () => {
  it('handles empty and single-door selections', () => {
    expect(optimizeWalkOrder([])).toEqual({ ordered: [], meters: 0 });
    const one = optimizeWalkOrder([at('a', -71, 42)]);
    expect(one.ordered.map((v) => v.id)).toEqual(['a']);
    expect(one.meters).toBe(0);
  });

  it('ignores un-geocoded doors', () => {
    const r = optimizeWalkOrder([at('a', -71, 42), voter({ id: 'b' })]);
    expect(r.ordered.map((v) => v.id)).toEqual(['a']);
  });

  it('sorts collinear doors into monotone order and minimizes distance', () => {
    // Four doors on an east-west line, fed in scrambled order.
    const scrambled = [at('c', 2, 0), at('a', 0, 0), at('d', 3, 0), at('b', 1, 0)];
    const r = optimizeWalkOrder(scrambled);
    const lngs = r.ordered.map((v) => v.lng);
    // Optimal open path walks straight down the line (either direction).
    expect(lngs).toEqual([0, 1, 2, 3]);
    // No backtracking: total length equals the span from the first to last door.
    const span = optimizeWalkOrder([at('a', 0, 0), at('d', 3, 0)]).meters;
    expect(r.meters).toBeCloseTo(span, 5);
  });

  it('never returns a longer path than the naive input order', () => {
    const doors = [
      at('a', 0, 0),
      at('b', 0, 1),
      at('c', 1, 1),
      at('d', 1, 0),
      at('e', 0.5, 0.5)
    ];
    const naive = pathMeters(doors);
    const optimized = optimizeWalkOrder(doors).meters;
    expect(optimized).toBeLessThanOrEqual(naive + 1e-6);
  });
});

describe('splitIntoWalkLists', () => {
  it('returns one list when k <= 1 and empty for no doors', () => {
    expect(splitIntoWalkLists([], 3)).toEqual([]);
    const one = splitIntoWalkLists([at('a', 0, 0), at('b', 1, 0)], 1);
    expect(one).toHaveLength(1);
    expect(one[0].ordered).toHaveLength(2);
  });

  it('partitions doors into k balanced lists covering every door exactly once', () => {
    // 12 doors in two well-separated clusters.
    const doors: VoterRecord[] = [];
    for (let i = 0; i < 6; i++) doors.push(at(`w${i}`, -80 + i * 0.001, 40));
    for (let i = 0; i < 6; i++) doors.push(at(`e${i}`, -70 + i * 0.001, 40));

    const lists = splitIntoWalkLists(doors, 3);
    expect(lists).toHaveLength(3);

    // Every door appears exactly once across all lists.
    const ids = lists.flatMap((l) => l.ordered.map((v) => v.id)).sort();
    expect(ids).toEqual(doors.map((d) => d.id).sort());

    // Balanced: no list exceeds ceil(12/3) = 4 doors.
    for (const l of lists) expect(l.ordered.length).toBeLessThanOrEqual(4);
  });

  it('keeps lists geographically contiguous (does not mix far-apart clusters)', () => {
    const doors: VoterRecord[] = [];
    for (let i = 0; i < 5; i++) doors.push(at(`w${i}`, -80 + i * 0.001, 40));
    for (let i = 0; i < 5; i++) doors.push(at(`e${i}`, -70 + i * 0.001, 40));

    const lists = splitIntoWalkLists(doors, 2);
    // With a clean 5/5 split and cap of 5, each list should be a single cluster.
    for (const l of lists) {
      const prefixes = new Set(l.ordered.map((v) => v.id[0]));
      expect(prefixes.size).toBe(1);
    }
  });
});

describe('voterLanguage / dominantVoterLanguage', () => {
  it('reads a preferred-language column under various headers', () => {
    expect(voterLanguage(voter({ id: '1', data: { Language: 'Spanish' } }))).toBe('Spanish');
    expect(voterLanguage(voter({ id: '2', data: { 'Preferred Language': 'es' } }))).toBe('es');
    expect(voterLanguage(voter({ id: '3', data: { Party: 'D' } }))).toBeNull();
  });

  it('picks the most common non-English language, normalizing codes/spellings', () => {
    const voters = [
      voter({ id: '1', data: { Language: 'es' } }),
      voter({ id: '2', data: { Language: 'Español' } }),
      voter({ id: '3', data: { Language: 'Vietnamese' } }),
      voter({ id: '4', data: { Language: 'English' } })
    ];
    // es + Español both normalize to Spanish → Spanish wins 2 to 1.
    expect(dominantVoterLanguage(voters)).toBe('Spanish');
  });

  it('returns null when no recognized non-English language is present', () => {
    expect(dominantVoterLanguage([voter({ id: '1', data: { Language: 'English' } })])).toBeNull();
    expect(dominantVoterLanguage([voter({ id: '1', data: {} })])).toBeNull();
  });
});

describe('applySegment', () => {
  const voters: VoterRecord[] = [
    voter({ id: '1', lat: 1, lng: 1, ballot_status: 'requested', data: { City: 'Springfield', Ward: '3', Language: 'Spanish' } }),
    voter({ id: '2', lat: 2, lng: 2, ballot_status: 'returned', data: { City: 'Springfield', Ward: '3', Language: 'Spanish' } }),
    voter({ id: '3', ballot_status: 'requested', contact_status: 'moved', data: { City: 'Shelbyville', Ward: '1' } }),
    voter({ id: '4', lat: 4, lng: 4, ballot_status: 'requested', territory_id: 't1', canvass_notes: 'call back', data: { City: 'Springfield', Ward: '3', Language: 'English' } })
  ];

  it('combines conditions (AND) across whitelisted fields', () => {
    const matched = applySegment(voters, { ballot_status: 'requested', ward: '3', language: 'Spanish' });
    expect(matched.map((v) => v.id)).toEqual(['1']);
  });

  it('filters by mapped / hasNotes / assignedToTerritory booleans', () => {
    expect(applySegment(voters, { mapped: false }).map((v) => v.id)).toEqual(['3']);
    expect(applySegment(voters, { hasNotes: true }).map((v) => v.id)).toEqual(['4']);
    expect(applySegment(voters, { assignedToTerritory: false }).map((v) => v.id)).toEqual(['1', '2', '3']);
  });

  it('ignores unknown enum values and empty filters (returns all)', () => {
    expect(applySegment(voters, { contact_status: 'bogus' })).toHaveLength(4);
    expect(applySegment(voters, {})).toHaveLength(4);
  });
});

describe('buildTurfSnapshot', () => {
  const territory = (id: string, assigned: string | null): Territory => ({
    id,
    project_id: 'p1',
    name: id,
    assigned_to: assigned,
    geometry: { type: 'Polygon', coordinates: [] },
    area_sq_meters: null,
    profiles: null
  });

  it('aggregates counts, ballots, cities, and territories', () => {
    const voters: VoterRecord[] = [
      voter({ id: '1', lat: 1, lng: 1, ballot_status: 'requested', territory_id: 't1', data: { City: 'Springfield', Ward: '1', Language: 'Spanish' }, canvass_notes: 'friendly' }),
      voter({ id: '2', lat: 2, lng: 2, ballot_status: 'returned', data: { City: 'Springfield', Ward: '2', Language: 'Spanish' } }),
      voter({ id: '3', address_line: '5 Main St', contact_status: 'moved', data: { City: 'Shelbyville' } }),
      voter({ id: '4', contact_status: 'do_not_contact' })
    ];
    const snap = buildTurfSnapshot(voters, [territory('t1', 'u1'), territory('t2', null)]);

    expect(snap.totalVoters).toBe(4);
    expect(snap.mapped).toBe(2);
    expect(snap.unmapped).toBe(2);
    expect(snap.geocodableBacklog).toBe(1); // only voter 3 is unmapped WITH an address
    expect(snap.contactStatus.active).toBe(2);
    expect(snap.contactStatus.moved).toBe(1);
    expect(snap.contactStatus.do_not_contact).toBe(1);
    expect(snap.ballots).toEqual({ requested: 1, returned: 1, outstanding: 1, returnRatePct: 50 });
    expect(snap.territories).toEqual({ total: 2, unassigned: 1 });
    expect(snap.votersAssignedToTerritory).toBe(1);
    expect(snap.distinctCities).toBe(2);
    expect(snap.distinctWards).toBe(2);
    expect(snap.topCities[0]).toEqual({ city: 'Springfield', count: 2 });
    expect(snap.topLanguages[0]).toEqual({ language: 'Spanish', count: 2 });
    expect(snap.notesLogged).toBe(1);
  });

  it('handles an empty project without dividing by zero', () => {
    const snap = buildTurfSnapshot([], []);
    expect(snap.totalVoters).toBe(0);
    expect(snap.ballots.returnRatePct).toBe(0);
    expect(snap.topCities).toEqual([]);
  });
});

// Length of the path visiting doors in the given array order.
function pathMeters(doors: VoterRecord[]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < doors.length; i++) {
    const a = doors[i - 1];
    const b = doors[i];
    const dLat = toRad(b.lat! - a.lat!);
    const dLng = toRad(b.lng! - a.lng!);
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat!)) * Math.cos(toRad(b.lat!)) * Math.sin(dLng / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(h));
  }
  return total;
}
