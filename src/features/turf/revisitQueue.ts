// Pure logic for the Revisit Queue: doors that are still knockable but have
// racked up repeated real no_answer attempts without ever being contacted —
// the stubborn-door analog of Best Time to Knock/Persuasion Drift, only
// possible because canvass_visits (migration 0030) keeps every attempt
// instead of overwriting in place. A door that's simply never been tried
// isn't "stubborn" — this only surfaces doors with a REAL failed-attempt
// history, so it stays honest about what it's measuring. No Supabase import
// (pattern: visitHistory.ts) — see revisitQueue.test.ts.
import type { VisitOutcome } from './visitHistory';

export type VisitForRevisit = {
  voter_id: string;
  occurred_at: string;
  outcome: VisitOutcome;
};

export type RevisitTarget = {
  id: string;
  full_name: string | null;
};

export type RevisitCandidate = {
  voterId: string;
  name: string;
  attempts: number;
  lastAttemptAt: string;
};

// Below this many failed attempts, a door just hasn't been tried enough yet
// to call it stubborn — that's the ordinary remaining-doors list's job.
const MIN_ATTEMPTS = 2;

// Ranked by attempt count first (the door that's eaten the most tries without
// a result is the most worth a deliberate, planned revisit), then by how
// long it's been since the last attempt (longer-stale first) as the
// tiebreaker.
export function buildRevisitQueue(
  targets: RevisitTarget[],
  visits: VisitForRevisit[],
  opts?: { minAttempts?: number }
): RevisitCandidate[] {
  const minAttempts = opts?.minAttempts ?? MIN_ATTEMPTS;

  const byVoter = new Map<string, VisitForRevisit[]>();
  for (const v of visits) {
    const list = byVoter.get(v.voter_id) ?? [];
    list.push(v);
    byVoter.set(v.voter_id, list);
  }

  const candidates: RevisitCandidate[] = [];
  for (const target of targets) {
    const voterVisits = byVoter.get(target.id) ?? [];
    if (voterVisits.length === 0) continue;
    const everContacted = voterVisits.some((v) => v.outcome === 'contacted');
    if (everContacted) continue;
    const attempts = voterVisits.filter((v) => v.outcome === 'no_answer').length;
    if (attempts < minAttempts) continue;

    const lastAttemptAt = voterVisits.reduce(
      (latest, v) => (new Date(v.occurred_at).getTime() > new Date(latest).getTime() ? v.occurred_at : latest),
      voterVisits[0].occurred_at
    );
    candidates.push({ voterId: target.id, name: target.full_name || 'Voter', attempts, lastAttemptAt });
  }

  return candidates.sort(
    (a, b) => b.attempts - a.attempts || new Date(a.lastAttemptAt).getTime() - new Date(b.lastAttemptAt).getTime()
  );
}
