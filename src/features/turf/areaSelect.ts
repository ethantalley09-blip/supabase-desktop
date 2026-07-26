// Pure logic for Draw-an-Area AI Briefing: given an ad-hoc ring the user
// drew directly on the map (not a saved Territory), finds which real
// mapped voters actually fall inside it. Reuses the same point-in-polygon
// primitive (@turf/turf's booleanPointInPolygon) already used by
// useCreateTerritory in useTurf.ts, just without persisting anything — this
// is a throwaway shape for one question, not a permanent assignment. No
// Supabase import — see areaSelect.test.ts.
import { booleanPointInPolygon, point, polygon } from '@turf/turf';
import type { VoterRecord } from './useTurf';

export function findVotersInRing(voters: VoterRecord[], ring: [number, number][]): VoterRecord[] {
  if (ring.length < 3) return [];
  const closedRing = ring[0] === ring[ring.length - 1] ? ring : [...ring, ring[0]];
  const geom = polygon([closedRing]);
  return voters.filter(
    (v) => v.lat !== null && v.lng !== null && booleanPointInPolygon(point([v.lng!, v.lat!]), geom)
  );
}
