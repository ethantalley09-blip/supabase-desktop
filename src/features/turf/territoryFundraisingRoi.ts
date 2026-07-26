// Pure logic for Territory Fundraising ROI: the revenue-per-effort analog
// of Territory Difficulty Briefing (territoryDifficulty.ts). Real $ raised
// per territory (from linked doorstep donations, migration 0032) divided
// by real doors knocked there (unique voters attempted in canvass_visits) —
// a genuinely different optimization axis (dollars, not contact rate) for
// deciding where to deploy canvassers next. No Supabase import (pattern:
// territoryDifficulty.ts) — see territoryFundraisingRoi.test.ts.
import type { Territory, VoterRecord } from './useTurf';

export type DonationForTerritoryRoi = { voter_id: string | null; amount_cents: number };
export type VisitForTerritoryRoi = { voter_id: string };

export type TerritoryRoi = {
  territoryId: string;
  name: string;
  totalCents: number;
  doorsKnocked: number;
  centsPerDoorKnocked: number;
};

// A territory needs at least this many unique doors knocked before a
// $-per-door figure means anything — one lucky big gift isn't a pattern.
const MIN_DOORS_KNOCKED = 3;

export function computeTerritoryFundraisingRoi(
  voters: VoterRecord[],
  visits: VisitForTerritoryRoi[],
  donations: DonationForTerritoryRoi[],
  territories: Territory[]
): TerritoryRoi[] {
  const voterTerritory = new Map(voters.map((v) => [v.id, v.territory_id]));

  const doorsKnockedByTerritory = new Map<string, Set<string>>();
  for (const visit of visits) {
    const territoryId = voterTerritory.get(visit.voter_id);
    if (!territoryId) continue;
    const set = doorsKnockedByTerritory.get(territoryId) ?? new Set<string>();
    set.add(visit.voter_id);
    doorsKnockedByTerritory.set(territoryId, set);
  }

  const centsByTerritory = new Map<string, number>();
  for (const d of donations) {
    if (!d.voter_id) continue;
    const territoryId = voterTerritory.get(d.voter_id);
    if (!territoryId) continue;
    centsByTerritory.set(territoryId, (centsByTerritory.get(territoryId) ?? 0) + d.amount_cents);
  }

  const results: TerritoryRoi[] = [];
  for (const [territoryId, doorSet] of doorsKnockedByTerritory) {
    if (doorSet.size < MIN_DOORS_KNOCKED) continue;
    const totalCents = centsByTerritory.get(territoryId) ?? 0;
    results.push({
      territoryId,
      name: territories.find((t) => t.id === territoryId)?.name ?? 'Unnamed territory',
      totalCents,
      doorsKnocked: doorSet.size,
      centsPerDoorKnocked: Math.round(totalCents / doorSet.size)
    });
  }

  return results.sort((a, b) => b.centsPerDoorKnocked - a.centsPerDoorKnocked);
}
