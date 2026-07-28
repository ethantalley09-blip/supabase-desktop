// Pure logic for the Territory Staffing Advisor: cross-references real
// remaining-door counts per territory (same computation as
// turfBriefingMath.ts's topRemainingTerritories / territoryDifficulty.ts)
// with how many distinct real canvassers have actually worked each
// territory recently, to catch a territory quietly going unworked while
// another sits over-staffed relative to what's left. Distinct from
// territoryDifficulty.ts (which ranks vote-contact difficulty, not staffing
// balance) and territoryFundraisingRoi.ts (revenue per door, a different
// axis entirely). No Supabase import (pattern: territoryDifficulty.ts) —
// see territoryStaffing.test.ts.
import { remainingDoorsToday } from './turfBriefingMath';
const LOOKBACK_DAYS = 7;
const DAY_MS = 86_400_000;
// A territory needs a real, meaningful backlog before a staffing gap there
// is worth acting on — a couple of leftover doors isn't a crisis.
const MIN_REMAINING_FOR_CONCERN = 10;
// The understaffed territory's workload-per-canvasser must be at least this
// many times the over-staffed one's before it's a clear enough signal to
// recommend moving real people, not just noise between two similar loads.
const REALLOCATION_RATIO = 3;
// Only territories with real remaining work are worth showing at all — an
// exhausted territory with zero doors left doesn't need staffing advice.
export function computeTerritoryStaffing(voters, visits, territories, now = new Date()) {
    const remainingByTerritory = new Map();
    for (const v of remainingDoorsToday(voters, now.getTime())) {
        if (v.territory_id)
            remainingByTerritory.set(v.territory_id, (remainingByTerritory.get(v.territory_id) ?? 0) + 1);
    }
    const voterTerritory = new Map(voters.map((v) => [v.id, v.territory_id]));
    const cutoff = now.getTime() - LOOKBACK_DAYS * DAY_MS;
    const canvassersByTerritory = new Map();
    for (const v of visits) {
        if (new Date(v.occurred_at).getTime() < cutoff)
            continue;
        const territoryId = voterTerritory.get(v.voter_id);
        if (!territoryId)
            continue;
        const set = canvassersByTerritory.get(territoryId) ?? new Set();
        set.add(v.canvasser_id);
        canvassersByTerritory.set(territoryId, set);
    }
    return territories
        .map((t) => {
        const remainingDoors = remainingByTerritory.get(t.id) ?? 0;
        const activeCanvassers = canvassersByTerritory.get(t.id)?.size ?? 0;
        return {
            territoryId: t.id,
            name: t.name,
            remainingDoors,
            activeCanvassers,
            doorsPerCanvasser: remainingDoors / Math.max(activeCanvassers, 1)
        };
    })
        .filter((t) => t.remainingDoors > 0)
        .sort((a, b) => b.doorsPerCanvasser - a.doorsPerCanvasser);
}
// Ranked by how stark the imbalance is — the biggest, most actionable gap
// first. Only ever suggests pulling FROM a territory that actually has at
// least one real active canvasser to spare; never recommends anything for a
// territory nobody is currently on (there's no one there to reassign).
export function suggestReallocations(staffing, limit = 3) {
    const understaffed = staffing.filter((t) => t.remainingDoors >= MIN_REMAINING_FOR_CONCERN);
    const overstaffed = staffing.filter((t) => t.activeCanvassers > 0).sort((a, b) => a.doorsPerCanvasser - b.doorsPerCanvasser);
    const suggestions = [];
    for (const under of understaffed) {
        const over = overstaffed.find((o) => o.territoryId !== under.territoryId && under.doorsPerCanvasser >= o.doorsPerCanvasser * REALLOCATION_RATIO);
        if (!over)
            continue;
        suggestions.push({
            fromTerritory: over.name,
            toTerritory: under.name,
            fromDoorsPerCanvasser: Math.round(over.doorsPerCanvasser * 10) / 10,
            toDoorsPerCanvasser: Math.round(under.doorsPerCanvasser * 10) / 10
        });
        if (suggestions.length >= limit)
            break;
    }
    return suggestions;
}
