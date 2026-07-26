// Pure logic for Ask Coverage Gap: cross-references the Cross-Canvasser
// Overlap Guard (overlapGuard.ts) with warm-door scoring (doorstep.ts) and
// real linked donations. A warm household that multiple different
// canvassers have genuinely visited but NO ONE has actually asked for a
// donation is a real coordination failure — everyone assumed someone else
// would ask. No Supabase import (pattern: overlapGuard.ts) — see
// askCoverageGap.test.ts.
import type { WarmDoor } from './doorstep';
import type { Household } from './households';
import type { VisitForOverlap } from './overlapGuard';

export type DonationForCoverageGap = { voter_id: string | null };

export type AskCoverageGap = {
  householdKey: string;
  address: string;
  canvassers: string[];
  warmDoor: WarmDoor; // the specific warm household member no one has asked
};

const DAY_MS = 86_400_000;

export function findAskCoverageGaps(
  households: Household[],
  visits: VisitForOverlap[],
  warmDoors: WarmDoor[],
  donations: DonationForCoverageGap[],
  opts?: { lookbackDays?: number }
): AskCoverageGap[] {
  const lookbackDays = opts?.lookbackDays ?? 7;
  const cutoff = Date.now() - lookbackDays * DAY_MS;

  const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
  const warmByVoter = new Map(warmDoors.map((d) => [d.voterId, d]));

  const visitsByVoter = new Map<string, VisitForOverlap[]>();
  for (const v of visits) {
    if (new Date(v.occurred_at).getTime() < cutoff) continue;
    const list = visitsByVoter.get(v.voter_id) ?? [];
    list.push(v);
    visitsByVoter.set(v.voter_id, list);
  }

  const gaps: AskCoverageGap[] = [];
  for (const h of households) {
    const memberVisits = h.members.flatMap((m) => visitsByVoter.get(m.id) ?? []);
    if (memberVisits.length === 0) continue;

    const canvasserNames = new Map<string, string>();
    for (const v of memberVisits) {
      if (!canvasserNames.has(v.canvasser_id)) canvasserNames.set(v.canvasser_id, v.canvasser_name || 'Canvasser');
    }
    if (canvasserNames.size < 2) continue; // needs real multi-canvasser coverage

    const warmMember = h.members.find((m) => warmByVoter.has(m.id) && !alreadyGiven.has(m.id));
    if (!warmMember) continue;

    gaps.push({
      householdKey: h.key,
      address: h.address,
      canvassers: [...canvasserNames.values()],
      warmDoor: warmByVoter.get(warmMember.id)!
    });
  }

  return gaps;
}
