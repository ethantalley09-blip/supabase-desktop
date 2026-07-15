import { describe, expect, it } from 'vitest';
import { buildGoalPlan, buildGotvReadiness } from './campaignIntelligence';

describe('campaign command center calculations', () => {
  it('builds an achievable daily fundraising plan', () => {
    const plan = buildGoalPlan(10_000, 20_000, '2026-07-25', 2_500, new Date('2026-07-15T12:00:00'));
    // The deadline day counts as a usable campaign day.
    expect(plan).toMatchObject({ remainingCents: 10_000, daysLeft: 11, dailyCents: 910, suggestedDonors: 4 });
  });

  it('reports concrete GOTV blockers', () => {
    const voter = { id: '1', contact_status: 'active', lat: null, lng: null, territory_id: null, ballot_status: 'requested' } as never;
    const readiness = buildGotvReadiness([voter], [{ assigned_to: null }] as never);
    expect(readiness.ready).toBe(0);
    expect(readiness.blockers.map((b) => b.count)).toEqual([1, 1, 1, 1]);
  });
});
