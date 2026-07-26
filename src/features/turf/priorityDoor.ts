// Pure logic for the Priority Door Briefing: the turnout-focused analog of
// Golden Hour Push (goldenHourPush.ts, which is fundraising-focused) —
// synthesizes real persuadability + ballot status (classifyPersuadability in
// turfBriefingMath.ts), the Revisit Queue (revisitQueue.ts), and how close
// voting day actually is (daysUntilElection in electionCountdownAsk.ts) into
// a single ranked "which doors most need a turnout knock right now" list.
// Every point has a real reason, same pattern as doorstep.ts's scoreDoors.
// Deliberately excludes fundraising warmth — that axis already has its own
// dedicated tool (Golden Hour Push) — so this stays a distinct, non-
// duplicate optimization. No Supabase import (pattern: doorstep.ts) — see
// priorityDoor.test.ts.
import type { RevisitCandidate } from './revisitQueue';
import type { PersuadabilityBucket } from './turfBriefingMath';

export type PriorityDoorInput = {
  id: string;
  full_name: string | null;
  address_line: string | null;
  bucket: PersuadabilityBucket;
  ballot_status: string | null;
};

export type PriorityDoor = {
  voterId: string;
  name: string;
  address: string;
  score: number;
  reasons: string[];
};

// A door only has turnout upside from one more knock if it's leaned real
// support or persuadable — an 'opposed' or 'unknown' door gains nothing from
// a turnout-focused visit today.
const TURNOUT_BUCKETS: PersuadabilityBucket[] = ['base_support', 'persuadable'];
// Inside the final two weeks, an un-returned ballot from a real lean is
// measurably more time-sensitive than the same door a month out.
const ELECTION_URGENT_DAYS = 14;

export function findPriorityDoors(
  doors: PriorityDoorInput[],
  revisitQueue: RevisitCandidate[],
  daysUntilElection: number | null,
  limit = 5
): PriorityDoor[] {
  const revisitByVoter = new Map(revisitQueue.map((r) => [r.voterId, r]));
  const electionUrgent = daysUntilElection !== null && daysUntilElection >= 0 && daysUntilElection <= ELECTION_URGENT_DAYS;

  const scored: PriorityDoor[] = [];
  for (const d of doors) {
    if (d.ballot_status === 'returned') continue; // already voted — nothing left to chase
    if (!TURNOUT_BUCKETS.includes(d.bucket)) continue;

    const reasons: string[] = [
      d.bucket === 'base_support' ? 'a committed supporter who hasn’t voted yet' : 'persuadable and hasn’t voted yet'
    ];
    let score = d.bucket === 'base_support' ? 20 : 30; // an undecided-but-leaning door has more to gain from one more knock than one already committed

    const revisit = revisitByVoter.get(d.id);
    if (revisit) {
      score += Math.min(30, revisit.attempts * 10);
      reasons.push(`already ${revisit.attempts} attempt${revisit.attempts === 1 ? '' : 's'} without contact`);
    }

    if (electionUrgent) {
      score += 20;
      reasons.push(`only ${daysUntilElection} day${daysUntilElection === 1 ? '' : 's'} until the election`);
    }

    scored.push({
      voterId: d.id,
      name: d.full_name ?? 'Voter',
      address: d.address_line ?? 'address on file',
      score,
      reasons
    });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
