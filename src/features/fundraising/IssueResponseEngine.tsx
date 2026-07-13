import { Megaphone, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Donation } from './useFundraising';
import { warmSegment } from './runway';
import { useDraftIssueResponse, useIssueEvents } from './useGrowthAi';

const EVENT_TYPES = [
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'news', label: 'News story' },
  { value: 'opponent', label: 'Opponent statement' },
  { value: 'milestone', label: 'Campaign milestone' },
  { value: 'other', label: 'Other' }
] as const;

// Issue Response Engine: something real just happened — the response window
// is hours, not days. One description in, a coordinated pack out (2 email
// angles + SMS + social), plus the warm segment (donors who gave in the last
// 45 days, computed from real gifts) most likely to respond right now.
// Guardrail: the model may only describe the event as staff stated it.
export function IssueResponseEngine({
  orgId,
  projectId,
  donations
}: {
  orgId: string;
  projectId: string;
  donations: Donation[] | undefined;
}) {
  const { data: events } = useIssueEvents(projectId);
  const draft = useDraftIssueResponse();
  const [eventType, setEventType] = useState<string>('endorsement');
  const [description, setDescription] = useState('');

  const warm = useMemo(
    () => warmSegment((donations ?? []).map((d) => ({ donorId: d.donor_id, donatedAt: d.donated_at }))),
    [donations]
  );

  const run = () => {
    if (!description.trim()) return;
    draft.mutate({
      orgId,
      projectId,
      eventType,
      description: description.trim(),
      warmSegmentSize: warm.length
    });
    setDescription('');
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Issue Response Engine</h3>
      </div>
      <p className="text-xs text-neutral-500">
        When news breaks, the response window is hours. Describe what happened and get a coordinated
        pack — two email angles, an SMS, a social post — grounded only in what you wrote.
      </p>

      <div className="rounded-md border border-violet-100 bg-violet-50 p-2.5">
        <p className="text-xs text-violet-900">
          <span className="font-semibold">{warm.length} warm donors</span> gave in the last 45 days —
          your most likely responders to a same-day ask.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <textarea
          rows={2}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          placeholder="What just happened? e.g. The Teachers Union endorsed us this morning."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button size="sm" onClick={run} disabled={draft.isPending || !description.trim()}>
          <Sparkles className="h-4 w-4" />
          {draft.isPending ? 'Building pack…' : 'Build response pack'}
        </Button>
      </div>
      {draft.isError && <p className="text-sm text-red-600">{(draft.error as Error).message}</p>}

      {events && events.length > 0 && (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="rounded-md border border-neutral-200 p-3">
              <p className="text-sm font-medium text-neutral-900">
                {EVENT_TYPES.find((t) => t.value === ev.event_type)?.label ?? ev.event_type}: {ev.description}
              </p>
              {ev.responses && (
                <div className="mt-2 space-y-2">
                  {([ev.responses.email_a, ev.responses.email_b] as const).map((em, i) => (
                    <div key={i} className="rounded bg-neutral-50 p-2">
                      <p className="text-xs font-semibold text-neutral-800">
                        Email ({em.angle}): {em.subject}
                      </p>
                      <p className="whitespace-pre-wrap text-xs text-neutral-600">{em.body}</p>
                    </div>
                  ))}
                  <div className="rounded bg-neutral-50 p-2">
                    <p className="text-xs font-semibold text-neutral-800">SMS</p>
                    <p className="text-xs text-neutral-600">{ev.responses.sms}</p>
                  </div>
                  <div className="rounded bg-neutral-50 p-2">
                    <p className="text-xs font-semibold text-neutral-800">Social</p>
                    <p className="text-xs text-neutral-600">{ev.responses.social}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
