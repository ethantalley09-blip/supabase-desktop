// Pure ranking logic for the org-level "which project needs the most
// attention" rollup (question-bank §23) — the one piece of that section that
// doesn't need a new host surface: HomePage.tsx already lists every project
// an Owner/Manager can see, right below OrgDashboard's existing cross-project
// widgets. Deliberately NOT a prediction — just an honest, explainable
// ranking from real per-project counts (unmapped voters, dollars raised). No
// Supabase import — see projectRollup.test.ts.
export type ProjectRollupRow = {
  projectId: string;
  name: string;
  totalVoters: number;
  mappedVoters: number;
  raisedCents: number;
};

export type ProjectAttention = ProjectRollupRow & {
  mappedRatePct: number;
  unmappedVoters: number;
  attentionScore: number;
};

// $100 raised is treated as roughly offsetting a 1-voter unmapped backlog —
// just enough so a well-funded project doesn't automatically outrank a
// stalled one purely for having fewer voters. Not a real exchange rate,
// just a tie-breaker weighting.
const DOLLARS_PER_BACKLOG_VOTER_CENTS = 10_000;

export function rankProjectsByAttention(rows: ProjectRollupRow[]): ProjectAttention[] {
  return rows
    .map((r) => {
      const unmappedVoters = Math.max(0, r.totalVoters - r.mappedVoters);
      const mappedRatePct = r.totalVoters > 0 ? Math.round((r.mappedVoters / r.totalVoters) * 100) : 0;
      const attentionScore = unmappedVoters - r.raisedCents / DOLLARS_PER_BACKLOG_VOTER_CENTS;
      return { ...r, mappedRatePct, unmappedVoters, attentionScore };
    })
    .sort((a, b) => b.attentionScore - a.attentionScore);
}

// "Which project has the strongest fundraising pace?" (§23) — a plain sort
// on data the rollup already fetches, no new query needed.
export function rankProjectsByFundraising(rows: ProjectRollupRow[]): ProjectRollupRow[] {
  return [...rows].sort((a, b) => b.raisedCents - a.raisedCents);
}
