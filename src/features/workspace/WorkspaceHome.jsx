import { ArrowRight, CheckCircle2, Circle, ListChecks, Plus, Rocket, Sun, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDonations } from '@/features/fundraising/useFundraising';
import { useConstituentCases } from '@/features/governing/useGoverning';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useCampaignScripts } from '@/features/scripts/useScripts';
import { useCanvassVisits, useTerritories, useVoterRecords } from '@/features/turf/useTurf';
import { useAuth } from '@/providers/AuthProvider';
import { TaskList } from './TaskList';
import { useCreateTask, useOrgMembers, useTeamTasks, useWeeklyRecaps } from './useWorkspace';
import { WeeklyRecap } from './WeeklyRecap';
import { buildChecklist, buildTodayActions, buildWeeklyStats, filterTasks, sortTasks, weekStart } from './workspaceMath';
const TONE = {
    red: 'border-l-red-500',
    amber: 'border-l-amber-500',
    indigo: 'border-l-indigo-500',
    violet: 'border-l-violet-500',
    neutral: 'border-l-neutral-300'
};
// Per-viewer "I've seen it" for the finished checklist. Browser storage is
// right for this (a personal convenience, not shared state) and every access
// is guarded: private windows can throw.
function useDismissed(key) {
    const read = () => {
        try {
            return window.localStorage.getItem(key) === '1';
        }
        catch {
            return false;
        }
    };
    const [dismissed, setDismissed] = useState(read);
    const dismiss = () => {
        try {
            window.localStorage.setItem(key, '1');
        }
        catch {
            // ignore: it simply reappears next visit
        }
        setDismissed(true);
    };
    return [dismissed, dismiss];
}
function LaunchChecklist({ checklist, onGo, projectId }) {
    const [dismissed, dismiss] = useDismissed(`lynx.checklist.dismissed.${projectId}`);
    if (dismissed)
        return null;
    const pct = Math.round((checklist.doneCount / checklist.total) * 100);
    return (<div className="space-y-3 rounded-lg border border-indigo-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-indigo-600"/>
          <h3 className="text-sm font-semibold text-neutral-900">
            {checklist.complete ? 'You’re all set up' : 'Get your campaign running'}
          </h3>
          <span className="text-xs text-neutral-400">{checklist.doneCount} of {checklist.total}</span>
        </div>
        {checklist.complete && (<button type="button" onClick={dismiss} aria-label="Hide checklist">
            <X className="h-4 w-4 text-neutral-400 hover:text-neutral-700"/>
          </button>)}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${pct}%` }}/>
      </div>
      <ul className="space-y-1">
        {checklist.steps.map((s) => {
            const isNext = checklist.next?.id === s.id;
            return (<li key={s.id} className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${isNext ? 'bg-indigo-50' : ''}`}>
              {s.done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500"/> : <Circle className="h-4 w-4 shrink-0 text-neutral-300"/>}
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${s.done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{s.label}</p>
                {isNext && <p className="text-xs text-neutral-500">{s.why}</p>}
              </div>
              {!s.done && (<Button size="sm" variant={isNext ? 'default' : 'ghost'} onClick={() => onGo(s.target)}>
                  {s.cta}
                </Button>)}
            </li>);
        })}
      </ul>
    </div>);
}
function TodayPanel({ actions, onGo, onMakeTask, madeTaskIds }) {
    return (<div className="space-y-2 rounded-lg border border-amber-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <Sun className="h-4 w-4 text-amber-500"/>
        <h3 className="text-sm font-semibold text-neutral-900">Today</h3>
        <span className="text-xs text-neutral-400">the few things worth doing next</span>
      </div>
      {actions.length === 0 ? (<p className="text-sm text-neutral-500">Nothing urgent. You're caught up.</p>) : (<ul className="space-y-1.5">
          {actions.map((a) => (<li key={a.id} className={`flex items-center gap-3 rounded-md border border-l-4 border-neutral-100 bg-neutral-50/50 p-2.5 ${TONE[a.tone]}`}>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">{a.title}</p>
                {a.detail && <p className="truncate text-xs text-neutral-500">{a.detail}</p>}
              </div>
              {!a.id.startsWith('tasks_') && (<button type="button" title="Turn into a task" disabled={madeTaskIds.has(a.id)} onClick={() => onMakeTask(a)} className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:text-emerald-500">
                  {madeTaskIds.has(a.id) ? <CheckCircle2 className="h-4 w-4"/> : <Plus className="h-4 w-4"/>}
                </button>)}
              <Button size="sm" variant="outline" onClick={() => onGo(a.target)}>
                {a.cta} <ArrowRight className="h-3.5 w-3.5"/>
              </Button>
            </li>))}
        </ul>)}
    </div>);
}
// Top of the Overview tab: setup checklist (managers, until done), Today's
// short action list, the viewer's own tasks, and the Weekly Recap. All of it
// reads queries the app already caches, so it adds no load of its own
// beyond tasks and recaps.
export function WorkspaceHome({ project, available, onGo }) {
    const { user } = useAuth();
    const canManage = Boolean(useHasPermission(project.org_id, 'projects.manage').data);
    const { data: voters } = useVoterRecords(project.id);
    const { data: visits } = useCanvassVisits(project.id);
    const { data: territories } = useTerritories(project.id);
    const { data: scripts } = useCampaignScripts(project.id);
    const { data: donations } = useDonations(project.id);
    const { data: members } = useOrgMembers(project.org_id);
    const { data: cases } = useConstituentCases(available?.governing ? project.id : undefined);
    const { data: tasks } = useTeamTasks(project.id);
    const { data: recaps } = useWeeklyRecaps(project.id, canManage);
    const createTask = useCreateTask();
    const [madeTaskIds, setMadeTaskIds] = useState(() => new Set());
    const checklist = useMemo(() => buildChecklist({ voters, territories, members, scripts, visits, donations, available }), [voters, territories, members, scripts, visits, donations, available]);
    const recapThisWeek = (recaps ?? []).some((r) => r.week_start === weekStart());
    const actions = useMemo(() => buildTodayActions({ userId: user?.id, tasks, voters, visits, donations, cases, available, canManage, checklist, recapThisWeek }), [user?.id, tasks, voters, visits, donations, cases, available, canManage, checklist, recapThisWeek]);
    const myTasks = useMemo(() => sortTasks(filterTasks(tasks, 'mine', user?.id)).slice(0, 5), [tasks, user?.id]);
    const weeklyStats = useMemo(() => buildWeeklyStats({ visits, donations, cases, tasks }), [visits, donations, cases, tasks]);
    const makeTask = (a) => createTask.mutate({ orgId: project.org_id, projectId: project.id, userId: user?.id, title: a.title, notes: a.detail, assignedTo: user?.id, linkTab: a.target?.tab, linkAnchor: a.target?.anchor }, { onSuccess: () => setMadeTaskIds((s) => new Set(s).add(a.id)) });
    return (<div className="space-y-4">
      {canManage && <LaunchChecklist checklist={checklist} onGo={onGo} projectId={project.id}/>}
      <TodayPanel actions={actions} onGo={onGo} onMakeTask={makeTask} madeTaskIds={madeTaskIds}/>
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-emerald-600"/>
            <h3 className="text-sm font-semibold text-neutral-900">My tasks</h3>
          </div>
          <button type="button" className="text-xs text-neutral-500 hover:text-neutral-900" onClick={() => onGo({ tab: 'tasks' })}>
            All tasks →
          </button>
        </div>
        <TaskList tasks={myTasks} projectId={project.id} userId={user?.id} canManage={canManage} onGo={onGo} emptyText="Nothing assigned to you. Add tasks from the Tasks tab, or with + on anything in Today."/>
      </div>
      {canManage && <WeeklyRecap orgId={project.org_id} projectId={project.id} stats={weeklyStats} aiEnabled={Boolean(available?.ai)}/>}
    </div>);
}
