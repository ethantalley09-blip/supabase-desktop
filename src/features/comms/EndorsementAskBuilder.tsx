import { BadgeCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEndorsementAsk } from './useOutreachStudio';

// Endorsement Outreach Builder: distinct from Donor Message Studio (asks for
// money) and Media Pitch Builder (asks for coverage) — this asks a named
// organization or community leader for their endorsement.
export function EndorsementAskBuilder({ orgId, projectId }: { orgId: string; projectId: string }) {
  const draft = useEndorsementAsk();
  const [who, setWho] = useState('');
  const [whyFit, setWhyFit] = useState('');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!draft.data) return;
    await navigator.clipboard.writeText(`${draft.data.subject}\n\n${draft.data.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Endorsement Outreach Builder</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Name the organization or leader and the real reason they're a fit — get a personalized
        endorsement request, not a form letter.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input className="w-56" placeholder="Organization or leader" value={who} onChange={(e) => setWho(e.target.value)} />
        <Input
          className="min-w-56 flex-1"
          placeholder="Why they're a fit, e.g. endorsed our housing platform publicly last year"
          value={whyFit}
          onChange={(e) => setWhyFit(e.target.value)}
        />
        <Button
          size="sm"
          onClick={() => draft.mutate({ orgId, projectId, who: who.trim(), whyFit: whyFit.trim() })}
          disabled={draft.isPending || !who.trim() || !whyFit.trim()}
        >
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Drafting…' : 'Draft the ask'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {draft.data && (
        <div className="space-y-1.5 rounded-md border border-violet-100 bg-violet-50 p-3 text-xs text-neutral-700">
          <p><span className="font-semibold">Subject:</span> {draft.data.subject}</p>
          <p className="whitespace-pre-wrap">{draft.data.body}</p>
          <Button size="sm" variant="outline" className="mt-1" onClick={copy}>
            {copied ? 'Copied!' : 'Copy request'}
          </Button>
        </div>
      )}
    </div>
  );
}
