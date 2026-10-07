import { describe, expect, it } from 'vitest';
import { buildChecklist, buildTodayActions, buildWeeklyStats, filterTasks, sortTasks, taskDueState, weekStart } from './workspaceMath';
// Thursday, Oct 8 2026, noon local
const NOW = new Date(2026, 9, 8, 12, 0, 0);
const task = (o) => ({ id: Math.random().toString(36), status: 'open', title: 'T', created_at: '2026-10-01T00:00:00', due_on: null, assigned_to: 'me', ...o });
describe('tasks', () => {
    it('classifies due state by local date', () => {
        expect(taskDueState(task({ due_on: '2026-10-07' }), NOW)).toBe('overdue');
        expect(taskDueState(task({ due_on: '2026-10-08' }), NOW)).toBe('today');
        expect(taskDueState(task({ due_on: '2026-10-09' }), NOW)).toBe('upcoming');
        expect(taskDueState(task({ status: 'done', due_on: '2026-10-01' }), NOW)).toBe('none');
    });
    it('sorts open by urgency, done last', () => {
        const list = [
            task({ id: 'done', status: 'done', completed_at: '2026-10-05' }),
            task({ id: 'nodate' }),
            task({ id: 'later', due_on: '2026-10-20' }),
            task({ id: 'soon', due_on: '2026-10-10' }),
            task({ id: 'late', due_on: '2026-10-01' }),
            task({ id: 'today', due_on: '2026-10-08' })
        ];
        expect(sortTasks(list, NOW).map((t) => t.id)).toEqual(['late', 'today', 'soon', 'later', 'nodate', 'done']);
    });
    it('filters views', () => {
        const list = [task({ id: 'a' }), task({ id: 'b', assigned_to: null }), task({ id: 'c', status: 'done' }), task({ id: 'd', assigned_to: 'you' })];
        expect(filterTasks(list, 'mine', 'me').map((t) => t.id)).toEqual(['a']);
        expect(filterTasks(list, 'unassigned', 'me').map((t) => t.id)).toEqual(['b']);
        expect(filterTasks(list, 'done', 'me').map((t) => t.id)).toEqual(['c']);
        expect(filterTasks(list, 'open', 'me').map((t) => t.id)).toEqual(['a', 'b', 'd']);
    });
});
describe('buildChecklist', () => {
    it('detects steps from real data and finds the next one', () => {
        const c = buildChecklist({ voters: [{ lat: 1, lng: 2 }], territories: [], members: [1], scripts: [], visits: [], donations: [], available: {} });
        expect(c.steps.map((s) => s.id)).toEqual(['import', 'map', 'territory', 'team', 'knock']);
        expect(c.doneCount).toBe(2);
        expect(c.next.id).toBe('territory');
        expect(c.complete).toBe(false);
    });
    it('adds script and gift steps only when those modules exist', () => {
        const c = buildChecklist({ available: { ai: true, fundraising: true } });
        expect(c.steps.map((s) => s.id)).toEqual(['import', 'map', 'territory', 'team', 'script', 'knock', 'gift']);
    });
});
describe('buildTodayActions', () => {
    const base = { userId: 'me', tasks: [], voters: [], visits: [], donations: [], cases: [], available: {}, canManage: false, now: NOW };
    it('is empty when there is nothing to do', () => {
        expect(buildTodayActions(base)).toEqual([]);
    });
    it('puts overdue tasks above everything', () => {
        const r = buildTodayActions({ ...base, tasks: [task({ due_on: '2026-10-01' }), task({ due_on: '2026-10-08' })], visits: [{ voter_id: 'v', occurred_at: '2026-09-01T00:00:00', outcome: 'contacted' }], voters: [{ id: 'v', lat: 1, lng: 1 }] });
        expect(r.map((a) => a.id)).toEqual(['tasks_overdue', 'tasks_today', 'canvass_quiet']);
    });
    it('flags quiet fundraising and unmapped voters only with real signal', () => {
        const r = buildTodayActions({
            ...base,
            available: { fundraising: true },
            donations: [{ donated_at: '2026-09-20T00:00:00' }],
            voters: [{ id: 'a', lat: null, lng: null }, { id: 'b', lat: 1, lng: 1 }]
        });
        expect(r.map((a) => a.id)).toEqual(['gifts_quiet', 'unmapped']);
    });
    it('shows the next setup step only to managers', () => {
        const checklist = buildChecklist({ available: {} });
        expect(buildTodayActions({ ...base, checklist }).map((a) => a.id)).toEqual([]);
        expect(buildTodayActions({ ...base, checklist, canManage: true })[0].id).toBe('setup_next');
    });
    it('nudges the weekly recap late in the week for managers with AI', () => {
        const r = buildTodayActions({ ...base, canManage: true, available: { ai: true }, recapThisWeek: false });
        expect(r.map((a) => a.id)).toContain('recap');
        expect(buildTodayActions({ ...base, canManage: true, available: { ai: true }, recapThisWeek: true }).map((a) => a.id)).not.toContain('recap');
    });
    it('caps the list', () => {
        const many = Array.from({ length: 10 }, () => task({ due_on: '2026-10-01' }));
        expect(buildTodayActions({ ...base, tasks: many }, 1)).toHaveLength(1);
    });
});
describe('weekly recap', () => {
    it('starts weeks on Monday', () => {
        expect(weekStart(NOW)).toBe('2026-10-05');
        expect(weekStart(new Date(2026, 9, 11, 9))).toBe('2026-10-05');
        expect(weekStart(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05');
    });
    it('compares this week to the same point last week', () => {
        const s = buildWeeklyStats({
            now: NOW,
            visits: [
                { occurred_at: new Date(2026, 9, 6, 10).toISOString(), outcome: 'contacted', canvasser_id: 'c1' },
                { occurred_at: new Date(2026, 9, 7, 10).toISOString(), outcome: 'no_answer', canvasser_id: 'c2' },
                { occurred_at: new Date(2026, 8, 29, 10).toISOString(), outcome: 'contacted', canvasser_id: 'c1' },
                // last Friday: after the same point last week, so excluded
                { occurred_at: new Date(2026, 9, 2, 10).toISOString(), outcome: 'contacted', canvasser_id: 'c1' }
            ],
            donations: [{ donated_at: new Date(2026, 9, 6).toISOString(), amount_cents: 5050 }],
            cases: [],
            tasks: [{ status: 'done', completed_at: new Date(2026, 9, 7).toISOString() }, { status: 'open' }]
        });
        expect(s.this_week).toMatchObject({ doors: 2, conversations: 1, contact_rate_pct: 50, active_canvassers: 2, gifts: 1, raised_usd: 51, tasks_done: 1 });
        expect(s.same_point_last_week).toMatchObject({ doors: 1, conversations: 1 });
        expect(s.open_tasks).toBe(1);
        expect(s.days_into_week).toBe(4);
    });
});
