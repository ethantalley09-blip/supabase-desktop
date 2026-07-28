import { Newspaper, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePressRelease } from './useOutreachStudio';
// Press Release Generator: AP-style release from facts staff provide.
// Grounded strictly in the announcement + quote given — never invents a
// quote attributed to the candidate.
export function PressReleaseGenerator({ orgId, projectId }) {
    const draft = usePressRelease();
    const [announcement, setAnnouncement] = useState('');
    const [quote, setQuote] = useState('');
    const [location, setLocation] = useState('');
    const [contact, setContact] = useState('');
    const [copied, setCopied] = useState(false);
    const copyAll = async () => {
        if (!draft.data)
            return;
        const d = draft.data;
        await navigator.clipboard.writeText(`${d.headline}\n\n${d.dateline}\n\n${d.body}\n\n${d.boilerplate}\n\n${d.media_contact_line}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (<div className="space-y-3 rounded-lg border border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <Newspaper className="h-4 w-4 text-neutral-700"/>
        <h3 className="text-sm font-semibold text-neutral-900">Press Release Generator</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Standard AP structure — headline, dateline, lede, quote, boilerplate, media contact — from
        the facts you give it. It never invents a quote or a statistic.
      </p>

      <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="What's the announcement? e.g. Campaign announces endorsement from the county Teachers Union, effective today." value={announcement} onChange={(e) => setAnnouncement(e.target.value)}/>
      <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="Optional: a real quote to include, attributed to whoever said it" value={quote} onChange={(e) => setQuote(e.target.value)}/>
      <div className="flex flex-wrap gap-2">
        <Input className="min-w-40 flex-1" placeholder="City, State (dateline)" value={location} onChange={(e) => setLocation(e.target.value)}/>
        <Input className="min-w-40 flex-1" placeholder="Media contact — name, email/phone" value={contact} onChange={(e) => setContact(e.target.value)}/>
      </div>
      <Button size="sm" onClick={() => draft.mutate({ orgId, projectId, announcement: announcement.trim(), quote: quote.trim(), location: location.trim(), contact: contact.trim() })} disabled={draft.isPending || !announcement.trim()}>
        <Sparkles className="h-4 w-4"/>
        {draft.isPending ? 'Drafting…' : 'Draft release'}
      </Button>
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {draft.data && (<div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-800">
          <p className="font-semibold">{draft.data.headline}</p>
          <p className="mt-1 text-neutral-500">{draft.data.dateline}</p>
          <p className="mt-2 whitespace-pre-wrap">{draft.data.body}</p>
          <p className="mt-2 text-neutral-600">{draft.data.boilerplate}</p>
          <p className="mt-2 text-neutral-500">{draft.data.media_contact_line}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={copyAll}>
            {copied ? 'Copied!' : 'Copy full release'}
          </Button>
        </div>)}
    </div>);
}
