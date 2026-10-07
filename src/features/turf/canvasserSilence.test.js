import { describe, expect, it } from 'vitest';
import { detectSilentCanvassers } from './canvasserSilence';
const NOW = new Date('2026-07-24T18:00:00');
function minutesAgo(minutes) {
    return new Date(NOW.getTime() - minutes * 60 * 1000).toISOString();
}
function visit(id, name, minutes) {
    return { canvasser_id: id, canvasser_name: name, occurred_at: minutesAgo(minutes) };
}
describe('detectSilentCanvassers', () => {
    it('flags a canvasser silent for over the threshold after a real earlier presence', () => {
        const visits = [visit('c1', 'Finn', 300), visit('c1', 'Finn', 250), visit('c1', 'Finn', 200)];
        const alerts = detectSilentCanvassers(visits, NOW);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ canvasserId: 'c1', name: 'Finn', minutesSinceLastVisit: 200, visitsToday: 3 });
    });
    it('does not flag a canvasser who is still actively knocking', () => {
        const visits = [visit('c1', 'Finn', 60), visit('c1', 'Finn', 10)];
        expect(detectSilentCanvassers(visits, NOW)).toHaveLength(0);
    });
    it('does not flag a canvasser with only one visit today, no matter how stale', () => {
        const visits = [visit('c1', 'Finn', 300)];
        expect(detectSilentCanvassers(visits, NOW)).toHaveLength(0);
    });
    it('ignores visits from a previous day', () => {
        const visits = [visit('c1', 'Finn', 60 * 30), visit('c1', 'Finn', 60 * 28)];
        expect(detectSilentCanvassers(visits, NOW)).toHaveLength(0);
    });
    it('ranks the longest silence first', () => {
        const visits = [
            visit('c1', 'Finn', 300),
            visit('c1', 'Finn', 200),
            visit('c2', 'Carol', 500),
            visit('c2', 'Carol', 400)
        ];
        const alerts = detectSilentCanvassers(visits, NOW);
        expect(alerts.map((a) => a.canvasserId)).toEqual(['c2', 'c1']);
    });
    it('returns an empty list for no visits', () => {
        expect(detectSilentCanvassers([], NOW)).toHaveLength(0);
    });
});
