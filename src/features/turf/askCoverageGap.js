const DAY_MS = 86_400_000;
export function findAskCoverageGaps(households, visits, warmDoors, donations, opts) {
    const lookbackDays = opts?.lookbackDays ?? 7;
    const cutoff = Date.now() - lookbackDays * DAY_MS;
    const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
    const warmByVoter = new Map(warmDoors.map((d) => [d.voterId, d]));
    const visitsByVoter = new Map();
    for (const v of visits) {
        if (new Date(v.occurred_at).getTime() < cutoff)
            continue;
        const list = visitsByVoter.get(v.voter_id) ?? [];
        list.push(v);
        visitsByVoter.set(v.voter_id, list);
    }
    const gaps = [];
    for (const h of households) {
        const memberVisits = h.members.flatMap((m) => visitsByVoter.get(m.id) ?? []);
        if (memberVisits.length === 0)
            continue;
        const canvasserNames = new Map();
        for (const v of memberVisits) {
            if (!canvasserNames.has(v.canvasser_id))
                canvasserNames.set(v.canvasser_id, v.canvasser_name || 'Canvasser');
        }
        if (canvasserNames.size < 2)
            continue; // needs real multi-canvasser coverage
        const warmMember = h.members.find((m) => warmByVoter.has(m.id) && !alreadyGiven.has(m.id));
        if (!warmMember)
            continue;
        gaps.push({
            householdKey: h.key,
            address: h.address,
            canvassers: [...canvasserNames.values()],
            warmDoor: warmByVoter.get(warmMember.id)
        });
    }
    return gaps;
}
