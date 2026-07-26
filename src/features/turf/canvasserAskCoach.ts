// Pure logic for Canvasser Ask Coach: cross-references the door-knocking
// Canvasser Leaderboard (canvasserStats.ts) with the doorstep $ leaderboard
// (doorstep.ts's canvasserLeaderboard) by profile id — the same person is
// both a canvasser (canvass_visits.canvasser_id) and, when they log a real
// gift, a recorder (donations.recorded_by). Surfaces who's great at doors
// but rarely asks, versus who converts real contacts into real gifts at a
// high rate. No Supabase import (pattern: canvasserStats.ts) — see
// canvasserAskCoach.test.ts.
import type { CanvasserStat } from './canvasserStats';
import type { LeaderboardRow } from './doorstep';

export type AskCoachStat = {
  canvasserId: string;
  name: string;
  contacts: number;
  giftCount: number;
  askRatePct: number; // real giftCount / real contacts
};

// Below this many real contacts, an ask rate is one lucky/unlucky
// conversation, not a coaching-worthy pattern.
const MIN_CONTACTS = 3;

// Ranked lowest ask-rate first — the canvasser who most needs coaching
// leads the list, not the one already converting well.
export function computeCanvasserAskCoach(
  canvasserStats: CanvasserStat[],
  donationLeaderboard: LeaderboardRow[]
): AskCoachStat[] {
  const giftsByRecorder = new Map(donationLeaderboard.map((r) => [r.recorderId, r.giftCount]));

  return canvasserStats
    .filter((c) => c.contacts >= MIN_CONTACTS)
    .map((c) => {
      const giftCount = giftsByRecorder.get(c.canvasserId) ?? 0;
      return {
        canvasserId: c.canvasserId,
        name: c.name,
        contacts: c.contacts,
        giftCount,
        askRatePct: Math.round((giftCount / c.contacts) * 100)
      };
    })
    .sort((a, b) => a.askRatePct - b.askRatePct);
}
