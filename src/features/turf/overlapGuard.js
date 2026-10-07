const DAY_MS = 86_400_000;
export function detectCrossCanvasserOverlap(households, visits, opts) {
    const lookbackDays = opts?.lookbackDays ?? 7;
    const cutoff = Date.now() - lookbackDays * DAY_MS;
    const visitsByVoter = new Map();
    for (const v of visits) {
        if (new Date(v.occurred_at).getTime() < cutoff)
            continue;
        const list = visitsByVoter.get(v.voter_id) ?? [];
        list.push(v);
        visitsByVoter.set(v.voter_id, list);
    }
    const alerts = [];
    for (const h of households) {
        const memberVisits = h.members
            .flatMap((m) => visitsByVoter.get(m.id) ?? [])
            .sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
        if (memberVisits.length === 0)
            continue;
        const canvasserNames = new Map();
        for (const v of memberVisits) {
            if (!canvasserNames.has(v.canvasser_id))
                canvasserNames.set(v.canvasser_id, v.canvasser_name || 'Canvasser');
        }
        if (canvasserNames.size < 2)
            continue; // same canvasser revisiting isn't an overlap
        alerts.push({
            householdKey: h.key,
            address: h.address,
            canvassers: [...canvasserNames.values()],
            visitCount: memberVisits.length
        });
    }
    return alerts.sort((a, b) => b.visitCount - a.visitCount);
}
