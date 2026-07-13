import { ListFilter } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Project } from '@/features/projects/useProjects';
import {
  applySegment,
  useCreateTerritoryFromVoters,
  useVoterRecords,
  voterCity,
  voterLanguage,
  voterWard,
  type SegmentFilter,
  type VoterRecord
} from '@/features/turf/useTurf';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';

const EXAMPLES = [
  'Spanish-speaking voters in Ward 3 with an outstanding ballot',
  'Voters who have moved',
  'Everyone not yet assigned to a territory',
  'Mapped voters with canvass notes'
];

// Smart Segments — describe a voter universe in plain English and get an
// actionable list back (not just an answer). The model returns a whitelisted
// filter (see SEGMENT_SYSTEM); `applySegment` runs it in-memory, and the result
// can become a walk list in one click. Closes the loop from question → action.
export function SmartSegments({ project }: { project: Project }) {
  const { data: voters } = useVoterRecords(project.id);
  const assist = useAiAssist();
  const createFromSelection = useCreateTerritoryFromVoters();
  const [description, setDescription] = useState('');
  const [result, setResult] = useState<{ label: string; matched: VoterRecord[] } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  // Give the model the real values in the data so it maps "downtown" → an
  // actual city name and uses ward/language values that exist.
  const vocabulary = useMemo(() => {
    const cities = new Set<string>();
    const wards = new Set<string>();
    const languages = new Set<string>();
    for (const v of voters ?? []) {
      const c = voterCity(v);
      if (c) cities.add(c);
      const w = voterWard(v);
      if (w) wards.add(w);
      const l = voterLanguage(v);
      if (l) languages.add(l);
    }
    return JSON.stringify({
      cities: [...cities].slice(0, 50),
      wards: [...wards].slice(0, 50),
      languages: [...languages].slice(0, 20)
    });
  }, [voters]);

  const run = async (text: string) => {
    const desc = text.trim();
    if (!desc) return;
    setDescription(desc);
    setParseError(null);
    setSavedMsg(null);
    setResult(null);
    const res = await assist.mutateAsync({
      orgId: project.org_id,
      projectId: project.id,
      purpose: 'segment_filter',
      instructions: desc,
      context: vocabulary
    });
    const parsed = extractJson<{ label?: string; filters?: SegmentFilter }>(res.text);
    if (!parsed || !parsed.filters) {
      setParseError("Couldn't read a filter from that — try describing the group differently.");
      return;
    }
    const matched = applySegment(voters ?? [], parsed.filters);
    setResult({ label: parsed.label?.trim() || 'Segment', matched });
  };

  const createWalkList = async () => {
    if (!result) return;
    const r = await createFromSelection.mutateAsync({
      projectId: project.id,
      name: result.label,
      voters: result.matched
    });
    setSavedMsg(`Walk list "${r.territory.name}" created — ${r.assignedCount} voters assigned.`);
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ListFilter className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Smart Segments</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Describe the voters you want and turn them into a walk list — no filters to build.
      </p>

      <div className="flex gap-2">
        <Input
          placeholder="e.g. Spanish-speaking voters in Ward 3 with an outstanding ballot"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(description)}
        />
        <Button size="sm" onClick={() => run(description)} disabled={assist.isPending || !description.trim()}>
          {assist.isPending ? 'Finding…' : 'Find'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => run(ex)}
            disabled={assist.isPending}
            className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>

      {assist.isError && <p className="text-sm text-red-600">{(assist.error as Error).message}</p>}
      {parseError && <p className="text-sm text-red-600">{parseError}</p>}

      {result && (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3">
          <p className="text-sm font-medium text-neutral-900">
            {result.label} — {result.matched.length} voter{result.matched.length === 1 ? '' : 's'}
          </p>
          <ul className="space-y-0.5 text-xs text-neutral-600">
            {result.matched.slice(0, 6).map((v) => (
              <li key={v.id}>
                {v.full_name || '—'}
                {v.address_line ? ` · ${v.address_line}` : ''}
              </li>
            ))}
            {result.matched.length > 6 && <li className="text-neutral-400">…and {result.matched.length - 6} more</li>}
          </ul>
          {result.matched.length > 0 && (
            <Button variant="outline" size="sm" onClick={createWalkList} disabled={createFromSelection.isPending}>
              {createFromSelection.isPending ? 'Creating…' : 'Create walk list from these'}
            </Button>
          )}
          {createFromSelection.isError && (
            <p className="text-sm text-red-600">{(createFromSelection.error as Error).message}</p>
          )}
          {savedMsg && <p className="text-sm text-emerald-600">{savedMsg}</p>}
        </div>
      )}
    </div>
  );
}
