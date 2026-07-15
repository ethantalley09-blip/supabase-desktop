import { Mic, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInterviewPrep } from './useCompete';

// Interview Prep: friendly/routine press (local news, podcast, radio) —
// distinct from Debate Prep's adversarial exchange. Most candidate media
// time is this, not a debate stage.
export function InterviewPrep({ orgId, projectId }: { orgId: string; projectId: string }) {
  const draft = useInterviewPrep();
  const [format, setFormat] = useState('');
  const [topics, setTopics] = useState('');

  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Mic className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Interview Prep</h3>
      </div>
      <p className="text-xs text-neutral-500">
        For routine local news, podcast, or radio — not a debate stage. Name the format and the
        topics likely to come up.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input
          className="w-56"
          placeholder="Format, e.g. WKRT morning radio, 10 min"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        />
        <Input
          className="min-w-56 flex-1"
          placeholder="Likely topics, e.g. housing plan, recent endorsement, budget vote"
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
        />
        <Button
          size="sm"
          onClick={() => draft.mutate({ orgId, projectId, format: format.trim(), topics: topics.trim() })}
          disabled={draft.isPending || !format.trim() || !topics.trim()}
        >
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Building…' : 'Build prep sheet'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {draft.data && (
        <div className="space-y-3">
          <p className="rounded-md border border-violet-200 bg-violet-50 p-3 text-sm font-medium text-violet-900">
            One thing to land: {draft.data.one_thing_to_land}
          </p>
          <div>
            <p className="text-xs font-semibold text-neutral-700">Bridge phrases</p>
            <ul className="mt-1 space-y-1">
              {draft.data.bridge_phrases.map((p, i) => (
                <li key={i} className="text-xs text-neutral-600">— {p}</li>
              ))}
            </ul>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-neutral-700">Likely questions</p>
            {draft.data.likely_questions.map((q, i) => (
              <div key={i} className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs">
                <p className="font-medium text-neutral-800">Q: {q.question}</p>
                <p className="mt-0.5 text-neutral-600">A: {q.suggested_answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
