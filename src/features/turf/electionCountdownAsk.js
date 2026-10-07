export function daysUntilElection(dateStr, now = new Date()) {
    const target = new Date(`${dateStr}T00:00:00`);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}
export function findCountdownAskTargets(warmDoors, donations, electionDateStr, now = new Date(), limit = 5) {
    const days = daysUntilElection(electionDateStr, now);
    if (days < 0)
        return []; // election already passed — nothing left to count down to
    const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
    return warmDoors
        .filter((d) => !alreadyGiven.has(d.voterId))
        .slice(0, limit)
        .map((d) => ({ ...d, daysUntilElection: days }));
}
