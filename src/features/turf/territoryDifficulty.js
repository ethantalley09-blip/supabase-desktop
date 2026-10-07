// Pure logic for the Territory Difficulty Briefing (feature 5 of round 3):
// real per-territory contact/opposition/dead-door rates from the visit log,
// so a captain can see which territory is genuinely harder to work before
// staffing it — never a guess, always from real logged outcomes. No
// Supabase import (pattern: route.ts, doorstep.ts) — see
// territoryDifficulty.test.ts.
import { remainingDoorsToday } from './turfBriefingMath';
// A territory needs at least this many logged visits before its rates mean
// anything — one hostile door isn't "100% opposition."
const MIN_ATTEMPTS_FOR_DIFFICULTY = 3;
// Ranked hardest-first (opposition + dead-door rate combined) — the
// territories worth flagging to a captain deciding where to send
// experienced vs. new volunteers.
export function computeTerritoryDifficulty(voters, visits, territories) {
    const voterTerritory = new Map(voters.map((v) => [v.id, v.territory_id]));
    const stats = new Map();
    for (const visit of visits) {
        const territoryId = voterTerritory.get(visit.voter_id);
        if (!territoryId)
            continue; // door isn't assigned to a territory — nothing to attribute this visit to
        const s = stats.get(territoryId) ?? { attempts: 0, contacted: 0, opposed: 0, deadDoor: 0 };
        s.attempts += 1;
        if (visit.outcome === 'contacted')
            s.contacted += 1;
        if (visit.outcome === 'dead_door')
            s.deadDoor += 1;
        if (visit.persuadability_bucket === 'opposed')
            s.opposed += 1;
        stats.set(territoryId, s);
    }
    const remainingByTerritory = new Map();
    for (const v of remainingDoorsToday(voters)) {
        if (v.territory_id)
            remainingByTerritory.set(v.territory_id, (remainingByTerritory.get(v.territory_id) ?? 0) + 1);
    }
    return [...stats.entries()]
        .filter(([, s]) => s.attempts >= MIN_ATTEMPTS_FOR_DIFFICULTY)
        .map(([territoryId, s]) => ({
        territoryId,
        name: territories.find((t) => t.id === territoryId)?.name ?? 'Unnamed territory',
        attempts: s.attempts,
        contactRatePct: Math.round((s.contacted / s.attempts) * 100),
        oppositionPct: Math.round((s.opposed / s.attempts) * 100),
        deadDoorPct: Math.round((s.deadDoor / s.attempts) * 100),
        remainingDoors: remainingByTerritory.get(territoryId) ?? 0
    }))
        .sort((a, b) => b.oppositionPct + b.deadDoorPct - (a.oppositionPct + a.deadDoorPct));
}
