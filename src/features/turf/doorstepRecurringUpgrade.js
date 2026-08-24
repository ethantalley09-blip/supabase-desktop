// Only a currently-supportive lean is a real upgrade candidate — an
// 'opposed' or 'unknown' voter who happened to give once isn't evidence of
// an ongoing relationship worth asking to deepen.
const UPGRADE_ELIGIBLE_BUCKETS = ['base_support', 'persuadable'];
export function findDoorstepRecurringTargets(donations, visits) {
    const centsByVoter = new Map();
    for (const d of donations) {
        if (!d.voter_id)
            continue;
        centsByVoter.set(d.voter_id, (centsByVoter.get(d.voter_id) ?? 0) + d.amount_cents);
    }
    if (centsByVoter.size === 0)
        return [];
    const latestVisitByVoter = new Map();
    for (const v of visits) {
        const existing = latestVisitByVoter.get(v.voter_id);
        if (!existing || new Date(v.occurred_at).getTime() > new Date(existing.occurred_at).getTime()) {
            latestVisitByVoter.set(v.voter_id, v);
        }
    }
    const targets = [];
    for (const [voterId, cents] of centsByVoter) {
        const latest = latestVisitByVoter.get(voterId);
        if (!latest || !UPGRADE_ELIGIBLE_BUCKETS.includes(latest.persuadability_bucket))
            continue;
        targets.push({ voterId, name: latest.voter_name || 'Voter', lastGiftCents: cents, lean: latest.persuadability_bucket });
    }
    return targets.sort((a, b) => b.lastGiftCents - a.lastGiftCents);
}
