import { describe, expect, it } from 'vitest';
import { applyHardExclusions, sequenceGatedLast } from './walkListFilter';

const scored = (tag, cls, tier) => ({
    attribute: { tag },
    class: cls,
    tier,
    confidence: 0.8,
    daysSinceConfirmed: 0,
    reasons: []
});

const profile = (addressKey, attributes) => ({
    addressKey,
    streetKey: 'oak st',
    lat: 0,
    lng: 0,
    attributes,
    hardExclusion: attributes.find((a) => a.tier === 'hard' && (a.class === 'legal' || a.class === 'safety')) ?? null
});

const voters = [
    { id: 'v1', address_line: '1 Oak St' },
    { id: 'v2', address_line: '3 Oak St' },
    { id: 'v3', address_line: '5 Oak St' },
    { id: 'v4', address_line: null }
];

describe('applyHardExclusions', () => {
    const profiles = new Map([
        ['1 oak st', profile('1 oak st', [scored('no_trespassing', 'legal', 'hard')])],
        ['3 oak st', profile('3 oak st', [scored('hostile', 'safety', 'hard')])],
        ['5 oak st', profile('5 oak st', [scored('gated_home', 'access', 'actionable')])]
    ]);

    it('removes posted and confirmed-unsafe doors, keeps merely inconvenient ones', () => {
        const { included, excluded } = applyHardExclusions(voters, profiles);
        expect(included.map((v) => v.id)).toEqual(['v3', 'v4']);
        expect(excluded.map((e) => e.voter.id)).toEqual(['v1', 'v2']);
    });

    it('never drops a door silently — every exclusion carries a readable reason', () => {
        const { excluded } = applyHardExclusions(voters, profiles);
        expect(excluded[0].reason).toBe('No trespassing posted — do not visit');
        expect(excluded[1].reason).toContain('2+ canvassers');
        for (const e of excluded)
            expect(e.label).toBeTruthy();
    });

    it('keeps an access constraint on the list — a gate is a delay, not an exclusion', () => {
        const { included } = applyHardExclusions(voters, profiles);
        expect(included.some((v) => v.id === 'v3')).toBe(true);
    });

    it('leaves untagged doors alone', () => {
        const { included, excluded } = applyHardExclusions(voters, new Map());
        expect(included).toHaveLength(4);
        expect(excluded).toHaveLength(0);
    });
});

describe('sequenceGatedLast', () => {
    it('keeps the optimized order but moves gated doors to the end of the run', () => {
        const profiles = new Map([
            ['3 oak st', profile('3 oak st', [scored('gated_home', 'access', 'actionable')])],
            ['5 oak st', profile('5 oak st', [scored('hoa_community', 'access', 'hard')])]
        ]);
        const ordered = sequenceGatedLast(voters, profiles);
        expect(ordered.map((v) => v.id)).toEqual(['v1', 'v4', 'v2', 'v3']);
    });

    it('leaves an all-open route untouched', () => {
        expect(sequenceGatedLast(voters, new Map()).map((v) => v.id)).toEqual(['v1', 'v2', 'v3', 'v4']);
    });
});
