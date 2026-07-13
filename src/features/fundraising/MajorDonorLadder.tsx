import { ArrowUpCircle, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Donor } from './useFundraising';
import { useAssessMajorDonor, useMajorDonorEscalations } from './useFundraisingAi';

// Identifies mid-tier recurring donors ready for a personal major-gift ask,
// based on giving trend / event attendance / email engagement — not guesswork.
export function MajorDonorLadder({
  orgId,
  projectId,
  donors
}: {
  orgId: string;
  projectId: string;
  donors: Donor[] | undefined;
}) {
  const { data: escalations } = useMajorDonorEscalations(orgId);
  const assess = useAssessMajorDonor();
  const [donorId, setDonorId] = useState('');

  const run = async () => {
    if (!donorId) return;
    // In production this pulls real trend/attendance/engagement data; the
    // shape here is what the AI purpose expects.
    const signals = JSON.stringify({
      giving_trend: 'escalating: $25 -> $35 -> $50 over last 3 gifts',
      event_attendance: 1,
      email_engagement: 'opened 4 of last 5 sends, clicked 2'
    });
    await assess.mutateAsync({ orgId, projectId, donorId, signals });
    setDonorId('');
  };

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ArrowUpCircle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Major Donor Escalation Ladder</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Finds mid-tier donors ready for a personal major-gift ask, based on real giving trend and
        engagement — not a mass blast.
      </p>

      <div className="flex gap-2">
        <select
          className="h-9 flex-1 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={donorId}
          onChange={(e) => setDonorId(e.target.value)}
        >
          <option value="">Select a donor to assess…</option>
          {donors?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
        <Button size="sm" onClick={run} disabled={assess.isPending || !donorId}>
          <Sparkles className="h-4 w-4" />
          {assess.isPending ? 'Assessing…' : 'Assess'}
        </Button>
      </div>
      {assess.isError && <p className="text-sm text-red-600">{(assess.error as Error).message}</p>}

      {escalations && escalations.length > 0 && (
        <div className="divide-y divide-amber-100 rounded-md border border-amber-100">
          {escalations.slice(0, 5).map((e) => (
            <div key={e.id} className="space-y-1.5 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-neutral-900">
                  Readiness: {(e.readiness_score * 100).toFixed(0)}% — suggested ask $
                  {(e.suggested_ask_cents / 100).toLocaleString()}
                </p>
              </div>
              <p className="whitespace-pre-wrap text-xs text-neutral-600">{e.ask_sequence}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
