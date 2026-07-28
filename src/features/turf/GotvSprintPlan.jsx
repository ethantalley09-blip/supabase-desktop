import { CalendarClock, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrgMembersForBridge } from '@/features/fundraising/useFundraisingAi';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
function useGotvSprintPlan() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'gotv_sprint_plan',
                context: JSON.stringify(input.context)
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the GOTV plan');
            return parsed;
        }
    });
}
function daysUntil(dateStr) {
    const target = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((target.getTime() - today.getTime()) / 86_400_000));
}
// GOTV Countdown Planner: the turnout-operations analog of the Fundraising
// tab's FEC Sprint Planner. The final stretch before election day is the
// highest-stakes, most chaotic window of any campaign, and nothing in Lynx
// planned it until now. Real inputs only: staff provide the actual election
// date, everything else is computed from real ballot/contact-status counts
// already on voter_records and the real active roster size.
export function GotvSprintPlan({ orgId, projectId, voters }) {
    const { data: members } = useOrgMembersForBridge(orgId);
    const plan = useGotvSprintPlan();
    const [electionDate, setElectionDate] = useState('');
    const counts = useMemo(() => {
        const active = voters.filter((v) => v.contact_status === 'active');
        return {
            totalVoters: voters.length,
            contactable: active.length,
            ballotsRequested: voters.filter((v) => v.ballot_status === 'requested').length,
            ballotsReturned: voters.filter((v) => v.ballot_status === 'returned').length,
            ballotsOutstanding: voters.filter((v) => v.ballot_status === 'requested').length - voters.filter((v) => v.ballot_status === 'returned').length
        };
    }, [voters]);
    const days = electionDate ? daysUntil(electionDate) : null;
    const run = () => {
        if (!electionDate || days === null)
            return;
        plan.mutate({
            orgId,
            projectId,
            context: {
                days_remaining: days,
                election_date: electionDate,
                total_voters: counts.totalVoters,
                contactable_voters: counts.contactable,
                ballots_outstanding: Math.max(0, counts.ballotsOutstanding),
                ballots_returned: counts.ballotsReturned,
                active_volunteer_count: members?.length ?? 0
            }
        });
    };
    return (<div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-blue-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">GOTV Countdown Planner</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Set the real election date and get a day-by-day turnout operations plan, built from your
        actual ballot-chase status ({Math.max(0, counts.ballotsOutstanding)} outstanding of{' '}
        {counts.ballotsRequested} requested) and {members?.length ?? 0} active team member
        {members?.length === 1 ? '' : 's'}.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" value={electionDate} onChange={(e) => setElectionDate(e.target.value)}/>
        {days !== null && <span className="text-xs text-neutral-400">{days} day{days === 1 ? '' : 's'} out</span>}
        <Button size="sm" onClick={run} disabled={plan.isPending || !electionDate || (days ?? 0) < 1 || (days ?? 0) > 30}>
          <Sparkles className="h-4 w-4"/>
          {plan.isPending ? 'Building…' : 'Build the plan'}
        </Button>
      </div>
      {days !== null && days > 30 && (<p className="text-xs text-amber-600">Plans cover up to 30 days out — check back closer to election day.</p>)}
      {plan.isError && <p className="text-sm text-red-600">{plan.error.message}</p>}

      {plan.data && (<div className="space-y-2">
          <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm font-medium text-blue-900">
            Today's priority: {plan.data.priority_call}
          </p>
          <div className="space-y-1.5">
            {plan.data.daily_plan.map((d, i) => (<div key={i} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs">
                <p className="font-semibold text-neutral-800">{d.day}</p>
                <p className="text-neutral-700">{d.focus}</p>
                <p className="text-neutral-400">{d.volunteer_allocation}</p>
              </div>))}
          </div>
        </div>)}
    </div>);
}
