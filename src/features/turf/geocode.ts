import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { VoterRecord } from './useTurf';

// US Census Bureau geocoder: free, no API key, no hard rate limit published
// but be polite. US-only coverage, which matches the product (US campaign
// voter files). The endpoint sends no CORS headers, so a direct browser
// fetch is blocked; transport differs by runtime (see fetchCensus below).
const CENSUS_PATH = '/geocoder/locations/onelineaddress';
const CENSUS_ORIGIN = 'https://geocoding.geo.census.gov';

// Cap per run: geocoding is sequential (~0.5-1s per address) and this runs
// in the foreground. Re-run the action for large backlogs.
const MAX_PER_RUN = 25;

type CensusBody = {
  result?: { addressMatches?: { coordinates: { x: number; y: number } }[] };
};

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

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    format: 'json'
  });
  const body = await fetchCensus(params.toString());
  const match = body?.result?.addressMatches?.[0];
  if (!match) return null;
  return { lat: match.coordinates.y, lng: match.coordinates.x };
}

export function useGeocodeUnmapped() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { projectId: string; voters: VoterRecord[] }) => {
      const candidates = input.voters
        .filter((v) => v.lat === null && v.address_line)
        .slice(0, MAX_PER_RUN);

      let resolved = 0;
      let failed = 0;
      for (const voter of candidates) {
        // Unmapped columns often hold city/state; include them when present
        // so the one-line geocoder has a full address to work with.
        const city = (voter.data?.['City'] ?? voter.data?.['city'] ?? '') as string;
        const state = (voter.data?.['State'] ?? voter.data?.['state'] ?? '') as string;
        const oneLine = [voter.address_line, city, state].filter(Boolean).join(', ');

        try {
          const coords = await geocodeAddress(oneLine);
          if (coords) {
            const { error } = await supabase
              .from('voter_records')
              .update({ lat: coords.lat, lng: coords.lng })
              .eq('id', voter.id);
            if (error) throw error;
            resolved += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }
      return { attempted: candidates.length, resolved, failed };
    },
    onSuccess: (_r, vars) => {
      queryClient.invalidateQueries({ queryKey: ['voter-records', vars.projectId] });
    }
  });
}
