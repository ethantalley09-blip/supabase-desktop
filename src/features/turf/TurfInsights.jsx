import { Compass, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { buildTurfSnapshot } from './useTurf';
// Beginner-friendly example questions — one tap fills the box, so a first-time
// user never faces a blank prompt.
const EXAMPLES = [
    'How many ballots are still outstanding?',
    'Which city has the most voters?',
    'How many voters still need an address geocoded?',
    'How many territories have no canvasser?'
];
// Two AI features that turn the turf data into answers instead of a spreadsheet:
//   • Ask your voters — plain-English Q&A (no query builder to learn).
//   • Field Coach — one tap → the 3 highest-impact things to do next.
// Both send only the aggregate snapshot (buildTurfSnapshot), never raw rows.
export function TurfInsights({ orgId, projectId, voters, territories, canUseAi }) {
    const entitlement = useEntitlement(orgId, 'ai_module');
    const ask = useAiAssist();
    const coach = useAiAssist();
    const [question, setQuestion] = useState('');
    const snapshot = useMemo(() => JSON.stringify(buildTurfSnapshot(voters, territories)), [voters, territories]);
    // Gate: needs both the premium entitlement and the ai.use permission.
    if (!canUseAi || !entitlement.data)
        return null;
    const runAsk = (q) => {
        const text = q.trim();
        if (!text)
            return;
        setQuestion(text);
        ask.mutate({ orgId, projectId, purpose: 'data_qa', instructions: text, context: snapshot });
    };
    const runCoach = () => coach.mutate({ orgId, projectId, purpose: 'field_coach', context: snapshot });
    return (<div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">AI insights</h3>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          Premium
        </span>
      </div>

      {/* Ask your voters */}
      <div className="space-y-2">
        <p className="text-xs text-neutral-500">
          Ask a question about your voters in plain English — no filters to build.
        </p>
        <div className="flex gap-2">
          <Input placeholder="e.g. How many voters in Ward 3 haven't been contacted?" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runAsk(question)}/>
          <Button size="sm" onClick={() => runAsk(question)} disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? 'Asking…' : 'Ask'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (<button key={ex} type="button" onClick={() => runAsk(ex)} disabled={ask.isPending} className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50">
              {ex}
            </button>))}
        </div>
        {ask.isError && <p className="text-sm text-red-600">{ask.error.message}</p>}
        {ask.data && (<div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
            {ask.data.text}
          </div>)}
      </div>

      <hr className="border-neutral-100"/>

      {/* Field Coach */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            Not sure where to start? Get your top 3 priorities right now.
          </p>
          <Button variant="outline" size="sm" onClick={runCoach} disabled={coach.isPending}>
            <Compass className="h-4 w-4"/>
            {coach.isPending ? 'Thinking…' : 'Plan my day'}
          </Button>
        </div>
        {coach.isError && <p className="text-sm text-red-600">{coach.error.message}</p>}
        {coach.data && (<div className="whitespace-pre-wrap rounded-md border border-violet-200 bg-violet-50 p-3 text-sm text-neutral-800">
            {coach.data.text}
          </div>)}
      </div>
    </div>);
}
