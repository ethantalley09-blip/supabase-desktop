import { AlertTriangle, ShieldAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { findDonorsNearLimit, findEmployerClustersNearLimit } from './contributionLimitMath';
import { formatUsd, type Donation, type Donor } from './useFundraising';

// Contribution Limit Guardian: a deliberately AI-free safety net (this
// domain stays AI-free for legal-risk reasons, the same rule as the
// Compliance tab) that flags a real donor or real employer cluster
// approaching a STAFF-ENTERED dollar threshold — never a number this app
// asserts as the actual legal limit. Pure running-total math only; the
// limit input is a session-local number, same lightweight pattern as the
// Election Countdown date field elsewhere in this app.
export function ContributionLimitGuardian({
  donors,
  donations
}: {
  donors: Donor[] | undefined;
  donations: Donation[] | undefined;
}) {
  const [limitInput, setLimitInput] = useState('');
  const limitCents = Number(limitInput) > 0 ? Math.round(Number(limitInput) * 100) : 0;

  const donorAlerts = useMemo(() => findDonorsNearLimit(donors ?? [], donations ?? [], limitCents), [donors, donations, limitCents]);
  const employerAlerts = useMemo(
    () => findEmployerClustersNearLimit(donors ?? [], donations ?? [], limitCents),
    [donors, donations, limitCents]
  );

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-slate-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Contribution Limit Guardian</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Tracks real cumulative giving per donor and per employer cluster against a limit you enter
        — a running-total safety net, not a legal determination.
      </p>

      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
        <div className="text-xs text-amber-900">
          <p className="font-medium">Not legal or FEC advice</p>
          <p className="mt-0.5 text-amber-800">
            This is a configuration-driven running total against whatever number you enter below,
            not a compliance filing tool. Legal counsel must verify actual contribution limits and
            any required filings — including whether donors sharing an employer are legally
            affiliated for aggregation purposes, which this app has no way to determine on its own.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-neutral-500">Limit per donor $</span>
        <Input
          type="number"
          min="1"
          step="1"
          className="h-9 w-32"
          placeholder="e.g. 3300"
          value={limitInput}
          onChange={(e) => setLimitInput(e.target.value)}
        />
      </div>

      {limitCents <= 0 ? (
        <p className="text-sm text-neutral-500">Enter a limit to see real donors/clusters approaching it.</p>
      ) : (
        <>
          <div className="space-y-1 text-xs text-neutral-700">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Individual donors</p>
            {donorAlerts.length === 0 ? (
              <p className="text-neutral-500">No real donor is within 80% of this limit yet.</p>
            ) : (
              donorAlerts.map((a) => (
                <p key={a.donorId} className={a.pctOfLimit >= 100 ? 'font-medium text-red-700' : ''}>
                  {a.name}: {formatUsd(a.totalCents)} ({a.pctOfLimit}% of {formatUsd(a.limitCents)})
                </p>
              ))
            )}
          </div>
          <div className="space-y-1 text-xs text-neutral-700">
            <p className="font-semibold uppercase tracking-wide text-slate-500">Employer clusters (informal, for review only)</p>
            {employerAlerts.length === 0 ? (
              <p className="text-neutral-500">No real employer cluster is within 80% of this limit yet.</p>
            ) : (
              employerAlerts.map((a) => (
                <p key={a.employer} className={a.pctOfLimit >= 100 ? 'font-medium text-red-700' : ''}>
                  {a.employer}: {formatUsd(a.totalCents)} across {a.donorCount} real donors ({a.pctOfLimit}% of{' '}
                  {formatUsd(a.limitCents)})
                </p>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
