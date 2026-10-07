// Pure logic for the Campaign Script & Survey record (question-bank §8,
// items 1-2: "What questions are in the current survey?" / "What is the
// current door script?"). These were tagged [Now] in the source doc for a
// real reason — Lynx already generates canvassing scripts on demand via AI
// (the `canvassing_script` purpose) but never stores an official CURRENT
// one anywhere, so the advisor had nothing to point to. The [Derived]-tier
// items in this section (completion rate, abandonment, answer-choice skew)
// stay out of scope — those need a structured response-capture redesign,
// a genuinely bigger change than adding this record. No Supabase import —
// see scriptMath.test.ts.
// The most recently added active door script wins — there's only ever
// meant to be one "current" one, but nothing stops staff from adding a new
// one before retiring the old (active flag), so pick the latest by
// insertion order (callers pass entries already ordered by sort_order/id).
export function currentDoorScript(entries) {
    const active = entries.filter((e) => e.kind === 'door_script' && e.active);
    return active.length > 0 ? active[active.length - 1].content : null;
}
export function currentSurveyQuestions(entries) {
    return entries
        .filter((e) => e.kind === 'survey_question' && e.active)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((e) => e.content);
}
