import { HeartPulse, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { scoreLapse } from './runway';
import { useDraftReactivation, useReactivations } from './useGrowthAi';
// Smart Reactivation: lapse detection runs client-side against each donor's
// OWN giving rhythm (a monthly donor 60 days quiet is lapsed; an annual donor
// isn't) — pure fn in runway.ts, works with zero AI calls. The AI drafts the
// 3-angle win-back only when staff asks for it. Distinct from churn_prediction
// (single risk score + one message): this is rhythm-relative staging.
export function ReactivationCenter({ orgId, projectId, donors, donations }) {
    const { data: drafts } = useReactivations(projectId);
    const draft = useDraftReactivation();
    const [openDraft, setOpenDraft] = useState(null);
    // Score every donor from real gifts; keep meaningful lapses only.
    const lapsing = useMemo(() => {
        if (!donors || !donations)
            return [];
        const giftsByDonor = new Map();
        for (const d of donations) {
            const list = giftsByDonor.get(d.donor_id) ?? [];
            list.push({ amountCents: d.amount_cents, donatedAt: d.donated_at });
            giftsByDonor.set(d.donor_id, list);
        }
        return donors
            .map((donor) => {
            const gifts = giftsByDonor.get(donor.id) ?? [];
            const assessment = scoreLapse({ donorId: donor.id, gifts });
            const typical = gifts.length ? Math.round(gifts.reduce((s, g) => s + g.amountCents, 0) / gifts.length) : 0;
            return { donor, assessment, typicalGiftCents: typical, giftCount: gifts.length };
        })
            .filter((x) => x.assessment.lapseScore >= 40)
            .sort((a, b) => b.assessment.lapseScore - a.assessment.lapseScore)
            .slice(0, 8);
    }, [donors, donations]);
    const donorName = (id) => donors?.find((d) => d.id === id)?.full_name ?? 'Donor';
    return (<div className="space-y-3 rounded-lg border border-orange-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <HeartPulse className="h-4 w-4 text-orange-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Reactivation Center</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Catches donors drifting away measured against their own giving rhythm — not a flat "90 days
        quiet" rule — and drafts a 3-angle win-back (impact / urgency / belonging) you pick from.
      </p>

      {lapsing.length === 0 ? (<p className="text-sm text-neutral-500">No donors are meaningfully off their giving rhythm right now.</p>) : (<div className="space-y-2">
          {lapsing.map(({ donor, assessment, typicalGiftCents, giftCount }) => (<div key={donor.id} className="flex items-center justify-between rounded-md border border-orange-100 bg-orange-50 p-3">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {donor.full_name} — lapse score {assessment.lapseScore}
                </p>
                <p className="text-xs text-neutral-600">{assessment.triggerReason}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => draft.mutate({
                    orgId,
                    projectId,
                    donorId: donor.id,
                    lapseScore: assessment.lapseScore,
                    triggerReason: assessment.triggerReason,
                    typicalGiftCents,
                    giftCount
                })} disabled={draft.isPending}>
                <Sparkles className="h-4 w-4"/>
                {draft.isPending ? 'Drafting…' : 'Draft win-back'}
              </Button>
            </div>))}
        </div>)}
      {draft.isError && <p className="text-sm text-red-600">{draft.error.message}</p>}

      {drafts && drafts.length > 0 && (<div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Drafted sequences</p>
          {drafts.map((r) => (<div key={r.id} className="rounded-md border border-neutral-200 p-3">
              <button type="button" className="w-full text-left" onClick={() => setOpenDraft(openDraft === r.id ? null : r.id)}>
                <p className="text-sm font-medium text-neutral-900">
                  {donorName(r.donor_id)} — 3 variants ready {openDraft === r.id ? '▾' : '▸'}
                </p>
              </button>
              {openDraft === r.id && (<div className="mt-2 space-y-2">
                  {['impact', 'urgency', 'peer'].map((angle) => (<div key={angle} className="rounded bg-neutral-50 p-2">
                      <p className="text-xs font-semibold capitalize text-neutral-800">
                        {angle}: {r.sequence[angle].subject}
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-neutral-600">{r.sequence[angle].body}</p>
                    </div>))}
                </div>)}
            </div>))}
        </div>)}
    </div>);
}
