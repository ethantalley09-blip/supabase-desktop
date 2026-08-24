import { describe, expect, it } from 'vitest';
import { computeBestTimeToKnock, detectPersuasionDrift } from './visitHistory';
// computeBestTimeToKnock buckets by LOCAL hour (Date#getHours(), matching
// sendTime.ts's own convention) — these fixtures build local Date objects
// directly (year, month, day, hour) rather than parsing UTC 'Z' strings, so
// the test's intended hour matches getHours() regardless of the machine's
// timezone.
const atLocalHour = (hour, minute = 0) => new Date(2026, 6, 22, hour, minute, 0).toISOString();
describe('computeBestTimeToKnock', () => {
    it('returns null below the minimum sample size', () => {
        const visits = [
            { occurred_at: atLocalHour(18), outcome: 'contacted' },
            { occurred_at: atLocalHour(18, 5), outcome: 'contacted' }
        ];
        expect(computeBestTimeToKnock(visits)).toBeNull();
    });
    it('picks the hour with the highest contact RATE, not the highest raw count', () => {
        const visits = [
            // Hour 18: 10 attempts, 3 contacted -> 30% rate
            ...Array.from({ length: 7 }, () => ({ occurred_at: atLocalHour(18), outcome: 'no_answer' })),
            ...Array.from({ length: 3 }, () => ({ occurred_at: atLocalHour(18), outcome: 'contacted' })),
            // Hour 10: 4 attempts, 3 contacted -> 75% rate (fewer raw contacts, higher rate)
            { occurred_at: atLocalHour(10), outcome: 'no_answer' },
            { occurred_at: atLocalHour(10), outcome: 'contacted' },
            { occurred_at: atLocalHour(10), outcome: 'contacted' },
            { occurred_at: atLocalHour(10), outcome: 'contacted' }
        ];
        const result = computeBestTimeToKnock(visits);
        expect(result?.bestHour).toBe(10);
        expect(result?.contactRatePct).toBe(75);
    });
    it('ignores hours below the minimum-attempts threshold even if their rate is 100%', () => {
        const visits = [
            // Hour 6: only 1 attempt, 100% rate — should not win
            { occurred_at: atLocalHour(6), outcome: 'contacted' },
            // Hour 14: 5 attempts, 40% rate — enough sample, should win
            { occurred_at: atLocalHour(14), outcome: 'contacted' },
            { occurred_at: atLocalHour(14), outcome: 'contacted' },
            { occurred_at: atLocalHour(14), outcome: 'no_answer' },
            { occurred_at: atLocalHour(14), outcome: 'no_answer' },
            { occurred_at: atLocalHour(14), outcome: 'no_answer' }
        ];
        const result = computeBestTimeToKnock(visits);
        expect(result?.bestHour).toBe(14);
    });
});
describe('detectPersuasionDrift', () => {
    const visit = (over) => ({
        voter_id: 'v1',
        voter_name: 'Pat Voter',
        occurred_at: '2026-07-22T18:00:00Z',
        persuadability_bucket: 'unknown',
        ...over
    });
    it('flags a door that warmed from opposed to persuadable', () => {
        const alerts = detectPersuasionDrift([
            visit({ occurred_at: '2026-07-01T00:00:00Z', persuadability_bucket: 'opposed' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', persuadability_bucket: 'persuadable' })
        ]);
        expect(alerts).toHaveLength(1);
        expect(alerts[0]).toMatchObject({ direction: 'warmed', from: 'opposed', to: 'persuadable' });
    });
    it('flags a door that cooled from base_support to opposed', () => {
        const alerts = detectPersuasionDrift([
            visit({ occurred_at: '2026-07-01T00:00:00Z', persuadability_bucket: 'base_support' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', persuadability_bucket: 'opposed' })
        ]);
        expect(alerts[0]).toMatchObject({ direction: 'cooled', from: 'base_support', to: 'opposed' });
    });
    it('does not flag a shift between persuadable and base_support', () => {
        const alerts = detectPersuasionDrift([
            visit({ occurred_at: '2026-07-01T00:00:00Z', persuadability_bucket: 'persuadable' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', persuadability_bucket: 'base_support' })
        ]);
        expect(alerts).toEqual([]);
    });
    it('does not flag anything touching unknown', () => {
        const alerts = detectPersuasionDrift([
            visit({ occurred_at: '2026-07-01T00:00:00Z', persuadability_bucket: 'opposed' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', persuadability_bucket: 'unknown' })
        ]);
        expect(alerts).toEqual([]);
    });
    it('requires at least two visits for the same voter', () => {
        expect(detectPersuasionDrift([visit({ persuadability_bucket: 'opposed' })])).toEqual([]);
    });
    it('compares only the two most recent visits, not the full history', () => {
        const alerts = detectPersuasionDrift([
            visit({ occurred_at: '2026-07-01T00:00:00Z', persuadability_bucket: 'opposed' }),
            visit({ occurred_at: '2026-07-05T00:00:00Z', persuadability_bucket: 'base_support' }),
            visit({ occurred_at: '2026-07-10T00:00:00Z', persuadability_bucket: 'persuadable' })
        ]);
        // last two are base_support -> persuadable, not flagged; the earlier
        // opposed->base_support jump is stale and should not surface.
        expect(alerts).toEqual([]);
    });
});
