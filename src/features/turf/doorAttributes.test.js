import { describe, expect, it } from 'vitest';
import { countSilentNonConfirmations, evidenceWeight, getRoutingAttributes, hasHardExclusion, inheritedStreetTags, inheritedTagsForAddress, rollUpAddress, scoreAllAttributes, scoreAttribute } from './doorAttributes';

const NOW = new Date('2026-08-15T12:00:00Z').getTime();
const DAY_MS = 86_400_000;
const daysAgo = (n) => new Date(NOW - n * DAY_MS).toISOString();

const attr = (over = {}) => ({
    tag: 'gated_home',
    class: 'access',
    address_key: '12 oak st',
    street_key: 'oak st',
    lat: 42, lng: -71,
    first_observed_at: daysAgo(0),
    // Fresh by default so decay is exactly 1.0 and each test's arithmetic is
    // about the evidence model, not about the clock. Tests that care about
    // decay pass their own last_confirmed_at.
    last_confirmed_at: daysAgo(0),
    observer_ids: ['obs-a'],
    observation_count: 1,
    noted_observation_count: 0,
    contradiction_count: 0,
    source: 'canvasser',
    status: 'active',
    ...over
});

describe('evidenceWeight', () => {
    it('counts a repeat report from the SAME canvasser far below a second independent one', () => {
        const repeat = evidenceWeight(attr({ observer_ids: ['obs-a'], observation_count: 2 }));
        const independent = evidenceWeight(attr({ observer_ids: ['obs-a', 'obs-b'], observation_count: 2 }));
        expect(repeat).toBeCloseTo(1.35, 5);
        expect(independent).toBeCloseTo(2.0, 5);
        expect(independent).toBeGreaterThan(repeat);
    });

    it('adds weight for a written note and for staff confirmation', () => {
        expect(evidenceWeight(attr({ noted_observation_count: 1 }))).toBeCloseTo(1.25, 5);
        expect(evidenceWeight(attr({ status: 'staff_confirmed' }))).toBeCloseTo(1.5, 5);
    });

    it('subtracts for explicit contradictions', () => {
        expect(evidenceWeight(attr({ observer_ids: ['a', 'b'], observation_count: 2, contradiction_count: 1 }))).toBeCloseTo(1.5, 5);
    });

    it('applies silent non-confirmation only to tags that are impossible to miss', () => {
        expect(evidenceWeight(attr({ tag: 'gated_home' }), 2)).toBeCloseTo(0.7, 5);
        // A dog may simply be indoors, so a later visit that did not see one is
        // not evidence against it.
        expect(evidenceWeight(attr({ tag: 'dogs', class: 'hazard' }), 2)).toBeCloseTo(1.0, 5);
    });
});

describe('scoreAttribute', () => {
    it('puts one fresh single-observer report at advisory, and two observers at actionable', () => {
        const one = scoreAttribute(attr(), { now: NOW });
        expect(one.confidence).toBeCloseTo(0.4, 3);
        expect(one.tier).toBe('advisory');

        const two = scoreAttribute(attr({ observer_ids: ['a', 'b'], observation_count: 2 }), { now: NOW });
        expect(two.confidence).toBeCloseTo(0.5714, 3);
        expect(two.tier).toBe('actionable');
    });

    it('never lets a single canvasser push `hostile` to a hard exclusion, whatever the arithmetic says', () => {
        const solo = scoreAttribute(attr({
            tag: 'hostile', class: 'safety',
            observer_ids: ['obs-a'], observation_count: 12
        }), { now: NOW });
        expect(solo.confidence).toBeGreaterThan(0.75);
        expect(solo.tier).toBe('actionable');

        const corroborated = scoreAttribute(attr({
            tag: 'hostile', class: 'safety',
            observer_ids: ['obs-a', 'obs-b'], observation_count: 12
        }), { now: NOW });
        expect(corroborated.tier).toBe('hard');
    });

    it('treats a posted no-trespass notice as authoritative from one observer, and never decays it', () => {
        const fresh = scoreAttribute(attr({ tag: 'no_trespassing', class: 'legal' }), { now: NOW });
        expect(fresh.tier).toBe('hard');

        const ancient = scoreAttribute(attr({
            tag: 'no_trespassing', class: 'legal', last_confirmed_at: daysAgo(2000)
        }), { now: NOW });
        expect(ancient.confidence).toBeCloseTo(0.4, 3);
        expect(ancient.tier).toBe('hard');
    });

    it('decays a safety tag below advisory after one half-life without re-confirmation', () => {
        const base = { tag: 'hostile', class: 'safety', observer_ids: ['a', 'b'], observation_count: 2 };
        expect(scoreAttribute(attr({ ...base }), { now: NOW }).tier).toBe('actionable');
        const stale = scoreAttribute(attr({ ...base, last_confirmed_at: daysAgo(180) }), { now: NOW });
        expect(stale.confidence).toBeCloseTo(0.2857, 3);
        expect(stale.tier).toBe('none');
    });

    it('zeroes a retracted tag and explains why', () => {
        const scored = scoreAttribute(attr({ status: 'retracted', status_reason: 'Gate removed' }), { now: NOW });
        expect(scored.confidence).toBe(0);
        expect(scored.tier).toBe('none');
        expect(scored.reasons).toEqual(['Retracted: Gate removed']);
    });

    it('caps a disputed tag at advisory so it cannot drive routing before a human resolves it', () => {
        const scored = scoreAttribute(attr({
            status: 'disputed', observer_ids: ['a', 'b', 'c'], observation_count: 8
        }), { now: NOW });
        expect(scored.confidence).toBeGreaterThan(0.75);
        expect(scored.tier).toBe('advisory');
    });

    it('always returns human-readable reasons', () => {
        const scored = scoreAttribute(attr({
            observer_ids: ['a', 'b'], observation_count: 3, noted_observation_count: 1, contradiction_count: 1
        }), { now: NOW });
        expect(scored.reasons).toContain('Reported by 2 different canvassers');
        expect(scored.reasons).toContain('Seen 3 times total');
        expect(scored.reasons).toContain('Backed by a written note');
        expect(scored.reasons).toContain('Contradicted 1x by a later visit');
    });

    it('flags a backfilled tag as needing confirmation', () => {
        const scored = scoreAttribute(attr({ source: 'backfill' }), { now: NOW });
        expect(scored.reasons.some((r) => r.includes('older free-text notes'))).toBe(true);
    });
});

describe('countSilentNonConfirmations', () => {
    const visits = [
        { occurred_at: daysAgo(3), observed_attributes: ['gated_home'] }, // before last confirm
        { occurred_at: daysAgo(0.5), observed_attributes: [] },
        { occurred_at: daysAgo(0.2), observed_attributes: ['dogs'] },
        { occurred_at: daysAgo(0.1), observed_attributes: ['gated_home'] } // re-confirmed
    ];

    it('counts only later visits that failed to re-observe an unmissable tag', () => {
        expect(countSilentNonConfirmations(attr({ last_confirmed_at: daysAgo(1) }), visits)).toBe(2);
    });

    it('returns zero for tags that can legitimately be missed', () => {
        expect(countSilentNonConfirmations(attr({ tag: 'dogs', class: 'hazard', last_confirmed_at: daysAgo(1) }), visits)).toBe(0);
    });
});

describe('scoreAllAttributes', () => {
    it('joins visits to doors by normalized address, not by voter', () => {
        const voters = [
            { id: 'v1', address_line: ' 12 Oak St ' },
            { id: 'v2', address_line: '12 oak  st' } // same physical door
        ];
        const visits = [
            { voter_id: 'v2', occurred_at: daysAgo(0.5), observed_attributes: [] },
            { voter_id: 'v2', occurred_at: daysAgo(0.4), observed_attributes: [] }
        ];
        const scored = scoreAllAttributes({ attributes: [attr({ last_confirmed_at: daysAgo(1) })], visits, voters, now: NOW });
        // Two silent non-confirmations logged against the OTHER voter at the
        // same address still count against the door.
        expect(scored[0].reasons).toContain('Not seen on 2 later visits');
    });
});

describe('rollUpAddress', () => {
    it('drops sub-advisory tags and surfaces the hard exclusion', () => {
        const scored = [
            scoreAttribute(attr({ tag: 'no_trespassing', class: 'legal' }), { now: NOW }),
            scoreAttribute(attr({ tag: 'dogs', class: 'hazard' }), { now: NOW }),
            scoreAttribute(attr({ tag: 'apartment', class: 'facility', last_confirmed_at: daysAgo(3000) }), { now: NOW })
        ];
        const profiles = rollUpAddress(scored);
        const profile = profiles.get('12 oak st');
        expect(profile.attributes).toHaveLength(2);
        expect(hasHardExclusion(profile)).toBe(true);
        expect(profile.hardExclusion.attribute.tag).toBe('no_trespassing');
    });
});

describe('the class firewall', () => {
    it('strips safety-class attributes from anything that is not a safety surface', () => {
        const scored = [
            scoreAttribute(attr({ tag: 'hostile', class: 'safety', observer_ids: ['a', 'b'], observation_count: 4 }), { now: NOW }),
            scoreAttribute(attr({ tag: 'gated_home', class: 'access' }), { now: NOW })
        ];
        const routing = getRoutingAttributes(scored);
        expect(routing).toHaveLength(1);
        expect(routing[0].attribute.tag).toBe('gated_home');
        expect(routing.some((s) => s.class === 'safety')).toBe(false);
    });
});

describe('inheritance', () => {
    it('pre-fills only actionable-or-better tags for a door', () => {
        const profiles = rollUpAddress([
            scoreAttribute(attr({ tag: 'apartment', class: 'facility', observer_ids: ['a', 'b'], observation_count: 2 }), { now: NOW }),
            scoreAttribute(attr({ tag: 'dogs', class: 'hazard' }), { now: NOW }) // advisory only
        ]);
        expect(inheritedTagsForAddress(profiles.get('12 oak st'))).toEqual(['apartment']);
    });

    it('inherits across a street only for block-scoped tags — never a gate, a dog, or hostility', () => {
        const scored = [
            scoreAttribute(attr({ tag: 'hoa_community', class: 'access', address_key: '4 oak st', observer_ids: ['a', 'b'], observation_count: 2 }), { now: NOW }),
            scoreAttribute(attr({ tag: 'gated_home', class: 'access', address_key: '6 oak st', observer_ids: ['a', 'b'], observation_count: 2 }), { now: NOW }),
            scoreAttribute(attr({ tag: 'hostile', class: 'safety', address_key: '8 oak st', observer_ids: ['a', 'b'], observation_count: 4 }), { now: NOW })
        ];
        expect(inheritedStreetTags(scored, 'oak st')).toEqual(['hoa_community']);
    });
});
