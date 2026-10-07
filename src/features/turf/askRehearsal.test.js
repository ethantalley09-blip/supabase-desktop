import { describe, expect, it } from 'vitest';
import { buildAskRehearsalSnapshot } from './askRehearsal';
describe('buildAskRehearsalSnapshot', () => {
    it('returns null when there are no warm doors', () => {
        expect(buildAskRehearsalSnapshot([])).toBeNull();
    });
    it('counts real doors and ranks the most frequent reasons first', () => {
        const warmDoors = [
            { reasons: ['noted as a supporter', 'wants a yard sign'] },
            { reasons: ['noted as a supporter'] },
            { reasons: ['noted as a supporter', 'mentioned donating'] }
        ];
        const snapshot = buildAskRehearsalSnapshot(warmDoors);
        expect(snapshot?.doorCount).toBe(3);
        expect(snapshot?.commonReasons[0]).toBe('noted as a supporter');
        expect(snapshot?.commonReasons).toContain('wants a yard sign');
        expect(snapshot?.commonReasons).toContain('mentioned donating');
    });
    it('caps the common reasons list at 5', () => {
        const warmDoors = Array.from({ length: 8 }, (_, i) => ({ reasons: [`reason ${i}`] }));
        const snapshot = buildAskRehearsalSnapshot(warmDoors);
        expect(snapshot?.commonReasons).toHaveLength(5);
    });
    it('never ties a reason back to a specific voter — output has no id/name fields', () => {
        const snapshot = buildAskRehearsalSnapshot([{ reasons: ['noted as a supporter'] }]);
        expect(snapshot).toEqual({ doorCount: 1, commonReasons: ['noted as a supporter'] });
    });
});
