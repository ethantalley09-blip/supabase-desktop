import { BarChart3, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { extractJson } from '@/lib/ai/extractJson';
import { useGenerateVariations } from './useFundraisingAi';

export function CopyVariationTester({ orgId, projectId }: { orgId: string; projectId: string }) {
  const generateVariations = useGenerateVariations();
  const [baseMessage, setBaseMessage] = useState('');
  const [orgContext, setOrgContext] = useState('{"deadline":"2025-03-31","has_matching_funds":false,"urgency_level":"moderate"}');
  const [result, setResult] = useState<{
    variant_a: string;
    variant_b: string;
    variant_c: string;
    notes: string;
  } | null>(null);

  const generate = async () => {
    if (!baseMessage.trim()) return;
    const res = await generateVariations.mutateAsync({
      orgId,
      projectId,
      baseMessage,
      orgContext
    });
    setResult(res);
  };

  return (
    <div className="space-y-3 rounded-lg border border-emerald-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-neutral-900">FEC-Compliant A/B Copy Tester</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Generate 3 legal, factual message variants for A/B testing without compliance risk.
      </p>

      <textarea
        rows={3}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Base fundraising message…"
        value={baseMessage}
        onChange={(e) => setBaseMessage(e.target.value)}
      />

      <div>
        <label className="text-xs font-semibold text-neutral-600">Org Context (JSON)</label>
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-xs font-mono"
          value={orgContext}
          onChange={(e) => setOrgContext(e.target.value)}
        />
      </div>

      <Button size="sm" onClick={generate} disabled={generateVariations.isPending || !baseMessage.trim()}>
        <Sparkles className="h-4 w-4" />
        {generateVariations.isPending ? 'Generating…' : 'Generate Variants'}
      </Button>

      {generateVariations.isError && (
        <p className="text-sm text-red-600">{(generateVariations.error as Error).message}</p>
      )}

      {result && (
        <div className="space-y-2">
          <p className="text-xs text-neutral-600 italic">{result.notes}</p>

          {['a', 'b', 'c'].map((variant) => (
            <div key={variant} className="space-y-1 rounded-md border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-xs font-semibold uppercase text-neutral-500">Variant {variant.toUpperCase()}</p>
              <p className="text-sm text-neutral-800">
                {result[(`variant_${variant}` as 'variant_a' | 'variant_b' | 'variant_c')]}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline">
                  Copy
                </Button>
                <Button size="sm" variant="outline">
                  Send to {variant.toUpperCase()}%
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
