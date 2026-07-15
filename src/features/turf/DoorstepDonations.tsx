import { HandCoins, Sparkles, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDonations } from '@/features/fundraising/useFundraising';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import { useQuickInsight } from '@/lib/ai/useQuickInsight';
import { canvasserLeaderboard, scoreDoors, type WarmDoor } from './doorstep';
import type { VoterRecord } from './useTurf';

type Pitch = { pitch: string; if_yes: string; if_no: string; suggested_ask_dollars: number };

// Doorstep Donations: the feature only Lynx can build, because only Lynx has
// turf AND fundraising in one place. Warm-door scoring is instant client-side
// math on real canvass notes (see doorstep.ts); the AI only words the
// 20-second ask. The leaderboard attributes real recorded gifts to the team
// member who logged them (RLS: it simply stays empty for roles that can't
// read donations).
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
  const ai = useAiAssist();
  const [pitchFor, setPitchFor] = useState<string | null>(null);
  const [pitch, setPitch] = useState<Pitch | null>(null);

  const warmDoors = useMemo(() => scoreDoors(voters), [voters]);
  const leaderboard = useMemo(() => canvasserLeaderboard(donations ?? []).slice(0, 5), [donations]);

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
              {canUseAi && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-1.5"
                  onClick={() => getPitch(d)}
                  disabled={ai.isPending}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {ai.isPending && pitchFor === d.voterId ? 'Writing…' : '20-second ask'}
                </Button>
              )}
              {pitch && pitchFor === d.voterId && (
                <div className="mt-2 space-y-1 rounded bg-white p-2.5 text-xs text-neutral-700">
                  <p className="whitespace-pre-wrap">{pitch.pitch}</p>
                  <p><span className="font-semibold">Suggested ask:</span> ${pitch.suggested_ask_dollars}</p>
                  <p><span className="font-semibold">If yes:</span> {pitch.if_yes}</p>
                  <p><span className="font-semibold">If no:</span> {pitch.if_no}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {ai.isError && <p className="text-sm text-red-600">{(ai.error as Error).message}</p>}

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
