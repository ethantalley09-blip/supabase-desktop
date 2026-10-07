import { describe, expect, it } from 'vitest';
import { computeCanvasserLeaderboard } from './canvasserStats';
const visit = (over) => ({
    canvasser_id: 'c1',
    canvasser_name: 'Finn',
    outcome: 'no_answer',
    ...over
});
describe('computeCanvasserLeaderboard', () => {
    it('excludes canvassers below the minimum attempt threshold', () => {
        const result = computeCanvasserLeaderboard([
            visit({ canvasser_id: 'c1', outcome: 'contacted' }),
            visit({ canvasser_id: 'c1', outcome: 'contacted' })
        ]);
        expect(result).toEqual([]);
    });
    it('ranks by real contacts first, contact rate as tiebreaker', () => {
        const visits = [
            // c1: 11 attempts, 7 contacted -> ~64%
            ...Array.from({ length: 4 }, () => visit({ canvasser_id: 'c1', canvasser_name: 'Finn', outcome: 'no_answer' })),
            ...Array.from({ length: 7 }, () => visit({ canvasser_id: 'c1', canvasser_name: 'Finn', outcome: 'contacted' })),
            // c2: 6 attempts, 6 contacted -> 100%, but fewer real contacts than c1
            ...Array.from({ length: 6 }, () => visit({ canvasser_id: 'c2', canvasser_name: 'Carol', outcome: 'contacted' }))
        ];
        const result = computeCanvasserLeaderboard(visits);
        expect(result.map((r) => r.canvasserId)).toEqual(['c1', 'c2']);
        expect(result[0]).toMatchObject({ name: 'Finn', attempts: 11, contacts: 7 });
    });
    it('breaks a tie in real contacts by contact rate', () => {
        const visits = [
            // c1: 3 attempts, 3 contacted -> 100%
            ...Array.from({ length: 3 }, () => visit({ canvasser_id: 'c1', canvasser_name: 'Finn', outcome: 'contacted' })),
            // c2: 4 attempts, 3 contacted -> 75%
            visit({ canvasser_id: 'c2', canvasser_name: 'Carol', outcome: 'no_answer' }),
            ...Array.from({ length: 3 }, () => visit({ canvasser_id: 'c2', canvasser_name: 'Carol', outcome: 'contacted' }))
        ];
        const result = computeCanvasserLeaderboard(visits);
        expect(result.map((r) => r.canvasserId)).toEqual(['c1', 'c2']);
    });
    it('falls back to a generic name when none is available', () => {
        const result = computeCanvasserLeaderboard([
            visit({ canvasser_id: 'c1', canvasser_name: null, outcome: 'contacted' }),
            visit({ canvasser_id: 'c1', canvasser_name: null, outcome: 'contacted' }),
            visit({ canvasser_id: 'c1', canvasser_name: null, outcome: 'contacted' })
        ]);
        expect(result[0].name).toBe('Canvasser');
    });
});
