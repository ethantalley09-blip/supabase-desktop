import { Compass, MessageSquare, Search, Sparkles } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Project } from '@/features/projects/useProjects';
import {
  buildFundraisingSnapshot,
  COMPLIANCE_THRESHOLD_CENTS,
  useDonationTotal,
  useDonations
} from '@/features/fundraising/useFundraising';
import { buildTurfSnapshot, dominantVoterLanguage, useTerritories, useVoterRecords } from '@/features/turf/useTurf';
import { useAvailableTools } from '@/features/rbac/useAvailableTools';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist, type AiPurpose } from '@/lib/ai/useAiAssist';
import { ContentPack } from './ContentPack';
import { RefineBar } from './RefineBar';
import { SmartSegments } from './SmartSegments';
import { TranslateBar } from './TranslateBar';

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  turf: 'Turf',
  comms: 'Comms',
  fundraising: 'Fundraising'
};

const ASK_EXAMPLES = [
  'How many ballots are still outstanding?',
  'How close are we to the compliance threshold?',
  'Which city has the most voters?',
  'How many voters still need geocoding?'
];

const STUDIO_KINDS: { value: AiPurpose; label: string }[] = [
  { value: 'broadcast', label: 'Team broadcast' },
  { value: 'canvassing_script', label: 'Canvassing script' },
  { value: 'relational_text', label: 'Personal text' }
];

const TONES = ['Warm', 'Urgent', 'Casual', 'Formal'];

// The AI Center — one hub for the campaign's own-data AI tools. Everything here
// runs on first-party data (this project's voters, territories, and donations),
// summarized into an aggregate snapshot; no raw rows leave the app. Rendered
// only when the org has the ai_module entitlement AND the viewer has ai.use
// (gated in ProjectDetailsPage).
export function AiCenterTab({ project }: { project: Project }) {
  const { tools, byCategory } = useAvailableTools(project.org_id);
  const has = (id: string) => tools.some((t) => t.id === id);
  const { data: voters } = useVoterRecords(project.id);
  const { data: territories } = useTerritories(project.id);
  const fundraisingEnt = useEntitlement(project.org_id, 'fundraising_module', project.id);
  const { data: donations } = useDonations(project.id);
  const { data: donationTotal } = useDonationTotal(project.id);

  const ask = useAiAssist();
  const coach = useAiAssist();
  const studio = useAiAssist();

  const [question, setQuestion] = useState('');
  const [studioKind, setStudioKind] = useState<AiPurpose>('broadcast');
  const [studioTone, setStudioTone] = useState(TONES[0]);
  const [studioBrief, setStudioBrief] = useState('');
  const [studioText, setStudioText] = useState(''); // current draft (refinable)
  const [copied, setCopied] = useState(false);

  // Combined project snapshot: turf always, fundraising only when the project
  // has that paid module (otherwise the donations query is RLS-empty anyway).
  const snapshot = useMemo(() => {
    const turf = buildTurfSnapshot(voters ?? [], territories ?? []);
    const fundraising = fundraisingEnt.data
      ? buildFundraisingSnapshot(donations ?? [], donationTotal ?? 0, COMPLIANCE_THRESHOLD_CENTS)
      : undefined;
    return JSON.stringify({ turf, fundraising });
  }, [voters, territories, donations, donationTotal, fundraisingEnt.data]);

  // Default the translator to the electorate's dominant non-English language,
  // detected from the imported voter file.
  const dominantLanguage = useMemo(() => dominantVoterLanguage(voters ?? []), [voters]);

  const runAsk = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion(text);
    ask.mutate({ orgId: project.org_id, projectId: project.id, purpose: 'data_qa', instructions: text, context: snapshot });
  };

  const runStudio = () =>
    studio.mutate(
      {
        orgId: project.org_id,
        projectId: project.id,
        purpose: studioKind,
        tone: studioTone,
        instructions: studioBrief.trim() || 'A brief, on-message update.'
      },
      { onSuccess: (data) => setStudioText(data.text) }
    );

  const copyStudio = async () => {
    if (!studioText) return;
    await navigator.clipboard.writeText(studioText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-violet-600" />
        <h2 className="text-base font-semibold text-neutral-900">AI Center</h2>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          Premium
        </span>
      </div>
      <p className="text-sm text-neutral-500">
        Your campaign's AI toolkit, all in one place. Everything here works off this project's own
        data — nothing is shared outside your organization.
      </p>

      {/* Your AI Tools — makes the per-role customization visible, not just enforced */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Your AI tools ({tools.length})
        </p>
        <p className="mt-0.5 text-xs text-neutral-500">
          Curated for your role — other roles on your team see a different set below.
        </p>
        <div className="mt-2 space-y-1.5">
          {(Object.keys(byCategory) as (keyof typeof byCategory)[])
            .filter((cat) => byCategory[cat].length > 0)
            .map((cat) => (
              <p key={cat} className="text-xs text-neutral-600">
                <span className="font-medium text-neutral-800">{CATEGORY_LABEL[cat]}:</span>{' '}
                {byCategory[cat].map((t) => t.label).join(', ')}
              </p>
            ))}
          {tools.length === 0 && <p className="text-xs text-neutral-400">No AI tools available to your role yet.</p>}
        </div>
      </div>

      {/* Ask your data */}
      {has('ask_data') && (
      <Card icon={<Search className="h-4 w-4 text-violet-600" />} title="Ask your data">
        <p className="text-xs text-neutral-500">
          Ask anything about your voters and fundraising in plain English — no filters to build.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. How many voters in Ward 3 haven't been contacted?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runAsk(question)}
          />
          <Button size="sm" onClick={() => runAsk(question)} disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? 'Asking…' : 'Ask'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ASK_EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => runAsk(ex)}
              disabled={ask.isPending}
              className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
            >
              {ex}
            </button>
          ))}
        </div>
        {ask.isError && <p className="text-sm text-red-600">{(ask.error as Error).message}</p>}
        {ask.data && <Answer>{ask.data.text}</Answer>}
      </Card>
      )}

      {/* Smart Segments — describe a universe, get an actionable walk list */}
      {has('smart_segments') && <SmartSegments project={project} />}

      {/* Field Coach */}
      {has('campaign_coach') && (
      <Card icon={<Compass className="h-4 w-4 text-violet-600" />} title="Campaign Coach">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">Not sure what to do next? Get your top 3 priorities right now.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => coach.mutate({ orgId: project.org_id, projectId: project.id, purpose: 'field_coach', context: snapshot })}
            disabled={coach.isPending}
          >
            {coach.isPending ? 'Thinking…' : 'Plan my day'}
          </Button>
        </div>
        {coach.isError && <p className="text-sm text-red-600">{(coach.error as Error).message}</p>}
        {coach.data && <Answer tone="violet">{coach.data.text}</Answer>}
      </Card>
      )}

      {/* Message Studio */}
      {has('message_studio') && (
      <Card icon={<MessageSquare className="h-4 w-4 text-violet-600" />} title="Message Studio">
        <p className="text-xs text-neutral-500">Draft on-message copy for any channel in seconds.</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <select
              className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
              value={studioKind}
              onChange={(e) => setStudioKind(e.target.value as AiPurpose)}
            >
              {STUDIO_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Tone</Label>
            <select
              className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
              value={studioTone}
              onChange={(e) => setStudioTone(e.target.value)}
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
          placeholder="What should it say? e.g. Remind volunteers about Saturday's canvass launch at 9am."
          value={studioBrief}
          onChange={(e) => setStudioBrief(e.target.value)}
        />
        <Button size="sm" onClick={runStudio} disabled={studio.isPending}>
          <Sparkles className="h-4 w-4" />
          {studio.isPending ? 'Writing…' : 'Generate'}
        </Button>
        {studio.isError && <p className="text-sm text-red-600">{(studio.error as Error).message}</p>}
        {studioText && (
          <div className="space-y-2">
            <Answer>{studioText}</Answer>
            <Button variant="outline" size="sm" onClick={copyStudio}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
            <RefineBar
              orgId={project.org_id}
              projectId={project.id}
              text={studioText}
              onResult={setStudioText}
            />
            <TranslateBar
              orgId={project.org_id}
              projectId={project.id}
              text={studioText}
              defaultLanguage={dominantLanguage}
            />
          </div>
        )}
      </Card>
      )}

      {/* Content Pack — one brief, every channel */}
      {has('content_pack') && <ContentPack project={project} defaultLanguage={dominantLanguage} />}
    </div>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-neutral-900">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Answer({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'violet' }) {
  const cls =
    tone === 'violet' ? 'border-violet-200 bg-violet-50' : 'border-neutral-200 bg-neutral-50';
  return (
    <div className={`whitespace-pre-wrap rounded-md border p-3 text-sm text-neutral-800 ${cls}`}>
      {children}
    </div>
  );
}
