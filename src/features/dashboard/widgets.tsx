import { useQuery } from '@tanstack/react-query';
import { formatUsd } from '@/features/fundraising/useFundraising';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { supabase } from '@/lib/supabase/client';

// Org-scoped dashboard widgets. Each renders only if the viewer's role has
// the matching permission -- the same widget set assembles differently for
// an Owner vs. a Canvasser, which is what makes the dashboard "tiered".

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-neutral-900">{value}</p>
      {sub && <p className="text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}

export function OrgDashboard({ orgId }: { orgId: string }) {
  const canFundraising = useHasPermission(orgId, 'fundraising.view');
  const canComms = useHasPermission(orgId, 'comms.view');
  const canTurf = useHasPermission(orgId, 'turf.view');
  const canCompliance = useHasPermission(orgId, 'compliance.view');

  const { data } = useQuery({
    queryKey: ['org-dashboard', orgId],
    queryFn: async () => {
      const { data: projects, error: projectsError } = await supabase
        .from('projects')
        .select('id')
        .eq('org_id', orgId);
      if (projectsError) throw projectsError;
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
    canFundraising.data && (
      <StatCard key="raised" label="Raised" value={formatUsd(data?.raisedCents ?? 0)} sub="all projects" />
    ),
    canComms.data && (
      <StatCard key="threads" label="Broadcasts" value={String(data?.threads ?? 0)} sub="org-wide" />
    ),
    canTurf.data && (
      <StatCard
        key="turf"
        label="Turf"
        value={String(data?.territories ?? 0)}
        sub={`${data?.voters ?? 0} voter records`}
      />
    ),
    canCompliance.data && (
      <StatCard
        key="compliance"
        label="Compliance"
        value={String(data?.unlockedProjects ?? 0)}
        sub="projects unlocked"
      />
    )
  ].filter(Boolean);

  if (widgets.length === 0) return null;

  return <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">{widgets}</div>;
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

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Organizations" value={String(data?.orgs ?? 0)} sub={`${data?.activeOrgs ?? 0} active`} />
      <StatCard label="Projects" value={String(data?.projects ?? 0)} />
      <StatCard label="Donation volume" value={formatUsd(data?.raisedCents ?? 0)} sub="platform-wide" />
      <StatCard label="Pending approvals" value="—" sub="see queue below" />
    </div>
  );
}
