import { describe, expect, it } from 'vitest';
import { computeAnswerChoiceSkew, computeSurveyAbandonment, computeSurveyCompletion, mostSkewedQuestion } from './surveyAnalytics';
const Q1 = { id: 'q1', content: 'Are you registered?', sortOrder: 0, choices: ['Yes', 'No'] };
const Q2 = { id: 'q2', content: 'Top issue?', sortOrder: 1, choices: null };
const questions = [Q1, Q2];
function visit(id, outcome = 'contacted') {
    return { id, outcome };
}
describe('computeSurveyCompletion', () => {
    it('reports zero when there are no active questions', () => {
        expect(computeSurveyCompletion([visit('v1')], [], [])).toEqual({
            eligibleVisits: 1,
            attemptedVisits: 0,
            fullyCompletedVisits: 0,
            attemptRatePct: 0,
            completionRatePct: 0
        });
    });
    it('ignores no_answer/dead_door visits — they were never a real conversation', () => {
        const visits = [visit('v1', 'no_answer'), visit('v2', 'dead_door')];
        const stats = computeSurveyCompletion(visits, [], questions);
        expect(stats.eligibleVisits).toBe(0);
    });
    it('counts a visit as attempted once any question is answered, completed once all are', () => {
        const visits = [visit('v1'), visit('v2'), visit('v3')];
        const responses = [
            { visit_id: 'v1', script_id: 'q1', answer: 'Yes' },
            { visit_id: 'v1', script_id: 'q2', answer: 'Jobs' },
            { visit_id: 'v2', script_id: 'q1', answer: 'No' }
            // v3: no responses at all — never attempted
        ];
        const stats = computeSurveyCompletion(visits, responses, questions);
        expect(stats.eligibleVisits).toBe(3);
        expect(stats.attemptedVisits).toBe(2);
        expect(stats.fullyCompletedVisits).toBe(1);
        expect(stats.attemptRatePct).toBe(67);
        expect(stats.completionRatePct).toBe(50);
    });
});
describe('computeSurveyAbandonment', () => {
    it('reports zero abandonment when nothing was attempted', () => {
        const stats = computeSurveyAbandonment([visit('v1')], [], questions);
        expect(stats.attemptedVisits).toBe(0);
        expect(stats.abandonmentRatePct).toBe(0);
        expect(stats.topDropOffQuestion).toBeNull();
    });
    it('flags the first unanswered question in sort order as the drop-off point', () => {
        const visits = [visit('v1'), visit('v2')];
        const responses = [
            { visit_id: 'v1', script_id: 'q1', answer: 'Yes' }
            // v1 stopped at q2; v2 has zero responses so it's not "attempted"
        ];
        const stats = computeSurveyAbandonment(visits, responses, questions);
        expect(stats.attemptedVisits).toBe(1);
        expect(stats.abandonedVisits).toBe(1);
        expect(stats.abandonmentRatePct).toBe(100);
        expect(stats.topDropOffQuestion).toEqual({ scriptId: 'q2', content: 'Top issue?', count: 1 });
    });
    it('reports zero abandonment when every attempted survey finished', () => {
        const visits = [visit('v1')];
        const responses = [
            { visit_id: 'v1', script_id: 'q1', answer: 'Yes' },
            { visit_id: 'v1', script_id: 'q2', answer: 'Jobs' }
        ];
        const stats = computeSurveyAbandonment(visits, responses, questions);
        expect(stats.abandonedVisits).toBe(0);
        expect(stats.topDropOffQuestion).toBeNull();
    });
});
describe('computeAnswerChoiceSkew', () => {
    it('returns null for an open-ended question (no choices defined)', () => {
        const responses = Array.from({ length: 10 }, (_, i) => ({ visit_id: `v${i}`, script_id: 'q2', answer: 'Jobs' }));
        expect(computeAnswerChoiceSkew(responses, Q2)).toBeNull();
    });
    it('returns null below the minimum sample size', () => {
        const responses = [
            { visit_id: 'v1', script_id: 'q1', answer: 'Yes' },
            { visit_id: 'v2', script_id: 'q1', answer: 'No' }
        ];
        expect(computeAnswerChoiceSkew(responses, Q1)).toBeNull();
    });
    it('tallies a real skewed distribution once the sample floor is met', () => {
        const responses = [
            ...Array.from({ length: 8 }, (_, i) => ({ visit_id: `v${i}`, script_id: 'q1', answer: 'Yes' })),
            ...Array.from({ length: 2 }, (_, i) => ({ visit_id: `w${i}`, script_id: 'q1', answer: 'No' }))
        ];
        const skew = computeAnswerChoiceSkew(responses, Q1);
        expect(skew.totalAnswers).toBe(10);
        expect(skew.topChoice).toEqual({ choice: 'Yes', count: 8, pct: 80 });
        expect(skew.breakdown).toEqual([
            { choice: 'Yes', count: 8, pct: 80 },
            { choice: 'No', count: 2, pct: 20 }
        ]);
    });
    it('buckets an answer outside the defined choices as otherCount rather than dropping it silently', () => {
        const responses = [
            ...Array.from({ length: 4 }, (_, i) => ({ visit_id: `v${i}`, script_id: 'q1', answer: 'Yes' })),
            { visit_id: 'v9', script_id: 'q1', answer: 'Maybe' }
        ];
        const skew = computeAnswerChoiceSkew(responses, Q1);
        expect(skew.otherCount).toBe(1);
        expect(skew.totalAnswers).toBe(5);
    });
});
describe('mostSkewedQuestion', () => {
    it('returns null when no structured question has enough answers', () => {
        expect(mostSkewedQuestion([], questions)).toBeNull();
    });
    it('picks the structured question with the largest top-choice share', () => {
        const responses = Array.from({ length: 10 }, (_, i) => ({ visit_id: `v${i}`, script_id: 'q1', answer: 'Yes' }));
        const result = mostSkewedQuestion(responses, questions);
        expect(result.content).toBe('Are you registered?');
        expect(result.topChoice.pct).toBe(100);
    });
});
