import { CalendarDays, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGenerateRecap, useWeeklyRecaps } from './useWorkspace';
import { weekStart } from './workspaceMath';
function Section({ title, items, tone }) {
    if (!items?.length)
        return null;
    return (<div>
      <p className={`text-xs font-semibold ${tone}`}>{title}</p>
      <ul className="list-disc space-y-0.5 pl-5 text-xs text-neutral-700">
        {items.map((i) => (<li key={i}>{i}</li>))}
      </ul>
    </div>);
}
// Weekly Recap: one click turns this week vs last week into a short manager
// read, saved so the team can page back through every past week. Manager
// only (the stats include money raised -- see 0043).
export function WeeklyRecap({ orgId, projectId, stats, aiEnabled }) {
    const { data: recaps } = useWeeklyRecaps(projectId, true);
    const generate = useGenerateRecap();
    const [i, setI] = useState(0);
    const list = recaps ?? [];
    const current = list[i] ?? null;
    const hasThisWeek = list.some((r) => r.week_start === weekStart());
    return (<div id="tool-weekly_recap" className="space-y-3 rounded-lg border border-violet-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-violet-600"/>
          <h3 className="text-sm font-semibold text-neutral-900">Weekly Recap</h3>
        </div>
        {aiEnabled && (<Button size="sm" variant="outline" disabled={generate.isPending} onClick={() => generate.mutate({ orgId, projectId, stats }, { onSuccess: () => setI(0) })}>
            <Sparkles className="h-3.5 w-3.5"/>
            {generate.isPending ? 'Writing…' : hasThisWeek ? 'Refresh this week' : "Write this week's recap"}
          </Button>)}
      </div>
      <p className="text-xs text-neutral-500">
        This week so far: {stats.this_week.doors} doors ({stats.same_point_last_week.doors} at this point last week),
        {' '}{stats.this_week.gifts} gifts, {stats.this_week.tasks_done} tasks done.
      </p>
      {generate.isError && <p className="text-xs text-red-600">{generate.error.message}</p>}
      {!aiEnabled && list.length === 0 && (<p className="text-xs text-neutral-400">AI-written recaps unlock with the AI module.</p>)}
      {current && (<div className="space-y-2 rounded-md bg-violet-50/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-neutral-500">Week of {current.week_start}</p>
            {list.length > 1 && (<div className="flex items-center gap-1">
                <button type="button" aria-label="Older week" disabled={i >= list.length - 1} onClick={() => setI(i + 1)} className="disabled:opacity-30">
                  <ChevronLeft className="h-4 w-4 text-neutral-500"/>
                </button>
                <button type="button" aria-label="Newer week" disabled={i === 0} onClick={() => setI(i - 1)} className="disabled:opacity-30">
                  <ChevronRight className="h-4 w-4 text-neutral-500"/>
                </button>
              </div>)}
          </div>
          <p className="text-sm font-semibold text-neutral-900">{current.recap.headline}</p>
          <Section title="Wins" items={current.recap.wins} tone="text-emerald-700"/>
          <Section title="Watch" items={current.recap.watch} tone="text-amber-700"/>
          <Section title="Next week's focus" items={current.recap.next_week_focus} tone="text-violet-700"/>
        </div>)}
    </div>);
}
