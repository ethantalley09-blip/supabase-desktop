// Pure logic for Household Cascade: cross-references Household Rollup
// (households.ts) against real linked doorstep donations (migration 0032).
// When one member of a household has given, the rest are a warm,
// values-aligned cross-sell — not a cold ask, a household that already
// supports the campaign. Exact-address match only (households.ts's own
// documented limitation), so this stays exactly as conservative as
// everything else built on it. No Supabase import (pattern: households.ts)
// — see householdCascade.test.ts.
import type { Household } from './households';

export type DonationForCascade = { voter_id: string | null; amount_cents: number };

export type CascadeTarget = {
  householdKey: string;
  address: string;
  givingMemberName: string;
  givingMemberAmountCents: number;
  askTargets: { voterId: string; name: string }[];
};

export function findHouseholdCascadeTargets(
  households: Household[],
  donations: DonationForCascade[]
): CascadeTarget[] {
  const centsByVoter = new Map<string, number>();
  for (const d of donations) {
    if (!d.voter_id) continue;
    centsByVoter.set(d.voter_id, (centsByVoter.get(d.voter_id) ?? 0) + d.amount_cents);
  }

  const targets: CascadeTarget[] = [];
  for (const h of households) {
    if (h.members.length < 2) continue; // no one else at this address to cross-sell to
    const givingMember = h.members.find((m) => centsByVoter.has(m.id));
    if (!givingMember) continue;

    const askTargets = h.members
      .filter((m) => m.id !== givingMember.id && !centsByVoter.has(m.id))
      .map((m) => ({ voterId: m.id, name: m.full_name || 'Voter' }));
    if (askTargets.length === 0) continue;

    targets.push({
      householdKey: h.key,
      address: h.address,
      givingMemberName: givingMember.full_name || 'A household member',
      givingMemberAmountCents: centsByVoter.get(givingMember.id)!,
      askTargets
    });
  }

  return targets.sort((a, b) => b.givingMemberAmountCents - a.givingMemberAmountCents);
}
