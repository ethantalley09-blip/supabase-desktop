// Below this many failed attempts, a door just hasn't been tried enough yet
// to call it stubborn — that's the ordinary remaining-doors list's job.
const MIN_ATTEMPTS = 2;
// Ranked by attempt count first (the door that's eaten the most tries without
// a result is the most worth a deliberate, planned revisit), then by how
// long it's been since the last attempt (longer-stale first) as the
// tiebreaker.
export function buildRevisitQueue(targets, visits, opts) {
    const minAttempts = opts?.minAttempts ?? MIN_ATTEMPTS;
    const byVoter = new Map();
    for (const v of visits) {
        const list = byVoter.get(v.voter_id) ?? [];
        list.push(v);
        byVoter.set(v.voter_id, list);
    }
    const candidates = [];
    for (const target of targets) {
        const voterVisits = byVoter.get(target.id) ?? [];
        if (voterVisits.length === 0)
            continue;
        const everContacted = voterVisits.some((v) => v.outcome === 'contacted');
        if (everContacted)
            continue;
        const attempts = voterVisits.filter((v) => v.outcome === 'no_answer').length;
        if (attempts < minAttempts)
            continue;
        const lastAttemptAt = voterVisits.reduce((latest, v) => (new Date(v.occurred_at).getTime() > new Date(latest).getTime() ? v.occurred_at : latest), voterVisits[0].occurred_at);
        candidates.push({ voterId: target.id, name: target.full_name || 'Voter', attempts, lastAttemptAt });
    }
    return candidates.sort((a, b) => b.attempts - a.attempts || new Date(a.lastAttemptAt).getTime() - new Date(b.lastAttemptAt).getTime());
}
