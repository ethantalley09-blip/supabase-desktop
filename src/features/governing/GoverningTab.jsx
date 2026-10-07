import { ChevronDown, ChevronRight, Landmark, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOrgMembersForBridge } from '@/features/fundraising/useFundraisingAi';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAuth } from '@/providers/AuthProvider';
import { CaseDetail } from './CaseDetail';
import { CaseIntake } from './CaseIntake';
import { CASE_CATEGORIES, CASE_STATUSES, caseAgeDays, computeCaseStats, daysUntilTermEnds, isActiveCase, isOverdue, sortCaseQueue } from './governingMath';
import { useConstituentCases, useOfficeBriefing } from './useGoverning';
const PRIORITY_STYLE = {
    urgent: 'bg-red-100 text-red-700',
    high: 'bg-amber-100 text-amber-700',
    normal: 'bg-neutral-100 text-neutral-600',
    low: 'bg-neutral-100 text-neutral-400'
};
function Stat({ label, value, tone }) {
    return (<div className="rounded-lg border border-neutral-200 bg-white p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className={`text-lg font-semibold ${tone ?? 'text-neutral-900'}`}>{value}</p>
    </div>);
}
// Governing mode: the officeholder's workspace on the SAME project the
// campaign ran on, so the supporter file, notes, and donors carry straight
// into the re-election. Constituent service here is official work -- the AI
// prompts refuse to turn a reply into a campaign ask.
export function GoverningTab({ project }) {
    const { user } = useAuth();
    const { data: cases, isLoading } = useConstituentCases(project.id);
    const { data: members } = useOrgMembersForBridge(project.org_id);
    const canManage = Boolean(useHasPermission(project.org_id, 'governing.manage').data);
    const aiEnt = useEntitlement(project.org_id, 'ai_module');
    const canUseAi = useHasPermission(project.org_id, 'ai.use');
    const aiEnabled = Boolean(aiEnt.data && canUseAi.data);
    const briefing = useOfficeBriefing();
    const [view, setView] = useState('active');
    const [openId, setOpenId] = useState(null);
    const stats = useMemo(() => computeCaseStats(cases ?? []), [cases]);
    const queue = useMemo(() => {
        const all = cases ?? [];
        const filtered = view === 'active'
            ? all.filter(isActiveCase)
            : view === 'mine'
                ? all.filter((c) => isActiveCase(c) && c.assigned_to === user?.id)
                : all;
        return view === 'all' ? filtered : sortCaseQueue(filtered);
    }, [cases, view, user?.id]);
    const termDays = daysUntilTermEnds(project);
    return (<div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Landmark className="h-5 w-5 text-emerald-600"/>
        <h2 className="text-base font-semibold text-neutral-900">Office</h2>
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
          {project.office_title || 'Governing mode'}
        </span>
        {termDays !== null && (<span className="text-xs text-neutral-500">
            {termDays > 0 ? `${termDays} days left in term` : 'Term end date has passed'}
          </span>)}
      </div>

      {termDays !== null && termDays > 0 && termDays <= 540 && (<div className="rounded-md border-l-4 border-indigo-500 bg-indigo-50 p-3 text-xs text-indigo-900">
          <span className="font-semibold">Re-election is under 18 months out.</span> When you are
          ready, switch this project back to Campaign mode from the header. Every voter, canvass
          note, donor, and resolved case stays right where it is.
        </div>)}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Open cases" value={stats.active}/>
        <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'text-red-600' : undefined}/>
        <Stat label="Median days to resolve" value={stats.medianDaysToResolve ?? '—'}/>
        <Stat label="New in last 30 days" value={stats.openedLast30Days}/>
      </div>

      {canManage && <CaseIntake orgId={project.org_id} projectId={project.id}/>}

      <div className="rounded-lg border border-neutral-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 p-3">
          <h3 className="text-sm font-semibold text-neutral-900">Case queue</h3>
          <div className="inline-flex gap-1 rounded-md bg-neutral-100 p-0.5 text-xs">
            {[['active', 'Active'], ['mine', 'Assigned to me'], ['all', 'All']].map(([v, label]) => (<button key={v} type="button" onClick={() => setView(v)} className={`rounded px-2 py-1 ${view === v ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500'}`}>
                {label}
              </button>))}
          </div>
        </div>
        {isLoading && <p className="p-4 text-sm text-neutral-400">Loading cases…</p>}
        {!isLoading && queue.length === 0 && (<p className="p-4 text-sm text-neutral-400">
            {view === 'all' ? 'No cases logged yet.' : 'Nothing waiting. Inbox zero.'}
          </p>)}
        {queue.map((c) => {
            const open = openId === c.id;
            return (<div key={c.id} className="border-b border-neutral-100 last:border-0">
              <button type="button" className="flex w-full items-start gap-2 p-3 text-left hover:bg-neutral-50" onClick={() => setOpenId(open ? null : c.id)}>
                {open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400"/> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400"/>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-neutral-900">{c.subject}</p>
                  <p className="text-xs text-neutral-500">
                    {c.constituent_name} · {CASE_CATEGORIES.find((x) => x.value === c.category)?.label} ·{' '}
                    {CASE_STATUSES.find((x) => x.value === c.status)?.label} · {caseAgeDays(c)}d old
                    {c.assignee ? ` · ${c.assignee.full_name || c.assignee.email}` : ''}
                  </p>
                </div>
                {isOverdue(c) && <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">Overdue</span>}
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${PRIORITY_STYLE[c.priority]}`}>{c.priority}</span>
              </button>
              {open && (<CaseDetail orgId={project.org_id} projectId={project.id} caseRow={c} members={members} canManage={canManage} aiEnabled={aiEnabled}/>)}
            </div>);
        })}
      </div>

      {aiEnabled ? (<div id="tool-office_briefing" className="space-y-3 rounded-lg border border-emerald-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-600"/>
            <h3 className="text-sm font-semibold text-neutral-900">Office Briefing</h3>
          </div>
          <p className="text-xs text-neutral-500">
            A chief-of-staff read on your casework: what's slipping, and which issue keeps coming
            up. Uses only the totals above, never anyone's name or case details.
          </p>
          <Button size="sm" onClick={() => briefing.mutate({ orgId: project.org_id, project, cases: cases ?? [] })} disabled={briefing.isPending || !cases?.length}>
            <Sparkles className="h-4 w-4"/>
            {briefing.isPending ? 'Reading…' : 'Brief me'}
          </Button>
          {briefing.isError && <p className="text-sm text-red-600">{briefing.error.message}</p>}
          {briefing.data && (<div className="space-y-2 rounded-md bg-emerald-50 p-3 text-xs text-neutral-700">
              <p className="font-semibold text-neutral-900">{briefing.data.headline}</p>
              {briefing.data.whats_working && <p>{briefing.data.whats_working}</p>}
              {briefing.data.needs_attention?.length > 0 && (<ul className="list-disc space-y-0.5 pl-5">
                  {briefing.data.needs_attention.map((n) => (<li key={n}>{n}</li>))}
                </ul>)}
              {briefing.data.recurring_issue && <p className="italic">{briefing.data.recurring_issue}</p>}
            </div>)}
        </div>) : (<p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-400">
          AI reply drafting and the Office Briefing unlock with the AI module.
        </p>)}
    </div>);
}
