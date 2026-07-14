import { format } from 'date-fns';
import { ArrowRight, Clock, Globe, Newspaper, TrendingDown, TrendingUp, Trophy, Wallet } from 'lucide-react';
import { type ReactNode, useMemo } from 'react';
import { computeSendTimeInsights } from '@/features/comms/sendTime';
import { useOpponentRecords } from '@/features/compete/useCompete';
import { useDonations, useDonationTotal } from '@/features/fundraising/useFundraising';
import { scoreLapse, warmSegment } from '@/features/fundraising/runway';
import { useLatestRunwayPlan } from '@/features/fundraising/useGrowthAi';
import type { ToolLocation } from '@/features/rbac/toolRegistry';
import { canvasserLeaderboard, scoreDoors } from '@/features/turf/doorstep';
import { useVoterRecords } from '@/features/turf/useTurf';
import type { Project } from '../useProjects';
import { computeLanguageCoverage, computeMomentum, dailySeries, pct, sparklinePoints } from './overviewMath';

// The Overview command center: every number is instant client-side math on
// queries React Query already caches (no AI calls, no extra round-trips), and
// every "next move" deep-links to the tool that does it. Sections whose data
// the viewer's role can't read (RLS) simply show zeros/hide — presentation
// only, enforcement stays in the database.
export function OverviewTab({
  project,
  onOpenTool
}: {
  project: Project;
  onOpenTool?: (loc: ToolLocation) => void;
}) {
  const { data: voters } = useVoterRecords(project.id);
  const { data: donations } = useDonations(project.id);
  const { data: totalCents } = useDonationTotal(project.id);
  const { data: runwayPlan } = useLatestRunwayPlan(project.id);
  const { data: opponentRecords } = useOpponentRecords(project.id);

  const stats = useMemo(() => {
    const v = voters ?? [];
    const d = donations ?? [];
    const contacted = v.filter((x) => (x.canvass_notes ?? '').length > 0).length;
    const returned = v.filter((x) => x.ballot_status === 'returned').length;
    const requested = v.filter((x) => x.ballot_status === 'requested').length;
    const donorIds = new Set(d.map((x) => x.donor_id));
    const warm = warmSegment(d.map((x) => ({ donorId: x.donor_id, donatedAt: x.donated_at })));
    const warmDoors = scoreDoors(v);

    // Lapsing donors, scored against each donor's own giving rhythm.
    const giftsByDonor = new Map<string, { amountCents: number; donatedAt: string }[]>();
    for (const g of d) {
      const list = giftsByDonor.get(g.donor_id) ?? [];
      list.push({ amountCents: g.amount_cents, donatedAt: g.donated_at });
      giftsByDonor.set(g.donor_id, list);
    }
    const lapsing = [...giftsByDonor.entries()].filter(
      ([id, gifts]) => scoreLapse({ donorId: id, gifts }).lapseScore >= 40
    ).length;

    const last30 = dailySeries(d, 30);
    const raised30 = last30.reduce((a, b) => a + b, 0);
    const momentum = computeMomentum(d);
    const sendTime = computeSendTimeInsights(d);
    const languages = computeLanguageCoverage(v);
    const topFundraisers = canvasserLeaderboard(d).slice(0, 3);

    return {
      v, contacted, returned, requested, donorCount: donorIds.size, warm: warm.length,
      warmDoors: warmDoors.length, lapsing, last30, raised30, momentum, sendTime, languages, topFundraisers
    };
  }, [voters, donations]);

  const daysUntilShortfall = (dateStr: string) =>
    Math.max(0, Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000));

  const go = (toolId: string, tab: ToolLocation['tab']) => onOpenTool?.({ tab, anchor: `tool-${toolId}` });

  const allActions: { label: string; count: number; toolId: string; tab: ToolLocation['tab'] }[] = [
    { label: 'warm doors ready for a doorstep ask', count: stats.warmDoors, toolId: 'doorstep_donations', tab: 'turf' },
    { label: 'donors drifting off their giving rhythm', count: stats.lapsing, toolId: 'reactivation_center', tab: 'fundraising' },
    { label: 'warm donors for a same-day ask', count: stats.warm, toolId: 'issue_response', tab: 'fundraising' },
    { label: 'requested ballots to chase home', count: stats.requested, toolId: 'field_coach', tab: 'turf' }
  ];
  const actions = allActions.filter((a) => a.count > 0);

  return (
    <div className="space-y-4">
      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Raised" value={`$${Math.round((totalCents ?? 0) / 100).toLocaleString()}`} />
        <Stat label="Donors" value={String(stats.donorCount)} />
        <Stat label="Voters" value={String(stats.v.length)} />
        <Stat label="Ballots returned" value={String(stats.returned)} />
      </div>

      {/* 30-day money pulse */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Last 30 days
          </p>
          <p className="text-sm font-semibold text-neutral-900">
            ${Math.round(stats.raised30 / 100).toLocaleString()} raised
          </p>
        </div>
        <svg viewBox="0 0 240 48" className="mt-2 h-12 w-full" preserveAspectRatio="none" role="img" aria-label="Donations per day, last 30 days">
          <polyline
            points={sparklinePoints(stats.last30)}
            fill="none"
            stroke="#059669"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>

      {/* Field progress */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Progress
          label="Voters with a canvass note"
          value={pct(stats.contacted, stats.v.length)}
          detail={`${stats.contacted} of ${stats.v.length}`}
          color="bg-violet-500"
        />
        <Progress
          label="Ballots returned"
          value={pct(stats.returned, stats.v.length)}
          detail={`${stats.returned} returned · ${stats.requested} requested`}
          color="bg-emerald-500"
        />
      </div>

      {/* Cross-domain signals — each one only exists because Lynx has turf,
          fundraising, comms, and compete data in the same place */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MiniCard
          icon={stats.momentum.direction === 'down' ? <TrendingDown className="h-4 w-4 text-red-500" /> : <TrendingUp className="h-4 w-4 text-emerald-500" />}
          label="Momentum (15-day)"
          value={
            stats.momentum.direction === 'flat'
              ? 'Flat'
              : `${stats.momentum.direction === 'up' ? '+' : '-'}${stats.momentum.changePct}%`
          }
          detail={`$${Math.round(stats.momentum.last15Cents / 100).toLocaleString()} vs $${Math.round(stats.momentum.prev15Cents / 100).toLocaleString()} prior 15 days`}
        />

        <MiniCard
          icon={<Wallet className="h-4 w-4 text-neutral-600" />}
          label="Funding runway"
          value={
            !runwayPlan
              ? 'Not run yet'
              : runwayPlan.shortfall_date
                ? `${daysUntilShortfall(runwayPlan.shortfall_date)}d to shortfall`
                : 'Healthy'
          }
          detail={
            !runwayPlan
              ? 'Run it once to see your cash forecast'
              : runwayPlan.shortfall_date
                ? `$${Math.round(runwayPlan.shortfall_cents / 100).toLocaleString()} projected gap on ${runwayPlan.shortfall_date}`
                : 'No shortfall projected in the next 90 days'
          }
          onClick={() => go('funding_runway', 'fundraising')}
        />

        <MiniCard
          icon={<Newspaper className="h-4 w-4 text-indigo-600" />}
          label="Opposition pulse"
          value={String(opponentRecords?.length ?? 0)}
          detail={
            opponentRecords && opponentRecords.length > 0
              ? `most recent: ${opponentRecords[0].record_type} on ${opponentRecords[0].occurred_on}`
              : 'log their public record to activate this'
          }
          onClick={() => go('opponent_log', 'compete')}
        />

        <MiniCard
          icon={<Clock className="h-4 w-4 text-neutral-600" />}
          label="Best time to reach supporters"
          value={stats.sendTime ? stats.sendTime.bestDay : 'Not enough data'}
          detail={stats.sendTime ? `around ${stats.sendTime.bestHourLabel}, from real gift timing` : 'activates after a few gifts come in'}
          onClick={() => go('send_time_insight', 'comms')}
        />

        <MiniCard
          icon={<Trophy className="h-4 w-4 text-amber-500" />}
          label="Top doorstep fundraisers"
          value={stats.topFundraisers[0]?.name ?? '—'}
          detail={
            stats.topFundraisers.length > 0
              ? stats.topFundraisers.map((f) => `${f.name} $${Math.round(f.totalCents / 100).toLocaleString()}`).join(' · ')
              : 'no gifts attributed to a canvasser yet'
          }
          onClick={() => go('doorstep_donations', 'turf')}
        />

        <MiniCard
          icon={<Globe className="h-4 w-4 text-sky-600" />}
          label="Language equity"
          value={stats.languages[0] ? `${stats.languages[0].language} ${stats.languages[0].pct}%` : 'English only on file'}
          detail={
            stats.languages[0]
              ? `${stats.languages[0].contacted} of ${stats.languages[0].total} ${stats.languages[0].language}-speaking voters contacted`
              : 'no non-English speakers logged yet'
          }
          onClick={() => go('field_coach', 'turf')}
        />
      </div>

      {/* Where to push next — every line opens the tool that does it */}
      {actions.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Where to push next
          </p>
          <div className="mt-2 space-y-1">
            {actions.map((a) => (
              <button
                key={a.toolId}
                type="button"
                onClick={() => go(a.toolId, a.tab)}
                className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                <span>
                  <span className="font-semibold text-neutral-900">{a.count}</span> {a.label}
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Project facts */}
      <div className="rounded-lg border border-neutral-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Fact label="Name" value={project.name} />
          <Fact label="State" value={project.state ?? '—'} />
          <Fact label="Status" value={project.status} />
          <Fact label="Created" value={format(new Date(project.created_at), 'PPP')} />
        </dl>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-neutral-900">{value}</p>
    </div>
  );
}

function Progress({ label, value, detail, color }: { label: string; value: number; detail: string; color: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-neutral-700">{label}</p>
        <p className="text-xs tabular-nums text-neutral-500">{value}%</p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <p className="mt-1 text-xs text-neutral-400">{detail}</p>
    </div>
  );
}

function MiniCard({
  icon,
  label,
  value,
  detail,
  onClick
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  onClick?: () => void;
}) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-lg border border-neutral-200 bg-white p-4 text-left ${onClick ? 'hover:border-neutral-300 hover:bg-neutral-50' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {icon}
          <p className="text-xs font-medium text-neutral-600">{label}</p>
        </div>
        {onClick && <ArrowRight className="h-3.5 w-3.5 text-neutral-300" />}
      </div>
      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900">{value}</p>
      <p className="mt-0.5 text-xs text-neutral-400">{detail}</p>
    </Wrapper>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
