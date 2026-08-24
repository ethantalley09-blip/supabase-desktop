import { describe, expect, it } from 'vitest';
import { computeCanvasserAskCoach } from './canvasserAskCoach';
const stat = (over) => ({
    canvasserId: 'c1',
    name: 'Finn',
    attempts: 10,
    contacts: 5,
    contactRatePct: 50,
    ...over
});
const row = (over) => ({
    recorderId: 'c1',
    name: 'Finn',
    totalCents: 5000,
    giftCount: 2,
    ...over
});
describe('computeCanvasserAskCoach', () => {
    it('excludes a canvasser below the minimum-contacts threshold', () => {
        const result = computeCanvasserAskCoach([stat({ contacts: 2 })], []);
        expect(result).toEqual([]);
    });
    it('computes a real ask rate from contacts and linked gift count', () => {
        const result = computeCanvasserAskCoach([stat({ canvasserId: 'c1', contacts: 10 })], [row({ recorderId: 'c1', giftCount: 5 })]);
        expect(result).toEqual([{ canvasserId: 'c1', name: 'Finn', contacts: 10, giftCount: 5, askRatePct: 50 }]);
    });
    it('gives a 0% ask rate to a canvasser who has never logged a gift', () => {
        const result = computeCanvasserAskCoach([stat({ canvasserId: 'c1', contacts: 10 })], []);
        expect(result[0]).toMatchObject({ giftCount: 0, askRatePct: 0 });
    });
    it('ranks the lowest ask rate first — who most needs coaching', () => {
        const stats = [stat({ canvasserId: 'c1', name: 'Finn', contacts: 10 }), stat({ canvasserId: 'c2', name: 'Carol', contacts: 10 })];
        const rows = [row({ recorderId: 'c1', giftCount: 8 }), row({ recorderId: 'c2', giftCount: 1 })];
        const result = computeCanvasserAskCoach(stats, rows);
        expect(result.map((r) => r.canvasserId)).toEqual(['c2', 'c1']);
    });
});
