import { Mail, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEmailCampaign } from './useOutreachStudio';

// Email Campaign Studio: one brief -> 3 A/B subject line variants, preview
// text, and a full body. Subject lines take genuinely different angles
// (curiosity / direct ask / urgency-if-real), not cosmetic rewordings.
export function EmailCampaignStudio({ orgId, projectId }: { orgId: string; projectId: string }) {
  const draft = useEmailCampaign();
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('');
  const [brief, setBrief] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-sky-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Email Campaign Studio</h3>
      </div>
      <p className="text-xs text-neutral-500">
        One brief becomes a full campaign: 3 subject lines to A/B test, inbox preview text, and the
        body — ready to paste into your sender.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input className="min-w-40 flex-1" placeholder="Goal — e.g. drive RSVPs to Saturday's rally" value={goal} onChange={(e) => setGoal(e.target.value)} />
        <Input className="min-w-40 flex-1" placeholder="Audience — e.g. lapsed donors" value={audience} onChange={(e) => setAudience(e.target.value)} />
      </div>
      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="What should the email say? Key points, tone, any real deadline."
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <Button
        size="sm"
        onClick={() => draft.mutate({ orgId, projectId, goal: goal.trim(), audience: audience.trim(), brief: brief.trim() })}
        disabled={draft.isPending || !goal.trim() || !brief.trim()}
      >
        <Sparkles className="h-4 w-4" />
        {draft.isPending ? 'Drafting…' : 'Draft campaign'}
      </Button>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {draft.data && (
        <div className="space-y-2">
          <div className="grid gap-1.5 sm:grid-cols-3">
            {([
              ['A', draft.data.subject_a],
              ['B', draft.data.subject_b],
              ['C', draft.data.subject_c]
            ] as const).map(([label, subject]) => (
              <button
                key={label}
                type="button"
                onClick={() => copy(`subject-${label}`, subject)}
                className="rounded-md border border-sky-100 bg-sky-50 p-2 text-left text-xs text-neutral-700 hover:bg-sky-100"
              >
                <span className="font-semibold text-sky-700">Subject {label}</span>
                <p className="mt-0.5">{subject}</p>
                {copied === `subject-${label}` && <span className="text-[10px] text-emerald-600">Copied!</span>}
              </button>
            ))}
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <p className="text-xs font-semibold text-neutral-800">Preview text</p>
            <p className="text-xs text-neutral-600">{draft.data.preview_text}</p>
          </div>
          <div className="rounded-md border border-neutral-200 p-3">
            <p className="text-xs font-semibold text-neutral-800">Body</p>
            <p className="whitespace-pre-wrap text-xs text-neutral-700">{draft.data.body}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => copy('body', draft.data!.body)}>
              {copied === 'body' ? 'Copied!' : 'Copy body'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
