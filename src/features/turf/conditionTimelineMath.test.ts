import { describe, expect, it } from 'vitest';
import { buildConditionTimeline, hasDisagreement, observersForTag, tagsInTimeline } from './conditionTimelineMath';
import type { VisitRow, VoterRow } from './doorIntelligence.types';

const voters: VoterRow[] = [
    { id: 'v1', full_name: 'Ada', address_line: ' 12 Oak St ', canvass_notes: null, contact_status: 'active', ballot_status: 'none', lat: null, lng: null },
    { id: 'v2', full_name: 'Ben', address_line: '12 oak  st', canvass_notes: null, contact_status: 'active', ballot_status: 'none', lat: null, lng: null },
    { id: 'v3', full_name: 'Cara', address_line: '14 Oak St', canvass_notes: null, contact_status: 'active', ballot_status: 'none', lat: null, lng: null }
];

const visit = (over: Partial<VisitRow> & { id: string; occurred_at: string }): VisitRow => ({
    voter_id: 'v1',
    outcome: 'no_answer',
    persuadability_bucket: 'unknown',
    notes_snapshot: null,
    observed_attributes: [],
    contradicted_attributes: [],
    canvasser_id: 'c1',
    canvasser_name: 'Carol',
    voter_name: 'Ada',
    ...over
});

describe('buildConditionTimeline', () => {
    it('gathers every visit to the same physical door, newest first', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['gated_home'] }),
            // A different registered voter at the SAME address is the same door.
            visit({ id: 'b', occurred_at: '2026-08-01T10:00:00Z', voter_id: 'v2', observed_attributes: ['gated_home'] }),
            // A different address is not.
            visit({ id: 'c', occurred_at: '2026-08-05T10:00:00Z', voter_id: 'v3', observed_attributes: ['dogs'] })
        ];
        const timeline = buildConditionTimeline(visits, voters, '12 oak st');
        expect(timeline.map((e) => e.visitId)).toEqual(['b', 'a']);
    });

    it('reports what a later visit failed to re-observe', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['gated_home'] }),
            visit({ id: 'b', occurred_at: '2026-08-01T10:00:00Z', observed_attributes: [] })
        ];
        const [newest, oldest] = buildConditionTimeline(visits, voters, '12 oak st');
        expect(newest.silentOn).toEqual(['gated_home']);
        // Nothing was known before the first visit, so it can be silent on nothing.
        expect(oldest.silentOn).toEqual([]);
    });

    it('does not count an explicit contradiction as silence — they are different evidence', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['gated_home'] }),
            visit({ id: 'b', occurred_at: '2026-08-01T10:00:00Z', contradicted_attributes: ['gated_home'] })
        ];
        const [newest] = buildConditionTimeline(visits, voters, '12 oak st');
        expect(newest.contradicted).toEqual(['gated_home']);
        expect(newest.silentOn).toEqual([]);
    });

    it('stops tracking a tag once it has been contradicted', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['gated_home'] }),
            visit({ id: 'b', occurred_at: '2026-07-15T10:00:00Z', contradicted_attributes: ['gated_home'] }),
            visit({ id: 'c', occurred_at: '2026-08-01T10:00:00Z', observed_attributes: [] })
        ];
        const [newest] = buildConditionTimeline(visits, voters, '12 oak st');
        expect(newest.silentOn).toEqual([]);
    });

    it('returns nothing for an address with no voters', () => {
        expect(buildConditionTimeline([], voters, '99 nowhere rd')).toEqual([]);
    });

    it('handles visits with the attribute columns absent entirely', () => {
        const legacy = { ...visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z' }) };
        delete (legacy as Partial<VisitRow>).observed_attributes;
        delete (legacy as Partial<VisitRow>).contradicted_attributes;
        const [entry] = buildConditionTimeline([legacy as VisitRow], voters, '12 oak st');
        expect(entry.observed).toEqual([]);
        expect(entry.contradicted).toEqual([]);
    });
});

describe('observersForTag', () => {
    it('lists the distinct people who reported it', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['dogs'], canvasser_name: 'Carol' }),
            visit({ id: 'b', occurred_at: '2026-07-08T10:00:00Z', observed_attributes: ['dogs'], canvasser_name: 'Carol' }),
            visit({ id: 'c', occurred_at: '2026-07-09T10:00:00Z', observed_attributes: ['dogs'], canvasser_name: 'Finn' })
        ];
        const timeline = buildConditionTimeline(visits, voters, '12 oak st');
        expect(observersForTag(timeline, 'dogs').sort()).toEqual(['Carol', 'Finn']);
    });
});

describe('hasDisagreement', () => {
    it('is true only when the trail holds both an observation and a contradiction', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['gated_home'] }),
            visit({ id: 'b', occurred_at: '2026-08-01T10:00:00Z', contradicted_attributes: ['gated_home'] })
        ];
        const timeline = buildConditionTimeline(visits, voters, '12 oak st');
        expect(hasDisagreement(timeline, 'gated_home')).toBe(true);
        expect(hasDisagreement(timeline, 'dogs')).toBe(false);
    });
});

describe('tagsInTimeline', () => {
    it('collects every tag mentioned either way', () => {
        const visits = [
            visit({ id: 'a', occurred_at: '2026-07-01T10:00:00Z', observed_attributes: ['gated_home', 'dogs'] }),
            visit({ id: 'b', occurred_at: '2026-08-01T10:00:00Z', contradicted_attributes: ['apartment'] })
        ];
        const timeline = buildConditionTimeline(visits, voters, '12 oak st');
        expect(tagsInTimeline(timeline).sort()).toEqual(['apartment', 'dogs', 'gated_home']);
    });
});
