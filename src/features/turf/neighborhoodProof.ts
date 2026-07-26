// Pure logic for Neighborhood Social Proof: real doorstep gifts
// (donations.voter_id, migration 0032) grouped by street name reveal how
// many of a warm door's real neighbors have already given — a genuine
// social-proof talking point, not a fabricated one. Only ever surfaces when
// the real count is greater than zero; a door with no real neighbor givers
// gets no social-proof card at all rather than an honest-but-useless "0
// neighbors have given" line. No Supabase import (pattern: doorstep.ts) —
// see neighborhoodProof.test.ts.
import type { WarmDoor } from './doorstep';

export type VoterForStreetMatch = {
  id: string;
  address_line: string | null;
};

export type DonationForStreetMatch = { voter_id: string | null };

export type NeighborProof = WarmDoor & {
  streetName: string;
  neighborGiverCount: number;
};

// Strips a leading house number so "100 Main St" and "204 Main St" match as
// the same street — a simple, explainable heuristic (pattern: route.ts's
// pickField, turfBriefingMath.ts's PARTY_ALIASES: pragmatic over clever).
function streetName(addressLine: string | null): string | null {
  if (!addressLine) return null;
  const stripped = addressLine.replace(/^\s*\d+\s*/, '').trim().toLowerCase();
  return stripped || null;
}

export function findNeighborhoodProof(
  warmDoors: WarmDoor[],
  allVoters: VoterForStreetMatch[],
  donations: DonationForStreetMatch[]
): NeighborProof[] {
  const givers = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id!));

  const streetToVoterIds = new Map<string, Set<string>>();
  for (const v of allVoters) {
    const street = streetName(v.address_line);
    if (!street) continue;
    const set = streetToVoterIds.get(street) ?? new Set<string>();
    set.add(v.id);
    streetToVoterIds.set(street, set);
  }

  const results: NeighborProof[] = [];
  for (const door of warmDoors) {
    const street = streetName(door.address);
    if (!street) continue;
    const streetVoterIds = streetToVoterIds.get(street);
    if (!streetVoterIds) continue;

    let neighborGiverCount = 0;
    for (const id of streetVoterIds) {
      if (id !== door.voterId && givers.has(id)) neighborGiverCount += 1;
    }
    if (neighborGiverCount === 0) continue;

    results.push({ ...door, streetName: street, neighborGiverCount });
  }

  return results.sort((a, b) => b.neighborGiverCount - a.neighborGiverCount);
}
