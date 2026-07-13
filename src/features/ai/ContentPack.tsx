import { Layers } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Project } from '@/features/projects/useProjects';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { TranslateBar } from './TranslateBar';

const TONES = ['Warm', 'Urgent', 'Casual', 'Formal'];

type Pack = {
  email_subject?: string;
  email_body?: string;
  sms?: string;
  canvassing_script?: string;
  social_post?: string;
};

// Multi-channel content pack: one brief -> a coordinated email, text,
// canvassing script, and social post, each copyable and translatable. The
// model returns JSON (see CONTENT_PACK_SYSTEM); we render whatever channels
// come back. Consistent core message across channels is the whole point.
export function ContentPack({
  project,
  defaultLanguage
}: {
  project: Project;
  defaultLanguage?: string | null;
}) {
  const assist = useAiAssist();
  const [tone, setTone] = useState(TONES[0]);
  const [brief, setBrief] = useState('');
  const [pack, setPack] = useState<Pack | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const generate = async () => {
    setParseError(null);
    setPack(null);
    const res = await assist.mutateAsync({
      orgId: project.org_id,
      projectId: project.id,
      purpose: 'content_pack',
      tone,
      instructions: brief.trim() || 'A brief, on-message update for supporters.'
    });
    const parsed = extractJson<Pack>(res.text);
    if (!parsed) {
      setParseError("Couldn't read the content pack — try rephrasing the brief.");
      return;
    }
    setPack(parsed);
  };

  const email =
    pack?.email_subject || pack?.email_body
      ? [pack?.email_subject ? `Subject: ${pack.email_subject}` : '', pack?.email_body ?? '']
          .filter(Boolean)
          .join('\n\n')
      : '';

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Content Pack</h3>
      </div>
      <p className="text-xs text-neutral-500">
        One brief, every channel. Generates a coordinated email, text, canvassing script, and social
        post — each ready to copy or translate.
      </p>

      <div className="flex flex-wrap items-end gap-3">
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
      </div>
      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="What's the message? e.g. Early voting starts Monday — remind supporters to make a plan and find their polling place."
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <Button size="sm" onClick={generate} disabled={assist.isPending}>
        <Layers className="h-4 w-4" />
        {assist.isPending ? 'Building…' : 'Generate pack'}
      </Button>

      {assist.isError && <p className="text-sm text-red-600">{(assist.error as Error).message}</p>}
      {parseError && <p className="text-sm text-red-600">{parseError}</p>}

      {pack && (
        <div className="space-y-3">
          <Channel label="Email" text={email} project={project} defaultLanguage={defaultLanguage} />
          <Channel label="Text message" text={pack.sms} project={project} defaultLanguage={defaultLanguage} />
          <Channel label="Canvassing script" text={pack.canvassing_script} project={project} defaultLanguage={defaultLanguage} />
          <Channel label="Social post" text={pack.social_post} project={project} defaultLanguage={defaultLanguage} />
        </div>
      )}
    </div>
  );
}

function Channel({
  label,
  text,
  project,
  defaultLanguage
}: {
  label: string;
  text: string | undefined;
  project: Project;
  defaultLanguage?: string | null;
}) {
  const [copied, setCopied] = useState(false);
  if (!text?.trim()) return null;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-neutral-800">{text}</p>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? 'Copied!' : 'Copy'}
      </Button>
      <TranslateBar orgId={project.org_id} projectId={project.id} text={text} defaultLanguage={defaultLanguage} />
    </div>
  );
}
