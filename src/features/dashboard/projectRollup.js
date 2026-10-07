// $100 raised is treated as roughly offsetting a 1-voter unmapped backlog —
// just enough so a well-funded project doesn't automatically outrank a
// stalled one purely for having fewer voters. Not a real exchange rate,
// just a tie-breaker weighting.
const DOLLARS_PER_BACKLOG_VOTER_CENTS = 10_000;
export function rankProjectsByAttention(rows) {
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
export function rankProjectsByFundraising(rows) {
    return [...rows].sort((a, b) => b.raisedCents - a.raisedCents);
}
