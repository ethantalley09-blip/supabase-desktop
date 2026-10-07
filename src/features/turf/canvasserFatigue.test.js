import { describe, expect, it } from 'vitest';
import { detectCanvasserFatigue } from './canvasserFatigue';
const NOW = new Date('2026-07-24T18:00:00');
function hoursAgo(hours) {
    return new Date(NOW.getTime() - hours * 60 * 60 * 1000).toISOString();
}
function visit(id, name, hours, outcome) {
    return { canvasser_id: id, canvasser_name: name, occurred_at: hoursAgo(hours), outcome };
}
describe('detectCanvasserFatigue', () => {
    it('flags a canvasser whose contact rate dropped meaningfully in the second half of the shift', () => {
        const visits = [
            // early half: 8 hours ago through 6 hours ago, 4/4 contacted
            visit('c1', 'Finn', 8, 'contacted'),
            visit('c1', 'Finn', 7.5, 'contacted'),
            visit('c1', 'Finn', 7, 'contacted'),
            visit('c1', 'Finn', 6.5, 'contacted'),
            // later half: 3 hours ago through 1 hour ago, 0/4 contacted
            visit('c1', 'Finn', 3, 'no_answer'),
            visit('c1', 'Finn', 2.5, 'no_answer'),
            visit('c1', 'Finn', 2, 'no_answer'),
            visit('c1', 'Finn', 1, 'no_answer')
        ];
        const alerts = detectCanvasserFatigue(visits, NOW);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({
            canvasserId: 'c1',
            name: 'Finn',
            earlyContactRatePct: 100,
            laterContactRatePct: 0,
            attemptsConsidered: 8
        });
    });
    it('does not flag a steady contact rate across the shift', () => {
        const visits = [
            visit('c1', 'Finn', 8, 'contacted'),
            visit('c1', 'Finn', 7, 'no_answer'),
            visit('c1', 'Finn', 6, 'contacted'),
            visit('c1', 'Finn', 5, 'no_answer'),
            visit('c1', 'Finn', 4, 'contacted'),
            visit('c1', 'Finn', 3, 'no_answer'),
            visit('c1', 'Finn', 2, 'contacted'),
            visit('c1', 'Finn', 1, 'no_answer')
        ];
        expect(detectCanvasserFatigue(visits, NOW)).toHaveLength(0);
    });
    it('does not flag a canvasser with too few attempts in a half', () => {
        const visits = [
            visit('c1', 'Finn', 8, 'contacted'),
            visit('c1', 'Finn', 7, 'contacted'),
            visit('c1', 'Finn', 3, 'no_answer')
        ];
        expect(detectCanvasserFatigue(visits, NOW)).toHaveLength(0);
    });
    it('ignores visits from a previous day, even with the same decline pattern', () => {
        const visits = [
            visit('c1', 'Finn', 32, 'contacted'),
            visit('c1', 'Finn', 31.5, 'contacted'),
            visit('c1', 'Finn', 31, 'contacted'),
            visit('c1', 'Finn', 30.5, 'contacted'),
            visit('c1', 'Finn', 27, 'no_answer'),
            visit('c1', 'Finn', 26.5, 'no_answer'),
            visit('c1', 'Finn', 26, 'no_answer'),
            visit('c1', 'Finn', 25, 'no_answer')
        ];
        expect(detectCanvasserFatigue(visits, NOW)).toHaveLength(0);
    });
    it('returns an empty list for no visits', () => {
        expect(detectCanvasserFatigue([], NOW)).toHaveLength(0);
    });
});
