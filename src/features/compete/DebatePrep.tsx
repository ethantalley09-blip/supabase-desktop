import { Mic2, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDebatePrep, type OpponentRecord } from './useCompete';

// Debate Prep: from the logged opponent record + our stated positions, the 5
// most likely attacks with honest responses and a pivot line for each. The
// prompt never coaches lying — responses acknowledge what's true.
export function DebatePrep({
  orgId,
  projectId,
  records
}: {
  orgId: string;
  projectId: string;
  records: OpponentRecord[] | undefined;
}) {
  const prep = useDebatePrep();
  const [positions, setPositions] = useState('');

  return (
    <div className="space-y-3 rounded-lg border border-amber-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Mic2 className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Debate Prep</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Walk in knowing what's coming. From their logged record and your positions, get the 5 most
        likely attacks — each with an honest response and a pivot back to your ground.
      </p>

      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Your candidate's key positions, one per line. e.g. Renew the school levy / Fix the Main St corridor / No new city income tax"
        value={positions}
        onChange={(e) => setPositions(e.target.value)}
      />
      <Button
        size="sm"
        onClick={() => records && prep.mutate({ orgId, projectId, records, ourPositions: positions.trim() })}
        disabled={prep.isPending || !positions.trim() || !(records?.length)}
      >
        <Sparkles className="h-4 w-4" />
        {prep.isPending ? 'Preparing…' : 'Build prep sheet'}
      </Button>
      {prep.isError && <p className="text-sm text-red-600">{(prep.error as Error).message}</p>}

      {prep.data && (
        <div className="space-y-2">
          {prep.data.attacks.map((a, i) => (
            <div key={i} className="rounded-md border border-amber-100 bg-amber-50 p-3">
              <p className="text-xs font-semibold text-neutral-900">Likely attack: {a.attack}</p>
              <p className="mt-1 text-xs text-neutral-700">
                <span className="font-medium">Respond:</span> {a.response}
              </p>
              <p className="mt-0.5 text-xs text-neutral-700">
                <span className="font-medium">Pivot:</span> {a.pivot}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
