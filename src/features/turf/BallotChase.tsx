import { Sparkles } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist } from '@/lib/ai/useAiAssist';
import {
  useUpdateVoterNotes,
  useUpdateVoterStatus,
  type BallotStatus,
  type ContactStatus,
  type VoterRecord
} from './useTurf';

const CONTACT_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'moved', label: 'Moved' },
  { value: 'bad_address', label: 'Bad address' },
  { value: 'deceased', label: 'Deceased' },
  { value: 'do_not_contact', label: 'Do not contact' }
];

const BALLOT_OPTIONS: { value: BallotStatus; label: string }[] = [
  { value: 'none', label: 'No ballot' },
  { value: 'requested', label: 'Requested' },
  { value: 'returned', label: 'Returned' }
];

const MAX_ROWS = 200;
// Cap notes sent to the model so one huge selection can't blow the context /
// cost; the digest of a representative sample is still useful.
const MAX_NOTES_FOR_AI = 300;

// Vote-by-mail chase board + list hygiene + AI note digest. The three stat
// cards answer the question NGP VAN users keep asking for in one glance (how
// many ballots are out, back, and outstanding). The table is where field staff
// record moves/bad addresses and log door notes. The AI summarizer turns those
// free-text notes into themes + sentiment + flags — the "can't filter notes"
// gap competitors leave open.
export function BallotChase({
  orgId,
  projectId,
  voters,
  visibleVoters,
  canManage,
  canUseAi
}: {
  orgId: string;
  projectId: string;
  voters: VoterRecord[];
  visibleVoters: VoterRecord[];
  canManage: boolean;
  canUseAi: boolean;
}) {
  const updateStatus = useUpdateVoterStatus();
  const updateNotes = useUpdateVoterNotes();
  const aiEnabled = useEntitlement(orgId, 'ai_module');
  const summarize = useAiAssist();
  // AI digest needs both the premium entitlement and the ai.use permission.
  const showAi = canUseAi && Boolean(aiEnabled.data);

  const stats = useMemo(() => {
    let requested = 0;
    let returned = 0;
    for (const v of voters) {
      if (v.ballot_status === 'requested') requested += 1;
      else if (v.ballot_status === 'returned') returned += 1;
    }
    const universe = requested + returned;
    return {
      universe,
      returned,
      outstanding: requested,
      returnRate: universe > 0 ? Math.round((returned / universe) * 100) : 0
    };
  }, [voters]);

  // Notes in the current (filtered) view, for the AI digest.
  const notesInView = useMemo(
    () =>
      visibleVoters
        .map((v) => v.canvass_notes?.trim())
        .filter((n): n is string => Boolean(n)),
    [visibleVoters]
  );

  const rows = visibleVoters.slice(0, MAX_ROWS);
  const digest = summarize.data?.text;

  const runSummary = () =>
    summarize.mutate({
      orgId,
      projectId,
      purpose: 'note_summary',
      notes: notesInView.slice(0, MAX_NOTES_FOR_AI)
    });

  const saveNote = (voter: VoterRecord, next: string) => {
    if (next === (voter.canvass_notes ?? '')) return; // unchanged — skip the write
    updateNotes.mutate({ voterId: voter.id, projectId, notes: next, current: voter });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Ballots requested" value={stats.universe} tone="neutral" />
        <StatCard label="Returned" value={stats.returned} tone="emerald" sub={`${stats.returnRate}% return rate`} />
        <StatCard label="Outstanding" value={stats.outstanding} tone="amber" sub="still to chase" />
      </div>

      {showAi && (
        <div className="space-y-2 rounded-lg border border-violet-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <h3 className="text-sm font-semibold text-neutral-900">AI note digest</h3>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                Premium
              </span>
            </div>
            <Button
              size="sm"
              onClick={runSummary}
              disabled={summarize.isPending || notesInView.length === 0}
            >
              {summarize.isPending ? 'Summarizing…' : `Summarize ${notesInView.length} note${notesInView.length === 1 ? '' : 's'}`}
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            Turns the door notes in the current view into themes, sentiment, and follow-up flags.
            {notesInView.length === 0 && ' No notes in view yet — add some in the table below.'}
          </p>
          {summarize.isError && (
            <p className="text-sm text-red-600">{(summarize.error as Error).message}</p>
          )}
          {digest && (
            <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
              {digest}
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2">Voter</th>
              <th className="px-4 py-2">Address status</th>
              <th className="px-4 py-2">Ballot</th>
              <th className="px-4 py-2">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <tr key={v.id} className="border-t border-neutral-100 align-top">
                <td className="px-4 py-2">
                  <div className="font-medium text-neutral-900">{v.full_name || '—'}</div>
                  <div className="text-xs text-neutral-400">{v.address_line || ''}</div>
                </td>
                <td className="px-4 py-2">
                  {canManage ? (
                    <select
                      className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                      value={v.contact_status}
                      disabled={updateStatus.isPending}
                      onChange={(e) =>
                        updateStatus.mutate({
                          voterId: v.id,
                          projectId,
                          contact_status: e.target.value as ContactStatus,
                          current: v
                        })
                      }
                    >
                      {CONTACT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-neutral-500">
                      {CONTACT_OPTIONS.find((o) => o.value === v.contact_status)?.label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {canManage ? (
                    <select
                      className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
                      value={v.ballot_status}
                      disabled={updateStatus.isPending}
                      onChange={(e) =>
                        updateStatus.mutate({
                          voterId: v.id,
                          projectId,
                          ballot_status: e.target.value as BallotStatus,
                          current: v
                        })
                      }
                    >
                      {BALLOT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-neutral-500">
                      {BALLOT_OPTIONS.find((o) => o.value === v.ballot_status)?.label}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {canManage ? (
                    // Uncontrolled + keyed by id: saves on blur only, so typing
                    // doesn't fire a network write per keystroke.
                    <textarea
                      key={v.id}
                      rows={2}
                      defaultValue={v.canvass_notes ?? ''}
                      placeholder="Door notes…"
                      className="w-full min-w-[12rem] rounded-md border border-neutral-300 px-2 py-1 text-sm"
                      onBlur={(e) => saveNote(v, e.target.value.trim())}
                    />
                  ) : (
                    <span className="text-neutral-500">{v.canvass_notes || '—'}</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-neutral-400">
                  No voters in view. Import voters or adjust the city/ward filter above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {visibleVoters.length > MAX_ROWS && (
          <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-400">
            Showing first {MAX_ROWS} of {visibleVoters.length}. Filter by city/ward to narrow.
          </p>
        )}
      </div>
      {updateStatus.isError && (
        <p className="text-sm text-red-600">{(updateStatus.error as Error).message}</p>
      )}
      {updateNotes.isError && (
        <p className="text-sm text-red-600">{(updateNotes.error as Error).message}</p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone
}: {
  label: string;
  value: number;
  sub?: string;
  tone: 'neutral' | 'emerald' | 'amber';
}) {
  const toneClass = {
    neutral: 'border-neutral-200 bg-white text-neutral-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900'
  }[tone];
  return (
    <div className={`rounded-lg border p-4 ${toneClass}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
      {sub && <p className="text-xs opacity-70">{sub}</p>}
    </div>
  );
}
