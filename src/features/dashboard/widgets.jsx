import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { formatUsd } from '@/features/fundraising/useFundraising';
import { useOrgProjects } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { supabase } from '@/lib/supabase/client';
import { rankProjectsByAttention, rankProjectsByFundraising } from './projectRollup';
// Org-scoped dashboard widgets. Each renders only if the viewer's role has
// the matching permission -- the same widget set assembles differently for
// an Owner vs. a Canvasser, which is what makes the dashboard "tiered".
function StatCard({ label, value, sub }) {
    return (<div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-900">{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>);
}
export function OrgDashboard({ orgId }) {
    const canFundraising = useHasPermission(orgId, 'fundraising.view');
    const canComms = useHasPermission(orgId, 'comms.view');
    const canTurf = useHasPermission(orgId, 'turf.view');
    const canCompliance = useHasPermission(orgId, 'compliance.view');
    const { data: unread = 0 } = useQuery({
        queryKey: ['unread-broadcasts', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('my_unread_broadcasts', { p_org_id: orgId });
            if (error)
                throw error;
            return Number(data ?? 0);
        },
        refetchInterval: 60_000
    });
    const { data } = useQuery({
        queryKey: ['org-dashboard', orgId],
        queryFn: async () => {
            const { data: projects, error: projectsError } = await supabase
                .from('projects')
                .select('id')
                .eq('org_id', orgId);
            if (projectsError)
                throw projectsError;
            const projectIds = projects.map((p) => p.id);
            if (projectIds.length === 0) {
                return { raisedCents: 0, threads: 0, territories: 0, voters: 0, unlockedProjects: 0 };
            }
            // Widget queries run under RLS: a viewer without fundraising.view gets
            // zero donation rows back, so these aggregates naturally scope to what
            // the viewer may see.
            const [donations, threads, territories, voters, compliance] = await Promise.all([
                supabase.from('donations').select('amount_cents').in('project_id', projectIds),
                supabase.from('message_threads').select('id', { count: 'exact', head: true }).eq('org_id', orgId),
                supabase.from('territories').select('id', { count: 'exact', head: true }).in('project_id', projectIds),
                supabase.from('voter_records').select('id', { count: 'exact', head: true }).in('project_id', projectIds),
                supabase.from('compliance_status').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('unlocked', true)
            ]);
            return {
                raisedCents: (donations.data ?? []).reduce((sum, d) => sum + d.amount_cents, 0),
                threads: threads.count ?? 0,
                territories: territories.count ?? 0,
                voters: voters.count ?? 0,
                unlockedProjects: compliance.count ?? 0
            };
        }
    });
    const widgets = [
        canFundraising.data && (<StatCard key="raised" label="Raised" value={formatUsd(data?.raisedCents ?? 0)} sub="all projects"/>),
        canComms.data && (<StatCard key="threads" label="Broadcasts" value={String(data?.threads ?? 0)} sub={unread > 0 ? `${unread} unread` : 'all read'}/>),
        canTurf.data && (<StatCard key="turf" label="Turf" value={String(data?.territories ?? 0)} sub={`${data?.voters ?? 0} voter records`}/>),
        canCompliance.data && (<StatCard key="compliance" label="Compliance" value={String(data?.unlockedProjects ?? 0)} sub="projects unlocked"/>)
    ].filter(Boolean);
    if (widgets.length === 0)
        return null;
    return <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{widgets}</div>;
}
// Advisor rollup (question-bank §23, "which project needs the most
// attention"): the one multi-project question that's honestly answerable
// without a new host surface — HomePage already lists every project an
// Owner/Manager can see. Cheap head-count queries per project (same pattern
// OrgDashboard already uses), never a prediction, just an explainable
// ranking (rankProjectsByAttention in projectRollup.ts, unit-tested). Only
// renders with 2+ projects — nothing to "roll up" with just one.
export function ProjectAttentionRollup({ orgId }) {
    const canManage = useHasPermission(orgId, 'projects.manage');
    const { data: projects } = useOrgProjects(orgId);
    const { data: rows } = useQuery({
        queryKey: ['project-attention-rollup', orgId, (projects ?? []).map((p) => p.id).join(',')],
        queryFn: async () => {
            const list = projects ?? [];
            return Promise.all(list.map(async (p) => {
                const [total, mapped, donations] = await Promise.all([
                    supabase.from('voter_records').select('id', { count: 'exact', head: true }).eq('project_id', p.id),
                    supabase
                        .from('voter_records')
                        .select('id', { count: 'exact', head: true })
                        .eq('project_id', p.id)
                        .not('lat', 'is', null),
                    supabase.from('donations').select('amount_cents').eq('project_id', p.id)
                ]);
                return {
                    projectId: p.id,
                    name: p.name,
                    totalVoters: total.count ?? 0,
                    mappedVoters: mapped.count ?? 0,
                    raisedCents: (donations.data ?? []).reduce((sum, d) => sum + d.amount_cents, 0)
                };
            }));
        },
        enabled: Boolean(canManage.data && projects && projects.length > 1)
    });
    const ranked = useMemo(() => rankProjectsByAttention(rows ?? []), [rows]);
    const byFundraising = useMemo(() => rankProjectsByFundraising(rows ?? []), [rows]);
    if (!canManage.data || ranked.length < 2)
        return null;
    const top = ranked[0];
    const topFundraiser = byFundraising[0];
    return (<div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Advisor: needs attention</p>
      <p className="mt-1 text-sm text-neutral-800">
        <strong>{top.name}</strong> — {top.unmappedVoters.toLocaleString()} voter{top.unmappedVoters === 1 ? '' : 's'} still
        unmapped
        {top.raisedCents === 0 ? ', no donations recorded yet' : `, ${formatUsd(top.raisedCents)} raised`}.
      </p>
      {topFundraiser.raisedCents > 0 && (<p className="mt-1 text-xs text-neutral-600">
          Strongest fundraising pace: <strong>{topFundraiser.name}</strong> ({formatUsd(topFundraiser.raisedCents)} raised).
        </p>)}
      {ranked.length > 1 && (<ul className="mt-2 space-y-0.5 text-xs text-neutral-500">
          {ranked.slice(1, 4).map((r) => (<li key={r.projectId}>
              {r.name}: {r.mappedRatePct}% mapped, {formatUsd(r.raisedCents)} raised
            </li>))}
        </ul>)}
    </div>);
}
// Cross-org, read-only rollups for the SuperAdmin dashboard.
export function PlatformMetrics() {
    const { data } = useQuery({
        queryKey: ['platform-metrics'],
        queryFn: async () => {
            const [orgs, activeOrgs, projects, donations] = await Promise.all([
                supabase.from('organizations').select('id', { count: 'exact', head: true }),
                supabase.from('organizations').select('id', { count: 'exact', head: true }).eq('status', 'active'),
                supabase.from('projects').select('id', { count: 'exact', head: true }),
                supabase.from('donations').select('amount_cents')
            ]);
            return {
                orgs: orgs.count ?? 0,
                activeOrgs: activeOrgs.count ?? 0,
                projects: projects.count ?? 0,
                raisedCents: (donations.data ?? []).reduce((sum, d) => sum + d.amount_cents, 0)
            };
        }
    });
    return (<div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Organizations" value={String(data?.orgs ?? 0)} sub={`${data?.activeOrgs ?? 0} active`}/>
      <StatCard label="Projects" value={String(data?.projects ?? 0)}/>
      <StatCard label="Donation volume" value={formatUsd(data?.raisedCents ?? 0)} sub="platform-wide"/>
      <StatCard label="Pending approvals" value="—" sub="see queue below"/>
    </div>);
}
