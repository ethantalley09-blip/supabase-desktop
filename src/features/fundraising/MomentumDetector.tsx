import { Flame, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Donation } from './useFundraising';
import { useDetectMomentum } from './useFundraisingAi';

// Detects a REAL donation-velocity spike (computed from actual recent
// donations vs. baseline — not fabricated urgency) and drafts a rapid-response
// ask to capitalize while attention is genuinely high (debate night, viral
// moment, news hit).
export function MomentumDetector({
  orgId,
  projectId,
  donations
}: {
  orgId: string;
  projectId: string;
  donations: Donation[] | undefined;
}) {
  const detect = useDetectMomentum();
  const [trigger, setTrigger] = useState('');

  const stats = useMemo(() => {
    if (!donations || donations.length === 0) return null;
    const now = Date.now();
    const windowMinutes = 60;
    const windowMs = windowMinutes * 60_000;
    const recent = donations.filter((d) => now - new Date(d.donated_at).getTime() <= windowMs);
    const olderWindows = donations.filter((d) => {
      const age = now - new Date(d.donated_at).getTime();
      return age > windowMs && age <= windowMs * 24; // prior 24 windows as baseline
    });
    const recentTotal = recent.reduce((s, d) => s + d.amount_cents, 0);
    const baselineAvg =
      olderWindows.length > 0
        ? Math.round(olderWindows.reduce((s, d) => s + d.amount_cents, 0) / 24)
        : recentTotal || 1;
    return { windowMinutes, donationCount: recent.length, donationTotalCents: recentTotal, baselineAvgCents: baselineAvg };
  }, [donations]);

  const run = async () => {
    if (!stats) return;
    await detect.mutateAsync({
      orgId,
      projectId,
      windowMinutes: stats.windowMinutes,
      donationCount: stats.donationCount,
      donationTotalCents: stats.donationTotalCents,
      baselineAvgCents: stats.baselineAvgCents,
      trigger: trigger.trim() || undefined
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Flame className="h-4 w-4 text-red-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Fundraising Momentum Detector</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Checks your actual last-hour donation velocity against your own baseline. If it's a real
        spike (debate, viral moment, news hit), drafts a rapid-response ask while it's happening —
        never fabricated urgency, only your real numbers.
      </p>

      {stats && (
        <p className="text-xs text-neutral-600">
          Last {stats.windowMinutes} min: {stats.donationCount} gift{stats.donationCount === 1 ? '' : 's'}, $
          {(stats.donationTotalCents / 100).toLocaleString()} vs. typical $
          {(stats.baselineAvgCents / 100).toLocaleString()}/hr
        </p>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="What's happening right now? (optional, e.g. 'just went viral after the debate')"
          value={trigger}
          onChange={(e) => setTrigger(e.target.value)}
        />
        <Button size="sm" onClick={run} disabled={detect.isPending || !stats}>
          <Sparkles className="h-4 w-4" />
          {detect.isPending ? 'Checking…' : 'Check Momentum'}
        </Button>
      </div>
      {detect.isError && <p className="text-sm text-red-600">{(detect.error as Error).message}</p>}

      {detect.data && (
        <div
          className={`rounded-md border p-3 ${
            detect.data.spikeMultiplier >= 2 ? 'border-red-200 bg-red-50' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <p className="text-sm font-semibold text-neutral-900">
            {detect.data.spikeMultiplier >= 2
              ? `${detect.data.spikeMultiplier.toFixed(1)}x normal pace — strike now`
              : `${detect.data.spikeMultiplier.toFixed(1)}x normal pace`}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{detect.data.message}</p>
          <p className="mt-1 text-xs text-neutral-500">Send to: {detect.data.suggested_segment}</p>
        </div>
      )}
    </div>
  );
}
