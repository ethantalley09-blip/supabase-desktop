import { GitCompare, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useContrast, type OpponentRecord } from './useCompete';

// Contrast Builder: their logged position vs. ours, side by side -> an email,
// a social post, and 3 volunteer talking points. Issues only — the system
// prompt refuses personal material and never extends their quote.
export function ContrastBuilder({
  orgId,
  projectId,
  records
}: {
  orgId: string;
  projectId: string;
  records: OpponentRecord[] | undefined;
}) {
  const contrast = useContrast();
  const [recordId, setRecordId] = useState('');
  const [position, setPosition] = useState('');

  const record = records?.find((r) => r.id === recordId);

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <GitCompare className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Contrast Builder</h3>
      </div>
      <p className="text-xs text-neutral-500">
        The cleanest attack is a clean comparison. Pick their logged position, state yours, and get
        contrast messaging that sticks to the issues.
      </p>

      <select
        className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
        value={recordId}
        onChange={(e) => setRecordId(e.target.value)}
      >
        <option value="">Their position (from the log)</option>
        {records?.map((r) => (
          <option key={r.id} value={r.id}>
            {r.occurred_on} — {r.content.slice(0, 80)}
          </option>
        ))}
      </select>
      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Our position, in your words. e.g. We support renewing the school levy — it funds 40 classroom aides."
        value={position}
        onChange={(e) => setPosition(e.target.value)}
      />
      <Button
        size="sm"
        onClick={() => record && contrast.mutate({ orgId, projectId, record, ourPosition: position.trim() })}
        disabled={contrast.isPending || !record || !position.trim()}
      >
        <Sparkles className="h-4 w-4" />
        {contrast.isPending ? 'Building…' : 'Build contrast'}
      </Button>
      {contrast.isError && <p className="text-sm text-red-600">{(contrast.error as Error).message}</p>}

      {contrast.data && (
        <div className="space-y-2">
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Email — {contrast.data.email.subject}</p>
            <p className="mt-1 whitespace-pre-wrap text-xs text-neutral-700">{contrast.data.email.body}</p>
          </div>
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Social</p>
            <p className="mt-1 text-xs text-neutral-700">{contrast.data.social}</p>
          </div>
          <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
            <p className="text-xs font-semibold text-neutral-800">Volunteer talking points</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-neutral-700">
              {contrast.data.talking_points.map((tp, i) => (
                <li key={i}>{tp}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
