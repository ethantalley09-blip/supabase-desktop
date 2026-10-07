import { ListChecks } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useAuth } from '@/providers/AuthProvider';
import { QuickAddTask, TaskList } from './TaskList';
import { useOrgMembers, useTeamTasks } from './useWorkspace';
import { filterTasks, sortTasks, taskDueState } from './workspaceMath';
const VIEWS = [
    ['mine', 'My tasks'],
    ['open', 'All open'],
    ['unassigned', 'Unassigned'],
    ['done', 'Done']
];
export function TasksTab({ project, onGo }) {
    const { user } = useAuth();
    const { data: tasks, isLoading } = useTeamTasks(project.id);
    const { data: members } = useOrgMembers(project.org_id);
    const canManage = Boolean(useHasPermission(project.org_id, 'projects.manage').data);
    const [view, setView] = useState('mine');
    const shown = useMemo(() => sortTasks(filterTasks(tasks, view, user?.id)), [tasks, view, user?.id]);
    const count = (v) => filterTasks(tasks, v, user?.id).length;
    const overdueMine = filterTasks(tasks, 'mine', user?.id).filter((t) => taskDueState(t) === 'overdue').length;
    return (<div className="space-y-4">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-emerald-600"/>
        <h2 className="text-base font-semibold text-neutral-900">Tasks</h2>
        {overdueMine > 0 && (<span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {overdueMine} overdue for you
          </span>)}
      </div>
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
        <QuickAddTask orgId={project.org_id} projectId={project.id} userId={user?.id} members={members} defaultAssignee={user?.id}/>
        <div className="inline-flex gap-1 rounded-md bg-neutral-100 p-0.5 text-xs">
          {VIEWS.map(([v, label]) => (<button key={v} type="button" onClick={() => setView(v)} className={`rounded px-2.5 py-1 ${view === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
              {label} <span className="text-neutral-400">{count(v)}</span>
            </button>))}
        </div>
        {isLoading ? (<p className="text-sm text-neutral-400">Loading…</p>) : (<TaskList tasks={shown} projectId={project.id} userId={user?.id} canManage={canManage} members={members} onGo={onGo} emptyText={view === 'mine' ? 'Nothing on your plate. Nice.' : view === 'done' ? 'Nothing finished yet.' : 'No open tasks.'}/>)}
      </div>
    </div>);
}
