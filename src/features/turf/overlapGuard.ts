// Pure logic for the Cross-Canvasser Overlap Guard: flags a household that
// two or more DIFFERENT canvassers have actually visited within a recent
// window — a real coordination gap (working the same street without
// realizing it) that only the canvass_visits log (migration 0030) can
// reveal, since the old overwrite-in-place columns never recorded WHO
// visited. Deliberately retrospective/informational, not a routing block:
// it surfaces what already happened so a captain can redirect next time, it
// never removes a door from anyone's list. No Supabase import (pattern:
// households.ts, visitHistory.ts) — see overlapGuard.test.ts.
import type { Household } from './households';

export type VisitForOverlap = {
  voter_id: string;
  canvasser_id: string;
  canvasser_name: string | null;
  occurred_at: string;
};

export type OverlapAlert = {
  householdKey: string;
  address: string;
  canvassers: string[]; // deduped display names, first-visited first
  visitCount: number;
};

const DAY_MS = 86_400_000;

export function detectCrossCanvasserOverlap(
  households: Household[],
  visits: VisitForOverlap[],
  opts?: { lookbackDays?: number }
): OverlapAlert[] {
  const lookbackDays = opts?.lookbackDays ?? 7;
  const cutoff = Date.now() - lookbackDays * DAY_MS;

  const visitsByVoter = new Map<string, VisitForOverlap[]>();
  for (const v of visits) {
    if (new Date(v.occurred_at).getTime() < cutoff) continue;
    const list = visitsByVoter.get(v.voter_id) ?? [];
    list.push(v);
    visitsByVoter.set(v.voter_id, list);
  }

  const alerts: OverlapAlert[] = [];
  for (const h of households) {
    const memberVisits = h.members
      .flatMap((m) => visitsByVoter.get(m.id) ?? [])
      .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    if (memberVisits.length === 0) continue;

    const canvasserNames = new Map<string, string>();
    for (const v of memberVisits) {
      if (!canvasserNames.has(v.canvasser_id)) canvasserNames.set(v.canvasser_id, v.canvasser_name || 'Canvasser');
    }
    if (canvasserNames.size < 2) continue; // same canvasser revisiting isn't an overlap

    alerts.push({
      householdKey: h.key,
      address: h.address,
      canvassers: [...canvasserNames.values()],
      visitCount: memberVisits.length
    });
  }

  return alerts.sort((a, b) => b.visitCount - a.visitCount);
}
