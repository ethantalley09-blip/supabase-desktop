// Below this many real prior no-answers, reaching someone on (say) the
// second try isn't "persistence" worth calling out.
const MIN_PRIOR_ATTEMPTS = 2;
export function findPersistenceAskTargets(visits, donations) {
    const byVoter = new Map();
    for (const v of visits) {
        const list = byVoter.get(v.voter_id) ?? [];
        list.push(v);
        byVoter.set(v.voter_id, list);
    }
    const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
    const targets = [];
    for (const [voterId, list] of byVoter) {
        if (alreadyGiven.has(voterId))
            continue;
        const sorted = [...list].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
        const latest = sorted[sorted.length - 1];
        if (latest.outcome !== 'contacted')
            continue; // only the visit that finally succeeded
        const priorAttempts = sorted.slice(0, -1).filter((v) => v.outcome === 'no_answer').length;
        if (priorAttempts < MIN_PRIOR_ATTEMPTS)
            continue;
        targets.push({ voterId, name: latest.voter_name || 'Voter', priorAttempts });
    }
    return targets.sort((a, b) => b.priorAttempts - a.priorAttempts);
}
