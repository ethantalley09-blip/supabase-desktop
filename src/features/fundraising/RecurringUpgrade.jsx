import { Gift, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraftRecurringUpgrade } from './useFundraisingAi';
// Subscription-anniversary style upsell — a proven SaaS retention tactic that
// political fundraising rarely uses. Donors on a flat $10/mo for 2 years are a
// warm upgrade target most campaigns never systematically ask.
export function RecurringUpgrade({ orgId, projectId, donors }) {
    const draft = useDraftRecurringUpgrade();
    const [donorId, setDonorId] = useState('');
    const [months, setMonths] = useState('18');
    const [monthly, setMonthly] = useState('10');
    const run = async () => {
        if (!donorId)
            return;
        await draft.mutateAsync({
            orgId,
            projectId,
            donorId,
            monthsActive: Number(months) || 0,
            currentMonthlyCents: Math.round(Number(monthly) * 100)
        });
    };
    return (<div className="space-y-3 rounded-lg border border-lime-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Gift className="h-4 w-4 text-lime-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Recurring Donor Upgrade (Anniversary Ask)</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Celebrates a long-time recurring donor's tenure first, then makes a modest, optional ask to
        increase their monthly gift — timed like a subscription anniversary, not a hard sell.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <select className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm" value={donorId} onChange={(e) => setDonorId(e.target.value)}>
          <option value="">Select recurring donor…</option>
          {donors?.map((d) => (<option key={d.id} value={d.id}>
              {d.full_name}
            </option>))}
        </select>
        <div className="w-28">
          <label className="text-xs text-neutral-500">Months active</label>
          <Input type="number" value={months} onChange={(e) => setMonths(e.target.value)}/>
        </div>
        <div className="w-28">
          <label className="text-xs text-neutral-500">Current $/mo</label>
          <Input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)}/>
        </div>
        <Button size="sm" onClick={run} disabled={draft.isPending || !donorId}>
          <Sparkles className="h-4 w-4"/>
          {draft.isPending ? 'Drafting…' : 'Draft Ask'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {draft.data && (<div className="rounded-md border border-lime-100 bg-lime-50 p-3">
          <p className="text-sm font-semibold text-neutral-900">
            Suggested: ${(draft.data.suggested_monthly_cents / 100).toFixed(2)}/mo
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{draft.data.message}</p>
        </div>)}
    </div>);
}
