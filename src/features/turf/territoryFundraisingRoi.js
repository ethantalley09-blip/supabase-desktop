// A territory needs at least this many unique doors knocked before a
// $-per-door figure means anything — one lucky big gift isn't a pattern.
const MIN_DOORS_KNOCKED = 3;
export function computeTerritoryFundraisingRoi(voters, visits, donations, territories) {
    const voterTerritory = new Map(voters.map((v) => [v.id, v.territory_id]));
    const doorsKnockedByTerritory = new Map();
    for (const visit of visits) {
        const territoryId = voterTerritory.get(visit.voter_id);
        if (!territoryId)
            continue;
        const set = doorsKnockedByTerritory.get(territoryId) ?? new Set();
        set.add(visit.voter_id);
        doorsKnockedByTerritory.set(territoryId, set);
    }
    const centsByTerritory = new Map();
    for (const d of donations) {
        if (!d.voter_id)
            continue;
        const territoryId = voterTerritory.get(d.voter_id);
        if (!territoryId)
            continue;
        centsByTerritory.set(territoryId, (centsByTerritory.get(territoryId) ?? 0) + d.amount_cents);
    }
    const results = [];
    for (const [territoryId, doorSet] of doorsKnockedByTerritory) {
        if (doorSet.size < MIN_DOORS_KNOCKED)
            continue;
        const totalCents = centsByTerritory.get(territoryId) ?? 0;
        results.push({
            territoryId,
            name: territories.find((t) => t.id === territoryId)?.name ?? 'Unnamed territory',
            totalCents,
            doorsKnocked: doorSet.size,
            centsPerDoorKnocked: Math.round(totalCents / doorSet.size)
        });
    }
    return results.sort((a, b) => b.centsPerDoorKnocked - a.centsPerDoorKnocked);
}
