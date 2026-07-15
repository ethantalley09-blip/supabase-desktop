import { Scale, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { useDonationTotal } from '@/features/fundraising/useFundraising';
import { useQuickInsight } from '@/lib/ai/useQuickInsight';
import { computeMoneyGap } from './competeMath';

// Public filing comparison: opponent totals are PUBLIC RECORD (fec.gov or
// the state portal) — staff type the number in, we compare against our real
// raised total. Pure math, works with zero AI setup; an optional one-line
// strategic read layers on top once ai_module is on.
export function FilingGap({ orgId, projectId, aiEnabled }: { orgId?: string; projectId: string; aiEnabled?: boolean }) {
  const { data: ourTotalCents } = useDonationTotal(projectId);
  const [theirs, setTheirs] = useState('');
  const [ourOverride, setOurOverride] = useState('');

  const ours = ourOverride ? Math.round(Number(ourOverride) * 100) : (ourTotalCents ?? 0);
  const gap = useMemo(
    () => (Number(theirs) > 0 || ours > 0 ? computeMoneyGap(ours, Math.round(Number(theirs || 0) * 100)) : null),
    [ours, theirs]
  );

  const read = useQuickInsight({
    orgId,
    projectId,
    framing: 'Our fundraising total vs. the opponent\'s public filing total — strategic, competitive tone',
    data: gap,
    enabled: Boolean(aiEnabled) && gap !== null && theirs !== ''
  });

  const fmt = (c: number) => `$${Math.round(c / 100).toLocaleString()}`;

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Scale className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Filing gap</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Campaign finance filings are public record. Look up the opponent's latest total on fec.gov
        (or your state portal), type it in, and see where you stand against your real raised total.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-700">Their filed total ($)</label>
          <Input type="number" className="w-36" placeholder="e.g. 48000" value={theirs} onChange={(e) => setTheirs(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-700">Our total (auto)</label>
          <Input
            type="number"
            className="w-36"
            placeholder={ourTotalCents ? String(Math.round(ourTotalCents / 100)) : 'enter ours'}
            value={ourOverride}
            onChange={(e) => setOurOverride(e.target.value)}
          />
        </div>
      </div>

      {gap && Number(theirs) >= 0 && theirs !== '' && (
        <div
          className={`rounded-md border-l-4 p-3 text-sm ${
            gap.leader === 'us'
              ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
              : gap.leader === 'them'
                ? 'border-amber-500 bg-amber-50 text-amber-900'
                : 'border-neutral-400 bg-neutral-50 text-neutral-800'
          }`}
        >
          {gap.leader === 'tied' ? (
            <span className="font-semibold">Dead even at {fmt(ours)}.</span>
          ) : (
            <>
              <span className="font-semibold">
                {gap.leader === 'us' ? 'You lead' : 'They lead'} by {fmt(gap.gapCents)}.
              </span>{' '}
              {fmt(ours)} raised vs. their {fmt(Math.round(Number(theirs) * 100))}
              {gap.ratio !== null && <> — you've raised {gap.ratio}x their total.</>}
              {gap.leader === 'them' && (
                <> Try Funding Runway and the Emergency Ask on the Fundraising tab to close it.</>
              )}
            </>
          )}
          {read.data && (
            <p className="mt-2 flex items-start gap-1.5 border-t border-current/20 pt-2 text-xs opacity-90">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              {read.data}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
