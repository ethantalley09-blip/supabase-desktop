import { ShieldAlert, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRedTeam } from './useCompete';
// Red Team: the inverse of opposition research — attack YOURSELF before the
// opponent does. Staff describe their own candidate's record candidly; the
// model plays the opponent's strategist and surfaces the 4 most likely
// attack angles, each with an honest prep response. Nothing is persisted.
export function RedTeam({ orgId, projectId }) {
    const red = useRedTeam();
    const [record, setRecord] = useState('');
    const badge = (likelihood) => likelihood === 'high'
        ? 'bg-red-100 text-red-700'
        : likelihood === 'medium'
            ? 'bg-amber-100 text-amber-700'
            : 'bg-neutral-100 text-neutral-600';
    return (<div className="space-y-3 rounded-lg border border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-neutral-700"/>
        <h3 className="text-sm font-semibold text-neutral-900">Red Team (attack yourself first)</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Describe your own candidate's record — honestly, including the awkward parts. The AI plays
        the opponent's strategist and shows you the attacks before they land, with a prep answer
        for each. Nothing you type here is saved.
      </p>

      <textarea rows={3} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="e.g. Council member 6 years. Voted for the 2023 budget that raised parking fines. Missed 4 votes last spring (family illness). Small business owner, two late tax filings in 2019, both settled." value={record} onChange={(e) => setRecord(e.target.value)}/>
      <Button size="sm" onClick={() => red.mutate({ orgId, projectId, ownRecord: record.trim() })} disabled={red.isPending || record.trim().length < 20}>
        <Sparkles className="h-4 w-4"/>
        {red.isPending ? 'Attacking…' : 'Run the red team'}
      </Button>
      {red.isError && <p className="text-sm text-red-600">{red.error.message}</p>}

      {red.data && (<div className="space-y-2">
          {red.data.vulnerabilities.map((v, i) => (<div key={i} className="rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-neutral-900">{v.attack_angle}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${badge(v.likelihood)}`}>
                  {v.likelihood}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-700">
                <span className="font-medium">Prep:</span> {v.prep_response}
              </p>
            </div>))}
        </div>)}
    </div>);
}
