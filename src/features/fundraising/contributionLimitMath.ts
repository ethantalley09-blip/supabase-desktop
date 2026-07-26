// Pure logic for the Contribution Limit Guardian: flags a real donor, or a
// real employer cluster, whose cumulative real giving is approaching a
// STAFF-ENTERED dollar threshold — never a hardcoded legal limit this app
// asserts on its own authority. Deliberately zero AI (this domain stays
// AI-free for legal-risk reasons, same rule as the Compliance tab) and
// deliberately not a filing tool — it is a mechanical running-total
// tracker against whatever number staff/counsel configure, nothing more.
// No Supabase import (pattern: doorstep.ts) — see
// contributionLimitGuardian.test.ts.

export type DonorForLimit = {
  id: string;
  full_name: string;
  employer: string | null;
};

export type DonationForLimit = {
  donor_id: string;
  amount_cents: number;
};

export type DonorLimitAlert = {
  donorId: string;
  name: string;
  totalCents: number;
  limitCents: number;
  pctOfLimit: number; // can exceed 100 once actually over
};

export type EmployerLimitAlert = {
  employer: string;
  totalCents: number;
  limitCents: number;
  pctOfLimit: number;
  donorCount: number;
};

// Surfaces a warning before the configured limit is actually reached, not
// only once it's already been crossed — advance notice is the whole point.
const WARNING_FRACTION = 0.8;

function sumByDonor(donations: DonationForLimit[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const d of donations) totals.set(d.donor_id, (totals.get(d.donor_id) ?? 0) + d.amount_cents);
  return totals;
}

export function findDonorsNearLimit(donors: DonorForLimit[], donations: DonationForLimit[], limitCents: number): DonorLimitAlert[] {
  if (limitCents <= 0) return [];
  const totalsByDonor = sumByDonor(donations);

  const alerts: DonorLimitAlert[] = [];
  for (const donor of donors) {
    const total = totalsByDonor.get(donor.id) ?? 0;
    if (total < limitCents * WARNING_FRACTION) continue;
    alerts.push({ donorId: donor.id, name: donor.full_name, totalCents: total, limitCents, pctOfLimit: Math.round((total / limitCents) * 100) });
  }
  return alerts.sort((a, b) => b.pctOfLimit - a.pctOfLimit);
}

// Employer clustering is an informal heuristic (same shared-employer signal
// as bundlerNetwork.ts) — it is NOT an authoritative FEC affiliated-entity
// or aggregation determination, which depends on facts this app has no way
// to know. Flag for staff/counsel review only.
export function findEmployerClustersNearLimit(
  donors: DonorForLimit[],
  donations: DonationForLimit[],
  limitCents: number
): EmployerLimitAlert[] {
  if (limitCents <= 0) return [];
  const totalsByDonor = sumByDonor(donations);

  const byEmployer = new Map<string, { display: string; total: number; count: number }>();
  for (const donor of donors) {
    const employer = donor.employer?.trim();
    if (!employer) continue;
    const total = totalsByDonor.get(donor.id) ?? 0;
    if (total <= 0) continue;
    const key = employer.toLowerCase();
    const entry = byEmployer.get(key) ?? { display: employer, total: 0, count: 0 };
    entry.total += total;
    entry.count += 1;
    byEmployer.set(key, entry);
  }

  const alerts: EmployerLimitAlert[] = [];
  for (const { display, total, count } of byEmployer.values()) {
    if (total < limitCents * WARNING_FRACTION) continue;
    alerts.push({ employer: display, totalCents: total, limitCents, pctOfLimit: Math.round((total / limitCents) * 100), donorCount: count });
  }
  return alerts.sort((a, b) => b.pctOfLimit - a.pctOfLimit);
}
