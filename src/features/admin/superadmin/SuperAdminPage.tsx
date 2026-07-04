import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { PlatformMetrics } from '@/features/dashboard/widgets';
import { cn } from '@/lib/utils';
import {
  useActivateOrg,
  useAllOrganizations,
  useOrgEntitlements,
  useSetEntitlement,
  type OrgWithCreator
} from './useAdminData';

// Org-level toggles the fake billing console exposes. Project-scoped keys
// (fundraising_module) are granted from project creation, and threshold keys
// (compliance_module) are system-granted -- both still show in the list below
// once they exist, they just aren't offered as manual org-level toggles.
const ORG_ENTITLEMENT_KEYS = ['org_active', 'comms_paid_tier', 'hr_module', 'payroll_module'];

export function SuperAdminPage() {
  const { data: orgs, isLoading, error } = useAllOrganizations();
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);

  const pending = orgs?.filter((o) => o.status === 'pending_payment') ?? [];
  const rest = orgs?.filter((o) => o.status !== 'pending_payment') ?? [];
  const selectedOrg = orgs?.find((o) => o.id === selectedOrgId) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">SuperAdmin</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Org approval queue and entitlement management. This console stands in for billing until a
          payment processor is connected.
        </p>
      </div>

      <PlatformMetrics />

      {error && <p className="text-sm text-red-600">{(error as Error).message}</p>}
      {isLoading && <p className="text-sm text-neutral-500">Loading organizations…</p>}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Approval queue ({pending.length})
        </h2>
        {pending.length === 0 && (
          <p className="rounded-md border border-dashed border-neutral-300 p-4 text-sm text-neutral-400">
            No organizations awaiting activation.
          </p>
        )}
        <div className="space-y-3">
          {pending.map((org) => (
            <PendingOrgCard key={org.id} org={org} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          All organizations
        </h2>
        <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created by</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rest.map((org) => (
                <tr key={org.id} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium text-neutral-900">{org.name}</td>
                  <td className="px-4 py-2 text-neutral-500">{org.org_type}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        org.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-neutral-100 text-neutral-600'
                      )}
                    >
                      {org.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{org.profiles?.email ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedOrgId(org.id === selectedOrgId ? null : org.id)}
                    >
                      {org.id === selectedOrgId ? 'Close' : 'Entitlements'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedOrg && <EntitlementManager org={selectedOrg} />}
    </div>
  );
}

function PendingOrgCard({ org }: { org: OrgWithCreator }) {
  const activateOrg = useActivateOrg();
  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
      <div>
        <p className="font-medium text-neutral-900">{org.name}</p>
        <p className="text-xs text-neutral-500">
          {org.org_type} · requested by {org.profiles?.email ?? 'unknown'}
          {org.state_of_registration ? ` · ${org.state_of_registration}` : ''}
        </p>
      </div>
      <Button size="sm" onClick={() => activateOrg.mutate(org.id)} disabled={activateOrg.isPending}>
        {activateOrg.isPending ? 'Activating…' : 'Activate'}
      </Button>
      {activateOrg.isError && (
        <p className="text-xs text-red-600">{(activateOrg.error as Error).message}</p>
      )}
    </div>
  );
}

function EntitlementManager({ org }: { org: OrgWithCreator }) {
  const { data: entitlements } = useOrgEntitlements(org.id);
  const setEntitlement = useSetEntitlement();

  const orgLevel = entitlements?.filter((e) => e.project_id === null) ?? [];
  const projectLevel = entitlements?.filter((e) => e.project_id !== null) ?? [];

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Entitlements — {org.name}</h2>

      <div className="mt-4 space-y-2">
        {ORG_ENTITLEMENT_KEYS.map((key) => {
          const existing = orgLevel.find((e) => e.key === key);
          const granted = existing?.granted ?? false;
          return (
            <div
              key={key}
              className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2"
            >
              <div>
                <code className="text-sm text-neutral-800">{key}</code>
                {existing && (
                  <span className="ml-2 text-xs text-neutral-400">({existing.granted_reason})</span>
                )}
              </div>
              <Button
                variant={granted ? 'destructive' : 'default'}
                size="sm"
                disabled={setEntitlement.isPending}
                onClick={() =>
                  setEntitlement.mutate({
                    orgId: org.id,
                    key,
                    granted: !granted,
                    existingId: existing?.id
                  })
                }
              >
                {granted ? 'Revoke' : 'Grant'}
              </Button>
            </div>
          );
        })}
      </div>

      {projectLevel.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Project-scoped
          </h3>
          <ul className="mt-2 space-y-1 text-sm text-neutral-600">
            {projectLevel.map((e) => (
              <li key={e.id}>
                <code>{e.key}</code> · project {e.project_id} · {e.granted ? 'granted' : 'revoked'} (
                {e.granted_reason})
              </li>
            ))}
          </ul>
        </div>
      )}

      {setEntitlement.isError && (
        <p className="mt-3 text-sm text-red-600">{(setEntitlement.error as Error).message}</p>
      )}
    </section>
  );
}
