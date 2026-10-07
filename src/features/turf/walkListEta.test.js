import { describe, expect, it } from 'vitest';
import { computeProjectPaceStats, doorSignature, estimateCompletion, estimateDoorMinutes, formatDuration } from './walkListEta';

const scored = (tag, cls, tier = 'actionable') => ({
    attribute: { tag },
    class: cls,
    tier,
    confidence: 0.7,
    daysSinceConfirmed: 0,
    reasons: []
});

// One canvasser, one day, evenly spaced visits.
const shift = (count, gapMinutes = 4, canvasser = 'c1') => Array.from({ length: count }, (_, i) => ({
    voter_id: `v${i}`,
    canvasser_id: canvasser,
    occurred_at: new Date(2026, 7, 15, 10, i * gapMinutes).toISOString()
}));

describe('doorSignature', () => {
    it('sorts tags so order of observation never splits a bucket', () => {
        const a = { attributes: [scored('gated_home', 'access'), scored('dogs', 'hazard')] };
        const b = { attributes: [scored('dogs', 'hazard'), scored('gated_home', 'access')] };
        expect(doorSignature(a)).toBe(doorSignature(b));
        expect(doorSignature(a)).toBe('dogs|gated_home');
    });

    it('never lets a safety tag into a timing bucket (class firewall)', () => {
        const withSafety = { attributes: [scored('gated_home', 'access'), scored('hostile', 'safety')] };
        const without = { attributes: [scored('gated_home', 'access')] };
        expect(doorSignature(withSafety)).toBe(doorSignature(without));
    });

    it('ignores tags below actionable and defaults to plain', () => {
        expect(doorSignature({ attributes: [scored('dogs', 'hazard', 'advisory')] })).toBe('plain');
        expect(doorSignature(null)).toBe('plain');
    });
});

describe('computeProjectPaceStats', () => {
    it('measures real minutes per door from the gap between consecutive visits', () => {
        const stats = computeProjectPaceStats(shift(40));
        expect(stats.overall.n).toBe(39);
        expect(stats.overall.median).toBe(4);
        expect(stats.bySignature.plain.n).toBe(39);
    });

    it('discards a gap long enough to be a break rather than a door', () => {
        const visits = [
            ...shift(3),
            { voter_id: 'vlate', canvasser_id: 'c1', occurred_at: new Date(2026, 7, 15, 13, 0).toISOString() }
        ];
        const stats = computeProjectPaceStats(visits);
        expect(stats.overall.n).toBe(2); // the 2h51m gap is dropped
    });

    it('never joins two different canvassers, or two different days, into one gap', () => {
        const visits = [...shift(3, 4, 'c1'), ...shift(3, 4, 'c2')];
        const stats = computeProjectPaceStats(visits);
        expect(stats.overall.n).toBe(4); // 2 gaps each, not 5 across the seam
    });

    it('buckets gaps by the condition signature of the door they led to', () => {
        const profiles = new Map([['gated', { attributes: [scored('gated_home', 'access')] }]]);
        const addressOf = new Map(Array.from({ length: 12 }, (_, i) => [`v${i}`, 'gated']));
        const stats = computeProjectPaceStats(shift(12), addressOf, profiles);
        expect(stats.bySignature.gated_home.n).toBe(11);
        expect(stats.bySignature.plain).toBeUndefined();
    });
});

describe('estimateDoorMinutes', () => {
    const stats = {
        overall: { median: 4.2, n: 100 },
        bySignature: { gated_home: { median: 9, n: 12 }, apartment: { median: 2, n: 3 } }
    };

    it('prefers a signature with enough real samples', () => {
        expect(estimateDoorMinutes('gated_home', stats)).toEqual({ minutes: 9, basis: 'signature', n: 12 });
    });

    it('falls back to the project median when a signature is too thin', () => {
        expect(estimateDoorMinutes('apartment', stats)).toEqual({ minutes: 4.2, basis: 'project', n: 100 });
        expect(estimateDoorMinutes('plain', stats)).toEqual({ minutes: 4.2, basis: 'project', n: 100 });
    });

    it('returns no number at all rather than guessing one', () => {
        const thin = { overall: { median: 5, n: 10 }, bySignature: {} };
        expect(estimateDoorMinutes('plain', thin)).toEqual({ minutes: null, basis: 'insufficient_data', n: 10 });
        expect(estimateDoorMinutes('plain', null)).toEqual({ minutes: null, basis: 'insufficient_data', n: 0 });
    });
});

describe('estimateCompletion', () => {
    const doors = Array.from({ length: 10 }, (_, i) => ({ addressKey: `a${i}` }));
    const paceStats = { overall: { median: 5, n: 100 }, bySignature: {} };

    it('adds real door time to real walking time along the optimized path', () => {
        const eta = estimateCompletion({ doors, pathMeters: 1500, paceStats });
        expect(eta.doorMinutes).toBe(50);
        expect(eta.travelMinutes).toBe(20); // 1500m at 1.25 m/s
        expect(eta.totalMinutes).toBe(70);
    });

    it('reports insufficient data instead of an invented ETA', () => {
        const eta = estimateCompletion({ doors, pathMeters: 1500, paceStats: { overall: { median: 5, n: 4 }, bySignature: {} } });
        expect(eta.totalMinutes).toBeNull();
        expect(eta.basis).toBe('insufficient_data');
    });

    it('says how many doors fall past the end of daylight', () => {
        const eta = estimateCompletion({ doors, pathMeters: 1500, paceStats, remainingDaylightMinutes: 35 });
        expect(eta.doorsBeyondDaylight).toBe(5);
    });

    it('leaves the daylight overflow unset when the list fits', () => {
        const eta = estimateCompletion({ doors, pathMeters: 1500, paceStats, remainingDaylightMinutes: 240 });
        expect(eta.doorsBeyondDaylight).toBeNull();
    });
});

describe('formatDuration', () => {
    it('is explicit when there is nothing to report', () => {
        expect(formatDuration(null)).toBe('Not enough data yet');
    });
    it('formats hours and minutes', () => {
        expect(formatDuration(70)).toBe('1h 10m');
        expect(formatDuration(45)).toBe('45m');
    });
});
