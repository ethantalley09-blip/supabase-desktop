import { describe, expect, it } from 'vitest';
import { buildEventPlan, type DonationForEvent, type DonorForEvent } from './eventPlanner';

function donor(id: string, name: string): DonorForEvent {
  return { id, full_name: name };
}

describe('buildEventPlan', () => {
  it('ranks invitees by real total given, highest first', () => {
    const donors = [donor('d1', 'Alice'), donor('d2', 'Bob')];
    const donations: DonationForEvent[] = [
      { donor_id: 'd1', amount_cents: 5000 },
      { donor_id: 'd2', amount_cents: 20000 }
    ];
    const plan = buildEventPlan(donors, donations);
    expect(plan.invitees[0].donorId).toBe('d2');
    expect(plan.invitees[1].donorId).toBe('d1');
  });

  it('excludes donors with no real gifts on file', () => {
    const donors = [donor('d1', 'Alice'), donor('d2', 'Never Given')];
    const donations: DonationForEvent[] = [{ donor_id: 'd1', amount_cents: 5000 }];
    const plan = buildEventPlan(donors, donations);
    expect(plan.invitees).toHaveLength(1);
    expect(plan.invitees[0].donorId).toBe('d1');
  });

  it('sets the suggested ask to the donor\'s own real largest single gift', () => {
    const donors = [donor('d1', 'Alice')];
    const donations: DonationForEvent[] = [
      { donor_id: 'd1', amount_cents: 1000 },
      { donor_id: 'd1', amount_cents: 9000 },
      { donor_id: 'd1', amount_cents: 2000 }
    ];
    const plan = buildEventPlan(donors, donations);
    expect(plan.invitees[0].totalGivenCents).toBe(12000);
    expect(plan.invitees[0].suggestedAskCents).toBe(9000);
  });

  it('computes a realistic range from 1x to 1.5x suggested asks', () => {
    const donors = [donor('d1', 'Alice'), donor('d2', 'Bob')];
    const donations: DonationForEvent[] = [
      { donor_id: 'd1', amount_cents: 10000 },
      { donor_id: 'd2', amount_cents: 20000 }
    ];
    const plan = buildEventPlan(donors, donations);
    expect(plan.realisticLowCents).toBe(30000);
    expect(plan.realisticHighCents).toBe(45000);
  });

  it('respects the invite count cap', () => {
    const donors = Array.from({ length: 20 }, (_, i) => donor(`d${i}`, `Donor ${i}`));
    const donations: DonationForEvent[] = donors.map((d, i) => ({ donor_id: d.id, amount_cents: (i + 1) * 100 }));
    const plan = buildEventPlan(donors, donations, 5);
    expect(plan.invitees).toHaveLength(5);
  });

  it('returns an empty plan for no donors', () => {
    const plan = buildEventPlan([], []);
    expect(plan.invitees).toHaveLength(0);
    expect(plan.realisticLowCents).toBe(0);
    expect(plan.realisticHighCents).toBe(0);
  });
});
