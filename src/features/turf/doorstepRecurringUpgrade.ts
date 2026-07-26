// Pure logic for Doorstep Recurring Upgrade: identifies a real doorstep-
// linked donor (donations.voter_id, migration 0032) whose most recent
// logged visit shows a genuinely supportive real lean — a candidate for a
// small monthly-recurring upgrade on a follow-up visit. Distinct from the
// general recurring_upgrade purpose (anniversary-timed, no door context at
// all): this is specifically about the in-person doorstep-conversion
// moment. No Supabase import (pattern: persistenceAsk.ts) — see
// doorstepRecurringUpgrade.test.ts.
import type { PersuadabilityBucket } from './turfBriefingMath';

export type DonationForRecurring = { voter_id: string | null; amount_cents: number };
export type VisitForRecurring = { voter_id: string; voter_name: string | null; occurred_at: string; persuadability_bucket: PersuadabilityBucket };

export type RecurringUpgradeTarget = {
  voterId: string;
  name: string;
  lastGiftCents: number;
  lean: PersuadabilityBucket;
};

// Only a currently-supportive lean is a real upgrade candidate — an
// 'opposed' or 'unknown' voter who happened to give once isn't evidence of
// an ongoing relationship worth asking to deepen.
const UPGRADE_ELIGIBLE_BUCKETS: PersuadabilityBucket[] = ['base_support', 'persuadable'];

export function findDoorstepRecurringTargets(
  donations: DonationForRecurring[],
  visits: VisitForRecurring[]
): RecurringUpgradeTarget[] {
  const centsByVoter = new Map<string, number>();
  for (const d of donations) {
    if (!d.voter_id) continue;
    centsByVoter.set(d.voter_id, (centsByVoter.get(d.voter_id) ?? 0) + d.amount_cents);
  }
  if (centsByVoter.size === 0) return [];

  const latestVisitByVoter = new Map<string, VisitForRecurring>();
  for (const v of visits) {
    const existing = latestVisitByVoter.get(v.voter_id);
    if (!existing || new Date(v.occurred_at).getTime() > new Date(existing.occurred_at).getTime()) {
      latestVisitByVoter.set(v.voter_id, v);
    }
  }

  const targets: RecurringUpgradeTarget[] = [];
  for (const [voterId, cents] of centsByVoter) {
    const latest = latestVisitByVoter.get(voterId);
    if (!latest || !UPGRADE_ELIGIBLE_BUCKETS.includes(latest.persuadability_bucket)) continue;
    targets.push({ voterId, name: latest.voter_name || 'Voter', lastGiftCents: cents, lean: latest.persuadability_bucket });
  }

  return targets.sort((a, b) => b.lastGiftCents - a.lastGiftCents);
}
