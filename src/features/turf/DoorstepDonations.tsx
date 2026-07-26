import { HandCoins, Home, Repeat, Sparkles, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatUsd, useDonations, useRecordDonation } from '@/features/fundraising/useFundraising';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { useQuickInsight } from '@/lib/ai/useQuickInsight';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { canvasserLeaderboard, scoreDoors, type WarmDoor } from './doorstep';
import { findDoorstepRecurringTargets } from './doorstepRecurringUpgrade';
import { findHouseholdCascadeTargets } from './householdCascade';
import { groupIntoHouseholds } from './households';
import { useCanvassVisits, type VoterRecord } from './useTurf';

type Pitch = { pitch: string; if_yes: string; if_no: string; suggested_ask_dollars: number };
type CascadeAsk = { message: string; suggested_ask_dollars: number };
type RecurringAsk = { opener: string; ask: string; suggested_monthly_dollars: number };
type ReferralAsk = { thank_you: string; referral_ask: string };

// Doorstep Donations: the feature only Lynx can build, because only Lynx has
// turf AND fundraising in one place. Warm-door scoring is instant client-side
// math on real canvass notes (see doorstep.ts); the AI only words the
// 20-second ask. The leaderboard attributes real recorded gifts to the team
// member who logged them (RLS: it simply stays empty for roles that can't
// read donations). "Record gift" closes the loop this feature always lacked:
// a doorstep ask that leads to a real gift now writes voter_id (migration
// 0032) back onto the donation, which is what powers Household Cascade below
// plus Momentum Ask, Peak Ask Window, Territory Fundraising ROI, and
// Persistence Pays in TurfBriefing.tsx.
export function DoorstepDonations({
  orgId,
  projectId,
  voters,
  canUseAi
}: {
  orgId: string;
  projectId: string;
  voters: VoterRecord[];
  canUseAi: boolean;
}) {
  const { data: donations } = useDonations(projectId);
  const { data: visits } = useCanvassVisits(projectId);
  const ai = useAiAssist();
  const cascadeAi = useAiAssist();
  const recurringAi = useAiAssist();
  const referralAi = useAiAssist();
  const recordDonation = useRecordDonation();
  const [pitchFor, setPitchFor] = useState<string | null>(null);
  const [pitch, setPitch] = useState<Pitch | null>(null);
  const [cascadeFor, setCascadeFor] = useState<string | null>(null);
  const [cascadeAsk, setCascadeAsk] = useState<CascadeAsk | null>(null);
  const [recurringFor, setRecurringFor] = useState<string | null>(null);
  const [recurringAsk, setRecurringAsk] = useState<RecurringAsk | null>(null);
  const [recordingFor, setRecordingFor] = useState<string | null>(null);
  const [recordAmount, setRecordAmount] = useState('');
  const [referralFor, setReferralFor] = useState<string | null>(null);
  const [referralAsk, setReferralAsk] = useState<ReferralAsk | null>(null);

  // Recording a gift writes into the fundraising module directly, so it
  // needs that module's own permission + entitlement — turf.view (which
  // already gates this whole component) isn't enough on its own. RLS
  // enforces this regardless (invariant #1); this only controls whether the
  // button renders.
  const canManageFundraising = useHasPermission(orgId, 'fundraising.manage');
  const fundraisingEntitled = useEntitlement(orgId, 'fundraising_module', projectId);
  const canRecordGift = Boolean(canManageFundraising.data) && Boolean(fundraisingEntitled.data);

  const warmDoors = useMemo(() => scoreDoors(voters), [voters]);
  const leaderboard = useMemo(() => canvasserLeaderboard(donations ?? []).slice(0, 5), [donations]);
  const households = useMemo(() => groupIntoHouseholds(voters), [voters]);
  const cascadeTargets = useMemo(
    () => findHouseholdCascadeTargets(households, donations ?? []).slice(0, 5),
    [households, donations]
  );
  const recurringTargets = useMemo(
    () => findDoorstepRecurringTargets(donations ?? [], visits ?? []).slice(0, 5),
    [donations, visits]
  );

  // Passive enhancement: the ranking above is exact and already rendered.
  // One celebratory sentence layered on top, never a replacement.
  const shoutout = useQuickInsight({
    orgId,
    projectId,
    framing: 'Canvasser doorstep-fundraising leaderboard — upbeat, celebratory shoutout tone',
    data: leaderboard,
    enabled: canUseAi && leaderboard.length > 0
  });

  const getPitch = (d: WarmDoor) => {
    setPitchFor(d.voterId);
    setPitch(null);
    ai.mutate(
      {
        orgId,
        projectId,
        purpose: 'doorstep_pitch',
        context: JSON.stringify({
          warm_signals: d.reasons,
          voter_language: d.language,
          how_to_give: 'we text a secure donation link on the spot'
        })
      },
      {
        onSuccess: (res) => setPitch(extractJson<Pitch>(res.text))
      }
    );
  };

  const getCascadeAsk = (target: (typeof cascadeTargets)[number], askTarget: { voterId: string; name: string }) => {
    setCascadeFor(askTarget.voterId);
    setCascadeAsk(null);
    cascadeAi.mutate(
      {
        orgId,
        projectId,
        purpose: 'household_cascade_ask',
        context: JSON.stringify({ givingMemberName: target.givingMemberName, askTargetName: askTarget.name })
      },
      { onSuccess: (res) => setCascadeAsk(extractJson<CascadeAsk>(res.text)) }
    );
  };

  const getRecurringAsk = (target: (typeof recurringTargets)[number]) => {
    setRecurringFor(target.voterId);
    setRecurringAsk(null);
    recurringAi.mutate(
      {
        orgId,
        projectId,
        purpose: 'doorstep_recurring_ask',
        context: JSON.stringify({ name: target.name, lastGiftCents: target.lastGiftCents, lean: target.lean })
      },
      { onSuccess: (res) => setRecurringAsk(extractJson<RecurringAsk>(res.text)) }
    );
  };

  const startRecording = (d: WarmDoor) => {
    setRecordingFor(d.voterId);
    setRecordAmount(pitch && pitchFor === d.voterId ? String(pitch.suggested_ask_dollars) : '');
  };

  const saveGift = (d: WarmDoor) => {
    const dollars = Number(recordAmount);
    if (!dollars || dollars <= 0) return;
    recordDonation.mutate(
      {
        projectId,
        orgId,
        amountCents: Math.round(dollars * 100),
        donatedAt: new Date().toISOString(),
        paymentMethod: 'cash',
        newDonor: { full_name: d.name },
        voterId: d.voterId
      },
      {
        onSuccess: () => {
          setRecordingFor(null);
          // Doorstep Referral Ask: the moment right after a REAL gift is the
          // warmest a donor will ever be — captures that momentum instead of
          // letting it pass. Only fires when AI is available; the gift itself
          // has already saved either way.
          if (canUseAi) {
            setReferralFor(d.voterId);
            setReferralAsk(null);
            referralAi.mutate(
              {
                orgId,
                projectId,
                purpose: 'doorstep_referral_ask',
                context: JSON.stringify({ name: d.name, amountDollars: dollars, address: d.address })
              },
              { onSuccess: (res) => setReferralAsk(extractJson<ReferralAsk>(res.text)) }
            );
          }
        }
      }
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <HandCoins className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-neutral-900">
          Doorstep Donations — warm doors ({warmDoors.length})
        </h3>
      </div>
      <p className="text-xs text-neutral-500">
        Doors where your own canvass notes show real support — the only doors worth a donation ask.
        Scored instantly from your data, with the reason next to every name. Ask small, in person:
        a $10 doorstep gift makes a donor for life.
      </p>

      {warmDoors.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No warm doors yet — they appear as canvassers log supportive notes (mentions of support,
          yard signs, volunteering, donating).
        </p>
      ) : (
        <div className="space-y-1.5">
          {warmDoors.map((d) => (
            <div key={d.voterId} className="rounded-md border border-emerald-100 bg-emerald-50 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-xs font-medium text-neutral-900">
                  {d.name} · {d.address}
                  {d.language && d.language !== 'English' ? ` · speaks ${d.language}` : ''}
                </p>
                <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                  {d.score}
                </span>
              </div>
              <p className="text-xs text-neutral-600">{d.reasons.join(' · ')}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {canUseAi && (
                  <Button size="sm" variant="outline" onClick={() => getPitch(d)} disabled={ai.isPending}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {ai.isPending && pitchFor === d.voterId ? 'Writing…' : '20-second ask'}
                  </Button>
                )}
                {canRecordGift && recordingFor !== d.voterId && (
                  <Button size="sm" variant="outline" onClick={() => startRecording(d)}>
                    <HandCoins className="h-3.5 w-3.5" />
                    Record gift
                  </Button>
                )}
              </div>
              {pitch && pitchFor === d.voterId && (
                <div className="mt-2 space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
                  <p className="whitespace-pre-wrap">{pitch.pitch}</p>
                  <p><span className="font-semibold">Suggested ask:</span> ${pitch.suggested_ask_dollars}</p>
                  <p><span className="font-semibold">If yes:</span> {pitch.if_yes}</p>
                  <p><span className="font-semibold">If no:</span> {pitch.if_no}</p>
                </div>
              )}
              {recordingFor === d.voterId && (
                <div className="mt-2 flex items-center gap-2 rounded bg-white p-2.5">
                  <span className="text-xs text-neutral-500">$</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    className="h-7 w-24"
                    value={recordAmount}
                    onChange={(e) => setRecordAmount(e.target.value)}
                    autoFocus
                  />
                  <Button size="sm" onClick={() => saveGift(d)} disabled={recordDonation.isPending}>
                    {recordDonation.isPending ? 'Saving…' : 'Save gift'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setRecordingFor(null)}>
                    Cancel
                  </Button>
                </div>
              )}
              {referralFor === d.voterId && (referralAi.isPending || referralAsk || referralAi.isError) && (
                <div className="mt-2 space-y-1 rounded border border-amber-200 bg-amber-50 p-2.5 text-xs text-neutral-700">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Doorstep Referral Ask
                  </p>
                  {referralAi.isPending && <p className="text-neutral-500">Drafting…</p>}
                  {referralAi.isError && <p className="text-red-600">{(referralAi.error as Error).message}</p>}
                  {referralAsk && (
                    <>
                      <p>{referralAsk.thank_you}</p>
                      <p className="text-amber-700">→ {referralAsk.referral_ask}</p>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {ai.isError && <p className="text-sm text-red-600">{(ai.error as Error).message}</p>}
      {recordDonation.isError && (
        <p className="text-sm text-red-600">{(recordDonation.error as Error).message}</p>
      )}

      {cascadeTargets.length > 0 && canUseAi && (
        <div className="space-y-2 rounded-md border border-indigo-200 bg-indigo-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-900">
            <Home className="h-3.5 w-3.5" />
            Household Cascade — one member already gave
          </p>
          <p className="text-xs text-neutral-500">
            {'Real linked gifts (migration 0032) show one person at this address already supports the campaign — the rest of the household is a warm ask, not a cold one.'}
          </p>
          <div className="space-y-2">
            {cascadeTargets.map((t) => (
              <div key={t.householdKey} className="rounded bg-white p-2 text-xs">
                <p className="text-neutral-600">
                  {t.address}: {t.givingMemberName} already gave {formatUsd(t.givingMemberAmountCents)}
                </p>
                {t.askTargets.map((a) => (
                  <div key={a.voterId} className="mt-1 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-neutral-700">{a.name}</span>
                      <Button size="sm" variant="outline" onClick={() => getCascadeAsk(t, a)} disabled={cascadeAi.isPending}>
                        <Sparkles className="h-3.5 w-3.5" />
                        {cascadeAi.isPending && cascadeFor === a.voterId ? '…' : 'Get ask'}
                      </Button>
                    </div>
                    {cascadeAsk && cascadeFor === a.voterId && (
                      <div className="space-y-1 rounded bg-indigo-50 p-2 text-neutral-700">
                        <p>{cascadeAsk.message}</p>
                        <p className="font-medium text-indigo-700">Suggested ask: ${cascadeAsk.suggested_ask_dollars}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {cascadeAi.isError && <p className="text-sm text-red-600">{(cascadeAi.error as Error).message}</p>}
        </div>
      )}

      {recurringTargets.length > 0 && canUseAi && (
        <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-teal-900">
            <Repeat className="h-3.5 w-3.5" />
            Doorstep Recurring Upgrade
          </p>
          <p className="text-xs text-neutral-500">
            A real doorstep donor whose most recent visit still shows a supportive lean — worth a small monthly
            upgrade ask on the next visit.
          </p>
          <div className="space-y-2">
            {recurringTargets.map((t) => (
              <div key={t.voterId} className="space-y-1 rounded bg-white p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-700">
                    {t.name}: gave {formatUsd(t.lastGiftCents)} · {t.lean.replace('_', ' ')}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => getRecurringAsk(t)} disabled={recurringAi.isPending}>
                    <Sparkles className="h-3.5 w-3.5" />
                    {recurringAi.isPending && recurringFor === t.voterId ? '…' : 'Get ask'}
                  </Button>
                </div>
                {recurringAsk && recurringFor === t.voterId && (
                  <div className="space-y-1 rounded bg-teal-50 p-2 text-neutral-700">
                    <p>{recurringAsk.opener}</p>
                    <p className="text-teal-700">→ {recurringAsk.ask}</p>
                    <p className="font-medium">Suggested monthly ask: ${recurringAsk.suggested_monthly_dollars}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          {recurringAi.isError && <p className="text-sm text-red-600">{(recurringAi.error as Error).message}</p>}
        </div>
      )}

      {leaderboard.length > 0 && (
        <div className="rounded-md border border-neutral-200 p-3">
          <div className="flex items-center gap-1.5">
            <Trophy className="h-3.5 w-3.5 text-amber-500" />
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-600">
              Who's bringing it in
            </p>
          </div>
          <div className="mt-1.5 space-y-1">
            {leaderboard.map((r, i) => (
              <div key={r.recorderId} className="flex items-center justify-between text-xs">
                <span className="text-neutral-700">
                  {i + 1}. {r.name}
                </span>
                <span className="font-medium text-neutral-900">
                  ${Math.round(r.totalCents / 100).toLocaleString()} · {r.giftCount} gifts
                </span>
              </div>
            ))}
          </div>
          {shoutout.data && (
            <p className="mt-2 flex items-start gap-1.5 border-t border-neutral-100 pt-2 text-xs text-violet-700">
              <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
              {shoutout.data}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
