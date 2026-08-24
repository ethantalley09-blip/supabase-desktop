// Strips a leading house number so "100 Main St" and "204 Main St" match as
// the same street — a simple, explainable heuristic (pattern: route.ts's
// pickField, turfBriefingMath.ts's PARTY_ALIASES: pragmatic over clever).
function streetName(addressLine) {
    if (!addressLine)
        return null;
    const stripped = addressLine.replace(/^\s*\d+\s*/, '').trim().toLowerCase();
    return stripped || null;
}
export function findNeighborhoodProof(warmDoors, allVoters, donations) {
    const givers = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
    const streetToVoterIds = new Map();
    for (const v of allVoters) {
        const street = streetName(v.address_line);
        if (!street)
            continue;
        const set = streetToVoterIds.get(street) ?? new Set();
        set.add(v.id);
        streetToVoterIds.set(street, set);
    }
    const results = [];
    for (const door of warmDoors) {
        const street = streetName(door.address);
        if (!street)
            continue;
        const streetVoterIds = streetToVoterIds.get(street);
        if (!streetVoterIds)
            continue;
        let neighborGiverCount = 0;
        for (const id of streetVoterIds) {
            if (id !== door.voterId && givers.has(id))
                neighborGiverCount += 1;
        }
        if (neighborGiverCount === 0)
            continue;
        results.push({ ...door, streetName: street, neighborGiverCount });
    }
    return results.sort((a, b) => b.neighborGiverCount - a.neighborGiverCount);
}
