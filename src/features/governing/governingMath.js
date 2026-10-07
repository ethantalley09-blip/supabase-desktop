// Pure casework math for Governing mode -- no Supabase import, so it stays
// unit-testable (same split as turf/route.js + useTurf.js).

export const CASE_CATEGORIES = [
    { value: 'casework', label: 'Casework (help with an agency)' },
    { value: 'service_request', label: 'Service request' },
    { value: 'policy_opinion', label: 'Policy opinion' },
    { value: 'complaint', label: 'Complaint' },
    { value: 'event_request', label: 'Event / meeting request' },
    { value: 'other', label: 'Other' }
];
export const CASE_SOURCES = [
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Phone' },
    { value: 'walk_in', label: 'Walk-in' },
    { value: 'event', label: 'Town hall / event' },
    { value: 'letter', label: 'Letter' },
    { value: 'web', label: 'Web form' },
    { value: 'other', label: 'Other' }
];
export const CASE_STATUSES = [
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'waiting_on_agency', label: 'Waiting on agency' },
    { value: 'resolved', label: 'Resolved' },
    { value: 'closed', label: 'Closed' }
];
export const CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const DAY_MS = 86400000;
export function isActiveCase(c) {
    return c.status !== 'resolved' && c.status !== 'closed';
}
// A due date is a calendar day in the office's own sense, so a case due
// "today" is not overdue until tomorrow.
export function isOverdue(c, now = new Date()) {
    if (!isActiveCase(c) || !c.due_on)
        return false;
    const endOfDue = new Date(`${c.due_on}T23:59:59`);
    return now.getTime() > endOfDue.getTime();
}
export function caseAgeDays(c, now = new Date()) {
    const end = c.resolved_at ? new Date(c.resolved_at) : now;
    return Math.max(0, Math.floor((end.getTime() - new Date(c.created_at).getTime()) / DAY_MS));
}
const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 };
// Work queue order: overdue first, then priority, then oldest first -- the
// constituent who has waited longest at a given urgency gets answered next.
export function sortCaseQueue(cases, now = new Date()) {
    return [...cases].sort((a, b) => {
        const od = Number(isOverdue(b, now)) - Number(isOverdue(a, now));
        if (od !== 0)
            return od;
        const pr = (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
        if (pr !== 0)
            return pr;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}
function median(nums) {
    if (nums.length === 0)
        return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
// Office health numbers. Median (not mean) resolution time, because one
// year-long immigration case would otherwise swamp fifty two-day pothole
// requests. Null, never 0, when nothing has been resolved yet -- "0 days"
// would read as instant service.
export function computeCaseStats(cases, now = new Date()) {
    const active = cases.filter(isActiveCase);
    const resolved = cases.filter((c) => !isActiveCase(c) && c.resolved_at);
    const byCategory = {};
    for (const c of cases)
        byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    const last30 = cases.filter((c) => now.getTime() - new Date(c.created_at).getTime() <= 30 * DAY_MS).length;
    return {
        total: cases.length,
        active: active.length,
        overdue: active.filter((c) => isOverdue(c, now)).length,
        urgent: active.filter((c) => c.priority === 'urgent').length,
        waitingOnAgency: active.filter((c) => c.status === 'waiting_on_agency').length,
        resolved: resolved.length,
        medianDaysToResolve: median(resolved.map((c) => caseAgeDays(c, now))),
        oldestActiveDays: active.length ? Math.max(...active.map((c) => caseAgeDays(c, now))) : null,
        openedLast30Days: last30,
        byCategory
    };
}
// Most-raised subjects, by simple keyword frequency over subjects only (not
// the free-text details, which can hold personal circumstances). Gives the
// office briefing a "what are people writing about" signal without sending
// any individual's case to the model.
const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'about', 'from', 'this', 'that', 'need', 'help', 'please', 'issue', 'request', 'question', 're', 'my', 'our', 'on', 'in', 'to', 'of', 'a', 'an', 'is', 'at', 'not']);
export function topSubjectTerms(cases, limit = 5) {
    const counts = new Map();
    for (const c of cases) {
        const words = new Set(String(c.subject ?? '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 2 && !STOPWORDS.has(w)));
        for (const w of words)
            counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return [...counts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([term, count]) => ({ term, count }));
}
// The ONLY payload the office_briefing purpose may receive: aggregates, no
// names, contacts, or case details (the "aggregate snapshots, never raw
// rows" rule in CLAUDE.md).
export function buildOfficeSnapshot(cases, project, now = new Date()) {
    const stats = computeCaseStats(cases, now);
    return JSON.stringify({
        office: project?.office_title ?? null,
        term_ends_on: project?.term_ends_on ?? null,
        ...stats,
        top_subject_terms: topSubjectTerms(cases)
    });
}
// The constituent_reply payload: the one case being answered. Deliberately
// excludes email, phone, and the full name -- the draft only needs a first
// name for the greeting, and contact details never need to leave the app.
export function buildReplyContext(c, staffFacts, latestNote) {
    const firstName = String(c.constituent_name ?? '').trim().split(/\s+/)[0] || null;
    return JSON.stringify({
        constituent_first_name: firstName,
        category: c.category,
        subject: c.subject,
        what_they_wrote: c.details,
        current_status: c.status,
        latest_staff_note: latestNote ?? null,
        facts_staff_want_included: staffFacts?.trim() || null
    });
}
// Days left in the term, for the "re-election is coming" nudge. Null with no
// term end set.
export function daysUntilTermEnds(project, now = new Date()) {
    if (!project?.term_ends_on)
        return null;
    return Math.ceil((new Date(`${project.term_ends_on}T00:00:00`).getTime() - now.getTime()) / DAY_MS);
}
