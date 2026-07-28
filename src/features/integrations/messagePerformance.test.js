import { describe, expect, it } from 'vitest';
import { computeMessagePerformance } from './messagePerformance';
function events(channel, counts) {
    const rows = [];
    for (const [type, n] of Object.entries(counts)) {
        for (let i = 0; i < n; i++)
            rows.push({ channel, event_type: type });
    }
    return rows;
}
describe('computeMessagePerformance', () => {
    it('returns nothing for an empty event list', () => {
        expect(computeMessagePerformance([])).toEqual([]);
    });
    it('excludes a channel below the minimum sample size', () => {
        const rows = events('sms', { sent: 5, delivered: 5 });
        expect(computeMessagePerformance(rows)).toEqual([]);
    });
    it('computes real rates once the sample floor is met', () => {
        const rows = events('sms', { sent: 20, delivered: 18, replied: 4, bounced: 2 });
        const result = computeMessagePerformance(rows);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            channel: 'sms',
            sent: 20,
            deliveryRatePct: 90,
            replyRatePct: 22,
            bounceRatePct: 10
        });
    });
    it('returns null (not zero) for open/click rate when nothing was delivered yet', () => {
        const rows = events('email', { sent: 15, failed: 15 });
        const result = computeMessagePerformance(rows);
        expect(result[0].openRatePct).toBeNull();
        expect(result[0].clickRatePct).toBeNull();
    });
    it('tracks channels independently and sorts by sent volume descending', () => {
        const rows = [...events('sms', { sent: 10, delivered: 10 }), ...events('email', { sent: 30, delivered: 25, opened: 10 })];
        const result = computeMessagePerformance(rows);
        expect(result.map((r) => r.channel)).toEqual(['email', 'sms']);
        expect(result[0].openRatePct).toBe(40);
    });
});
