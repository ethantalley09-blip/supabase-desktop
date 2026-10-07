import { CalendarClock, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatUsd } from './useFundraising';
import { useBuildSprintPlan } from './useFundraisingAi';
// Every campaign lives and dies by the FEC filing-deadline spike. Builds a
// day-by-day plan (which segment, which ask theme) to hit the goal by then —
// the single biggest predictable revenue event in any cycle.
export function SprintPlanner({ orgId, projectId, currentTotalCents }) {
    const buildPlan = useBuildSprintPlan();
    const [deadlineDate, setDeadlineDate] = useState('');
    const [goal, setGoal] = useState('');
    const run = async () => {
        if (!deadlineDate || !goal)
            return;
        await buildPlan.mutateAsync({
            orgId,
            projectId,
            deadlineDate,
            currentPaceCents: currentTotalCents,
            goalCents: Math.round(Number(goal) * 100)
        });
    };
    return (<div className="space-y-3 rounded-lg border border-sky-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-sky-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">FEC Deadline Sprint Planner</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Builds a day-by-day plan to hit your filing-deadline goal — which segment to email which
        day, and the ask theme for each.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Filing deadline</Label>
          <Input type="date" value={deadlineDate} onChange={(e) => setDeadlineDate(e.target.value)}/>
        </div>
        <div className="space-y-1.5">
          <Label>Goal (USD)</Label>
          <Input type="number" placeholder="10000" value={goal} onChange={(e) => setGoal(e.target.value)}/>
        </div>
      </div>

      <Button size="sm" onClick={run} disabled={buildPlan.isPending || !deadlineDate || !goal}>
        <Sparkles className="h-4 w-4"/>
        {buildPlan.isPending ? 'Planning…' : 'Build Sprint Plan'}
      </Button>
      {buildPlan.isError && <p className="text-sm text-red-600">{buildPlan.error.message}</p>}

      {buildPlan.data && (<div className="space-y-2">
          <p className="text-sm font-medium text-neutral-900">{buildPlan.data.pace_assessment}</p>
          <p className="text-xs text-neutral-500">
            Current: {formatUsd(currentTotalCents)} / Goal: {formatUsd(Math.round(Number(goal) * 100))}
          </p>
          <div className="divide-y divide-sky-100 rounded-md border border-sky-100">
            {buildPlan.data.daily_plan.map((d, i) => (<div key={i} className="p-2.5 text-sm">
                <p className="font-medium text-neutral-900">{d.day}</p>
                <p className="text-xs text-neutral-600">
                  {d.segment} — <span className="italic">{d.ask_theme}</span>
                </p>
              </div>))}
          </div>
        </div>)}
    </div>);
}
