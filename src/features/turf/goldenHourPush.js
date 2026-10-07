// Only doors that are BOTH warm (real note signals) AND still reachable
// today AND not already given make the cut — a door that already gave
// doesn't need an ask, and a door outside today's remaining set can't be
// reached before dark regardless of how warm it is.
export function findGoldenHourTargets(warmDoors, remainingDoorIds, donations, limit = 3) {
    const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
    return warmDoors.filter((d) => remainingDoorIds.has(d.voterId) && !alreadyGiven.has(d.voterId)).slice(0, limit);
}
