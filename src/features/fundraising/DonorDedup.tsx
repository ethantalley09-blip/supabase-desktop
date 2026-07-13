import { GitMerge, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Donor } from './useFundraising';
import { useAssessDuplicate, useConfirmMerge, usePendingMergeSuggestions, useRejectMerge } from './useFundraisingAi';

// Fixes the "same donor, 3 different records" mess from importing multiple
// sources (ActBlue-style export, WinRed-style export, events, direct mail).
// The AI only SUGGESTS a match — a human always reviews and confirms before
// any records are merged.
export function DonorDedup({
  orgId,
  projectId,
  donors
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
}) {
  const { data: suggestions } = usePendingMergeSuggestions(orgId);
  const assess = useAssessDuplicate();
  const confirm = useConfirmMerge();
  const reject = useRejectMerge();
  const [donorIdA, setDonorIdA] = useState('');
  const [donorIdB, setDonorIdB] = useState('');

  const donorName = (id: string) => donors?.find((d) => d.id === id)?.full_name ?? id;

  const run = async () => {
    if (!donorIdA || !donorIdB || donorIdA === donorIdB) return;
    const a = donors?.find((d) => d.id === donorIdA);
    const b = donors?.find((d) => d.id === donorIdB);
    const recordsContext = JSON.stringify({
      a: { full_name: a?.full_name, email: a?.email, employer: a?.employer },
      b: { full_name: b?.full_name, email: b?.email, employer: b?.employer }
    });
    await assess.mutateAsync({ orgId, projectId, donorIdA, donorIdB, recordsContext });
  };

  return (
    <div className="space-y-3 rounded-lg border border-fuchsia-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-fuchsia-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Donor Identity Resolution</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Fixes the "same donor, different record" mess from importing multiple sources. Always a
        suggestion — nothing merges until you approve it.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={donorIdA}
          onChange={(e) => setDonorIdA(e.target.value)}
        >
          <option value="">Record A…</option>
          {donors?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <select
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={donorIdB}
          onChange={(e) => setDonorIdB(e.target.value)}
        >
          <option value="">Record B…</option>
          {donors?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={run} disabled={assess.isPending || !donorIdA || !donorIdB || donorIdA === donorIdB}>
          <Sparkles className="h-4 w-4" />
          {assess.isPending ? 'Comparing…' : 'Compare'}
        </Button>
      </div>
      {assess.isError && <p className="text-sm text-red-600">{(assess.error as Error).message}</p>}

      {suggestions && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((s) => (
            <div key={s.id} className="space-y-1.5 rounded-md border border-fuchsia-100 bg-fuchsia-50 p-3">
              <p className="text-sm font-medium text-neutral-900">
                {donorName(s.donor_id_a)} ↔ {donorName(s.donor_id_b)} — {(s.similarity_score * 100).toFixed(0)}% likely
                match
              </p>
              <p className="text-xs text-neutral-600">{s.rationale}</p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => confirm.mutate({ suggestionId: s.id, donorIdA: s.donor_id_a, donorIdB: s.donor_id_b, orgId })}
                  disabled={confirm.isPending}
                >
                  Merge into A
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => reject.mutate({ suggestionId: s.id, orgId })}
                  disabled={reject.isPending}
                >
                  Not the same person
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
