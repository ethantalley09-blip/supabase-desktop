// Below this many real contacts, an ask rate is one lucky/unlucky
// conversation, not a coaching-worthy pattern.
const MIN_CONTACTS = 3;
// Ranked lowest ask-rate first — the canvasser who most needs coaching
// leads the list, not the one already converting well.
export function computeCanvasserAskCoach(canvasserStats, donationLeaderboard) {
    const giftsByRecorder = new Map(donationLeaderboard.map((r) => [r.recorderId, r.giftCount]));
    return canvasserStats
        .filter((c) => c.contacts >= MIN_CONTACTS)
        .map((c) => {
        const giftCount = giftsByRecorder.get(c.canvasserId) ?? 0;
        return {
            canvasserId: c.canvasserId,
            name: c.name,
            contacts: c.contacts,
            giftCount,
            askRatePct: Math.round((giftCount / c.contacts) * 100)
        };
    })
        .sort((a, b) => a.askRatePct - b.askRatePct);
}
