// Pure logic for geocoding coverage/health — no Supabase imports (pattern:
// route.ts, doorstep.ts) so it stays unit-testable. All client-side math on
// data the app already has.

export type GeocodeHealthInput = {
  address_line: string | null;
  lat: number | null;
  geocode_status: 'unattempted' | 'matched' | 'ambiguous' | 'no_match' | 'error';
};

export type GeocodeHealth = {
  total: number;
  mapped: number;
  noAddress: number;
  unattempted: number;
  ambiguous: number;
  noMatch: number;
  error: number;
  pctMapped: number;
};

// This is deliberately aggregate-only. It is safe to send to the AI coach:
// no names, addresses, coordinates, or individual voter rows leave the app.
export function buildGeocodeAiSnapshot(voters: GeocodeHealthInput[]): Record<string, number> {
  const health = computeGeocodeHealth(voters);
  return {
    total_voters: health.total,
    mapped: health.mapped,
    mapping_coverage_percent: health.pctMapped,
    missing_address: health.noAddress,
    ready_to_geocode: health.unattempted,
    ambiguous_matches: health.ambiguous,
    no_match: health.noMatch,
    lookup_failures: health.error
  };
}

export function computeGeocodeHealth(voters: GeocodeHealthInput[]): GeocodeHealth {
  let mapped = 0;
  let noAddress = 0;
  let unattempted = 0;
  let ambiguous = 0;
  let noMatch = 0;
  let error = 0;

  for (const v of voters) {
    if (v.lat !== null) {
      mapped += 1;
      continue;
    }
    if (!v.address_line) {
      noAddress += 1;
      continue;
    }
    switch (v.geocode_status) {
      case 'ambiguous':
        ambiguous += 1;
        break;
      case 'no_match':
        noMatch += 1;
        break;
      case 'error':
        error += 1;
        break;
      default:
        unattempted += 1;
    }
  }

  const total = voters.length;
  return {
    total,
    mapped,
    noAddress,
    unattempted,
    ambiguous,
    noMatch,
    error,
    pctMapped: total === 0 ? 0 : Math.round((mapped / total) * 100)
  };
}

// Voters worth showing in a manual-fix list: geocoding was tried and didn't
// cleanly resolve. Ambiguous voters DO get a best-guess pin (so they count
// as "mapped" in computeGeocodeHealth above) but still belong here -- an
// ambiguous match means staff should confirm it, having a pin doesn't mean
// it's the right pin. Unattempted/no-address voters aren't included -- those
// belong in the normal "geocode next batch" flow, not a fix queue.
export function needsManualFix<T extends GeocodeHealthInput>(voters: T[]): T[] {
  return voters.filter(
    (v) => v.geocode_status === 'ambiguous' || (v.lat === null && (v.geocode_status === 'no_match' || v.geocode_status === 'error'))
  );
}
