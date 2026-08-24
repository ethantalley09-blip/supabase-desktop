import { PhoneCall, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePhoneScript } from './useOutreachStudio';
const CALL_TYPES = ['Phone bank (live call)', 'Peer-to-peer text', 'Recorded call'];
// Phone/Text Script Builder: distinct from the door-to-door canvassing
// script (Message Studio) — a caller/texter has seconds and no body
// language, so the greeting has to earn the next sentence.
export function PhoneScriptBuilder({ orgId, projectId }) {
    const draft = usePhoneScript();
    const [callType, setCallType] = useState(CALL_TYPES[0]);
    const [ask, setAsk] = useState('');
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        if (!draft.data)
            return;
        const d = draft.data;
        await navigator.clipboard.writeText(`${d.greeting}\n\n${d.message}\n\n${d.ask}\n\nVoicemail: ${d.if_voicemail}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (<div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-violet-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Phone / Text Script Builder</h3>
      </div>
      <p className="text-xs text-neutral-500">
        For phone banks and peer-to-peer texting — a caller has seconds and no body language, so
        this includes a voicemail-safe version too.
      </p>

      <div className="flex flex-wrap gap-2">
        <select className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm" value={callType} onChange={(e) => setCallType(e.target.value)}>
          {CALL_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
        <Input className="min-w-40 flex-1" placeholder="The ask — e.g. remind them to vote by Nov 5" value={ask} onChange={(e) => setAsk(e.target.value)}/>
      </div>
      <Button size="sm" onClick={() => draft.mutate({ orgId, projectId, callType, ask: ask.trim() })} disabled={draft.isPending || !ask.trim()}>
        <Sparkles className="h-4 w-4"/>
        {draft.isPending ? 'Writing…' : 'Draft script'}
      </Button>
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {draft.data && (<div className="space-y-1.5 rounded-md border border-violet-100 bg-violet-50 p-3 text-xs text-neutral-700">
          <p><span className="font-semibold">Greeting:</span> {draft.data.greeting}</p>
          <p><span className="font-semibold">Message:</span> {draft.data.message}</p>
          <p><span className="font-semibold">Ask:</span> {draft.data.ask}</p>
          <p><span className="font-semibold">Voicemail:</span> {draft.data.if_voicemail}</p>
          <Button size="sm" variant="outline" className="mt-1" onClick={copy}>
            {copied ? 'Copied!' : 'Copy script'}
          </Button>
        </div>)}
    </div>);
}
