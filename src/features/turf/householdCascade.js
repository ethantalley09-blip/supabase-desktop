export function findHouseholdCascadeTargets(households, donations) {
    const centsByVoter = new Map();
    for (const d of donations) {
        if (!d.voter_id)
            continue;
        centsByVoter.set(d.voter_id, (centsByVoter.get(d.voter_id) ?? 0) + d.amount_cents);
    }
    const targets = [];
    for (const h of households) {
        if (h.members.length < 2)
            continue; // no one else at this address to cross-sell to
        const givingMember = h.members.find((m) => centsByVoter.has(m.id));
        if (!givingMember)
            continue;
        const askTargets = h.members
            .filter((m) => m.id !== givingMember.id && !centsByVoter.has(m.id))
            .map((m) => ({ voterId: m.id, name: m.full_name || 'Voter' }));
        if (askTargets.length === 0)
            continue;
        targets.push({
            householdKey: h.key,
            address: h.address,
            givingMemberName: givingMember.full_name || 'A household member',
            givingMemberAmountCents: centsByVoter.get(givingMember.id),
            askTargets
        });
    }
    return targets.sort((a, b) => b.givingMemberAmountCents - a.givingMemberAmountCents);
}
