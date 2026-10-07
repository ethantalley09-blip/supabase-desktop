import { Siren, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { warmSegment } from './runway';
import { useEmergencyAsk } from './useGrowthAi';
// Emergency Ask Generator: "we need $X by <date>" -> a same-day pack (email +
// SMS + volunteer call script) for the warmest donors. Pairs with Funding
// Runway above: when it projects a shortfall, this raises the close. The
// urgency is real by construction — staff state the actual gap and deadline,
// and the prompt forbids inventing anything beyond them.
export function EmergencyAsk({ orgId, projectId, donations }) {
    const draft = useEmergencyAsk();
    const [goal, setGoal] = useState('');
    const [deadline, setDeadline] = useState('');
    const [reason, setReason] = useState('');
    const [copied, setCopied] = useState(null);
    const warm = useMemo(() => warmSegment((donations ?? []).map((d) => ({ donorId: d.donor_id, donatedAt: d.donated_at }))), [donations]);
    const avgRecentGiftCents = useMemo(() => {
        if (!donations?.length)
            return 0;
        const cutoff = Date.now() - 45 * 86_400_000;
        const recent = donations.filter((d) => new Date(d.donated_at).getTime() >= cutoff);
        return recent.length ? Math.round(recent.reduce((s, d) => s + d.amount_cents, 0) / recent.length) : 0;
    }, [donations]);
    const run = () => {
        if (!Number(goal) || !deadline || !reason.trim())
            return;
        draft.mutate({
            orgId,
            projectId,
            goalCents: Math.round(Number(goal) * 100),
            deadline,
            reason: reason.trim(),
            warmDonorCount: warm.length,
            avgRecentGiftCents
        });
    };
    const copy = async (key, text) => {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
    };
    return (<div className="space-y-3 rounded-lg border border-red-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Siren className="h-4 w-4 text-red-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Emergency Ask Generator</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Need a real amount by a real date? State it and get a same-day pack — email, SMS, and a
        volunteer call script — aimed at your {warm.length} warmest donors.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input type="number" className="w-28" placeholder="Goal ($)" value={goal} onChange={(e) => setGoal(e.target.value)}/>
        <Input type="date" className="w-40" value={deadline} onChange={(e) => setDeadline(e.target.value)}/>
        <Input className="min-w-48 flex-1" placeholder="Why? e.g. final TV buy invoice due" value={reason} onChange={(e) => setReason(e.target.value)}/>
        <Button size="sm" onClick={run} disabled={draft.isPending || !Number(goal) || !deadline || !reason.trim()}>
          <Sparkles className="h-4 w-4"/>
          {draft.isPending ? 'Drafting…' : 'Draft the pack'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {draft.data && (<div className="space-y-2">
          <div className="rounded-md border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Email — {draft.data.email.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{draft.data.email.body}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('email', `${draft.data.email.subject}\n\n${draft.data.email.body}`)}>
              {copied === 'email' ? 'Copied!' : 'Copy email'}
            </Button>
          </div>
          <div className="rounded-md border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">SMS</p>
            <p className="mt-1 text-xs text-neutral-700">{draft.data.sms}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('sms', draft.data.sms)}>
              {copied === 'sms' ? 'Copied!' : 'Copy SMS'}
            </Button>
          </div>
          <div className="rounded-md border border-red-100 bg-red-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Volunteer call script</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{draft.data.call_script}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('call', draft.data.call_script)}>
              {copied === 'call' ? 'Copied!' : 'Copy script'}
            </Button>
          </div>
        </div>)}
    </div>);
}
