// Pure logic for the Money Route Optimizer: reorders today's remaining
// doors to front-load real warm (fundraising-signal) doors while still
// walking an efficient geographic path within each group — rather than
// plain nearest-neighbor distance-only ordering (optimizeWalkOrder itself),
// which might visit the highest-value doors last simply because they
// happen to sit far from the geographic start point. Reuses
// optimizeWalkOrder's own nearest-neighbor + 2-opt logic on two real
// subsets (warm, then the rest) rather than reimplementing routing math.
// Distinct from territory_roi_briefing (aggregate $/door by territory, not
// a per-shift walk order) and golden_hour_ask_plan (a short list of doors
// to prioritize, not a full re-sequenced route). No Supabase import
// (pattern: route.ts) — see moneyRoute.test.ts.
import { optimizeWalkOrder } from './route';
import type { WalkRoute } from './route';
import type { VoterRecord } from './useTurf';

export type MoneyRouteResult = WalkRoute & {
  // How many of the ordered stops are real warm doors, front-loaded first —
  // shown to staff so the reordering is explainable, not a black box.
  warmDoorsFirst: number;
};

export function optimizeMoneyRoute(doors: VoterRecord[], warmVoterIds: ReadonlySet<string>): MoneyRouteResult {
  const mapped = doors.filter((v) => v.lat !== null && v.lng !== null);
  const warm = mapped.filter((v) => warmVoterIds.has(v.id));
  const rest = mapped.filter((v) => !warmVoterIds.has(v.id));

  const warmRoute = optimizeWalkOrder(warm);
  const restRoute = optimizeWalkOrder(rest);

  return {
    ordered: [...warmRoute.ordered, ...restRoute.ordered],
    meters: warmRoute.meters + restRoute.meters,
    warmDoorsFirst: warm.length
  };
}
