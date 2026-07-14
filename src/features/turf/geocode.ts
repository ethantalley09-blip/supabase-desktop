import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { VoterRecord } from './useTurf';

// US Census Bureau geocoder: free, no API key, no hard rate limit published
// but be polite. US-only coverage, which matches the product (US campaign
// voter files). The endpoint sends no CORS headers, so a direct browser
// fetch is blocked; transport differs by runtime (see fetchCensus below).
const CENSUS_PATH = '/geocoder/locations/onelineaddress';
const CENSUS_ORIGIN = 'https://geocoding.geo.census.gov';

// Batch size per Census call and the pause between them -- "polite" pacing,
// not a documented hard limit. "Geocode all remaining" loops this
// automatically instead of making the user click repeatedly (was the whole
// backlog before); the safety cap below still bounds a single run.
const BATCH_SIZE = 25;
const MAX_PER_RUN = 300;
const PACE_MS = 120;

type CensusMatch = { coordinates: { x: number; y: number } };
type CensusBody = { result?: { addressMatches?: CensusMatch[] } };

export type GeocodeResult =
  | { status: 'matched'; lat: number; lng: number; ambiguous: false }
  | { status: 'matched'; lat: number; lng: number; ambiguous: true; matchCount: number }
  | { status: 'no_match' }
  | { status: 'error' };

// In the packaged Tauri app, use the native HTTP client (no CORS, census.gov
// is allowlisted in tauri.conf.json). In the dev browser, hit the Vite proxy
// (/census-geocode) which forwards to census.gov server-side.
async function fetchCensus(query: string): Promise<CensusBody | null> {
  if (window.__TAURI__) {
    const { fetch: tauriFetch, ResponseType } = await import('@tauri-apps/api/http');
    const res = await tauriFetch<CensusBody>(`${CENSUS_ORIGIN}${CENSUS_PATH}?${query}`, {
      method: 'GET',
      responseType: ResponseType.JSON
    });
    return res.ok ? res.data : null;
  }
  const res = await fetch(`/census-geocode${CENSUS_PATH}?${query}`);
  return res.ok ? ((await res.json()) as CensusBody) : null;
}

// Census sometimes returns several candidate matches for one address (e.g.
// an apartment complex with multiple valid entrances). Taking match[0]
// silently, as before, means an ambiguous address quietly gets whichever
// candidate happened to sort first -- now surfaced instead of hidden.
export async function geocodeAddressDetailed(address: string): Promise<GeocodeResult> {
  const params = new URLSearchParams({ address, benchmark: 'Public_AR_Current', format: 'json' });
  let body: CensusBody | null;
  try {
    body = await fetchCensus(params.toString());
  } catch {
    return { status: 'error' };
  }
  const matches = body?.result?.addressMatches ?? [];
  if (matches.length === 0) return { status: 'no_match' };
  const best = matches[0];
  return matches.length === 1
    ? { status: 'matched', lat: best.coordinates.y, lng: best.coordinates.x, ambiguous: false }
    : { status: 'matched', lat: best.coordinates.y, lng: best.coordinates.x, ambiguous: true, matchCount: matches.length };
}

// Kept for callers that only want coordinates (e.g. the manual-fix retry).
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const r = await geocodeAddressDetailed(address);
  return r.status === 'matched' ? { lat: r.lat, lng: r.lng } : null;
}

function oneLineAddress(voter: VoterRecord): string {
  const city = (voter.data?.['City'] ?? voter.data?.['city'] ?? '') as string;
  const state = (voter.data?.['State'] ?? voter.data?.['state'] ?? '') as string;
  return [voter.address_line, city, state].filter(Boolean).join(', ');
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeBatch(voters: VoterRecord[], onProgress?: (done: number, total: number) => void) {
  let resolved = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let errored = 0;

  for (let i = 0; i < voters.length; i++) {
    const voter = voters[i];
    const result = await geocodeAddressDetailed(oneLineAddress(voter));
    const update =
      result.status === 'matched'
        ? {
            lat: result.lat,
            lng: result.lng,
            geocode_status: result.ambiguous ? 'ambiguous' : 'matched',
            geocode_checked_at: new Date().toISOString()
          }
        : { geocode_status: result.status, geocode_checked_at: new Date().toISOString() };

    const { error } = await supabase.from('voter_records').update(update).eq('id', voter.id);
    if (error) errored += 1;
    else if (result.status === 'matched' && !result.ambiguous) resolved += 1;
    else if (result.status === 'matched' && result.ambiguous) ambiguous += 1;
    else if (result.status === 'no_match') noMatch += 1;
    else errored += 1;

    onProgress?.(i + 1, voters.length);
    if (i < voters.length - 1) await sleep(PACE_MS);
  }
  return { attempted: voters.length, resolved, ambiguous, noMatch, errored };
}

// Loops in batches of BATCH_SIZE until the backlog (up to MAX_PER_RUN) is
// clear, instead of making the user click "geocode 25" repeatedly for a
// large voter file.
export function useGeocodeAllRemaining() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      voters: VoterRecord[];
      onProgress?: (done: number, total: number) => void;
    }) => {
      const candidates = input.voters
        .filter((v) => v.lat === null && v.address_line && v.geocode_status !== 'ambiguous')
        .slice(0, MAX_PER_RUN);

      let resolved = 0;
      let ambiguous = 0;
      let noMatch = 0;
      let errored = 0;
      for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
        const chunk = candidates.slice(i, i + BATCH_SIZE);
        const r = await geocodeBatch(chunk, (done) => input.onProgress?.(i + done, candidates.length));
        resolved += r.resolved;
        ambiguous += r.ambiguous;
        noMatch += r.noMatch;
        errored += r.errored;
        input.onProgress?.(Math.min(i + chunk.length, candidates.length), candidates.length);
      }
      return { attempted: candidates.length, resolved, ambiguous, noMatch, errored };
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}

// Manual fix path for ambiguous/no_match/error voters: re-geocode a single
// voter with a staff-edited address, or accept hand-typed coordinates
// directly when the address just won't resolve (rural routes, new
// construction, etc. -- real cases the Census index doesn't have yet).
export function useManualGeocode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; voterId: string } & (
      | { mode: 'retry'; address: string }
      | { mode: 'manual'; lat: number; lng: number }
    )) => {
      if (input.mode === 'manual') {
        const { error } = await supabase
          .from('voter_records')
          .update({ lat: input.lat, lng: input.lng, geocode_status: 'matched', geocode_checked_at: new Date().toISOString() })
          .eq('id', input.voterId);
        if (error) throw error;
        return { status: 'matched' as const };
      }
      const result = await geocodeAddressDetailed(input.address);
      const update =
        result.status === 'matched'
          ? {
              lat: result.lat,
              lng: result.lng,
              geocode_status: result.ambiguous ? 'ambiguous' : 'matched',
              geocode_checked_at: new Date().toISOString()
            }
          : { geocode_status: result.status, geocode_checked_at: new Date().toISOString() };
      const { error } = await supabase.from('voter_records').update(update).eq('id', input.voterId);
      if (error) throw error;
      return result;
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}
