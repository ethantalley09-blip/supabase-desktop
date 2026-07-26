// Pure logic for the High-Dollar Event Planner: builds a real, ranked
// invite list from actual lifetime giving (not a guess, not a purchased
// wealth-screening score) and an honest realistic dollar RANGE for a
// fundraising event, anchored to each invitee's own real largest gift to
// date rather than an untethered target. Distinct from ltv_forecast (a
// single AI-predicted long-term-value tier per donor, run one at a time)
// — this ranks the whole donor file by real historical total for a single
// event's invite list. No Supabase import (pattern: doorstep.ts) — see
// eventPlanner.test.ts.

export type DonorForEvent = {
  id: string;
  full_name: string;
};

export type DonationForEvent = {
  donor_id: string;
  amount_cents: number;
};

export type EventInvitee = {
  donorId: string;
  name: string;
  totalGivenCents: number;
  // A conservative next-ask anchor: their own real largest single gift to
  // date, not a number invented independent of their history.
  suggestedAskCents: number;
};

export type EventPlan = {
  invitees: EventInvitee[];
  realisticLowCents: number;
  realisticHighCents: number;
};

// A follow-on ask at a hosted event is realistically somewhere between "at
// least what they've given before" and "up to half again as much" — never
// a guess untethered from the donor's own real history.
const ASK_MULTIPLIER_LOW = 1.0;
const ASK_MULTIPLIER_HIGH = 1.5;

export function buildEventPlan(donors: DonorForEvent[], donations: DonationForEvent[], inviteCount = 15): EventPlan {
  const totalsByDonor = new Map<string, number>();
  const maxGiftByDonor = new Map<string, number>();
  for (const d of donations) {
    totalsByDonor.set(d.donor_id, (totalsByDonor.get(d.donor_id) ?? 0) + d.amount_cents);
    maxGiftByDonor.set(d.donor_id, Math.max(maxGiftByDonor.get(d.donor_id) ?? 0, d.amount_cents));
  }

  const invitees: EventInvitee[] = donors
    .map((donor) => ({
      donorId: donor.id,
      name: donor.full_name,
      totalGivenCents: totalsByDonor.get(donor.id) ?? 0,
      suggestedAskCents: maxGiftByDonor.get(donor.id) ?? 0
    }))
    // Only real prior donors are event-invite candidates — a name with no
    // real gifts on file has no basis for an ask estimate yet.
    .filter((invitee) => invitee.totalGivenCents > 0)
    .sort((a, b) => b.totalGivenCents - a.totalGivenCents)
    .slice(0, inviteCount);

  const realisticLowCents = invitees.reduce((sum, i) => sum + Math.round(i.suggestedAskCents * ASK_MULTIPLIER_LOW), 0);
  const realisticHighCents = invitees.reduce((sum, i) => sum + Math.round(i.suggestedAskCents * ASK_MULTIPLIER_HIGH), 0);

  return { invitees, realisticLowCents, realisticHighCents };
}
