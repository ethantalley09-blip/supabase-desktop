import { describe, expect, it } from 'vitest';
import { guessFieldMapping } from './parseFile';

describe('guessFieldMapping', () => {
  it('maps standard voter-file headers', () => {
    const m = guessFieldMapping(['Voter Name', 'Street Address', 'City', 'Latitude', 'Longitude', 'Party']);
    expect(m).toEqual({
      full_name: 'Voter Name',
      address_line: 'Street Address',
      lat: 'Latitude',
      lng: 'Longitude'
    });
  });

  it('maps lowercase/abbreviated headers', () => {
    const m = guessFieldMapping(['name', 'address', 'lat', 'lng']);
    expect(m).toEqual({ full_name: 'name', address_line: 'address', lat: 'lat', lng: 'lng' });
  });

  it('prefers full_name over other name-ish columns', () => {
    const m = guessFieldMapping(['county_name', 'full_name', 'street']);
    expect(m.full_name).toBe('full_name');
    expect(m.address_line).toBe('street');
  });

  it('recognizes lon as longitude', () => {
    const m = guessFieldMapping(['LON', 'LAT']);
    expect(m.lng).toBe('LON');
    expect(m.lat).toBe('LAT');
  });

  it('returns empty strings for unmatched fields', () => {
    const m = guessFieldMapping(['precinct', 'vote_history']);
    expect(m).toEqual({ full_name: '', address_line: '', lat: '', lng: '' });
  });
});
