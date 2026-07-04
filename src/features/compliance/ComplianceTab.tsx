import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { AlertTriangle } from 'lucide-react';
import type { Project } from '@/features/projects/useProjects';
import { supabase } from '@/lib/supabase/client';
import { PeriodReport } from './PeriodReport';

type Ruleset = {
  id: string;
  org_type: string;
  jurisdiction: string;
  ruleset: Record<string, unknown>;
  reviewed_by_counsel: boolean;
};

export function ComplianceTab({ project }: { project: Project }) {
  const { data: org } = useQuery({
    queryKey: ['org-type', project.org_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('org_type')
        .eq('id', project.org_id)
        .single();
      if (error) throw error;
      return data;
    }
  });
  const orgType = org?.org_type ?? '';

  const { data: status } = useQuery({
    queryKey: ['compliance-status', project.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compliance_status')
        .select('*')
        .eq('project_id', project.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    }
  });

  const { data: rulesets } = useQuery({
    queryKey: ['compliance-rulesets', orgType, project.state],
    queryFn: async () => {
      const jurisdictions = ['federal', ...(project.state ? [project.state] : [])];
      const { data, error } = await supabase
        .from('compliance_rulesets')
        .select('*')
        .eq('org_type', orgType)
        .in('jurisdiction', jurisdictions);
      if (error) throw error;
      return data as Ruleset[];
    },
    enabled: Boolean(orgType)
  });

  const federal = rulesets?.find((r) => r.jurisdiction === 'federal');
  const state = rulesets?.find((r) => r.jurisdiction !== 'federal');

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="text-sm text-amber-900">
          <p className="font-medium">Not legal advice</p>
          <p className="mt-0.5 text-amber-800">
            These rulesets are configuration defaults, not filing automation. Legal counsel must
            review and validate all compliance logic before relying on it for actual FEC or state
            filings.
          </p>
        </div>
      </div>

      {status?.threshold_met_at && (
        <p className="text-sm text-neutral-500">
          Compliance tools unlocked {format(new Date(status.threshold_met_at), 'PPp')} — this project
          crossed $1,000 in lifetime donations.
        </p>
      )}

      <PeriodReport
        project={project}
        itemizationThresholdCents={
          typeof federal?.ruleset?.['itemization_threshold_cents'] === 'number'
            ? (federal.ruleset['itemization_threshold_cents'] as number)
            : null
        }
      />

      <RulesetCard
        title="Federal ruleset"
        ruleset={federal ?? null}
        emptyNote="No federal ruleset seeded for this organization type."
      />
      <RulesetCard
        title={project.state ? `State ruleset — ${project.state}` : 'State ruleset'}
        ruleset={state ?? null}
        emptyNote={
          project.state
            ? `No ${project.state} ruleset configured yet. State-level rules must be added and validated by counsel.`
            : 'This project has no state set, so no state-level ruleset applies.'
        }
      />
    </div>
  );
}

function RulesetCard({
  title,
  ruleset,
  emptyNote
}: {
  title: string;
  ruleset: Ruleset | null;
  emptyNote: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
        {ruleset && (
          <span
            className={
              ruleset.reviewed_by_counsel
                ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700'
                : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700'
            }
          >
            {ruleset.reviewed_by_counsel ? 'Counsel reviewed' : 'Awaiting counsel review'}
          </span>
        )}
      </div>
      {ruleset ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          {Object.entries(ruleset.ruleset).map(([key, value]) => (
            <div key={key} className="flex gap-3">
              <dt className="w-64 shrink-0 text-neutral-400">{key}</dt>
              <dd className="text-neutral-800">
                {Array.isArray(value) ? value.join(', ') : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-neutral-400">{emptyNote}</p>
      )}
    </div>
  );
}
