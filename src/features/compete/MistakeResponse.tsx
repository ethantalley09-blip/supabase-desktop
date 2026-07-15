import { AlertOctagon, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useMistakeResponse } from './useCompete';

// Own-Candidate Mistake Response: distinct from Red Team (anticipates
// attacks before they land) and Issue Response Engine (reacts to external
// news) -- this is for when the campaign's own candidate actually got
// something wrong. Accountability, not spin. Nothing typed here is saved.
export function MistakeResponse({ orgId, projectId }: { orgId: string; projectId: string }) {
  const draft = useMistakeResponse();
  const [whatHappened, setWhatHappened] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-3 rounded-lg border border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <AlertOctagon className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Mistake Response</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Our candidate actually got something wrong — describe exactly what happened and get an
        honest accountability response, not spin. Nothing you type here is saved.
      </p>

      <textarea
        rows={3}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="e.g. At last night's forum, the candidate misstated the district's unemployment rate as 12% — it's actually 5.4%. A reporter caught it on video."
        value={whatHappened}
        onChange={(e) => setWhatHappened(e.target.value)}
      />
      <Button
        size="sm"
        onClick={() => draft.mutate({ orgId, projectId, whatHappened: whatHappened.trim() })}
        disabled={draft.isPending || whatHappened.trim().length < 20}
      >
        <Sparkles className="h-4 w-4" />
        {draft.isPending ? 'Drafting…' : 'Draft the response'}
      </Button>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {draft.data && (
        <div className="space-y-2">
          <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Public statement</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{draft.data.statement}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('statement', draft.data!.statement)}>
              {copied === 'statement' ? 'Copied!' : 'Copy statement'}
            </Button>
          </div>
          <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Social post</p>
            <p className="mt-1 text-xs text-neutral-700">{draft.data.social_post}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('social', draft.data!.social_post)}>
              {copied === 'social' ? 'Copied!' : 'Copy post'}
            </Button>
          </div>
          <div className="rounded-md border border-amber-100 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Canvasser talking point</p>
            <p className="mt-1 text-xs text-neutral-700">{draft.data.canvasser_talking_point}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('talk', draft.data!.canvasser_talking_point)}>
              {copied === 'talk' ? 'Copied!' : 'Copy talking point'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
