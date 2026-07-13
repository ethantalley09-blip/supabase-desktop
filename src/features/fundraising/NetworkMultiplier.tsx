import { Share2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Donor } from './useFundraising';
import { useDraftNetworkAsk, useNetworkAsks } from './useGrowthAi';

// Network Multiplier: turns a willing donor into an informal fundraiser by
// drafting a short ask in THEIR voice they can forward to people they name
// (coworkers, book club, neighbors). Deliberately no contact scraping or
// social-graph mining — the donor supplies the relationship; we supply words.
export function NetworkMultiplier({
  orgId,
  projectId,
  donors
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
}) {
  const { data: asks } = useNetworkAsks(projectId);
  const draft = useDraftNetworkAsk();
  const [donorId, setDonorId] = useState('');
  const [relationship, setRelationship] = useState('');
  const [reason, setReason] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const run = () => {
    const donor = donors?.find((d) => d.id === donorId);
    if (!donor || !relationship.trim() || !reason.trim()) return;
    draft.mutate({
      orgId,
      projectId,
      donorId,
      donorName: donor.full_name,
      relationship: relationship.trim(),
      donorReason: reason.trim()
    });
  };

  const copy = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const donorName = (id: string) => donors?.find((d) => d.id === id)?.full_name ?? 'Donor';

  return (
    <div className="space-y-3 rounded-lg border border-sky-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Share2 className="h-4 w-4 text-sky-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Network Multiplier</h3>
      </div>
      <p className="text-xs text-neutral-500">
        A donor tells you who they'd share with and why they gave — the AI writes a short note in
        their voice they can forward. A trusted friend's ask outperforms any campaign blast.
      </p>

      <div className="space-y-2">
        <select
          className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={donorId}
          onChange={(e) => setDonorId(e.target.value)}
        >
          <option value="">Which donor is sharing?</option>
          {donors?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <Input
          placeholder="Who's it for? e.g. my coworkers at the clinic"
          value={relationship}
          onChange={(e) => setRelationship(e.target.value)}
        />
        <Input
          placeholder="Why did they give? e.g. school funding matters to my kids"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button size="sm" onClick={run} disabled={draft.isPending || !donorId || !relationship.trim() || !reason.trim()}>
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Writing…' : 'Draft their note'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {asks && asks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Ready to forward</p>
          {asks.map((a) => (
            <div key={a.id} className="rounded-md border border-sky-100 bg-sky-50 p-3">
              <p className="text-xs font-medium text-neutral-800">
                {donorName(a.donor_id)} → {a.relationship}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{a.ask_text}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={() => copy(a.id, a.ask_text)}>
                {copiedId === a.id ? 'Copied!' : 'Copy for donor'}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
