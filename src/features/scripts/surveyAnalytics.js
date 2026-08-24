// Pure logic for the [Derived]-tier remainder of question-bank §8
// (completion rate, abandonment, answer-choice skew) — deliberately left out
// of scriptMath.js/0034_campaign_scripts.sql pending the structured
// response-capture redesign that migration 0035_survey_responses.sql is:
// one row per question actually answered during one real door visit
// (canvass_visits), joined here against the current active question list
// from campaign_scripts. No Supabase import — see surveyAnalytics.test.js.

// Only a CONTACTED visit could plausibly have had a survey conducted at all —
// a no_answer/dead_door visit was never a real conversation.
function eligibleVisitIds(visits) {
    return new Set(visits.filter((v) => v.outcome === 'contacted').map((v) => v.id));
}
// visit id -> Set of script ids actually answered during that visit.
function answeredByVisit(responses) {
    const map = new Map();
    for (const r of responses) {
        const set = map.get(r.visit_id) ?? new Set();
        set.add(r.script_id);
        map.set(r.visit_id, set);
    }
    return map;
}
export function computeSurveyCompletion(visits, responses, activeQuestions) {
    const questionIds = activeQuestions.map((q) => q.id);
    const eligible = eligibleVisitIds(visits);
    if (questionIds.length === 0 || eligible.size === 0) {
        return { eligibleVisits: eligible.size, attemptedVisits: 0, fullyCompletedVisits: 0, attemptRatePct: 0, completionRatePct: 0 };
    }
    const answered = answeredByVisit(responses);
    let attempted = 0;
    let fullyCompleted = 0;
    for (const visitId of eligible) {
        const set = answered.get(visitId);
        if (!set || set.size === 0)
            continue;
        attempted += 1;
        if (questionIds.every((id) => set.has(id)))
            fullyCompleted += 1;
    }
    return {
        eligibleVisits: eligible.size,
        attemptedVisits: attempted,
        fullyCompletedVisits: fullyCompleted,
        attemptRatePct: Math.round((attempted / eligible.size) * 100),
        completionRatePct: attempted > 0 ? Math.round((fullyCompleted / attempted) * 100) : 0
    };
}
// Drop-off point = the first active question (in real sort order) an
// attempted-but-incomplete visit never answered — an honest per-question
// abandonment signal, not just a single aggregate rate.
export function computeSurveyAbandonment(visits, responses, activeQuestions) {
    const sorted = [...activeQuestions].sort((a, b) => a.sortOrder - b.sortOrder);
    const eligible = eligibleVisitIds(visits);
    const answered = answeredByVisit(responses);
    let attempted = 0;
    let abandoned = 0;
    const dropOffCounts = new Map();
    for (const visitId of eligible) {
        const set = answered.get(visitId);
        if (!set || set.size === 0)
            continue;
        attempted += 1;
        const dropOffQuestion = sorted.find((q) => !set.has(q.id));
        if (dropOffQuestion) {
            abandoned += 1;
            dropOffCounts.set(dropOffQuestion.id, (dropOffCounts.get(dropOffQuestion.id) ?? 0) + 1);
        }
    }
    let topDropOffQuestion = null;
    if (dropOffCounts.size > 0) {
        const [scriptId, count] = [...dropOffCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        topDropOffQuestion = { scriptId, content: sorted.find((q) => q.id === scriptId)?.content ?? null, count };
    }
    return {
        attemptedVisits: attempted,
        abandonedVisits: abandoned,
        abandonmentRatePct: attempted > 0 ? Math.round((abandoned / attempted) * 100) : 0,
        topDropOffQuestion
    };
}
// Below this many real answers, a "skew" is a handful of early responses,
// not a real signal — same min-sample discipline used everywhere else in the
// advisor (canvasser leaderboard, best-time-to-knock, best-performing post).
const MIN_ANSWERS_FOR_SKEW = 5;
// Only meaningful for a structured question (real `choices` defined at
// migration time) — an open-ended question has no fixed answer set to skew
// against, so this honestly returns null rather than inventing buckets.
export function computeAnswerChoiceSkew(responses, question) {
    if (!question.choices || question.choices.length === 0)
        return null;
    const relevant = responses.filter((r) => r.script_id === question.id);
    if (relevant.length < MIN_ANSWERS_FOR_SKEW)
        return null;
    const counts = new Map(question.choices.map((c) => [c, 0]));
    let otherCount = 0;
    for (const r of relevant) {
        if (counts.has(r.answer))
            counts.set(r.answer, counts.get(r.answer) + 1);
        else
            otherCount += 1;
    }
    const total = relevant.length;
    const breakdown = [...counts.entries()]
        .map(([choice, count]) => ({ choice, count, pct: Math.round((count / total) * 100) }))
        .sort((a, b) => b.count - a.count);
    return { questionId: question.id, content: question.content, totalAnswers: total, breakdown, topChoice: breakdown[0] ?? null, otherCount };
}
// Across every structured active question, the one whose top choice has the
// largest share — a single honest "most skewed" answer for the advisor,
// rather than dumping every question's full distribution on the reader.
export function mostSkewedQuestion(responses, activeQuestions) {
    const structured = activeQuestions.filter((q) => q.choices && q.choices.length > 0);
    const results = structured.map((q) => computeAnswerChoiceSkew(responses, q)).filter((r) => r !== null);
    if (results.length === 0)
        return null;
    return [...results].sort((a, b) => (b.topChoice?.pct ?? 0) - (a.topChoice?.pct ?? 0))[0];
}
