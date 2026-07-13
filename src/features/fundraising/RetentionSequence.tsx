import { Heart, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Donor } from './useFundraising';
import { useDraftRetentionSequence } from './useFundraisingAi';

// The first 48 hours after a gift determine if a donor becomes recurring.
// Drafts a timed thank-you -> impact-update -> soft-second-ask sequence
// instead of the generic single thank-you most platforms send.
export function RetentionSequence({
  orgId,
  projectId,
  donors
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
}) {
  const draft = useDraftRetentionSequence();
  const [donorId, setDonorId] = useState('');
  const [amount, setAmount] = useState('50');

  const run = async () => {
    if (!donorId) return;
    const donationContext = JSON.stringify({
      amount_cents: Math.round(Number(amount) * 100),
      donor_history: 'first-time donor'
    });
    await draft.mutateAsync({ orgId, projectId, donorId, donationContext });
  };

  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Post-Donation Retention Sequence</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Drafts a timed 3-part sequence — thank-you, impact update, soft second ask — tuned to turn
        a one-time gift into a recurring donor.
      </p>

      <div className="flex gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={donorId}
          onChange={(e) => setDonorId(e.target.value)}
        >
          <option value="">Select donor…</option>
          {donors?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <input
          type="number"
          className="h-9 w-24 rounded-md border border-neutral-300 px-2 text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <Button size="sm" onClick={run} disabled={draft.isPending || !donorId}>
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Drafting…' : 'Draft Sequence'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {draft.data && (
        <div className="space-y-2">
          <SequenceStep label="Thank-you (sent immediately)" text={draft.data.thank_you} />
          <SequenceStep
            label={`Impact update (+${draft.data.impact_update_delay_days}d)`}
            text={draft.data.impact_update}
          />
          <SequenceStep label={`Second ask (+${draft.data.second_ask_delay_days}d)`} text={draft.data.second_ask} />
        </div>
      )}
    </div>
  );
}

function SequenceStep({ label, text }: { label: string; text: string }) {
  return (
    <div className="rounded-md border border-rose-100 bg-rose-50 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-800">{text}</p>
    </div>
  );
}
