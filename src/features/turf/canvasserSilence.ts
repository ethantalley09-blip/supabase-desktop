// Pure logic for the Silent Canvasser Alert: a real-time safety/coordination
// check distinct from the Pace Check-in (canvasserFatigue.ts, which flags a
// declining contact RATE while a canvasser keeps knocking). This flags a
// canvasser who had a real, established presence earlier today but has
// logged NOTHING — no attempts at all — in a while, which could mean
// they've simply finished for the day, or could mean something's wrong. No
// Supabase import (pattern: canvasserFatigue.ts) — see
// canvasserSilence.test.ts.

export type VisitForSilence = {
  canvasser_id: string;
  canvasser_name: string | null;
  occurred_at: string;
};

export type SilenceAlert = {
  canvasserId: string;
  name: string;
  minutesSinceLastVisit: number;
  visitsToday: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Needs a real established presence today before "gone quiet" means
// anything — a single knock isn't a pattern to worry about yet.
const MIN_VISITS_TODAY = 2;
// Below this gap, a canvasser could just be mid-conversation at a door or
// between houses — not a real signal yet.
const SILENCE_THRESHOLD_MINUTES = 90;

// Ranked by longest silence first — the canvasser worth checking on soonest
// leads the list.
export function detectSilentCanvassers(visits: VisitForSilence[], now: Date = new Date()): SilenceAlert[] {
  const todayStart = new Date(now.getTime());
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const nowMs = now.getTime();

  const byCanvasser = new Map<string, VisitForSilence[]>();
  for (const v of visits) {
    const t = new Date(v.occurred_at).getTime();
    if (t < todayStartMs || t > nowMs || t >= todayStartMs + DAY_MS) continue;
    const list = byCanvasser.get(v.canvasser_id) ?? [];
    list.push(v);
    byCanvasser.set(v.canvasser_id, list);
  }

  const alerts: SilenceAlert[] = [];
  for (const [canvasserId, list] of byCanvasser) {
    if (list.length < MIN_VISITS_TODAY) continue;

    const lastVisit = list.reduce((latest, v) =>
      new Date(v.occurred_at).getTime() > new Date(latest.occurred_at).getTime() ? v : latest
    );
    const minutesSinceLastVisit = Math.round((nowMs - new Date(lastVisit.occurred_at).getTime()) / 60000);
    if (minutesSinceLastVisit < SILENCE_THRESHOLD_MINUTES) continue;

    alerts.push({
      canvasserId,
      name: lastVisit.canvasser_name || 'Canvasser',
      minutesSinceLastVisit,
      visitsToday: list.length
    });
  }

  return alerts.sort((a, b) => b.minutesSinceLastVisit - a.minutesSinceLastVisit);
}
