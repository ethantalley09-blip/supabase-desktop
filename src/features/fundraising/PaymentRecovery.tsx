import { CreditCard, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Donor } from './useFundraising';
import { useDraftPaymentRecovery, usePendingPaymentRecoveries } from './useFundraisingAi';

const FAILURE_TYPES = [
  { value: 'expired_card', label: 'Card expired' },
  { value: 'declined', label: 'Declined' },
  { value: 'insufficient_funds', label: 'Insufficient funds' },
  { value: 'other', label: 'Other' }
];

// Recovers recurring revenue lost to card failures — a different leak than
// behavioral churn: the donor still wants to give, the card just failed.
// Industry data suggests 20-30% of recurring revenue leaks here, silently.
export function PaymentRecovery({
  orgId,
  projectId,
  donors
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
}) {
  const { data: pending } = usePendingPaymentRecoveries(orgId);
  const draft = useDraftPaymentRecovery();
  const [donorId, setDonorId] = useState('');
  const [failureType, setFailureType] = useState(FAILURE_TYPES[0].value);
  const [amount, setAmount] = useState('25');

  const run = async () => {
    if (!donorId) return;
    await draft.mutateAsync({
      orgId,
      projectId,
      donorId,
      failureType,
      failedAmountCents: Math.round(Number(amount) * 100)
    });
    setDonorId('');
  };

  return (
    <div className="space-y-3 rounded-lg border border-cyan-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-cyan-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Failed Payment Recovery</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Recovers recurring revenue lost to card failures — the donor still wants to give, the card
        just failed. A warm, non-alarming nudge, not a collections email.
      </p>

      <div className="flex flex-wrap gap-2">
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
        <select
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={failureType}
          onChange={(e) => setFailureType(e.target.value)}
        >
          {FAILURE_TYPES.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <Input type="number" className="w-24" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Button size="sm" onClick={run} disabled={draft.isPending || !donorId}>
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Drafting…' : 'Draft Recovery'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {pending && pending.length > 0 && (
        <div className="rounded-md border border-cyan-100 bg-cyan-50 p-3">
          <p className="text-sm font-medium text-cyan-900">
            {pending.length} pending recover{pending.length === 1 ? 'y' : 'ies'} — $
            {(pending.reduce((s, p) => s + p.failed_amount_cents, 0) / 100).toLocaleString()} in recoverable
            revenue
          </p>
        </div>
      )}
    </div>
  );
}
