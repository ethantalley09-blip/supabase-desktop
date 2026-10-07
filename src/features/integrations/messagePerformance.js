// Pure logic for question-bank §14-15 (SMS/email performance) -- reads
// message_events rows normalized by an integration connector (webhook or
// poll), never a raw provider payload directly. No Supabase import -- see
// messagePerformance.test.js.

// Below this many real sends, a delivery/open/reply rate is a handful of
// early messages, not a real signal -- same sample-size discipline as the
// canvasser leaderboard / best-time-to-knock elsewhere in the advisor.
const MIN_SENT_FOR_RATE = 10;
const COUNTED_EVENT_TYPES = ['sent', 'delivered', 'opened', 'clicked', 'replied', 'bounced', 'failed'];
function tallyByChannel(events) {
    const map = new Map();
    for (const e of events) {
        const c = map.get(e.channel) ?? { sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, failed: 0 };
        if (COUNTED_EVENT_TYPES.includes(e.event_type))
            c[e.event_type] += 1;
        map.set(e.channel, c);
    }
    return map;
}
export function computeMessagePerformance(events) {
    const byChannel = tallyByChannel(events);
    const result = [];
    for (const [channel, c] of byChannel) {
        if (c.sent < MIN_SENT_FOR_RATE)
            continue;
        result.push({
            channel,
            sent: c.sent,
            deliveryRatePct: Math.round((c.delivered / c.sent) * 100),
            openRatePct: c.delivered > 0 ? Math.round((c.opened / c.delivered) * 100) : null,
            clickRatePct: c.delivered > 0 ? Math.round((c.clicked / c.delivered) * 100) : null,
            replyRatePct: c.delivered > 0 ? Math.round((c.replied / c.delivered) * 100) : null,
            bounceRatePct: Math.round((c.bounced / c.sent) * 100)
        });
    }
    return result.sort((a, b) => b.sent - a.sent);
}
