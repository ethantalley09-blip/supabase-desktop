import { Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useRebuttal, type OpponentRecord } from './useCompete';

// Rapid Rebuttal: opponent made a claim -> a truth-first response pack in
// minutes (campaign statement + social + what canvassers say at the door).
// Truth-sandwich structure is enforced in the system prompt: never amplify
// the claim, never invent a fact-check.
export function RapidRebuttal({
  orgId,
  projectId,
  records
}: {
  orgId: string;
  projectId: string;
  records: OpponentRecord[] | undefined;
}) {
  const rebut = useRebuttal();
  const [recordId, setRecordId] = useState('');
  const [facts, setFacts] = useState('');

  const record = records?.find((r) => r.id === recordId);

  return (
    <div className="space-y-3 rounded-lg border border-red-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-red-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Rapid Rebuttal</h3>
      </div>
      <p className="text-xs text-neutral-500">
        They said something wrong about you. Pick the logged claim, give the true facts, and get a
        response pack — statement, social post, and a script for what canvassers say at the door.
      </p>

      <select
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        value={recordId}
        onChange={(e) => setRecordId(e.target.value)}
      >
        <option value="">Which logged claim are you answering?</option>
        {records?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.occurred_on} — {r.content.slice(0, 80)}
          </option>
        ))}
      </select>
      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="The true facts, in your words. e.g. She voted FOR the levy in 2024 — it's in the county record."
        value={facts}
        onChange={(e) => setFacts(e.target.value)}
      />
      <Button
        size="sm"
        onClick={() => record && rebut.mutate({ orgId, projectId, record, correctingFacts: facts.trim() })}
        disabled={rebut.isPending || !record || !facts.trim()}
      >
        <Sparkles className="h-4 w-4" />
        {rebut.isPending ? 'Drafting…' : 'Draft rebuttal'}
      </Button>
      {rebut.isError && <p className="text-sm text-red-600">{(rebut.error as Error).message}</p>}

      {rebut.data && (
        <div className="space-y-2">
          {([
            ['Campaign statement', rebut.data.statement],
            ['Social', rebut.data.social],
            ['At the door', rebut.data.door_response]
          ] as const).map(([label, text]) => (
            <div key={label} className="rounded-md border border-red-100 bg-red-50 p-3">
              <p className="text-xs font-semibold text-neutral-800">{label}</p>
              <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
