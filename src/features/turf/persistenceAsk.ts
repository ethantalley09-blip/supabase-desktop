// Pure logic for Persistence Pays: cross-references real visit history
// (canvass_visits, migration 0030) against linked doorstep donations
// (migration 0032) to find a door that just converted from repeated
// no_answer to a real contact after genuine persistence. That's a distinct
// psychological moment (reciprocity — "you kept coming back for me") from a
// first-knock ask, and if that persistence-earned contact hasn't given yet,
// it's one of the best-timed asks on the board. No Supabase import
// (pattern: visitHistory.ts) — see persistenceAsk.test.ts.
import type { VisitOutcome } from './visitHistory';

export type VisitForPersistence = { voter_id: string; voter_name: string | null; occurred_at: string; outcome: VisitOutcome };
export type DonationForPersistence = { voter_id: string | null };

export type PersistenceTarget = {
  voterId: string;
  name: string;
  priorAttempts: number; // real no_answer attempts before the visit that finally landed
};

// Below this many real prior no-answers, reaching someone on (say) the
// second try isn't "persistence" worth calling out.
const MIN_PRIOR_ATTEMPTS = 2;

export function findPersistenceAskTargets(
  visits: VisitForPersistence[],
  donations: DonationForPersistence[]
): PersistenceTarget[] {
  const byVoter = new Map<string, VisitForPersistence[]>();
  for (const v of visits) {
    const list = byVoter.get(v.voter_id) ?? [];
    list.push(v);
    byVoter.set(v.voter_id, list);
  }

  const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));

  const targets: PersistenceTarget[] = [];
  for (const [voterId, list] of byVoter) {
    if (alreadyGiven.has(voterId)) continue;
    const sorted = [...list].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
    const latest = sorted[sorted.length - 1];
    if (latest.outcome !== 'contacted') continue; // only the visit that finally succeeded

    const priorAttempts = sorted.slice(0, -1).filter((v) => v.outcome === 'no_answer').length;
    if (priorAttempts < MIN_PRIOR_ATTEMPTS) continue;

    targets.push({ voterId, name: latest.voter_name || 'Voter', priorAttempts });
  }

  return targets.sort((a, b) => b.priorAttempts - a.priorAttempts);
}
