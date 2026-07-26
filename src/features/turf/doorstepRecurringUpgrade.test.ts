import { describe, expect, it } from 'vitest';
import { findDoorstepRecurringTargets, type DonationForRecurring, type VisitForRecurring } from './doorstepRecurringUpgrade';

const donation = (over: Partial<DonationForRecurring>): DonationForRecurring => ({
  voter_id: 'v1',
  amount_cents: 1000,
  ...over
});

const visit = (over: Partial<VisitForRecurring>): VisitForRecurring => ({
  voter_id: 'v1',
  voter_name: 'Pat Voter',
  occurred_at: new Date().toISOString(),
  persuadability_bucket: 'base_support',
  ...over
});

describe('findDoorstepRecurringTargets', () => {
  it('flags a doorstep donor whose latest visit shows a supportive lean', () => {
    const targets = findDoorstepRecurringTargets([donation({})], [visit({})]);
    expect(targets).toEqual([{ voterId: 'v1', name: 'Pat Voter', lastGiftCents: 1000, lean: 'base_support' }]);
  });

  it('includes a persuadable lean as upgrade-eligible', () => {
    const targets = findDoorstepRecurringTargets([donation({})], [visit({ persuadability_bucket: 'persuadable' })]);
    expect(targets).toHaveLength(1);
  });

  it('excludes a donor whose latest visit shows an opposed lean', () => {
    const targets = findDoorstepRecurringTargets([donation({})], [visit({ persuadability_bucket: 'opposed' })]);
    expect(targets).toEqual([]);
  });

  it('excludes a donor whose latest visit lean is unknown', () => {
    const targets = findDoorstepRecurringTargets([donation({})], [visit({ persuadability_bucket: 'unknown' })]);
    expect(targets).toEqual([]);
  });

  it('ignores donations with no linked voter_id', () => {
    const targets = findDoorstepRecurringTargets([donation({ voter_id: null })], [visit({})]);
    expect(targets).toEqual([]);
  });

  it('excludes a linked donor with no visit history at all', () => {
    const targets = findDoorstepRecurringTargets([donation({ voter_id: 'v9' })], [visit({ voter_id: 'v1' })]);
    expect(targets).toEqual([]);
  });

  it('sums multiple gifts and uses the MOST RECENT visit to judge lean', () => {
    const donations = [donation({ amount_cents: 1000 }), donation({ amount_cents: 500 })];
    const visits = [
      visit({ occurred_at: '2026-07-01T00:00:00Z', persuadability_bucket: 'opposed' }),
      visit({ occurred_at: '2026-07-10T00:00:00Z', persuadability_bucket: 'base_support' })
    ];
    const targets = findDoorstepRecurringTargets(donations, visits);
    expect(targets).toEqual([{ voterId: 'v1', name: 'Pat Voter', lastGiftCents: 1500, lean: 'base_support' }]);
  });

  it('ranks larger cumulative givers first', () => {
    const donations = [donation({ voter_id: 'v1', amount_cents: 500 }), donation({ voter_id: 'v2', amount_cents: 5000 })];
    const visits = [visit({ voter_id: 'v1' }), visit({ voter_id: 'v2', voter_name: 'Big Giver' })];
    const targets = findDoorstepRecurringTargets(donations, visits);
    expect(targets.map((t) => t.voterId)).toEqual(['v2', 'v1']);
  });
});
