// Pure logic for a Turf-side Canvasser Leaderboard: real doors attempted/
// contacted per canvasser from the canvass_visits log (migration 0030),
// analogous to doorstep.ts's donation leaderboard but for door-knocking
// activity itself. No Supabase import (pattern: route.ts, visitHistory.ts)
// — see canvasserStats.test.ts.
import type { VisitOutcome } from './visitHistory';

export type CanvasserVisitLike = {
  canvasser_id: string;
  canvasser_name: string | null;
  outcome: VisitOutcome;
};

export type CanvasserStat = {
  canvasserId: string;
  name: string;
  attempts: number;
  contacts: number;
  contactRatePct: number;
};

// Below this many attempts, a contact rate is one lucky/unlucky knock, not a
// real signal — don't rank (or embarrass) anyone off a tiny sample.
const MIN_ATTEMPTS = 3;

// Ranked by real contacts first (the outcome that actually matters in the
// field), contact rate as the tiebreaker. Ties in both stay in visit order.
export function computeCanvasserLeaderboard(
  visits: CanvasserVisitLike[],
  opts?: { minAttempts?: number }
): CanvasserStat[] {
  const minAttempts = opts?.minAttempts ?? MIN_ATTEMPTS;
  const byCanvasser = new Map<string, { name: string | null; attempts: number; contacts: number }>();
  for (const v of visits) {
    const entry = byCanvasser.get(v.canvasser_id) ?? { name: v.canvasser_name, attempts: 0, contacts: 0 };
    entry.attempts += 1;
    if (v.outcome === 'contacted') entry.contacts += 1;
    if (!entry.name && v.canvasser_name) entry.name = v.canvasser_name;
    byCanvasser.set(v.canvasser_id, entry);
  }

  return [...byCanvasser.entries()]
    .filter(([, e]) => e.attempts >= minAttempts)
    .map(([canvasserId, e]) => ({
      canvasserId,
      name: e.name || 'Canvasser',
      attempts: e.attempts,
      contacts: e.contacts,
      contactRatePct: Math.round((e.contacts / e.attempts) * 100)
    }))
    .sort((a, b) => b.contacts - a.contacts || b.contactRatePct - a.contactRatePct);
}
