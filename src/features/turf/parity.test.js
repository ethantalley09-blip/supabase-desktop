import { describe, expect, it } from 'vitest';
import fixture from '../../../python_svc/fixtures/parity_cases.json';
import { scoreAttribute } from './doorAttributes';
import { grade, scoreWalkList } from './walkListScore';
// Cross-language parity: this implementation must agree with the Python
// scoring engine in python_svc/. The mirror of this file is
// python_svc/tests/test_parity.py, and both read the same fixture.
//
// The engine is implemented twice on purpose — Python is authoritative for the
// service, JS keeps the in-app path working when the service is unreachable —
// and duplicated logic drifts unless something mechanical checks it. Change a
// constant in either implementation without changing the other and one of
// these two suites goes red.
//
// Same reasoning as the pgTAP suite asserting migration 0039's SQL address
// normalization matches households.js.
const NOW = new Date(fixture.now).getTime();
const DAY_MS = 86_400_000;
const TOLERANCE = fixture.tolerance;
// Fixture cases carry `daysSinceConfirmed`; the scorer wants a timestamp.
function buildAttribute(spec) {
    const { daysSinceConfirmed = 0, ...rest } = spec;
    return {
        address_key: '1 test st',
        street_key: 'test st',
        observer_ids: [],
        observation_count: 0,
        noted_observation_count: 0,
        contradiction_count: 0,
        status: 'active',
        source: 'canvasser',
        ...rest,
        last_confirmed_at: new Date(NOW - daysSinceConfirmed * DAY_MS).toISOString()
    };
}
describe('parity with the Python scoring engine — attribute confidence', () => {
    for (const testCase of fixture.attributeCases) {
        it(`${testCase.id}: ${testCase.note ?? ''}`, () => {
            const scored = scoreAttribute(buildAttribute(testCase.attribute), {
                now: NOW,
                silentNonConfirmations: testCase.silentNonConfirmations ?? 0
            });
            expect(Math.abs(scored.confidence - testCase.expected.confidence)).toBeLessThanOrEqual(TOLERANCE);
            expect(scored.tier).toBe(testCase.expected.tier);
        });
    }
});
// Expands the fixture's door groups into voters + address profiles.
function buildWalkList(testCase) {
    const doors = [];
    const profilesByAddress = new Map();
    for (const group of testCase.doorGroups) {
        for (let i = 0; i < group.count; i++) {
            const address = `${i + 1} ${group.prefix}`;
            doors.push({ id: `${group.prefix}-${i}`, address_line: address });
            if (group.attributes.length === 0)
                continue;
            const key = address.toLowerCase();
            profilesByAddress.set(key, {
                addressKey: key,
                streetKey: group.prefix.toLowerCase(),
                lat: null,
                lng: null,
                attributes: group.attributes.map((a) => ({
                    attribute: { tag: a.tag, observer_ids: ['a', 'b'] },
                    class: a.class,
                    confidence: a.confidence,
                    tier: a.tier,
                    daysSinceConfirmed: 0,
                    reasons: []
                })),
                hardExclusion: null
            });
        }
    }
    return { doors, profilesByAddress };
}
describe('parity with the Python scoring engine — walk-list scoring', () => {
    for (const testCase of fixture.walkListCases) {
        it(`${testCase.id}: ${testCase.note ?? ''}`, () => {
            const { doors, profilesByAddress } = buildWalkList(testCase);
            const result = scoreWalkList({
                doors,
                profilesByAddress,
                pathMeters: testCase.pathMeters,
                projectMedianMinutes: testCase.projectMedianMinutes,
                projectMedianDensity: testCase.projectMedianDensity
            });
            for (const [key, expected] of Object.entries(testCase.expected)) {
                expect(result[key], `${testCase.id}.${key}`).toBe(expected);
            }
        });
    }
});
describe('parity with the Python scoring engine — grading', () => {
    for (const testCase of fixture.gradeCases) {
        it(`composite ${testCase.composite} / safety ${testCase.safety} → ${testCase.expected}`, () => {
            expect(grade(testCase.composite, testCase.safety)).toBe(testCase.expected);
        });
    }
});
