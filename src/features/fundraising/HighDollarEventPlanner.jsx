import { CalendarHeart, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { buildEventPlan } from './eventPlanner';
import { formatUsd } from './useFundraising';
import { useEventPlanningBriefing } from './useFundraisingAi';
// High-Dollar Event Planner: a real, ranked invite list built from actual
// lifetime giving (never a purchased wealth-screening guess), with an
// honest realistic dollar range anchored to each invitee's own real largest
// gift to date — replaces the spreadsheet-and-gut-feel process most
// campaigns use to plan a fundraising event. The target amount is a
// session-local input, same lightweight pattern as the Election Countdown
// date field elsewhere in this app — not persisted server-side.
export function HighDollarEventPlanner({ orgId, projectId, donors, donations }) {
    const ai = useEventPlanningBriefing();
    const [targetInput, setTargetInput] = useState('');
    const [briefing, setBriefing] = useState(null);
    const plan = useMemo(() => buildEventPlan(donors ?? [], donations ?? []), [donors, donations]);
    const targetCents = Number(targetInput) > 0 ? Math.round(Number(targetInput) * 100) : 0;
    const getBriefing = () => {
        if (plan.invitees.length === 0)
            return;
        setBriefing(null);
        ai.mutate({
            orgId,
            projectId,
            targetCents,
            invitees: plan.invitees,
            realisticLowCents: plan.realisticLowCents,
            realisticHighCents: plan.realisticHighCents
        }, { onSuccess: (res) => setBriefing(res) });
    };
    return (<div className="space-y-3 rounded-lg border border-rose-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarHeart className="h-4 w-4 text-rose-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">High-Dollar Event Planner</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Ranks real prior donors by real lifetime giving into an invite list, with an honest
        realistic dollar range anchored to each donor's own real largest gift — not a guess.
      </p>

      {plan.invitees.length === 0 ? (<p className="text-sm text-neutral-500">No prior real donors yet to build an invite list from.</p>) : (<>
          <div className="rounded-md border border-rose-100 bg-rose-50 p-3 text-xs text-neutral-700">
            <p className="font-medium text-neutral-900">
              Realistic range: {formatUsd(plan.realisticLowCents)} – {formatUsd(plan.realisticHighCents)} from{' '}
              {plan.invitees.length} real invitee{plan.invitees.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-1 space-y-0.5">
              {plan.invitees.slice(0, 8).map((i) => (<li key={i.donorId}>
                  {i.name}: {formatUsd(i.totalGivenCents)} lifetime — suggested ask {formatUsd(i.suggestedAskCents)}
                </li>))}
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">$</span>
            <Input type="number" min="1" step="1" className="h-9 w-32" placeholder="Event target" value={targetInput} onChange={(e) => setTargetInput(e.target.value)}/>
            <Button size="sm" onClick={getBriefing} disabled={ai.isPending || targetCents <= 0}>
              <Sparkles className="h-3.5 w-3.5"/>
              {ai.isPending ? '…' : 'Get event briefing'}
            </Button>
          </div>
          {ai.isError && <p className="text-sm text-red-600">{ai.error.message}</p>}
          {briefing && (<div className="space-y-1 rounded bg-rose-50 p-3 text-xs text-neutral-700">
              <p className="font-medium text-neutral-900">{briefing.headline}</p>
              <p className="text-rose-700">{briefing.gap_assessment}</p>
              {briefing.priority_calls.length > 0 && (<p>Call first: {briefing.priority_calls.join(', ')}</p>)}
            </div>)}
        </>)}
    </div>);
}
