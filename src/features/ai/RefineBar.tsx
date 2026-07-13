import { Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAiAssist } from '@/lib/ai/useAiAssist';

// Quick one-tap rewrites offered under any generated message.
const PRESETS: { label: string; instruction: string }[] = [
  { label: 'Shorter', instruction: 'Make it noticeably shorter and tighter.' },
  { label: 'Warmer', instruction: 'Make it warmer and more personable.' },
  { label: 'More urgent', instruction: 'Make it more urgent and action-oriented.' },
  { label: 'Simpler', instruction: 'Use simpler, plainer language.' },
  { label: 'Fix grammar', instruction: 'Fix any grammar and spelling issues, keeping the wording otherwise.' }
];

// Refine an already-generated message with a preset or custom instruction.
// Drops in under drafting outputs; preserves facts (the system prompt forbids
// adding claims), so it's a safe polish rather than a rewrite of substance.
export function RefineBar({
  orgId,
  projectId,
  text,
  onResult
}: {
  orgId: string;
  projectId: string;
  text: string;
  // Lets the parent replace its draft with the refined version, so refines can
  // chain (refine the refined text).
  onResult?: (refined: string) => void;
}) {
  const refine = useAiAssist();
  const [custom, setCustom] = useState('');

  const run = (instruction: string) => {
    if (!instruction.trim() || !text.trim()) return;
    refine.mutate(
      { orgId, projectId, purpose: 'refine', context: text, instructions: instruction },
      { onSuccess: (data) => onResult?.(data.text) }
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          <Wand2 className="h-3.5 w-3.5" /> Refine:
        </span>
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => run(p.instruction)}
            disabled={refine.isPending}
            className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          placeholder="…or describe a change (e.g. add a call to volunteer Saturday)"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run(custom)}
        />
        <Button variant="outline" size="sm" onClick={() => run(custom)} disabled={refine.isPending || !custom.trim()}>
          {refine.isPending ? 'Refining…' : 'Refine'}
        </Button>
      </div>
      {refine.isError && <p className="text-sm text-red-600">{(refine.error as Error).message}</p>}
      {refine.data && !onResult && (
        <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
          {refine.data.text}
        </div>
      )}
    </div>
  );
}
