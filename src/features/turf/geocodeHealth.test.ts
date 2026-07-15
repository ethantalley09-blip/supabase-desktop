import { describe, expect, it } from 'vitest';
import { buildGeocodeAiSnapshot, computeGeocodeHealth, needsManualFix, type GeocodeHealthInput } from './geocodeHealth';

const voter = (over: Partial<GeocodeHealthInput>): GeocodeHealthInput => ({
  address_line: '12 Oak St',
  lat: null,
  geocode_status: 'unattempted',
  ...over
});

describe('computeGeocodeHealth', () => {
  it('buckets every voter into exactly one category', () => {
    const health = computeGeocodeHealth([
      voter({ lat: 40.1 }),
      voter({ address_line: null }),
      voter({ geocode_status: 'unattempted' }),
      voter({ geocode_status: 'ambiguous' }),
      voter({ geocode_status: 'no_match' }),
      voter({ geocode_status: 'error' })
    ]);
    expect(health).toEqual({
      total: 6,
      mapped: 1,
      noAddress: 1,
      unattempted: 1,
      ambiguous: 1,
      noMatch: 1,
      error: 1,
      pctMapped: 17
    });
  });

  it('treats a mapped voter as mapped regardless of its geocode_status', () => {
    const health = computeGeocodeHealth([voter({ lat: 40.1, geocode_status: 'ambiguous' })]);
    expect(health.mapped).toBe(1);
    expect(health.ambiguous).toBe(0);
  });

  it('returns 0% for an empty list without dividing by zero', () => {
    expect(computeGeocodeHealth([]).pctMapped).toBe(0);
  });
});

describe('needsManualFix', () => {
  it('includes unmapped no_match/error voters', () => {
    const voters = [voter({ geocode_status: 'no_match' }), voter({ geocode_status: 'error' }), voter({ geocode_status: 'unattempted' })];
    expect(needsManualFix(voters)).toHaveLength(2);
  });

  it('includes ambiguous voters even once they have a best-guess pin', () => {
    const voters = [voter({ lat: 40.1, geocode_status: 'ambiguous' }), voter({ geocode_status: 'ambiguous' })];
    expect(needsManualFix(voters)).toHaveLength(2);
  });

  it('excludes a mapped no_match/error voter (shouldn\'t happen, but lat wins if it does)', () => {
    const voters = [voter({ lat: 40.1, geocode_status: 'no_match' })];
    expect(needsManualFix(voters)).toHaveLength(0);
  });
});

describe('buildGeocodeAiSnapshot', () => {
  it('contains only aggregate geocoding health data', () => {
    const snapshot = buildGeocodeAiSnapshot([voter({ lat: 40.1 }), voter({ geocode_status: 'no_match' })]);
    expect(snapshot).toEqual({
      total_voters: 2,
      mapped: 1,
      mapping_coverage_percent: 50,
      missing_address: 0,
      ready_to_geocode: 0,
      ambiguous_matches: 0,
      no_match: 1,
      lookup_failures: 0
    });
  });
});
