import { CalendarClock, Plus, Sparkles, TrendingDown, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Donation } from './useFundraising';
import { computeRunway, type PlannedExpense } from './runway';
import { useLatestRunwayPlan, useRunwayAnalysis, type RunwayStrategies } from './useGrowthAi';

// Funding Runway: the runway math runs client-side (pure fn, instant, no AI
// call) — the AI is only asked for closing strategies once a real shortfall
// is projected. Solves the "surprised by a cash crunch" pain no competitor
// addresses: they show your balance, this shows your future.
export function FundingRunway({
  orgId,
  projectId,
  donations
}: {
  orgId: string;
  projectId: string;
  donations: Donation[] | undefined;
}) {
  const { data: lastPlan } = useLatestRunwayPlan(projectId);
  const analyze = useRunwayAnalysis();
  const [cash, setCash] = useState('20000');
  const [burn, setBurn] = useState('500');
  const [expenses, setExpenses] = useState<PlannedExpense[]>([]);
  const [expLabel, setExpLabel] = useState('');
  const [expDate, setExpDate] = useState('');
  const [expAmount, setExpAmount] = useState('');

  // Observed donor velocity from real donations (last 30 days).
  const dailyRaiseCents = useMemo(() => {
    if (!donations?.length) return 0;
    const cutoff = Date.now() - 30 * 86_400_000;
    const recent = donations.filter((d) => new Date(d.donated_at).getTime() >= cutoff);
    return Math.round(recent.reduce((s, d) => s + d.amount_cents, 0) / 30);
  }, [donations]);

  // Live projection — recomputes as inputs change, no button needed.
  const runway = useMemo(
    () =>
      computeRunway(
        Math.round(Number(cash || 0) * 100),
        Math.round(Number(burn || 0) * 100),
        dailyRaiseCents,
        expenses
      ),
    [cash, burn, dailyRaiseCents, expenses]
  );

  const addExpense = () => {
    if (!expLabel.trim() || !expDate || !Number(expAmount)) return;
    setExpenses((prev) => [...prev, { label: expLabel.trim(), date: expDate, amount_cents: Math.round(Number(expAmount) * 100) }]);
    setExpLabel('');
    setExpDate('');
    setExpAmount('');
  };

  const segmentCounts = useMemo(() => {
    const byDonor = new Map<string, number>();
    for (const d of donations ?? []) byDonor.set(d.donor_id, (byDonor.get(d.donor_id) ?? 0) + d.amount_cents);
    const totals = [...byDonor.values()];
    const major = totals.filter((t) => t >= 100_000);
    const mid = totals.filter((t) => t >= 10_000 && t < 100_000);
    const small = totals.filter((t) => t < 10_000);
    const avg = (a: number[]) => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0);
    return { major: major.length, majorAvgCents: avg(major), mid: mid.length, midAvgCents: avg(mid), small: small.length, smallAvgCents: avg(small) };
  }, [donations]);

  const run = () =>
    analyze.mutate({
      orgId,
      projectId,
      cashOnHandCents: Math.round(Number(cash) * 100),
      dailyBurnCents: Math.round(Number(burn) * 100),
      dailyRaiseCents,
      plannedExpenses: expenses,
      runway,
      segmentCounts
    });

  const strategies: RunwayStrategies | null = analyze.data?.strategies ?? lastPlan?.strategies ?? null;

  return (
    <div className="space-y-3 rounded-lg border border-rose-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-rose-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Funding Runway</h3>
      </div>
      <p className="text-xs text-neutral-500">
        Projects your cash forward day by day — burn, planned expenses, and your real donation pace —
        and warns you about a shortfall weeks before it happens, with 3 concrete ways to close it.
      </p>

      <div className="flex flex-wrap gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-700">Cash on hand ($)</label>
          <Input type="number" className="w-32" value={cash} onChange={(e) => setCash(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-700">Daily burn ($/day)</label>
          <Input type="number" className="w-32" value={burn} onChange={(e) => setBurn(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-neutral-700">Donation pace (auto)</label>
          <p className="flex h-9 items-center text-sm text-neutral-700">
            ${Math.round(dailyRaiseCents / 100).toLocaleString()}/day from real gifts
          </p>
        </div>
      </div>

      {/* Planned expenses */}
      <div className="space-y-2 rounded-md border border-neutral-200 p-3">
        <p className="text-xs font-medium text-neutral-700">Planned expenses</p>
        {expenses.map((e, i) => (
          <div key={`${e.date}-${i}`} className="flex items-center justify-between text-xs text-neutral-600">
            <span>
              {e.date} — {e.label}: ${(e.amount_cents / 100).toLocaleString()}
            </span>
            <button type="button" onClick={() => setExpenses((prev) => prev.filter((_, j) => j !== i))}>
              <Trash2 className="h-3.5 w-3.5 text-neutral-400 hover:text-red-500" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Input className="flex-1" placeholder="TV ad buy" value={expLabel} onChange={(e) => setExpLabel(e.target.value)} />
          <Input type="date" className="w-40" value={expDate} onChange={(e) => setExpDate(e.target.value)} />
          <Input type="number" className="w-28" placeholder="$" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} />
          <Button size="sm" variant="outline" onClick={addExpense}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      {/* Live projection — pure math, always current */}
      {runway.shortfallDate ? (
        <div className="rounded-md border-l-4 border-rose-600 bg-rose-50 p-3">
          <p className="text-sm font-semibold text-rose-900">
            Projected shortfall: ${Math.round(runway.shortfallCents / 100).toLocaleString()} on {runway.shortfallDate} (
            {runway.daysUntilShortfall} days away)
          </p>
          <Button size="sm" className="mt-2" onClick={run} disabled={analyze.isPending}>
            <Sparkles className="h-4 w-4" />
            {analyze.isPending ? 'Building strategies…' : 'Get 3 strategies to close it'}
          </Button>
        </div>
      ) : (
        <div className="rounded-md border-l-4 border-emerald-500 bg-emerald-50 p-3">
          <p className="text-sm font-medium text-emerald-900">
            No shortfall projected in the next 90 days — ending balance ~$
            {Math.round(runway.endBalanceCents / 100).toLocaleString()} at this pace.
          </p>
        </div>
      )}
      {analyze.isError && <p className="text-sm text-red-600">{(analyze.error as Error).message}</p>}

      {strategies && (
        <div className="space-y-2">
          {([
            ['A', strategies.strategy_a],
            ['B', strategies.strategy_b]
          ] as const).map(([label, s]) => (
            <div key={label} className="rounded-md border border-blue-100 bg-blue-50 p-3">
              <p className="text-sm font-semibold text-neutral-900">
                Strategy {label}: ask {s.segment} (~${Math.round(s.ask_cents / 100).toLocaleString()} each)
              </p>
              <p className="mt-0.5 text-xs text-neutral-600">{s.rationale}</p>
              <p className="mt-1.5 text-xs font-medium text-neutral-800">Subject: {s.email_subject}</p>
              <p className="whitespace-pre-wrap text-xs text-neutral-700">{s.email_body}</p>
            </div>
          ))}
          <div className="rounded-md border border-purple-100 bg-purple-50 p-3">
            <p className="text-sm font-semibold text-neutral-900">
              <CalendarClock className="mr-1 inline h-3.5 w-3.5" />
              Strategy C: {strategies.strategy_c.description}
            </p>
            <p className="mt-0.5 text-xs text-neutral-600">{strategies.strategy_c.rationale}</p>
          </div>
        </div>
      )}
    </div>
  );
}
