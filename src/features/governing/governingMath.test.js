import { describe, expect, it } from 'vitest';
import { buildOfficeSnapshot, buildReplyContext, caseAgeDays, computeCaseStats, daysUntilTermEnds, isOverdue, sortCaseQueue, topSubjectTerms } from './governingMath';
const NOW = new Date('2026-10-05T12:00:00');
function mk(overrides) {
    return {
        id: overrides.id ?? Math.random().toString(36).slice(2),
        constituent_name: 'Jordan Rivera',
        contact_email: 'jordan@example.com',
        contact_phone: '555-0100',
        category: 'casework',
        subject: 'Pothole on Elm',
        details: 'There is a pothole.',
        status: 'open',
        priority: 'normal',
        due_on: null,
        created_at: '2026-10-01T12:00:00',
        resolved_at: null,
        ...overrides
    };
}
describe('isOverdue', () => {
    it('is not overdue on the due date itself', () => {
        expect(isOverdue(mk({ due_on: '2026-10-05' }), NOW)).toBe(false);
    });
    it('is overdue the day after', () => {
        expect(isOverdue(mk({ due_on: '2026-10-04' }), NOW)).toBe(true);
    });
    it('a resolved case is never overdue', () => {
        expect(isOverdue(mk({ due_on: '2026-09-01', status: 'resolved' }), NOW)).toBe(false);
    });
    it('no due date means not overdue', () => {
        expect(isOverdue(mk({}), NOW)).toBe(false);
    });
});
describe('caseAgeDays', () => {
    it('counts to now for open cases and to resolution for resolved ones', () => {
        expect(caseAgeDays(mk({}), NOW)).toBe(4);
        expect(caseAgeDays(mk({ status: 'resolved', resolved_at: '2026-10-03T12:00:00' }), NOW)).toBe(2);
    });
});
describe('sortCaseQueue', () => {
    it('puts overdue first, then priority, then oldest', () => {
        const a = mk({ id: 'a', priority: 'urgent', created_at: '2026-10-04T00:00:00' });
        const b = mk({ id: 'b', priority: 'low', due_on: '2026-10-01' });
        const c = mk({ id: 'c', priority: 'urgent', created_at: '2026-10-02T00:00:00' });
        const d = mk({ id: 'd', priority: 'normal' });
        expect(sortCaseQueue([a, b, c, d], NOW).map((x) => x.id)).toEqual(['b', 'c', 'a', 'd']);
    });
});
describe('computeCaseStats', () => {
    it('reports null resolution time when nothing is resolved, never 0', () => {
        expect(computeCaseStats([mk({})], NOW).medianDaysToResolve).toBeNull();
        expect(computeCaseStats([], NOW).oldestActiveDays).toBeNull();
    });
    it('uses the median so one long case does not swamp the rest', () => {
        const cases = [
            mk({ status: 'resolved', created_at: '2026-10-01T12:00:00', resolved_at: '2026-10-03T12:00:00' }),
            mk({ status: 'closed', created_at: '2026-10-01T12:00:00', resolved_at: '2026-10-04T12:00:00' }),
            mk({ status: 'resolved', created_at: '2025-10-01T12:00:00', resolved_at: '2026-10-01T12:00:00' })
        ];
        expect(computeCaseStats(cases, NOW).medianDaysToResolve).toBe(3);
    });
    it('counts active, overdue, urgent, waiting and categories', () => {
        const s = computeCaseStats([
            mk({ priority: 'urgent', due_on: '2026-10-01' }),
            mk({ status: 'waiting_on_agency', category: 'complaint' }),
            mk({ status: 'resolved', resolved_at: '2026-10-02T00:00:00' })
        ], NOW);
        expect(s).toMatchObject({ total: 3, active: 2, overdue: 1, urgent: 1, waitingOnAgency: 1, resolved: 1 });
        expect(s.byCategory).toEqual({ casework: 2, complaint: 1 });
    });
});
describe('topSubjectTerms', () => {
    it('counts each term once per case and drops one-offs and stopwords', () => {
        const terms = topSubjectTerms([
            mk({ subject: 'Pothole pothole on Elm' }),
            mk({ subject: 'Another pothole' }),
            mk({ subject: 'Help with the VA' })
        ]);
        expect(terms).toEqual([{ term: 'pothole', count: 2 }]);
    });
});
describe('AI payload boundaries', () => {
    it('office snapshot carries no names, contacts, or case details', () => {
        const snap = buildOfficeSnapshot([mk({ details: 'SSN issue with benefits' })], { office_title: 'City Council', term_ends_on: '2028-01-01' }, NOW);
        expect(snap).not.toContain('Jordan');
        expect(snap).not.toContain('jordan@example.com');
        expect(snap).not.toContain('555-0100');
        expect(snap).not.toContain('SSN');
        expect(JSON.parse(snap).office).toBe('City Council');
    });
    it('reply context sends only the first name, never contact details', () => {
        const ctx = JSON.parse(buildReplyContext(mk({}), '  Crew scheduled Oct 9 ', null));
        expect(ctx.constituent_first_name).toBe('Jordan');
        expect(JSON.stringify(ctx)).not.toContain('Rivera');
        expect(JSON.stringify(ctx)).not.toContain('example.com');
        expect(JSON.stringify(ctx)).not.toContain('555');
        expect(ctx.facts_staff_want_included).toBe('Crew scheduled Oct 9');
    });
});
describe('daysUntilTermEnds', () => {
    it('is null without a term end and counts days otherwise', () => {
        expect(daysUntilTermEnds({}, NOW)).toBeNull();
        expect(daysUntilTermEnds({ term_ends_on: '2026-10-15' }, NOW)).toBe(10);
    });
});
