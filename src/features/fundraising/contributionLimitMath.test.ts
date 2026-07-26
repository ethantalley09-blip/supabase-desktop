import { describe, expect, it } from 'vitest';
import {
  findDonorsNearLimit,
  findEmployerClustersNearLimit,
  type DonationForLimit,
  type DonorForLimit
} from './contributionLimitMath';

function donor(id: string, name: string, employer: string | null = null): DonorForLimit {
  return { id, full_name: name, employer };
}

describe('findDonorsNearLimit', () => {
  it('flags a donor at or above the 80% warning threshold', () => {
    const donors = [donor('d1', 'Alice')];
    const donations: DonationForLimit[] = [{ donor_id: 'd1', amount_cents: 8500 }];
    const alerts = findDonorsNearLimit(donors, donations, 10000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ donorId: 'd1', totalCents: 8500, pctOfLimit: 85 });
  });

  it('does not flag a donor comfortably under the threshold', () => {
    const donors = [donor('d1', 'Alice')];
    const donations: DonationForLimit[] = [{ donor_id: 'd1', amount_cents: 1000 }];
    expect(findDonorsNearLimit(donors, donations, 10000)).toHaveLength(0);
  });

  it('reports over 100% once a donor has actually exceeded the limit', () => {
    const donors = [donor('d1', 'Alice')];
    const donations: DonationForLimit[] = [{ donor_id: 'd1', amount_cents: 12000 }];
    const alerts = findDonorsNearLimit(donors, donations, 10000);
    expect(alerts[0].pctOfLimit).toBe(120);
  });

  it('sums multiple real gifts per donor', () => {
    const donors = [donor('d1', 'Alice')];
    const donations: DonationForLimit[] = [
      { donor_id: 'd1', amount_cents: 4000 },
      { donor_id: 'd1', amount_cents: 4500 }
    ];
    const alerts = findDonorsNearLimit(donors, donations, 10000);
    expect(alerts[0].totalCents).toBe(8500);
  });

  it('returns nothing when no limit is configured', () => {
    const donors = [donor('d1', 'Alice')];
    const donations: DonationForLimit[] = [{ donor_id: 'd1', amount_cents: 999999 }];
    expect(findDonorsNearLimit(donors, donations, 0)).toHaveLength(0);
  });

  it('sorts highest percentage of limit first', () => {
    const donors = [donor('d1', 'Alice'), donor('d2', 'Bob')];
    const donations: DonationForLimit[] = [
      { donor_id: 'd1', amount_cents: 8000 },
      { donor_id: 'd2', amount_cents: 9500 }
    ];
    const alerts = findDonorsNearLimit(donors, donations, 10000);
    expect(alerts[0].donorId).toBe('d2');
  });
});

describe('findEmployerClustersNearLimit', () => {
  it('flags an employer cluster whose combined real giving crosses the threshold', () => {
    const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp')];
    const donations: DonationForLimit[] = [
      { donor_id: 'd1', amount_cents: 5000 },
      { donor_id: 'd2', amount_cents: 4000 }
    ];
    const alerts = findEmployerClustersNearLimit(donors, donations, 10000);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ employer: 'Acme Corp', totalCents: 9000, donorCount: 2, pctOfLimit: 90 });
  });

  it('ignores donors with no real gifts on file', () => {
    const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp')];
    const donations: DonationForLimit[] = [{ donor_id: 'd1', amount_cents: 9000 }];
    const alerts = findEmployerClustersNearLimit(donors, donations, 10000);
    expect(alerts[0].donorCount).toBe(1);
  });

  it('ignores donors with no employer on file', () => {
    const donors = [donor('d1', 'Alice', null)];
    const donations: DonationForLimit[] = [{ donor_id: 'd1', amount_cents: 50000 }];
    expect(findEmployerClustersNearLimit(donors, donations, 10000)).toHaveLength(0);
  });

  it('returns nothing when no limit is configured', () => {
    const donors = [donor('d1', 'Alice', 'Acme Corp'), donor('d2', 'Bob', 'Acme Corp')];
    const donations: DonationForLimit[] = [
      { donor_id: 'd1', amount_cents: 50000 },
      { donor_id: 'd2', amount_cents: 50000 }
    ];
    expect(findEmployerClustersNearLimit(donors, donations, 0)).toHaveLength(0);
  });
});
