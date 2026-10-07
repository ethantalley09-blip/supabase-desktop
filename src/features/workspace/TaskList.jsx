import { ArrowRight, Check, Circle, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { taskDueState } from './workspaceMath';
import { useCreateTask, useUpdateTask } from './useWorkspace';
const DUE_STYLE = {
    overdue: 'text-red-600 font-medium',
    today: 'text-amber-700 font-medium',
    upcoming: 'text-neutral-500',
    none: 'text-neutral-400'
};
function dueText(task) {
    const state = taskDueState(task);
    if (state === 'overdue')
        return `Overdue · ${task.due_on}`;
    if (state === 'today')
        return 'Due today';
    if (task.due_on)
        return `Due ${task.due_on}`;
    return null;
}
// Quick-add row: title + who + when, Enter to save. The whole form is one
// line so adding a task never feels like filling out a form.
export function QuickAddTask({ orgId, projectId, userId, members, defaultAssignee }) {
    const create = useCreateTask();
    const [title, setTitle] = useState('');
    const [assignedTo, setAssignedTo] = useState(defaultAssignee ?? '');
    const [dueOn, setDueOn] = useState('');
    const submit = () => {
        if (!title.trim())
            return;
        create.mutate({ orgId, projectId, userId, title, assignedTo, dueOn }, { onSuccess: () => { setTitle(''); setDueOn(''); } });
    };
    return (<div className="space-y-1">
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Input className="min-w-48 flex-1" placeholder="Add a task, e.g. Call the print shop about yard signs" value={title} onChange={(e) => setTitle(e.target.value)}/>
        <select aria-label="Assign to" className="h-9 rounded-md border border-neutral-300 bg-white px-2 text-sm" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
          <option value="">Anyone</option>
          {members?.map((m) => (<option key={m.profile_id} value={m.profile_id}>{m.profile_id === userId ? 'Me' : m.full_name}</option>))}
        </select>
        <Input type="date" aria-label="Due date" className="w-40" value={dueOn} onChange={(e) => setDueOn(e.target.value)}/>
        <Button type="submit" size="sm" className="h-9" disabled={!title.trim() || create.isPending}>
          <Plus className="h-4 w-4"/> Add
        </Button>
      </form>
      {create.isError && <p className="text-xs text-red-600">{create.error.message}</p>}
    </div>);
}
// One row per task: tick to finish, assignee + due date at a glance, and a
// "Go" arrow when the task links to the place the work happens.
export function TaskList({ tasks, projectId, userId, canManage, members, onGo, emptyText }) {
    const update = useUpdateTask();
    if (!tasks?.length)
        return <p className="py-3 text-sm text-neutral-400">{emptyText ?? 'No tasks here.'}</p>;
    return (<ul className="divide-y divide-neutral-100">
      {tasks.map((t) => {
            const done = t.status === 'done';
            const canEdit = canManage || t.created_by === userId || t.assigned_to === userId;
            const due = dueText(t);
            return (<li key={t.id} className="flex items-center gap-3 py-2">
            <button type="button" disabled={!canEdit} aria-label={done ? 'Mark not done' : 'Mark done'} onClick={() => update.mutate({ id: t.id, projectId, patch: { status: done ? 'open' : 'done' } })} className="shrink-0 disabled:opacity-40">
              {done ? <Check className="h-5 w-5 rounded-full bg-emerald-500 p-0.5 text-white"/> : <Circle className="h-5 w-5 text-neutral-300 hover:text-emerald-500"/>}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm ${done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}>{t.title}</p>
              <p className="text-xs text-neutral-400">
                {t.assignee ? (t.assigned_to === userId ? 'You' : t.assignee.full_name || t.assignee.email) : 'Unassigned'}
                {due && !done ? <span className={DUE_STYLE[taskDueState(t)]}> · {due}</span> : null}
                {t.notes ? ` · ${t.notes}` : ''}
              </p>
            </div>
            {canEdit && !done && members && (<select aria-label="Reassign" className="hidden h-7 rounded-md border border-neutral-200 bg-white px-1 text-xs text-neutral-500 sm:block" value={t.assigned_to ?? ''} onChange={(e) => update.mutate({ id: t.id, projectId, patch: { assigned_to: e.target.value || null } })}>
                <option value="">Unassigned</option>
                {members.map((m) => (<option key={m.profile_id} value={m.profile_id}>{m.full_name}</option>))}
              </select>)}
            {t.link_tab && !done && onGo && (<button type="button" title="Go to where this gets done" onClick={() => onGo({ tab: t.link_tab, anchor: t.link_anchor })} className="shrink-0">
                <ArrowRight className="h-4 w-4 text-neutral-400 hover:text-neutral-800"/>
              </button>)}
          </li>);
        })}
    </ul>);
}
