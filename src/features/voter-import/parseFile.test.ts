import { describe, expect, it } from 'vitest';
import { guessFieldMapping, isBlankRow } from './parseFile';

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

describe('isBlankRow', () => {
  it('treats an all-empty-string row as blank', () => {
    expect(isBlankRow({ name: '', address: '', city: '' })).toBe(true);
  });

  it('treats an all-whitespace row as blank', () => {
    expect(isBlankRow({ name: '   ', address: '\t' })).toBe(true);
  });

  it('treats null/undefined-only values as blank', () => {
    expect(isBlankRow({ name: null, address: undefined })).toBe(true);
  });

  it('is not blank if any single column has real content', () => {
    expect(isBlankRow({ name: '', address: '12 Oak St', city: '' })).toBe(false);
  });

  it('a row of all zeros is not blank (0 is real data, not empty)', () => {
    expect(isBlankRow({ lat: 0, lng: 0 })).toBe(false);
  });
});
