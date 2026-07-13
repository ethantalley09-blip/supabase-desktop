import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/features/projects/useProjects';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { TranslateBar } from '@/features/ai/TranslateBar';

const TONES = ['Warm', 'Urgent', 'Casual', 'Formal'];

// Saved-Contact Outreach Booster (AI, premium).
// Modern phones bury texts from unknown numbers, which is quietly killing
// peer-to-peer reach. This tool produces (a) a one-tap contact card so the
// supporter's friend saves the campaign number first, and (b) an AI-drafted
// personal message that leads with that ask — lifting deliverability in a way
// no other campaign platform addresses.
export function OutreachBooster({ project }: { project: Project }) {
  const entitlement = useEntitlement(project.org_id, 'ai_module');
  const canUse = useHasPermission(project.org_id, 'ai.use');
  const assist = useAiAssist();

  const [friendName, setFriendName] = useState('');
  const [phone, setPhone] = useState('');
  const [issue, setIssue] = useState('');
  const [tone, setTone] = useState(TONES[0]);
  const [draft, setDraft] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  if (!canUse.data) return null;

  if (!entitlement.data) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-500">
        <span className="font-medium text-neutral-700">AI Outreach Booster</span> — AI-drafted
        relational messages plus a save-our-number contact card to beat unknown-sender filtering.
        Part of the AI module. Contact your administrator to enable it.
      </div>
    );
  }

  const flash = (what: string) => {
    setCopied(what);
    setTimeout(() => setCopied(null), 1500);
  };

  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    flash(label);
  };

  const vcard = () =>
    ['BEGIN:VCARD', 'VERSION:3.0', `FN:${project.name}`, `ORG:${project.name}`, `TEL;TYPE=CELL:${phone}`, 'END:VCARD'].join(
      '\n'
    );

  const downloadVcard = () => {
    const blob = new Blob([vcard()], { type: 'text/vcard' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '-')}.vcf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const generate = async () => {
    const result = await assist.mutateAsync({
      orgId: project.org_id,
      projectId: project.id,
      purpose: 'relational_text',
      tone,
      instructions:
        `The supporter is texting ${friendName || 'a friend'}. ` +
        `The campaign is "${project.name}". The ask / issue: ${issue}. ` +
        (phone ? `The number to save is ${phone}.` : 'Ask them to save the campaign number.')
    });
    setDraft(result.text);
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">AI Outreach Booster</h3>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          Premium
        </span>
      </div>
      <p className="text-xs text-neutral-500">
        Phones filter texts from unknown numbers. Send your supporter a contact card to save first,
        then a personal message that leads with the ask.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="friend">Recipient's first name</Label>
          <Input id="friend" value={friendName} onChange={(e) => setFriendName(e.target.value)} placeholder="Alex" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Campaign number to save</Label>
          <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="issue">The ask / issue</Label>
        <textarea
          id="issue"
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          value={issue}
          onChange={(e) => setIssue(e.target.value)}
          placeholder="Remind them to vote early this week and share the polling-place link."
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <Label>Tone</Label>
          <select
            className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={generate} disabled={assist.isPending || issue.trim().length < 3}>
          <Sparkles className="h-4 w-4" />
          {assist.isPending ? 'Drafting…' : 'Draft message'}
        </Button>
        <Button variant="outline" size="sm" onClick={downloadVcard} disabled={!phone}>
          Download contact card
        </Button>
      </div>

      {assist.isError && <p className="text-sm text-red-600">{(assist.error as Error).message}</p>}

      {draft && (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="whitespace-pre-wrap text-sm text-neutral-800">{draft}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(draft, 'message')}>
              {copied === 'message' ? 'Copied!' : 'Copy message'}
            </Button>
            {phone && (
              <Button variant="outline" size="sm" onClick={() => copy(phone, 'number')}>
                {copied === 'number' ? 'Copied!' : 'Copy number'}
              </Button>
            )}
          </div>
          <TranslateBar orgId={project.org_id} projectId={project.id} text={draft} />
        </div>
      )}
    </div>
  );
}
