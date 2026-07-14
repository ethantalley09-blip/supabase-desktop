import { Archive, BookOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAddOpponentRecord, useArchiveOpponentRecord, type OpponentRecord } from './useCompete';

const RECORD_TYPES: { value: OpponentRecord['record_type']; label: string }[] = [
  { value: 'statement', label: 'Statement' },
  { value: 'vote', label: 'Vote' },
  { value: 'ad', label: 'Ad' },
  { value: 'endorsement', label: 'Endorsement' },
  { value: 'filing', label: 'Public filing' },
  { value: 'news', label: 'News story' }
];

// The data foundation of the Compete tab: a hand-kept log of the opponent's
// public record. Every AI tool on this tab reads from here and nowhere else.
export function OpponentLog({
  orgId,
  projectId,
  records
}: {
  orgId: string;
  projectId: string;
  records: OpponentRecord[] | undefined;
}) {
  const add = useAddOpponentRecord();
  const archive = useArchiveOpponentRecord();
  const [recordType, setRecordType] = useState<OpponentRecord['record_type']>('statement');
  const [occurredOn, setOccurredOn] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');

  const submit = () => {
    if (!occurredOn || !content.trim()) return;
    add.mutate(
      { orgId, projectId, recordType, occurredOn, source, content },
      { onSuccess: () => { setContent(''); setSource(''); } }
    );
  };

  return (
    <div className="space-y-3 rounded-lg border border-indigo-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-indigo-600" />
        <h3 className="text-sm font-semibold text-neutral-900">
          Opponent log ({records?.length ?? 0} entries)
        </h3>
      </div>
      <p className="text-xs text-neutral-500">
        Step 1 of everything on this tab: log what the opponent said or did publicly. Be exact —
        the tools quote your entries word for word, so what you type here is what gets used.
      </p>

      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
          value={recordType}
          onChange={(e) => setRecordType(e.target.value as OpponentRecord['record_type'])}
        >
          {RECORD_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <Input type="date" className="w-40" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        <Input
          className="min-w-40 flex-1"
          placeholder="Source — outlet, URL, or event (e.g. Channel 4 debate)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />
      </div>
      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder={'What did they say or do? e.g. "Said they would vote against the school levy renewal."'}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <Button size="sm" onClick={submit} disabled={add.isPending || !occurredOn || !content.trim()}>
        <Plus className="h-4 w-4" />
        {add.isPending ? 'Saving…' : 'Log it'}
      </Button>
      {add.isError && <p className="text-sm text-red-600">{(add.error as Error).message}</p>}

      {records && records.length > 0 && (
        <div className="max-h-64 space-y-1.5 overflow-y-auto">
          {records.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-2 rounded-md bg-neutral-50 p-2.5">
              <div className="min-w-0">
                <p className="text-xs font-medium text-neutral-800">
                  {RECORD_TYPES.find((t) => t.value === r.record_type)?.label} · {r.occurred_on}
                  {r.source ? ` · ${r.source}` : ''}
                </p>
                <p className="text-xs text-neutral-600">{r.content}</p>
              </div>
              <button
                type="button"
                title="Archive"
                onClick={() => archive.mutate({ id: r.id, projectId })}
                className="shrink-0"
              >
                <Archive className="h-3.5 w-3.5 text-neutral-400 hover:text-neutral-700" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
