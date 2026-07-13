import { ShieldAlert, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCheckFatigue } from './useFundraisingAi';

// Flags donors at risk of unsubscribing/complaining before the next send —
// prevents list burnout, the biggest silent revenue leak in mass fundraising.
export function FatigueGuard({ orgId, projectId }: { orgId: string; projectId: string }) {
  const checkFatigue = useCheckFatigue();
  const [sendsLast30d, setSendsLast30d] = useState('8');
  const [openRateTrend, setOpenRateTrend] = useState('dropped from 45% to 22% over last 5 sends');

  const run = () => {
    const sendHistory = JSON.stringify({
      sends_last_30d: Number(sendsLast30d) || 0,
      open_rate_trend: openRateTrend
    });
    checkFatigue.mutate({ orgId, projectId, sendHistory });
  };

  return (
    <div className="space-y-3 rounded-lg border border-orange-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Fundraising Email Fatigue Guard</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Checks send frequency vs. engagement trend before your next blast, so you don't burn the
        list chasing a single email's revenue.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-neutral-500">Sends in last 30 days</label>
          <Input type="number" value={sendsLast30d} onChange={(e) => setSendsLast30d(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-neutral-500">Engagement trend</label>
          <Input value={openRateTrend} onChange={(e) => setOpenRateTrend(e.target.value)} />
        </div>
      </div>

      <Button size="sm" onClick={run} disabled={checkFatigue.isPending}>
        <Sparkles className="h-4 w-4" />
        {checkFatigue.isPending ? 'Checking…' : 'Check Before Sending'}
      </Button>
      {checkFatigue.isError && <p className="text-sm text-red-600">{(checkFatigue.error as Error).message}</p>}

      {checkFatigue.data && (
        <div
          className={`rounded-md border p-3 text-sm ${
            checkFatigue.data.fatigue_risk_score > 0.6
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          <p className="font-medium">Fatigue risk: {(checkFatigue.data.fatigue_risk_score * 100).toFixed(0)}%</p>
          <p className="mt-1 text-xs">{checkFatigue.data.recommendation}</p>
        </div>
      )}
    </div>
  );
}
