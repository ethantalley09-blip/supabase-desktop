import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import type { Project } from '@/features/projects/useProjects';
import {
  DATE_RANGE_PRESETS,
  type DateRangePresetId,
  inRange,
  resolvePreset
} from '@/lib/dates/dateRange';
import {
  COMPLIANCE_THRESHOLD_CENTS,
  formatUsd,
  useDonations,
  useDonationTotal,
  useOrgDonors,
  useRecordDonation
} from './useFundraising';

const donationSchema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .refine((v) => Number(v) > 0, 'Amount must be positive'),
  donated_at: z.string().min(1, 'Date is required'),
  payment_method: z.string().optional(),
  donor_name: z.string().optional(),
  donor_email: z.string().email().optional().or(z.literal('')),
  donor_employer: z.string().optional(),
  donor_occupation: z.string().optional()
});

type DonationFormValues = z.infer<typeof donationSchema>;

export function FundraisingTab({ project }: { project: Project }) {
  const { data: total = 0 } = useDonationTotal(project.id);
  const { data: donations } = useDonations(project.id);
  const canManage = useHasPermission(project.org_id, 'fundraising.manage');
  const [showForm, setShowForm] = useState(false);
  const [rangePreset, setRangePreset] = useState<DateRangePresetId>('all');

  // The compliance progress bar always reflects lifetime totals (that is the
  // threshold's definition); the date range only filters the chart and list.
  const pct = Math.min(100, Math.round((total / COMPLIANCE_THRESHOLD_CENTS) * 100));
  const thresholdMet = total >= COMPLIANCE_THRESHOLD_CENTS;

  const range = resolvePreset(rangePreset);
  const visibleDonations = (donations ?? []).filter((d) => inRange(new Date(d.donated_at), range));

  // Bucket donations by day for the trend chart.
  const byDay = new Map<string, number>();
  for (const d of visibleDonations) {
    const day = format(new Date(d.donated_at), 'MMM d');
    byDay.set(day, (byDay.get(day) ?? 0) + d.amount_cents / 100);
  }
  const chartData = [...byDay.entries()].reverse().map(([day, amount]) => ({ day, amount }));

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-white p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-400">Total raised</p>
            <p className="mt-1 text-2xl font-semibold text-neutral-900">{formatUsd(total)}</p>
          </div>
          {canManage.data && (
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              {showForm ? 'Close' : 'Record donation'}
            </Button>
          )}
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>
              {thresholdMet
                ? 'Compliance tools unlocked'
                : `${formatUsd(total)} / ${formatUsd(COMPLIANCE_THRESHOLD_CENTS)} raised — unlocks compliance tools`}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className={thresholdMet ? 'h-full bg-emerald-500' : 'h-full bg-neutral-800'}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {showForm && <DonationForm project={project} onDone={() => setShowForm(false)} />}

      <div className="flex items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-neutral-400">Period</span>
        <select
          className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-sm"
          value={rangePreset}
          onChange={(e) => setRangePreset(e.target.value as DateRangePresetId)}
        >
          {DATE_RANGE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-neutral-400">
          {visibleDonations.length} donation{visibleDonations.length === 1 ? '' : 's'} ·{' '}
          {formatUsd(visibleDonations.reduce((sum, d) => sum + d.amount_cents, 0))}
        </span>
      </div>

      {chartData.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-5">
          <p className="mb-3 text-xs uppercase tracking-wide text-neutral-400">Donations by day</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData}>
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip formatter={(v) => [`$${v}`, 'Amount']} />
              <Bar dataKey="amount" fill="#171717" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              <th className="px-4 py-2">Donor</th>
              <th className="px-4 py-2">Amount</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Method</th>
            </tr>
          </thead>
          <tbody>
            {visibleDonations.map((d) => (
              <tr key={d.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-900">{d.donors?.full_name ?? '—'}</td>
                <td className="px-4 py-2 font-medium text-neutral-900">{formatUsd(d.amount_cents)}</td>
                <td className="px-4 py-2 text-neutral-500">
                  {format(new Date(d.donated_at), 'PP')}
                </td>
                <td className="px-4 py-2 text-neutral-500">{d.payment_method ?? '—'}</td>
              </tr>
            ))}
            {visibleDonations.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-neutral-400">
                  No donations in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DonationForm({ project, onDone }: { project: Project; onDone: () => void }) {
  const recordDonation = useRecordDonation();
  const { data: donors } = useOrgDonors(project.org_id);
  const [existingDonorId, setExistingDonorId] = useState<string>('');
  const [donorError, setDonorError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<DonationFormValues>({
    resolver: zodResolver(donationSchema),
    defaultValues: { donated_at: format(new Date(), 'yyyy-MM-dd'), donor_name: '' }
  });

  const onSubmit = async (values: DonationFormValues) => {
    setDonorError(null);
    if (!existingDonorId && (!values.donor_name || values.donor_name.trim().length < 2)) {
      setDonorError('Donor name is required');
      return;
    }
    await recordDonation.mutateAsync({
      projectId: project.id,
      orgId: project.org_id,
      amountCents: Math.round(Number(values.amount) * 100),
      donatedAt: new Date(values.donated_at).toISOString(),
      paymentMethod: values.payment_method || undefined,
      donorId: existingDonorId || undefined,
      newDonor: existingDonorId
        ? undefined
        : {
            full_name: values.donor_name!.trim(),
            email: values.donor_email || undefined,
            employer: values.donor_employer || undefined,
            occupation: values.donor_occupation || undefined
          }
    });
    onDone();
  };

  return (
    <form
      className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5"
      onSubmit={handleSubmit(onSubmit)}
    >
      <h3 className="text-sm font-semibold text-neutral-900">Record a donation</h3>

      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input id="amount" type="number" step="0.01" {...register('amount')} />
          {errors.amount && <p className="text-xs text-red-600">{errors.amount.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="donated_at">Date</Label>
          <Input id="donated_at" type="date" {...register('donated_at')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment_method">Method</Label>
          <Input id="payment_method" placeholder="check, cash, online…" {...register('payment_method')} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Donor</Label>
        {donors && donors.length > 0 && (
          <select
            className="flex h-9 w-full rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={existingDonorId}
            onChange={(e) => setExistingDonorId(e.target.value)}
          >
            <option value="">New donor…</option>
            {donors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {!existingDonorId && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="donor_name">Full name</Label>
            <Input id="donor_name" {...register('donor_name')} />
            {donorError && <p className="text-xs text-red-600">{donorError}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="donor_email">Email</Label>
            <Input id="donor_email" placeholder="Optional" {...register('donor_email')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="donor_employer">Employer</Label>
            <Input id="donor_employer" placeholder="FEC itemization" {...register('donor_employer')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="donor_occupation">Occupation</Label>
            <Input id="donor_occupation" placeholder="FEC itemization" {...register('donor_occupation')} />
          </div>
        </div>
      )}

      {recordDonation.isError && (
        <p className="text-sm text-red-600">{(recordDonation.error as Error).message}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          Save donation
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
