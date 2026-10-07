import { Bell, CheckCheck, ClipboardList, Inbox, ListChecks } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { badgeText, notificationDestination, relativeTime, unreadCount } from './notifyMath';
import { useMarkNotificationsRead, useNotifications } from './useWorkspace';
const KIND_ICON = { task_assigned: ListChecks, task_done: ClipboardList, case_assigned: Inbox };
// Header bell: tasks and cases assigned to you, and tasks you created that
// someone finished. Written only by database triggers (0044); this just
// reads your own and marks them read.
export function NotificationBell({ currentProjectId, onGo, navigate }) {
    const { data: notifications } = useNotifications();
    const markRead = useMarkNotificationsRead();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const unread = unreadCount(notifications);
    const badge = badgeText(unread);
    useEffect(() => {
        if (!open)
            return;
        const onDown = (e) => {
            if (!ref.current?.contains(e.target))
                setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape')
                setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const openOne = (n) => {
        if (!n.read_at)
            markRead.mutate({ ids: [n.id] });
        setOpen(false);
        const dest = notificationDestination(n, currentProjectId);
        if (dest.kind === 'tab')
            onGo(dest.target);
        else if (dest.kind === 'route')
            navigate(dest.path);
    };
    const markAll = () => markRead.mutate({ ids: (notifications ?? []).filter((n) => !n.read_at).map((n) => n.id) });
    return (<div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative flex h-8 w-8 items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-50">
        <Bell className="h-4 w-4"/>
        {badge && (<span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
            {badge}
          </span>)}
      </button>
      {open && (<div className="absolute right-0 z-40 mt-2 w-80 overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2">
            <p className="text-sm font-semibold text-neutral-900">Notifications</p>
            {unread > 0 && (<button type="button" onClick={markAll} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900">
                <CheckCheck className="h-3.5 w-3.5"/> Mark all read
              </button>)}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {(notifications ?? []).length === 0 && (<li className="px-3 py-8 text-center text-sm text-neutral-400">
                Nothing yet. You'll hear here when someone assigns you a task or a case.
              </li>)}
            {(notifications ?? []).map((n) => {
                const Icon = KIND_ICON[n.kind] ?? Bell;
                return (<li key={n.id}>
                  <button type="button" onClick={() => openOne(n)} className={`flex w-full gap-2.5 px-3 py-2.5 text-left hover:bg-neutral-50 ${n.read_at ? '' : 'bg-indigo-50/60'}`}>
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${n.read_at ? 'text-neutral-300' : 'text-indigo-500'}`}/>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.read_at ? 'text-neutral-600' : 'font-medium text-neutral-900'}`}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-neutral-500">{n.body}</span>}
                      <span className="block text-[11px] text-neutral-400">{relativeTime(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-label="Unread"/>}
                  </button>
                </li>);
            })}
          </ul>
        </div>)}
    </div>);
}
