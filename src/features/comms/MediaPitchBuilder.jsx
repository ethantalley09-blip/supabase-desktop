import { Radio, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMediaPitch } from './useOutreachStudio';
// Media Pitch Builder: a short, personalized pitch to a specific reporter —
// no reporter database, no scraping. Staff name the reporter, outlet, and
// beat; the AI never claims a relationship or coverage history not provided.
export function MediaPitchBuilder({ orgId, projectId }) {
    const draft = useMediaPitch();
    const [reporterName, setReporterName] = useState('');
    const [outlet, setOutlet] = useState('');
    const [beat, setBeat] = useState('');
    const [angle, setAngle] = useState('');
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        if (!draft.data)
            return;
        await navigator.clipboard.writeText(`${draft.data.subject}\n\n${draft.data.body}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (<div className="space-y-3 rounded-lg border border-amber-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4 text-amber-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Media Pitch Builder</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Name the reporter and their beat, describe your story, and get a pitch under 150 words —
        the length that actually gets read.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input className="min-w-32 flex-1" placeholder="Reporter name" value={reporterName} onChange={(e) => setReporterName(e.target.value)}/>
        <Input className="min-w-32 flex-1" placeholder="Outlet" value={outlet} onChange={(e) => setOutlet(e.target.value)}/>
        <Input className="min-w-32 flex-1" placeholder="Their beat — e.g. local politics" value={beat} onChange={(e) => setBeat(e.target.value)}/>
      </div>
      <textarea rows={2} className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" placeholder="The story angle — why this is news right now." value={angle} onChange={(e) => setAngle(e.target.value)}/>
      <Button size="sm" onClick={() => draft.mutate({ orgId, projectId, reporterName: reporterName.trim(), outlet: outlet.trim(), beat: beat.trim(), angle: angle.trim() })} disabled={draft.isPending || !reporterName.trim() || !angle.trim()}>
        <Sparkles className="h-4 w-4"/>
        {draft.isPending ? 'Drafting…' : 'Draft pitch'}
      </Button>
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {draft.data && (<div className="rounded-md border border-amber-100 bg-amber-50 p-3">
          <p className="text-xs font-semibold text-neutral-800">{draft.data.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{draft.data.body}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={copy}>
            {copied ? 'Copied!' : 'Copy pitch'}
          </Button>
        </div>)}
    </div>);
}
