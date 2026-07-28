import { Mailbox, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDirectMail } from './useOutreachStudio';
// Direct Mail Designer: postcard-sized copy — a headline, a body under 50
// words, one CTA. Mail competes with junk mail for 2 seconds of attention,
// so the prompt enforces brevity, not just tone.
export function DirectMailDesigner({ orgId, projectId }) {
    const draft = useDirectMail();
    const [brief, setBrief] = useState('');
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        if (!draft.data)
            return;
        await navigator.clipboard.writeText(`${draft.data.headline}\n\n${draft.data.body}\n\n${draft.data.cta}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (<div className="space-y-3 rounded-lg border border-emerald-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Mailbox className="h-4 w-4 text-emerald-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Direct Mail Designer</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Postcard-sized copy: a headline readable across a room, one idea, one action. Mailers that
        try to say three things say nothing.
      </p>

      <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="What's the mailer about? e.g. GOTV postcard reminding early voters where their polling place is." value={brief} onChange={(e) => setBrief(e.target.value)}/>
      <Button size="sm" onClick={() => draft.mutate({ orgId, projectId, brief: brief.trim() })} disabled={draft.isPending || !brief.trim()}>
        <Sparkles className="h-4 w-4"/>
        {draft.isPending ? 'Designing…' : 'Draft mailer copy'}
      </Button>
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {draft.data && (<div className="rounded-md border border-emerald-100 bg-emerald-50 p-4 text-center">
          <p className="text-base font-semibold text-neutral-900">{draft.data.headline}</p>
          <p className="mt-1 text-xs text-neutral-700">{draft.data.body}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">{draft.data.cta}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>)}
    </div>);
}
