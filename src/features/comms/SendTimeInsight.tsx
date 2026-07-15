import { Clock, Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import type { Donation } from '@/features/fundraising/useFundraising';
import { useQuickInsight } from '@/lib/ai/useQuickInsight';
import { computeSendTimeInsights } from './sendTime';

// Send-Time Insight: no AI call for the number itself — instant math on the
// campaign's OWN donation timestamps, which stays true even with AI layered
// on top (see below). Competitors sell generic "best time to email" advice
// from industry averages; this is your actual supporters' behavior.
export function SendTimeInsight({
  donations,
  orgId,
  projectId,
  aiEnabled
}: {
  donations: Donation[] | undefined;
  orgId?: string;
  projectId?: string;
  aiEnabled?: boolean;
}) {
  const insight = useMemo(() => computeSendTimeInsights(donations ?? []), [donations]);
  const max = insight ? Math.max(...insight.hourlyCounts, 1) : 1;

  // Passive enhancement: the exact best-hour/day above is already computed
  // and rendered before this ever resolves. One extra sentence of practical
  // framing, never a replacement for the math.
  const tip = useQuickInsight({
    orgId,
    projectId,
    framing: 'Best-time-to-send scheduling insight for a political campaign — practical, actionable tone',
    data: insight,
    enabled: Boolean(aiEnabled && insight)
  });

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-neutral-700" />
        <h3 className="text-sm font-semibold text-neutral-900">Send-Time Insight</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Computed straight from when your own supporters actually give — not generic industry
        advice. Updates instantly as more gifts come in.
      </p>

      {!insight ? (
        <p className="text-sm text-neutral-500">
          Not enough donation history yet — this activates automatically once you have a few gifts
          on record.
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-800">
            Your supporters are most active <span className="font-semibold">{insight.bestDay}s around {insight.bestHourLabel}</span>{' '}
            — a good window for sends. <span className="text-neutral-400">({insight.sampleSize} gifts analyzed)</span>
          </p>
          <div className="flex h-16 items-end gap-0.5" role="img" aria-label="Donations by hour of day">
            {insight.hourlyCounts.map((c, h) => (
              <div
                key={h}
                title={`${h}:00 — ${c} gift${c === 1 ? '' : 's'}`}
                className={`flex-1 rounded-t ${h === insight.bestHour ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                style={{ height: `${Math.max(4, (c / max) * 100)}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-neutral-400">
            <span>12 AM</span>
            <span>12 PM</span>
            <span>11 PM</span>
          </div>
          {tip.data && (
            <p className="flex items-start gap-1.5 border-t border-neutral-100 pt-2 text-xs text-violet-700">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              {tip.data}
            </p>
          )}
        </>
      )}
    </div>
  );
}
