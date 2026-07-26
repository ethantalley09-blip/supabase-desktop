// Pure logic for Election Countdown Ask: the fundraising analog of the
// GOTV Countdown Planner (GotvSprintPlan.tsx) — a real, staff-entered
// election date drives urgency on warm doors that have never given, never
// a fabricated sense of urgency. Mirrors GotvSprintPlan.tsx's own
// daysUntil() convention (date-only string, compared at local midnight) so
// the two countdowns can never silently disagree. No Supabase import
// (pattern: doorstep.ts) — see electionCountdownAsk.test.ts.
import type { WarmDoor } from './doorstep';

export type DonationForCountdown = { voter_id: string | null };

export type CountdownAskTarget = WarmDoor & { daysUntilElection: number };

export function daysUntilElection(dateStr: string, now: Date = new Date()): number {
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function findCountdownAskTargets(
  warmDoors: WarmDoor[],
  donations: DonationForCountdown[],
  electionDateStr: string,
  now: Date = new Date(),
  limit = 5
): CountdownAskTarget[] {
  const days = daysUntilElection(electionDateStr, now);
  if (days < 0) return []; // election already passed — nothing left to count down to

  const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
  return warmDoors
    .filter((d) => !alreadyGiven.has(d.voterId))
    .slice(0, limit)
    .map((d) => ({ ...d, daysUntilElection: days }));
}
