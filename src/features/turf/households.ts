// Pure logic for Household Rollup: voters registered at the identical
// address collapse into one physical door, so a 3-voter household is never
// knocked (or routed to) 3 times. No Supabase import (pattern: route.ts,
// doorstep.ts) — see households.test.ts.
import type { VoterRecord } from './useTurf';

// Deliberately only trims/lowercases/collapses whitespace — NOT stripping
// unit/apartment numbers. Two apartments in one building are two different
// doors; only an exact address match is genuinely the same door. A looser
// match would risk merging unrelated addresses, which is worse than not
// merging at all.
export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase().replace(/\s+/g, ' ');
}

export type Household = {
  key: string;
  address: string; // original casing, from the first member
  lat: number;
  lng: number;
  members: VoterRecord[];
  memberCount: number;
};

// Groups mapped voters by identical normalized address. Unmapped voters
// (no lat/lng) and voters with no address text are each their own
// single-member "household" keyed by id, so they're never silently dropped.
export function groupIntoHouseholds(voters: VoterRecord[]): Household[] {
  const byKey = new Map<string, Household>();
  for (const v of voters) {
    const addr = v.address_line?.trim();
    const key = addr ? `addr:${normalizeAddress(addr)}` : `id:${v.id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(v);
      existing.memberCount += 1;
      continue;
    }
    byKey.set(key, {
      key,
      address: addr || v.full_name || 'Unknown address',
      lat: v.lat ?? 0,
      lng: v.lng ?? 0,
      members: [v],
      memberCount: 1
    });
  }
  return [...byKey.values()];
}

// One representative voter per unique address — used to make walk-order
// optimization/routing never send a canvasser to the same physical door
// twice just because two registered voters share it.
export function dedupeHouseholds(voters: VoterRecord[]): VoterRecord[] {
  return groupIntoHouseholds(voters).map((h) => h.members[0]);
}
