// Below this many attempts, a contact rate is one lucky/unlucky knock, not a
// real signal — don't rank (or embarrass) anyone off a tiny sample.
const MIN_ATTEMPTS = 3;
// Ranked by real contacts first (the outcome that actually matters in the
// field), contact rate as the tiebreaker. Ties in both stay in visit order.
export function computeCanvasserLeaderboard(visits, opts) {
    const minAttempts = opts?.minAttempts ?? MIN_ATTEMPTS;
    const byCanvasser = new Map();
    for (const v of visits) {
        const entry = byCanvasser.get(v.canvasser_id) ?? { name: v.canvasser_name, attempts: 0, contacts: 0 };
        entry.attempts += 1;
        if (v.outcome === 'contacted')
            entry.contacts += 1;
        if (!entry.name && v.canvasser_name)
            entry.name = v.canvasser_name;
        byCanvasser.set(v.canvasser_id, entry);
    }
    return [...byCanvasser.entries()]
        .filter(([, e]) => e.attempts >= minAttempts)
        .map(([canvasserId, e]) => ({
        canvasserId,
        name: e.name || 'Canvasser',
        attempts: e.attempts,
        contacts: e.contacts,
        contactRatePct: Math.round((e.contacts / e.attempts) * 100)
    }))
        .sort((a, b) => b.contacts - a.contacts || b.contactRatePct - a.contactRatePct);
}
