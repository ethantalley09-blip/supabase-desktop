import { describe, expect, it } from 'vitest';
import { buildConditionSnapshot, countDoorsByStreet, findSafetyAdvisories, rollUpStreet } from './streetRisk';
import { streetName } from './neighborhoodProof';

const scored = ({ tag = 'hostile', cls = 'safety', confidence = 0.5714, tier = 'actionable', observers = ['a', 'b'], addressKey = '1 oak st', streetKey = 'oak st' } = {}) => ({
    attribute: { tag, address_key: addressKey, street_key: streetKey, observer_ids: observers },
    class: cls,
    confidence,
    tier,
    daysSinceConfirmed: 0,
    reasons: []
});

const profile = (addressKey, streetKey, attributes) => ({
    addressKey,
    streetKey,
    lat: 42,
    lng: -71,
    attributes,
    hardExclusion: attributes.find((a) => a.tier === 'hard' && (a.class === 'legal' || a.class === 'safety')) ?? null
});

describe('rollUpStreet — k-anonymity floor', () => {
    it('suppresses a street whose safety signal comes from a single address', () => {
        const profiles = [profile('1 oak st', 'oak st', [scored({ addressKey: '1 oak st' })])];
        const [street] = rollUpStreet(profiles, new Map([['oak st', 4]]));
        expect(street.safetySuppressed).toBe(true);
        expect(street.safetyDoors).toBe(0);
        // Critically, the hazard density must not quietly still include it —
        // that would leak the exact thing the floor exists to protect.
        expect(street.hazardDensity).toBe(0);
        expect(street.reasons.some((r) => r.includes('safety'))).toBe(false);
    });

    it('exposes the aggregate once two different addresses carry a safety observation', () => {
        const profiles = [
            profile('1 oak st', 'oak st', [scored({ addressKey: '1 oak st', observers: ['a', 'b'] })]),
            profile('3 oak st', 'oak st', [scored({ addressKey: '3 oak st', observers: ['c', 'd'] })])
        ];
        const [street] = rollUpStreet(profiles, new Map([['oak st', 4]]));
        expect(street.safetySuppressed).toBe(false);
        expect(street.safetyDoors).toBe(2);
        expect(street.safetyObserverCount).toBe(4);
        expect(street.hazardDensity).toBeCloseTo(0.286, 2);
    });
});

describe('rollUpStreet — access', () => {
    it('reports the dominant access constraint and its real friction', () => {
        const profiles = [
            profile('1 elm st', 'elm st', [scored({ tag: 'gated_home', cls: 'access', addressKey: '1 elm st', streetKey: 'elm st' })]),
            profile('3 elm st', 'elm st', [scored({ tag: 'gated_home', cls: 'access', addressKey: '3 elm st', streetKey: 'elm st' })]),
            profile('5 elm st', 'elm st', [scored({ tag: 'apartment', cls: 'facility', addressKey: '5 elm st', streetKey: 'elm st' })])
        ];
        const [street] = rollUpStreet(profiles, new Map([['elm st', 10]]));
        expect(street.dominantConstraint).toBe('gated_home');
        expect(street.frictionMinutes).toBeCloseTo(9.5, 1); // 2 gates (8.0) + 1 apartment (1.5)
        expect(street.hazardDensity).toBe(0);
    });

    it('ignores tags below actionable when computing friction', () => {
        const profiles = [profile('1 elm st', 'elm st', [
            scored({ tag: 'gated_home', cls: 'access', tier: 'advisory', confidence: 0.4, addressKey: '1 elm st', streetKey: 'elm st' })
        ])];
        const [street] = rollUpStreet(profiles, new Map([['elm st', 10]]));
        expect(street.frictionMinutes).toBe(0);
        expect(street.dominantConstraint).toBeNull();
    });
});

describe('findSafetyAdvisories', () => {
    const twoAddressStreet = () => rollUpStreet([
        profile('1 oak st', 'oak st', [scored({ addressKey: '1 oak st', observers: ['a', 'b'] })]),
        profile('3 oak st', 'oak st', [scored({ addressKey: '3 oak st', observers: ['c', 'd'] })])
    ], new Map([['oak st', 4]]));

    it('fires when density, address count, and distinct reporters all clear', () => {
        const advisories = findSafetyAdvisories(twoAddressStreet(), { now: Date.now() });
        expect(advisories).toHaveLength(1);
        expect(advisories[0]).toMatchObject({ street: 'oak st', safetyDoors: 2, distinctReporters: 4 });
    });

    it('does not fire when every report came from the same canvasser', () => {
        const streets = rollUpStreet([
            profile('1 oak st', 'oak st', [scored({ addressKey: '1 oak st', observers: ['a'] })]),
            profile('3 oak st', 'oak st', [scored({ addressKey: '3 oak st', observers: ['a'] })])
        ], new Map([['oak st', 4]]));
        expect(findSafetyAdvisories(streets, { now: Date.now() })).toHaveLength(0);
    });

    it('respects the cooldown so a manager is not paged about the same street twice in a fortnight', () => {
        const now = Date.now();
        const recent = new Map([['oak st', new Date(now - 3 * 86_400_000).toISOString()]]);
        expect(findSafetyAdvisories(twoAddressStreet(), { now, lastAdvisoryByStreet: recent })).toHaveLength(0);

        const old = new Map([['oak st', new Date(now - 30 * 86_400_000).toISOString()]]);
        expect(findSafetyAdvisories(twoAddressStreet(), { now, lastAdvisoryByStreet: old })).toHaveLength(1);
    });
});

describe('buildConditionSnapshot', () => {
    it('emits street names and counts only — never a name, house number, or note', () => {
        const profiles = [
            profile('12 oak st', 'oak st', [scored({ tag: 'no_trespassing', cls: 'legal', tier: 'hard', addressKey: '12 oak st' })]),
            profile('3 oak st', 'oak st', [scored({ addressKey: '3 oak st', tier: 'hard', observers: ['a', 'b'] })]),
            profile('9 oak st', 'oak st', [scored({ addressKey: '9 oak st', tier: 'hard', observers: ['c', 'd'] })])
        ];
        const streets = rollUpStreet(profiles, new Map([['oak st', 20]]));
        const snapshot = buildConditionSnapshot({
            territoryName: 'Ward 4',
            streets,
            profiles,
            doorCount: 20,
            paceStats: { overall: { median: 4.2, n: 1180 } }
        });

        expect(snapshot.hardExclusions).toEqual({ no_trespassing: 1, hostile_confirmed: 2 });
        expect(snapshot.realMedianMinutesPerDoor).toBe(4.2);
        expect(snapshot.sampleSizeVisits).toBe(1180);

        const json = JSON.stringify(snapshot);
        expect(json).not.toContain('12 oak st'); // no house numbers
        expect(json).not.toContain('observer_ids');
        expect(json).toContain('oak st'); // street level is fine
    });

    it('reports no pace figure at all rather than guessing one', () => {
        const snapshot = buildConditionSnapshot({ streets: [], profiles: [], doorCount: 0, paceStats: null });
        expect(snapshot.realMedianMinutesPerDoor).toBeNull();
        expect(snapshot.sampleSizeVisits).toBe(0);
    });
});

describe('countDoorsByStreet', () => {
    it('counts real doors per street using the same derivation as the doorstep features', () => {
        const counts = countDoorsByStreet([
            { address_line: '12 Oak St' },
            { address_line: '14 Oak St' },
            { address_line: '1 Elm Ave' },
            { address_line: null }
        ], streetName);
        expect(counts.get('oak st')).toBe(2);
        expect(counts.get('elm ave')).toBe(1);
    });
});
