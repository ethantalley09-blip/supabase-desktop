import { ScanSearch, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOpponentDigest, type OpponentRecord } from './useCompete';

// Message Radar: one click digests the whole opponent log into themes,
// message drift over time, and what they are visibly NOT talking about
// (often the best ground to own). Analysis only — no attack copy here.
export function OpponentDigest({
  orgId,
  projectId,
  records
}: {
  orgId: string;
  projectId: string;
  records: OpponentRecord[] | undefined;
}) {
  const digest = useOpponentDigest();
  const enough = (records?.length ?? 0) >= 3;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ScanSearch className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Message Radar</h3>
      </div>
      <p className="text-xs text-neutral-500">
        One click reads your whole opponent log and reports their message themes, how their pitch
        has shifted over time, and the issues they're avoiding — often your best ground to own.
      </p>

      <Button
        size="sm"
        onClick={() => records && digest.mutate({ orgId, projectId, records })}
        disabled={digest.isPending || !enough}
      >
        <Sparkles className="h-4 w-4" />
        {digest.isPending ? 'Analyzing…' : enough ? 'Analyze their messaging' : 'Log at least 3 entries first'}
      </Button>
      {digest.isError && <p className="text-sm text-red-600">{(digest.error as Error).message}</p>}

      {digest.data && (
        <div className="space-y-2">
          {digest.data.themes.map((t) => (
            <div key={t.theme} className="rounded-md bg-neutral-50 p-3">
              <p className="text-xs font-semibold text-neutral-800">
                {t.theme} <span className="font-normal text-neutral-400">({t.evidence_count} entries)</span>
              </p>
              <p className="text-xs text-neutral-600">{t.summary}</p>
            </div>
          ))}
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Message shift</p>
            <p className="text-xs text-neutral-700">{digest.data.shift}</p>
          </div>
          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">What they're not talking about</p>
            <p className="text-xs text-neutral-700">{digest.data.gaps}</p>
          </div>
        </div>
      )}
    </div>
  );
}
