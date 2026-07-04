import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { exportCsv } from '@/features/export/exporters/csvExporter';
import { exportPdf } from '@/features/export/exporters/pdfExporter';
import { formatUsd } from '@/features/fundraising/useFundraising';
import type { Project } from '@/features/projects/useProjects';
import {
  DATE_RANGE_PRESETS,
  type DateRangePresetId,
  inRange,
  resolvePreset
} from '@/lib/dates/dateRange';
import { supabase } from '@/lib/supabase/client';

type DonationRow = {
  amount_cents: number;
  donated_at: string;
  donors: {
    full_name: string;
    email: string | null;
    employer: string | null;
    occupation: string | null;
  } | null;
};

type DonorAggregate = {
  donor: string;
  employer: string;
  occupation: string;
  count: number;
  total_cents: number;
  itemized: boolean;
};

// Itemized donor report for a reporting period. "Itemized" mirrors the FEC
// concept (donors whose period total exceeds the ruleset's
// itemization_threshold_cents must be reported with employer/occupation) --
// but per the compliance disclaimer, this is configuration-driven summary
// output, not filing-ready paperwork.
export function PeriodReport({
  project,
  itemizationThresholdCents
}: {
  project: Project;
  itemizationThresholdCents: number | null;
}) {
  const [preset, setPreset] = useState<DateRangePresetId>('this_quarter');

  const { data: donations } = useQuery({
    queryKey: ['report-donations', project.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations')
        .select('amount_cents, donated_at, donors(full_name, email, employer, occupation)')
        .eq('project_id', project.id)
        .order('donated_at');
      if (error) throw error;
      return data as unknown as DonationRow[];
    }
  });

  const range = resolvePreset(preset);
  const inPeriod = (donations ?? []).filter((d) => inRange(new Date(d.donated_at), range));

  const byDonor = new Map<string, DonorAggregate>();
  for (const d of inPeriod) {
    const key = d.donors?.full_name ?? 'Unknown donor';
    const agg = byDonor.get(key) ?? {
      donor: key,
      employer: d.donors?.employer ?? '',
      occupation: d.donors?.occupation ?? '',
      count: 0,
      total_cents: 0,
      itemized: false
    };
    agg.count += 1;
    agg.total_cents += d.amount_cents;
    byDonor.set(key, agg);
  }
  const rows = [...byDonor.values()]
    .map((r) => ({
      ...r,
      itemized: itemizationThresholdCents !== null && r.total_cents > itemizationThresholdCents
    }))
    .sort((a, b) => b.total_cents - a.total_cents);

  const periodLabel = DATE_RANGE_PRESETS.find((p) => p.id === preset)?.label ?? preset;
  const totalCents = rows.reduce((sum, r) => sum + r.total_cents, 0);

  const exportRows = () =>
    rows.map((r) => ({
      donor: r.donor,
      employer: r.employer,
      occupation: r.occupation,
      donations: r.count,
      total_usd: (r.total_cents / 100).toFixed(2),
      itemized: r.itemized ? 'yes' : 'no'
    }));
  const filePrefix = `${project.name.toLowerCase().replace(/\s+/g, '-')}-report-${preset}`;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Donor report by period</h3>
          <p className="text-xs text-neutral-400">
            {rows.length} donor{rows.length === 1 ? '' : 's'} · {formatUsd(totalCents)} ·{' '}
            {itemizationThresholdCents !== null
              ? `itemization over ${formatUsd(itemizationThresholdCents)}`
              : 'no itemization threshold configured'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
            value={preset}
            onChange={(e) => setPreset(e.target.value as DateRangePresetId)}
          >
            {DATE_RANGE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" onClick={() => exportCsv(`${filePrefix}.csv`, exportRows())}>
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exportPdf(`${filePrefix}.pdf`, `${project.name} — donors, ${periodLabel}`, exportRows())}
          >
            PDF
          </Button>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <tr>
            <th className="py-1.5 pr-3">Donor</th>
            <th className="py-1.5 pr-3">Employer</th>
            <th className="py-1.5 pr-3">Occupation</th>
            <th className="py-1.5 pr-3">Donations</th>
            <th className="py-1.5 pr-3">Total</th>
            <th className="py-1.5">Itemized</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.donor} className="border-t border-neutral-100">
              <td className="py-1.5 pr-3 font-medium text-neutral-900">{r.donor}</td>
              <td className="py-1.5 pr-3 text-neutral-500">{r.employer || '—'}</td>
              <td className="py-1.5 pr-3 text-neutral-500">{r.occupation || '—'}</td>
              <td className="py-1.5 pr-3 text-neutral-500">{r.count}</td>
              <td className="py-1.5 pr-3 text-neutral-900">{formatUsd(r.total_cents)}</td>
              <td className="py-1.5">
                {r.itemized ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Itemize
                  </span>
                ) : (
                  <span className="text-xs text-neutral-400">below threshold</span>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-center text-neutral-400">
                No donations in this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
