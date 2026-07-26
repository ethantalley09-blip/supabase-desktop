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
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RefineBar } from '@/features/ai/RefineBar';
import { TranslateBar } from '@/features/ai/TranslateBar';
import { AskOptimizer } from './AskOptimizer';
import { BundlerNetwork } from './BundlerNetwork';
import { ContributionLimitGuardian } from './ContributionLimitGuardian';
import { CopyVariationTester } from './CopyVariationTester';
import { DonorInsights } from './DonorInsights';
import { DonorDedup } from './DonorDedup';
import { EmergencyAsk } from './EmergencyAsk';
import { FatigueGuard } from './FatigueGuard';
import { FundingRunway } from './FundingRunway';
import { HighDollarEventPlanner } from './HighDollarEventPlanner';
import { IssueResponseEngine } from './IssueResponseEngine';
import { LtvForecast } from './LtvForecast';
import { NetworkMultiplier } from './NetworkMultiplier';
import { ReactivationCenter } from './ReactivationCenter';
import { MajorDonorLadder } from './MajorDonorLadder';
import { MomentumDetector } from './MomentumDetector';
import { PaymentRecovery } from './PaymentRecovery';
import { RecurringUpgrade } from './RecurringUpgrade';
import { RefundWatchdog } from './RefundWatchdog';
import { RetentionSequence } from './RetentionSequence';
import { SprintPlanner } from './SprintPlanner';
import { VolunteerDonorBridge } from './VolunteerDonorBridge';
import { useHasPermission } from '@/features/rbac/useHasPermission';
import type { Project } from '@/features/projects/useProjects';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { useAiAssist } from '@/lib/ai/useAiAssist';
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
  const { data: donors } = useOrgDonors(project.org_id);
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

      {/* AI Fundraising Suite — each wrapped in a `tool-<id>` anchor matching
          TOOL_LOCATIONS so AI-dashboard cards can deep-link here */}
      <div id="tool-funding_runway"><FundingRunway orgId={project.org_id} projectId={project.id} donations={donations} /></div>
      <div id="tool-emergency_ask"><EmergencyAsk orgId={project.org_id} projectId={project.id} donations={donations} /></div>
      <div id="tool-issue_response"><IssueResponseEngine orgId={project.org_id} projectId={project.id} donations={donations} /></div>
      <div id="tool-reactivation_center"><ReactivationCenter orgId={project.org_id} projectId={project.id} donors={donors} donations={donations} /></div>
      <div id="tool-network_multiplier"><NetworkMultiplier orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-donor_insights"><DonorInsights orgId={project.org_id} projectId={project.id} /></div>
      <div id="tool-ask_optimizer"><AskOptimizer orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-major_donor_ladder"><MajorDonorLadder orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-momentum_detector"><MomentumDetector orgId={project.org_id} projectId={project.id} donations={donations} /></div>
      <div id="tool-payment_recovery"><PaymentRecovery orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-volunteer_donor_bridge"><VolunteerDonorBridge orgId={project.org_id} projectId={project.id} /></div>
      <div id="tool-recurring_upgrade"><RecurringUpgrade orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-ltv_forecast"><LtvForecast orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-donor_dedup"><DonorDedup orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-refund_watchdog"><RefundWatchdog orgId={project.org_id} projectId={project.id} /></div>
      <div id="tool-sprint_planner"><SprintPlanner orgId={project.org_id} projectId={project.id} currentTotalCents={total} /></div>
      <div id="tool-retention_sequence"><RetentionSequence orgId={project.org_id} projectId={project.id} donors={donors} /></div>
      <div id="tool-fatigue_guard"><FatigueGuard orgId={project.org_id} projectId={project.id} /></div>
      <div id="tool-copy_variation_tester"><CopyVariationTester orgId={project.org_id} projectId={project.id} /></div>
      <div id="tool-bundler_network"><BundlerNetwork orgId={project.org_id} projectId={project.id} donors={donors} donations={donations} /></div>
      <div id="tool-event_planner"><HighDollarEventPlanner orgId={project.org_id} projectId={project.id} donors={donors} donations={donations} /></div>
      <div id="tool-contribution_limit_guardian"><ContributionLimitGuardian donors={donors} donations={donations} /></div>

      <div id="tool-donor_message_studio"><DonorMessageStudio project={project} /></div>

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

const DONOR_KINDS = [
  { value: 'thank_you', label: 'Thank-you note', verb: 'Write a warm thank-you note to a donor.' },
  { value: 'ask', label: 'Donation ask', verb: 'Write a donation ask to a prospective donor.' }
] as const;

const DONOR_TONES = ['Warm', 'Formal', 'Casual', 'Urgent'];

// Donor Message Studio (AI, premium). The last product domain to get AI:
// compliant thank-you notes and asks, with one-click translation. Self-gates on
// ai_module + ai.use so it simply doesn't render without both.
function DonorMessageStudio({ project }: { project: Project }) {
  const entitlement = useEntitlement(project.org_id, 'ai_module');
  const canUseAi = useHasPermission(project.org_id, 'ai.use');
  const assist = useAiAssist();
  const [kind, setKind] = useState<(typeof DONOR_KINDS)[number]['value']>('thank_you');
  const [tone, setTone] = useState(DONOR_TONES[0]);
  const [brief, setBrief] = useState('');
  const [draft, setDraft] = useState(''); // current message (refinable)
  const [copied, setCopied] = useState(false);

  if (!canUseAi.data || !entitlement.data) return null;

  const generate = () => {
    const verb = DONOR_KINDS.find((k) => k.value === kind)!.verb;
    assist.mutate(
      {
        orgId: project.org_id,
        projectId: project.id,
        purpose: 'donor_message',
        tone,
        instructions: `${verb} Context: ${brief.trim() || 'a recent supporter of the campaign'}`
      },
      { onSuccess: (data) => setDraft(data.text) }
    );
  };

  const copy = async () => {
    if (!draft) return;
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <h3 className="text-sm font-semibold text-neutral-900">Donor Message Studio</h3>
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
          Premium
        </span>
      </div>
      <p className="text-xs text-neutral-500">
        Draft compliant thank-you notes and asks in seconds — then translate them in one click.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>Type</Label>
          <select
            className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {DONOR_KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Tone</Label>
          <select
            className="flex h-9 rounded-md border border-neutral-300 bg-white px-3 text-sm"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
          >
            {DONOR_TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <textarea
        rows={2}
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        placeholder="Anything specific? e.g. Thank Maria for her $50 gift toward the field program."
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
      />
      <Button size="sm" onClick={generate} disabled={assist.isPending}>
        <Sparkles className="h-4 w-4" />
        {assist.isPending ? 'Writing…' : 'Generate'}
      </Button>
      {assist.isError && <p className="text-sm text-red-600">{(assist.error as Error).message}</p>}
      {draft && (
        <div className="space-y-2">
          <div className="whitespace-pre-wrap rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-800">
            {draft}
          </div>
          <Button variant="outline" size="sm" onClick={copy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <RefineBar orgId={project.org_id} projectId={project.id} text={draft} onResult={setDraft} />
          <TranslateBar orgId={project.org_id} projectId={project.id} text={draft} />
        </div>
      )}
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
