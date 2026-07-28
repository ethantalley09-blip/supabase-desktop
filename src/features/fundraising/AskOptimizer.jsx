import { Sparkles, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOptimizeAsk } from './useFundraisingAi';
export function AskOptimizer({ orgId, projectId, donors }) {
    const optimizeAsk = useOptimizeAsk();
    const [selectedDonorId, setSelectedDonorId] = useState('');
    const [result, setResult] = useState(null);
    const selectedDonor = donors?.find((d) => d.id === selectedDonorId);
    const generate = async () => {
        if (!selectedDonor)
            return;
        // In a real implementation, fetch the donor's full history from DB.
        const donorHistory = JSON.stringify({
            id: selectedDonor.id,
            full_name: selectedDonor.full_name,
            gifts: [
                { amount_cents: 5000, donated_at: '2025-01-15' },
                { amount_cents: 7500, donated_at: '2024-12-25' },
                { amount_cents: 5000, donated_at: '2024-11-01' }
            ],
            avg_gift_cents: 5833,
            last_gift_at: '2025-01-15',
            total_given_cents: 17500
        });
        const res = await optimizeAsk.mutateAsync({
            orgId,
            projectId,
            donorId: selectedDonor.id,
            donorHistory
        });
        setResult(res);
    };
    return (<div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-violet-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Dynamic Ask Optimizer</h3>
      </div>
      <p className="text-xs text-neutral-500">AI predicts the optimal ask amount for each donor to maximize conversion.</p>

      <select className="h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm" value={selectedDonorId} onChange={(e) => setSelectedDonorId(e.target.value)}>
        <option value="">Select a donor…</option>
        {donors?.map((d) => (<option key={d.id} value={d.id}>
            {d.full_name}
          </option>))}
      </select>

      <Button size="sm" onClick={generate} disabled={optimizeAsk.isPending || !selectedDonorId}>
        <Sparkles className="h-4 w-4"/>
        {optimizeAsk.isPending ? 'Optimizing…' : 'Get Optimal Ask'}
      </Button>

      {optimizeAsk.isError && <p className="text-sm text-red-600">{optimizeAsk.error.message}</p>}

      {result && (<div className="space-y-2 rounded-md border border-violet-100 bg-violet-50 p-3">
          <p className="text-sm font-semibold text-neutral-900">
            Suggested Ask: ${(result.suggested_ask_cents / 100).toLocaleString()}
          </p>
          <p className="text-xs text-neutral-600">{result.reasoning}</p>
          <p className="text-xs text-violet-700">Predicted conversion: {result.predicted_conversion_pct}%</p>
          <Button size="sm" variant="outline" className="w-full">
            Use This Ask in Email
          </Button>
        </div>)}
    </div>);
}
