import { Activity, CalendarDays, Flag, Target } from 'lucide-react';
import { useMemo, useState } from 'react';
import { formatUsd } from '@/features/fundraising/useFundraising';
import { buildGoalPlan, buildGotvReadiness, buildPulse } from './campaignIntelligence';
export function CampaignCommandCenter({ voters, territories, donations, totalCents }) {
    const [goalDollars, setGoalDollars] = useState(Math.max(1000, Math.ceil((totalCents + 50_000) / 100)));
    const [deadline, setDeadline] = useState(() => {
        const next = new Date();
        next.setDate(next.getDate() + 30);
        return next.toISOString().slice(0, 10);
    });
    const pulse = useMemo(() => buildPulse(voters, territories, donations), [voters, territories, donations]);
    const goal = useMemo(() => buildGoalPlan(totalCents, Math.round(goalDollars * 100), deadline), [totalCents, goalDollars, deadline]);
    const gotv = useMemo(() => buildGotvReadiness(voters, territories), [voters, territories]);
    return <section className="space-y-3">
    <div className="flex items-center gap-2">
      <Activity className="h-5 w-5 text-violet-600"/>
      <h3 className="text-base font-semibold text-neutral-900">Campaign Command Center</h3>
      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Live</span>
    </div>
    <p className="text-sm text-neutral-500">A practical, data-backed view of campaign health, fundraising pace, and turnout readiness.</p>
    <div className="grid gap-3 lg:grid-cols-3">
      <article className="rounded-lg border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><Activity className="h-4 w-4 text-violet-600"/>Campaign Pulse</span><span className="text-xs font-medium text-violet-700">{pulse.label}</span></div>
        <div className="mt-4 flex items-end gap-3"><span className="text-4xl font-semibold text-neutral-900">{pulse.score}</span><span className="mb-1 text-xs text-neutral-500">/ 100 operational readiness</span></div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600" style={{ width: `${pulse.score}%` }}/></div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Metric label="Mapped voters" value={`${pulse.mappedRate}%`}/><Metric label="Turf assigned" value={`${pulse.assignedRate}%`}/><Metric label="Ballots returned" value={`${pulse.returnedRate}%`}/><Metric label="14-day raised" value={formatUsd(pulse.recentRaisedCents)}/></div>
      </article>
      <article className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><Target className="h-4 w-4 text-emerald-600"/>Goal Lab</div>
        <p className="mt-1 text-xs text-neutral-500">Turn a fundraising target into a clear daily operating plan.</p>
        <div className="mt-3 grid grid-cols-2 gap-2"><label className="text-xs text-neutral-500">Goal ($)<input type="number" min="0" value={goalDollars} onChange={(e) => setGoalDollars(Number(e.target.value) || 0)} className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2 text-sm text-neutral-900"/></label><label className="text-xs text-neutral-500">Deadline<input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-neutral-300 px-2 text-sm text-neutral-900"/></label></div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric label="Still needed" value={formatUsd(goal.remainingCents)}/><Metric label="Per day" value={formatUsd(goal.dailyCents)}/><Metric label="At $25" value={`${goal.suggestedDonors} gifts`}/></div>
        <p className="mt-3 text-xs text-neutral-500"><CalendarDays className="mr-1 inline h-3.5 w-3.5"/>{goal.daysLeft} days left · {formatUsd(goal.weeklyCents)} per week</p>
      </article>
      <article className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-sm font-semibold text-neutral-900"><Flag className="h-4 w-4 text-orange-600"/>GOTV Readiness</span><span className="text-lg font-semibold text-neutral-900">{gotv.ready}%</span></div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100"><div className="h-full rounded-full bg-orange-500" style={{ width: `${gotv.ready}%` }}/></div>
        <div className="mt-3 space-y-2">{gotv.blockers.map((item) => <div key={item.label} className="flex gap-2 text-xs"><span className={item.count ? 'mt-0.5 h-2 w-2 shrink-0 rounded-full bg-orange-500' : 'mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500'}/><span className="text-neutral-700"><strong>{item.count}</strong> {item.label}<span className="block text-neutral-400">{item.count ? item.action : 'Complete.'}</span></span></div>)}</div>
      </article>
    </div>
  </section>;
}
function Metric({ label, value }) { return <div className="rounded-md bg-neutral-50 px-2 py-2"><div className="font-semibold text-neutral-900">{value}</div><div className="mt-0.5 text-[11px] text-neutral-500">{label}</div></div>; }
