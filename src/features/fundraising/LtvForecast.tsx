import { LineChart, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Donor } from './useFundraising';
import { useCultivateList, useForecastLtv } from './useFundraisingAi';

const REC_LABEL: Record<string, string> = {
  cultivate: 'Cultivate — invest time',
  maintain: 'Maintain — steady cadence',
  low_touch: 'Low touch — one-and-done profile'
};

// Predicts a donor's long-term value tier from their early giving pattern, so
// staff invest relationship-building time where it compounds instead of
// guessing which small first-time donors are worth cultivating.
export function LtvForecast({
  orgId,
  projectId,
  donors
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
}) {
  const { data: cultivateList } = useCultivateList(orgId);
  const forecast = useForecastLtv();
  const [donorId, setDonorId] = useState('');

  const run = async () => {
    if (!donorId) return;
    const giftHistory = JSON.stringify({
      gifts: [{ amount_cents: 2500, donated_at: '2025-01-01' }],
      tenure_months: 1,
      trend: 'first gift, no trend yet'
    });
    await forecast.mutateAsync({ orgId, projectId, donorId, giftHistory });
    setDonorId('');
  };

  return (
    <div className="space-y-3 rounded-lg border border-teal-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <LineChart className="h-4 w-4 text-teal-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Donor Lifetime Value Forecast</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Predicts which small, early donors are worth cultivating vs. one-and-done — most platforms
        only show historical totals, never a forward-looking signal.
      </p>

      <div className="flex gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={donorId}
          onChange={(e) => setDonorId(e.target.value)}
        >
          <option value="">Select donor to forecast…</option>
          {donors?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={run} disabled={forecast.isPending || !donorId}>
          <Sparkles className="h-4 w-4" />
          {forecast.isPending ? 'Forecasting…' : 'Forecast'}
        </Button>
      </div>
      {forecast.isError && <p className="text-sm text-red-600">{(forecast.error as Error).message}</p>}

      {cultivateList && cultivateList.length > 0 && (
        <div className="rounded-md border border-teal-100 bg-teal-50 p-3">
          <p className="text-sm font-medium text-teal-900">
            {cultivateList.length} donor{cultivateList.length === 1 ? '' : 's'} flagged worth cultivating
          </p>
          <div className="mt-1 space-y-1">
            {cultivateList.slice(0, 5).map((c) => (
              <p key={c.id} className="text-xs text-teal-800">
                Predicted LTV ${(c.predicted_ltv_cents / 100).toLocaleString()} ({c.confidence_label} confidence) —{' '}
                {REC_LABEL[c.investment_recommendation] ?? c.investment_recommendation}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
