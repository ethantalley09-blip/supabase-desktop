import { describe, expect, it } from 'vitest';
import { inRange, resolvePreset } from './dateRange';
// Fixed "now": July 3 2026, noon local — Q3, so "last quarter" is Q2
// (Apr 1 – Jun 30). Dates constructed with local-time args to avoid UTC
// parsing ambiguity.
const NOW = new Date(2026, 6, 3, 12);
const jul1 = new Date(2026, 6, 1, 9);
const jun15 = new Date(2026, 5, 15, 9);
const may10 = new Date(2026, 4, 10, 9);
const jan5 = new Date(2026, 0, 5, 9);
const all = [jul1, jun15, may10, jan5];
function countIn(presetId) {
    const range = resolvePreset(presetId, NOW);
    return all.filter((d) => inRange(d, range)).length;
}
describe('resolvePreset + inRange', () => {
    it('all time includes everything', () => {
        expect(countIn('all')).toBe(4);
    });
    it('last30 includes only dates within 30 days (Jul 1 and Jun 15)', () => {
        expect(countIn('last30')).toBe(2);
    });
    it('last90 excludes January', () => {
        expect(countIn('last90')).toBe(3);
    });
    it('this_month includes only July dates', () => {
        expect(countIn('this_month')).toBe(1);
    });
    it('this_quarter starts exactly on Jul 1 (Q3 boundary)', () => {
        expect(countIn('this_quarter')).toBe(1);
        // Jun 30 23:59 is one minute before Q3 — must be excluded.
        const q3 = resolvePreset('this_quarter', NOW);
        expect(inRange(new Date(2026, 5, 30, 23, 59), q3)).toBe(false);
        expect(inRange(new Date(2026, 6, 1, 0, 0), q3)).toBe(true);
    });
    it('last_quarter is exactly Q2: Apr 1 through Jun 30 inclusive', () => {
        expect(countIn('last_quarter')).toBe(2); // jun15 + may10
        const q2 = resolvePreset('last_quarter', NOW);
        expect(inRange(new Date(2026, 3, 1, 0, 0), q2)).toBe(true); // Apr 1 00:00
        expect(inRange(new Date(2026, 5, 30, 23, 59), q2)).toBe(true); // Jun 30 end
        expect(inRange(new Date(2026, 6, 1, 0, 0), q2)).toBe(false); // Jul 1
        expect(inRange(new Date(2026, 2, 31, 23, 59), q2)).toBe(false); // Mar 31
    });
    it('open-ended ranges have null bounds', () => {
        const r = resolvePreset('all', NOW);
        expect(r.from).toBeNull();
        expect(r.to).toBeNull();
    });
});
