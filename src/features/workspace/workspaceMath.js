// Today, Launch Checklist, Team Tasks, and Weekly Recap math. Pure.
import { buildRevisitQueue } from '@/features/turf/revisitQueue';
const DAY_MS = 86400000;
function localDate(d) {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
export function daysSince(iso, now = new Date()) {
    if (!iso)
        return null;
    return Math.floor((now.getTime() - new Date(iso).getTime()) / DAY_MS);
}
// ---------------------------------------------------------------------------
// Team Tasks
// ---------------------------------------------------------------------------
export function taskDueState(task, now = new Date()) {
    if (task.status !== 'open' || !task.due_on)
        return 'none';
    const today = localDate(now);
    if (task.due_on < today)
        return 'overdue';
    if (task.due_on === today)
        return 'today';
    return 'upcoming';
}
const DUE_RANK = { overdue: 0, today: 1, upcoming: 2, none: 3 };
// Open first; among open: overdue, due today, upcoming (soonest first), no
// date; done tasks last, most recently finished first.
export function sortTasks(tasks, now = new Date()) {
    return [...(tasks ?? [])].sort((a, b) => {
        const ao = a.status === 'open' ? 0 : 1;
        const bo = b.status === 'open' ? 0 : 1;
        if (ao !== bo)
            return ao - bo;
        if (ao === 1)
            return new Date(b.completed_at ?? 0).getTime() - new Date(a.completed_at ?? 0).getTime();
        const ar = DUE_RANK[taskDueState(a, now)];
        const br = DUE_RANK[taskDueState(b, now)];
        if (ar !== br)
            return ar - br;
        if (a.due_on && b.due_on && a.due_on !== b.due_on)
            return a.due_on < b.due_on ? -1 : 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}
export function filterTasks(tasks, view, userId) {
    const all = tasks ?? [];
    if (view === 'mine')
        return all.filter((t) => t.status === 'open' && t.assigned_to === userId);
    if (view === 'unassigned')
        return all.filter((t) => t.status === 'open' && !t.assigned_to);
    if (view === 'done')
        return all.filter((t) => t.status === 'done');
    return all.filter((t) => t.status === 'open');
}
// ---------------------------------------------------------------------------
// Launch Checklist
// ---------------------------------------------------------------------------
// Each step is detected from real data -- nobody ticks a box by hand, so the
// checklist can't say "done" while the thing isn't.
export function buildChecklist({ voters, territories, members, scripts, visits, donations, available }) {
    const v = voters ?? [];
    const steps = [
        { id: 'import', label: 'Import your voter list', why: 'Everything on the map and every walk list starts here.', done: v.length > 0, target: { tab: 'turf', anchor: 'tool-import_mapping' }, cta: 'Import voters' },
        { id: 'map', label: 'Put voters on the map', why: 'Mapped voters can be cut into turf and routed.', done: v.some((x) => x.lat != null && x.lng != null), target: { tab: 'turf' }, cta: 'Open the map' },
        { id: 'territory', label: 'Draw your first territory', why: 'A territory becomes a walk list you can hand to a canvasser.', done: (territories ?? []).length > 0, target: { tab: 'turf' }, cta: 'Draw a territory' },
        { id: 'team', label: 'Invite your team', why: 'Volunteers log doors from their own accounts.', done: (members ?? []).length > 1, target: { tab: 'team', anchor: 'invite-email' }, cta: 'Invite someone' }
    ];
    if (available?.ai) {
        steps.push({ id: 'script', label: 'Save your door script', why: 'Canvassers see the same message at every door.', done: (scripts ?? []).some((s) => s.kind === 'door_script' && s.active), target: { tab: 'ai', anchor: 'tool-message_studio' }, cta: 'Write the script' });
    }
    steps.push({ id: 'knock', label: 'Log your first door knock', why: 'Every knock feeds Best Time to Knock, routing, and your stats.', done: (visits ?? []).length > 0, target: { tab: 'turf' }, cta: 'Start canvassing' });
    if (available?.fundraising) {
        steps.push({ id: 'gift', label: 'Record your first donation', why: 'Unlocks fundraising insights (and Compliance at $1,000).', done: (donations ?? []).length > 0, target: { tab: 'fundraising' }, cta: 'Record a gift' });
    }
    const doneCount = steps.filter((s) => s.done).length;
    return { steps, doneCount, total: steps.length, complete: doneCount === steps.length, next: steps.find((s) => !s.done) ?? null };
}
// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------
// The handful of things worth doing right now, from real signals, most
// important first. Capped short on purpose: a 20-item "today" list is just
// another dashboard nobody reads.
export function buildTodayActions({ userId, tasks, voters, visits, donations, cases, available, canManage, checklist, recapThisWeek, now = new Date() }, limit = 6) {
    const out = [];
    const push = (a) => out.push(a);
    const myOpen = (tasks ?? []).filter((t) => t.status === 'open' && t.assigned_to === userId);
    const myOverdue = myOpen.filter((t) => taskDueState(t, now) === 'overdue');
    const myToday = myOpen.filter((t) => taskDueState(t, now) === 'today');
    if (myOverdue.length)
        push({ id: 'tasks_overdue', priority: 100, tone: 'red', title: `${myOverdue.length} of your tasks ${myOverdue.length === 1 ? 'is' : 'are'} overdue`, detail: myOverdue[0].title, cta: 'Open tasks', target: { tab: 'tasks' } });
    if (myToday.length)
        push({ id: 'tasks_today', priority: 90, tone: 'amber', title: `${myToday.length} task${myToday.length === 1 ? '' : 's'} due today`, detail: myToday[0].title, cta: 'Open tasks', target: { tab: 'tasks' } });
    if (available?.governing) {
        const activeCases = (cases ?? []).filter((c) => c.status !== 'resolved' && c.status !== 'closed');
        const overdue = activeCases.filter((c) => c.due_on && c.due_on < localDate(now));
        const urgent = activeCases.filter((c) => c.priority === 'urgent');
        if (overdue.length)
            push({ id: 'cases_overdue', priority: 95, tone: 'red', title: `${overdue.length} constituent case${overdue.length === 1 ? ' is' : 's are'} past the respond-by date`, detail: overdue[0].subject, cta: 'Open Office', target: { tab: 'governing' } });
        else if (urgent.length)
            push({ id: 'cases_urgent', priority: 85, tone: 'amber', title: `${urgent.length} urgent constituent case${urgent.length === 1 ? '' : 's'} open`, detail: urgent[0].subject, cta: 'Open Office', target: { tab: 'governing' } });
    }
    if (canManage && checklist && !checklist.complete && checklist.next)
        push({ id: 'setup_next', priority: 80, tone: 'indigo', title: `Next setup step: ${checklist.next.label}`, detail: checklist.next.why, cta: checklist.next.cta, target: checklist.next.target });
    const v = voters ?? [];
    const vs = visits ?? [];
    if (v.length > 0) {
        const revisit = buildRevisitQueue(v, vs);
        if (revisit.length >= 3)
            push({ id: 'revisit', priority: 60, tone: 'neutral', title: `${revisit.length} doors have been knocked twice with no answer`, detail: `Try a different time of day — ${revisit[0].name} has had ${revisit[0].attempts} tries.`, cta: 'Open Turf Map', target: { tab: 'turf', anchor: 'tool-turf_briefing' } });
        const lastKnock = vs.reduce((m, x) => (!m || x.occurred_at > m ? x.occurred_at : m), null);
        const quietDays = daysSince(lastKnock, now);
        if (vs.length > 0 && quietDays !== null && quietDays >= 3)
            push({ id: 'canvass_quiet', priority: 70, tone: 'amber', title: `No doors knocked in ${quietDays} days`, detail: 'Field momentum is easiest to keep, hardest to restart.', cta: 'Plan a shift', target: { tab: 'turf', anchor: 'tool-turf_briefing' } });
        const unmapped = v.filter((x) => x.lat == null || x.lng == null).length;
        if (unmapped > 0 && unmapped / v.length >= 0.1)
            push({ id: 'unmapped', priority: 50, tone: 'neutral', title: `${unmapped.toLocaleString()} voters aren't on the map yet`, detail: 'They can\'t be put in a territory or a walk list until they are.', cta: 'Fix mapping', target: { tab: 'turf', anchor: 'tool-geocode_coach' } });
    }
    if (available?.fundraising && (donations ?? []).length > 0) {
        const lastGift = donations.reduce((m, d) => (!m || d.donated_at > m ? d.donated_at : m), null);
        const giftDays = daysSince(lastGift, now);
        if (giftDays !== null && giftDays >= 7)
            push({ id: 'gifts_quiet', priority: 65, tone: 'amber', title: `No donations logged in ${giftDays} days`, detail: 'A short, honest ask to recent donors is usually the fastest restart.', cta: 'Open Fundraising', target: { tab: 'fundraising' } });
    }
    // Recap nudge only late in the week (Thu-Sun) and only for managers, who
    // are the only ones who can save one.
    const dow = now.getDay();
    if (canManage && available?.ai && !recapThisWeek && (dow === 0 || dow >= 4))
        push({ id: 'recap', priority: 40, tone: 'violet', title: "This week's recap isn't written yet", detail: 'Two minutes: what happened, what to watch, next week\'s focus.', cta: 'Write recap', target: { tab: 'overview', anchor: 'tool-weekly_recap' } });
    return out.sort((a, b) => b.priority - a.priority).slice(0, limit);
}
// ---------------------------------------------------------------------------
// Weekly Recap
// ---------------------------------------------------------------------------
// Monday of the week containing `now`, as a local YYYY-MM-DD.
export function weekStart(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const offset = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - offset);
    return localDate(d);
}
// This week (Monday -> now) vs the same span last week, aggregates only --
// this is the whole payload the weekly_recap purpose ever sees.
export function buildWeeklyStats({ visits, donations, cases, tasks, now = new Date() }) {
    const start = new Date(`${weekStart(now)}T00:00:00`);
    const elapsed = now.getTime() - start.getTime();
    const prevStart = new Date(start.getTime() - 7 * DAY_MS);
    const prevEnd = new Date(prevStart.getTime() + elapsed);
    const inThis = (iso) => iso && new Date(iso) >= start && new Date(iso) <= now;
    const inPrev = (iso) => iso && new Date(iso) >= prevStart && new Date(iso) <= prevEnd;
    const span = (pred) => {
        const vs = (visits ?? []).filter((v) => pred(v.occurred_at));
        const contacted = vs.filter((v) => v.outcome === 'contacted').length;
        const ds = (donations ?? []).filter((d) => pred(d.donated_at));
        return {
            doors: vs.length,
            conversations: contacted,
            contact_rate_pct: vs.length ? Math.round((contacted / vs.length) * 100) : null,
            active_canvassers: new Set(vs.map((v) => v.canvasser_id).filter(Boolean)).size,
            gifts: ds.length,
            raised_usd: Math.round(ds.reduce((s, d) => s + (d.amount_cents ?? 0), 0) / 100),
            cases_opened: (cases ?? []).filter((c) => pred(c.created_at)).length,
            cases_resolved: (cases ?? []).filter((c) => pred(c.resolved_at)).length,
            tasks_done: (tasks ?? []).filter((t) => t.status === 'done' && pred(t.completed_at)).length
        };
    };
    return {
        week_start: weekStart(now),
        days_into_week: Math.max(1, Math.ceil(elapsed / DAY_MS)),
        this_week: span(inThis),
        same_point_last_week: span(inPrev),
        open_tasks: (tasks ?? []).filter((t) => t.status === 'open').length
    };
}
