import { ShieldCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLatestRefundAlert, useLogRefundAndScan } from './useFundraisingAi';
const RISK_STYLE = {
    normal: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    elevated: 'border-amber-200 bg-amber-50 text-amber-900',
    critical: 'border-red-200 bg-red-50 text-red-900'
};
// Distinct from Payment Recovery: that's DECLINED future charges (donor still
// wants to give); this is DISPUTED past charges. A real spike here is a
// genuine early-warning — exactly the signal that would have caught the
// pre-checked recurring-donation backlash other platforms got burned by.
// Lynx never uses pre-checked recurring boxes; this is the safety net for
// everything else (a technical issue, a messaging misstep, fraud).
export function RefundWatchdog({ orgId, projectId }) {
    const { data: latest } = useLatestRefundAlert(projectId);
    const logAndScan = useLogRefundAndScan();
    const [amount, setAmount] = useState('25');
    const [reason, setReason] = useState('donor requested refund');
    const run = () => {
        logAndScan.mutate({
            orgId,
            projectId,
            refundedAmountCents: Math.round(Number(amount) * 100),
            reason,
            windowDays: 7,
            refundCount: (latest?.refund_count ?? 0) + 1,
            totalRefundedCents: Math.round(Number(amount) * 100),
            baselineRefundRate: 0.02 // ~2% is a typical healthy baseline; tune per org over time
        });
    };
    return (<div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-slate-600"/>
        <h3 className="text-sm font-semibold text-neutral-900">Refund & Chargeback Watchdog</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Logs a refund and checks whether your dispute rate is spiking against your own baseline — an
        early warning for a technical issue or an ask that landed wrong, not just declined cards.
      </p>

      <div className="flex flex-wrap gap-2">
        <Input type="number" className="w-24" value={amount} onChange={(e) => setAmount(e.target.value)}/>
        <Input className="flex-1" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason"/>
        <Button size="sm" onClick={run} disabled={logAndScan.isPending}>
          <Sparkles className="h-4 w-4"/>
          {logAndScan.isPending ? 'Scanning…' : 'Log & Scan'}
        </Button>
      </div>
      {logAndScan.isError && <p className="text-sm text-red-600">{logAndScan.error.message}</p>}

      {(logAndScan.data || latest) && (<div className={`rounded-md border p-3 ${RISK_STYLE[(logAndScan.data ?? latest).risk_level] ?? RISK_STYLE.normal}`}>
          <p className="text-sm font-semibold capitalize">{(logAndScan.data ?? latest).risk_level} risk</p>
          <p className="mt-1 text-xs">{(logAndScan.data ?? latest).analysis}</p>
        </div>)}
    </div>);
}
