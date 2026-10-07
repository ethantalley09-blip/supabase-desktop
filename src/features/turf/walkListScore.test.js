import { describe, expect, it } from 'vitest';
import { grade, projectMedianDensity, scoreWalkList } from './walkListScore';

const scored = (tag, cls, confidence, tier = 'actionable') => ({
    attribute: { tag },
    class: cls,
    confidence,
    tier,
    daysSinceConfirmed: 0,
    reasons: []
});

// Builds `count` voters at distinct addresses, each carrying `attributes`.
function doorsWith(prefix, count, attributes, profiles) {
    const voters = [];
    for (let i = 0; i < count; i++) {
        const address = `${i + 1} ${prefix}`;
        voters.push({ id: `${prefix}-${i}`, address_line: address });
        if (attributes) {
            profiles.set(address.toLowerCase(), {
                addressKey: address.toLowerCase(),
                streetKey: prefix.toLowerCase(),
                lat: 0, lng: 0,
                attributes,
                hardExclusion: null
            });
        }
    }
    return voters;
}

describe('scoreWalkList', () => {
    // The worked example from docs/DOOR_INTELLIGENCE_PRD.md §3.4.
    it('scores the reference route: 40 doors, 6 gates, a 14-unit building, 2 dogs, 1 hostile', () => {
        const profiles = new Map();
        const doors = [
            ...doorsWith('Gate St', 6, [scored('gated_home', 'access', 0.8)], profiles),
            ...doorsWith('Apt Rd', 14, [scored('apartment', 'facility', 0.88)], profiles),
            ...doorsWith('Dog Ln', 2, [scored('dogs', 'hazard', 0.62)], profiles),
            ...doorsWith('Hostile Way', 1, [scored('hostile', 'safety', 0.71)], profiles),
            ...doorsWith('Plain Ave', 17, null, profiles)
        ];
        expect(doors).toHaveLength(40);

        const result = scoreWalkList({
            doors,
            profilesByAddress: profiles,
            pathMeters: 2100,
            projectMedianMinutes: 4.2,
            projectMedianDensity: 16
        });

        expect(result.safety).toBe(89);
        expect(result.access).toBe(79);
        expect(result.density).toBe(60);
        expect(result.composite).toBe(78);
        expect(result.grade).toBe('B');
        expect(result.frictionMinutes).toBe(46);
        expect(result.hazardDensity).toBeCloseTo(0.029, 3);
    });

    it('flags a dangerous route for review even when it scores well everywhere else', () => {
        const profiles = new Map();
        const doors = [
            ...doorsWith('Rough St', 3, [scored('hostile', 'safety', 0.6)], profiles),
            ...doorsWith('Plain Ave', 7, null, profiles)
        ];
        const result = scoreWalkList({
            doors, profilesByAddress: profiles, pathMeters: 500,
            projectMedianMinutes: 4.2, projectMedianDensity: 16
        });

        expect(result.safety).toBe(28);
        expect(result.access).toBe(100); // nothing slowing it down
        expect(result.composite).toBeGreaterThan(50);
        // The composite is respectable; the gate overrides it anyway.
        expect(result.grade).toBe('REVIEW');
    });

    it('reports a sub-score as null rather than zero when the project has no history to compare against', () => {
        const profiles = new Map();
        const doors = doorsWith('Plain Ave', 10, null, profiles);
        const result = scoreWalkList({ doors, profilesByAddress: profiles });
        expect(result.access).toBeNull();
        expect(result.density).toBeNull();
        // Renormalized over what we actually have — a brand-new project isn't
        // punished for having no pace data yet.
        expect(result.composite).toBe(100);
        expect(result.grade).toBe('A');
    });

    it('explains itself in plain language', () => {
        const profiles = new Map();
        const doors = [
            ...doorsWith('Gate St', 6, [scored('gated_home', 'access', 0.8)], profiles),
            ...doorsWith('Hostile Way', 1, [scored('hostile', 'safety', 0.71)], profiles)
        ];
        const result = scoreWalkList({ doors, profilesByAddress: profiles, pathMeters: 500, projectMedianMinutes: 4 });
        expect(result.reasons).toContain('6 gated home doors add ~24 min');
        expect(result.reasons).toContain('1 door with a safety observation on this route');
    });

    it('says so plainly when a route is clean', () => {
        const profiles = new Map();
        const result = scoreWalkList({ doors: doorsWith('Plain Ave', 5, null, profiles), profilesByAddress: profiles });
        expect(result.reasons).toEqual(['No logged access or safety constraints on this route']);
    });

    it('ignores conditions below actionable when costing access, but still counts them as hazard', () => {
        const profiles = new Map();
        const doors = doorsWith('Dog Ln', 10, [scored('dogs', 'hazard', 0.4, 'advisory')], profiles);
        const result = scoreWalkList({ doors, profilesByAddress: profiles, pathMeters: 500, projectMedianMinutes: 4 });
        expect(result.frictionMinutes).toBe(0);
        expect(result.hazardDensity).toBeCloseTo(0.14, 2);
    });

    it('handles an empty list without dividing by zero', () => {
        expect(scoreWalkList({ doors: [] }).grade).toBe('A');
    });
});

describe('grade', () => {
    it('never lets a strong composite outvote the safety floor', () => {
        expect(grade(95, 39)).toBe('REVIEW');
        // Clearing the review floor is not the same as being safe: a
        // near-perfect composite with safety at 40 still only reaches C,
        // because the A and B bands carry their own safety minimums.
        expect(grade(95, 40)).toBe('C');
        expect(grade(95, 50)).toBe('B');
    });

    it('requires a decent safety score for the top bands', () => {
        expect(grade(85, 55)).toBe('B'); // composite is an A, safety holds it back
        expect(grade(85, 60)).toBe('A');
    });
});

describe('projectMedianDensity', () => {
    it('computes doors per km across the project own lists', () => {
        const lists = [
            { ordered: new Array(20), meters: 1000 }, // 20/km
            { ordered: new Array(10), meters: 1000 }, // 10/km
            { ordered: new Array(30), meters: 1000 } // 30/km
        ];
        expect(projectMedianDensity(lists)).toBe(20);
    });

    it('returns null when nothing has a real path length yet', () => {
        expect(projectMedianDensity([{ ordered: [], meters: 0 }])).toBeNull();
    });
});
