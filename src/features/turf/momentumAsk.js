// Only "warmed" drift (never "cooled") makes an ask target — asking a door
// that just turned hostile would be tone-deaf, not opportunistic.
export function findMomentumAskTargets(driftAlerts, donations) {
    const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
    return driftAlerts.filter((a) => a.direction === 'warmed' && !alreadyGiven.has(a.voterId));
}
