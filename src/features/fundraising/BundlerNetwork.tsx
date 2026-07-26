import { Sparkles, Users2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { findBundlerClusters, type BundlerCluster } from './bundlerNetworkMath';
import { formatUsd, type Donation, type Donor } from './useFundraising';
import { useBundlerCultivationAsk } from './useFundraisingAi';

type CultivationAsk = { ask_message: string; suggested_event_idea: string };

// Bundler Network Detector: real donors sharing a real employer
// (donors.employer) who have ALL actually given form an informal network —
// something no pure payment processor can see, since it only ever looks at
// one transaction at a time. Only surfaces once at least two real coworkers
// have both given (bundlerNetwork.ts); the AI only drafts the cultivation
// ask to the cluster's own highest real giver.
export function BundlerNetwork({
  orgId,
  projectId,
  donors,
  donations
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
  donations: Donation[] | undefined;
}) {
  const ai = useBundlerCultivationAsk();
  const [askFor, setAskFor] = useState<string | null>(null);
  const [ask, setAsk] = useState<CultivationAsk | null>(null);

  const clusters = useMemo(() => findBundlerClusters(donors ?? [], donations ?? []), [donors, donations]);

  const getCultivationAsk = (cluster: BundlerCluster) => {
    setAskFor(cluster.employer);
    setAsk(null);
    ai.mutate(
      {
        orgId,
        projectId,
        employer: cluster.employer,
        anchorDonorName: cluster.anchorDonorName,
        donorCount: cluster.donorCount,
        totalCents: cluster.totalCents
      },
      { onSuccess: (res) => setAsk(res) }
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Users2 className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Bundler Network Detector</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Real coworkers at the same employer who have all independently given form an informal
        bundler network — something a plain payment processor can't see since it only ever looks
        at one transaction at a time. Ask the group's own highest real giver to formally cultivate it.
      </p>

      {clusters.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No employer cluster yet — appears once two or more real donors at the same employer have
          both given.
        </p>
      ) : (
        <div className="space-y-2">
          {clusters.slice(0, 5).map((cluster) => (
            <div key={cluster.employer} className="rounded-md border border-violet-100 bg-violet-50 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium text-neutral-900">
                  {cluster.employer}: {cluster.donorCount} real givers, {formatUsd(cluster.totalCents)} total
                </p>
                <Button size="sm" variant="outline" onClick={() => getCultivationAsk(cluster)} disabled={ai.isPending}>
                  <Sparkles className="h-3.5 w-3.5" />
                  {ai.isPending && askFor === cluster.employer ? '…' : 'Get cultivation ask'}
                </Button>
              </div>
              <p className="text-neutral-600">
                Top giver: {cluster.anchorDonorName} ({formatUsd(cluster.anchorDonorCents)})
              </p>
              {ask && askFor === cluster.employer && (
                <div className="mt-1.5 space-y-1 rounded bg-white p-2 text-neutral-700">
                  <p>{ask.ask_message}</p>
                  <p className="text-violet-700">→ {ask.suggested_event_idea}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {ai.isError && <p className="text-sm text-red-600">{(ai.error as Error).message}</p>}
    </div>
  );
}
