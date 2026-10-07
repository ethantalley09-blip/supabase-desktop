import { describe, expect, it } from 'vitest';
import { assignWalkLists, partitionBySpecialization } from './walkListAssign';

const scored = (tag, cls, tier = 'actionable') => ({
    attribute: { tag },
    class: cls,
    tier,
    confidence: 0.8,
    daysSinceConfirmed: 0,
    reasons: []
});

const profile = (addressKey, streetKey, attributes) => ({
    addressKey, streetKey, lat: 0, lng: 0, attributes, hardExclusion: null
});

const votersAt = (address, count) => Array.from({ length: count }, (_, i) => ({
    id: `${address}-${i}`,
    address_line: address
}));

describe('partitionBySpecialization', () => {
    it('splits a large apartment building into its own list', () => {
        const voters = [...votersAt('100 Main St', 14), ...votersAt('12 Oak St', 3)];
        const profiles = new Map([['100 main st', profile('100 main st', 'main st', [scored('apartment', 'facility')])]]);
        const { specialized, general } = partitionBySpecialization(voters, profiles);
        expect(specialized).toHaveLength(1);
        expect(specialized[0].capability).toBe('multi_unit');
        expect(specialized[0].doors).toHaveLength(14);
        expect(general).toHaveLength(3);
    });

    it('leaves a small building in the general walk — not worth its own list', () => {
        const voters = votersAt('100 Main St', 5);
        const profiles = new Map([['100 main st', profile('100 main st', 'main st', [scored('apartment', 'facility')])]]);
        const { specialized, general } = partitionBySpecialization(voters, profiles);
        expect(specialized).toHaveLength(0);
        expect(general).toHaveLength(5);
    });

    it('always splits out a senior facility regardless of size — the rule is who may be sent, not efficiency', () => {
        const voters = votersAt('2 Elm Ave', 3);
        const profiles = new Map([['2 elm ave', profile('2 elm ave', 'elm ave', [scored('senior_center', 'facility')])]]);
        const { specialized } = partitionBySpecialization(voters, profiles);
        expect(specialized).toHaveLength(1);
        expect(specialized[0].capability).toBe('senior_facility');
    });

    it('groups a sprawling senior facility by street, since its units carry different address lines', () => {
        const voters = [...votersAt('2 Elm Ave', 2), ...votersAt('4 Elm Ave', 2)];
        const profiles = new Map([
            ['2 elm ave', profile('2 elm ave', 'elm ave', [scored('senior_center', 'facility')])],
            ['4 elm ave', profile('4 elm ave', 'elm ave', [scored('senior_center', 'facility')])]
        ]);
        const { specialized } = partitionBySpecialization(voters, profiles);
        expect(specialized).toHaveLength(1);
        expect(specialized[0].doors).toHaveLength(4);
    });

    it('ignores a facility tag that has not reached actionable', () => {
        const voters = votersAt('100 Main St', 14);
        const profiles = new Map([['100 main st', profile('100 main st', 'main st', [scored('apartment', 'facility', 'advisory')])]]);
        const { specialized, general } = partitionBySpecialization(voters, profiles);
        expect(specialized).toHaveLength(0);
        expect(general).toHaveLength(14);
    });
});

describe('assignWalkLists', () => {
    const canvassers = [
        { profile_id: 'p1', capabilities: [] },
        { profile_id: 'p2', capabilities: ['multi_unit'] },
        { profile_id: 'p3', capabilities: ['spanish'] }
    ];

    it('routes a specialized list to someone who actually has the capability', () => {
        const [a] = assignWalkLists([{ id: 'L1', requiredCapability: 'multi_unit' }], canvassers);
        expect(a.assignedTo).toBe('p2');
        expect(a.flags).toEqual([]);
    });

    it('refuses to auto-assign a senior facility to anyone untrained', () => {
        const [a] = assignWalkLists([{ id: 'L1', requiredCapability: 'senior_facility' }], canvassers);
        expect(a.assignedTo).toBeNull();
        expect(a.flags).toContain('needs_manual_assignment');
    });

    it('assigns an unstaffed multi-unit list anyway, but says so out loud', () => {
        const [a] = assignWalkLists([{ id: 'L1', requiredCapability: 'multi_unit' }], [{ profile_id: 'p1', capabilities: [] }]);
        expect(a.assignedTo).toBe('p1');
        expect(a.flags).toContain('unspecialized');
    });

    it('recommends pairing on a hazardous route without ever auto-pairing', () => {
        const [a] = assignWalkLists([{ id: 'L1', hazardDensity: 0.4 }], canvassers);
        expect(a.flags).toContain('pairing_recommended');
        expect(a.assignedTo).toBe('p1'); // one person, flagged — not silently two
    });

    it('prefers a language match but never over the hard capability requirement', () => {
        const withGap = assignWalkLists([{ id: 'L1', language: 'spanish' }], canvassers);
        expect(withGap[0].assignedTo).toBe('p3');
        expect(withGap[0].flags).not.toContain('language_gap');

        const noMatch = assignWalkLists([{ id: 'L1', language: 'vietnamese' }], canvassers);
        expect(noMatch[0].flags).toContain('language_gap');
    });

    it('never assigns the same canvasser to two lists, and is deterministic', () => {
        const lists = [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }];
        const first = assignWalkLists(lists, canvassers);
        const second = assignWalkLists([...lists].reverse(), canvassers);
        expect(first).toEqual(second);
        expect(new Set(first.map((a) => a.assignedTo)).size).toBe(3);
    });
});
