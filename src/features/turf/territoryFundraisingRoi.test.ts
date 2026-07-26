import { describe, expect, it } from 'vitest';
import { computeTerritoryFundraisingRoi, type DonationForTerritoryRoi, type VisitForTerritoryRoi } from './territoryFundraisingRoi';
import type { Territory, VoterRecord } from './useTurf';

const voter = (id: string, territoryId: string | null): VoterRecord => ({ id, territory_id: territoryId }) as VoterRecord;
const territory = (id: string, name: string): Territory => ({ id, name }) as Territory;
const visit = (voterId: string): VisitForTerritoryRoi => ({ voter_id: voterId });
const donation = (voterId: string | null, cents: number): DonationForTerritoryRoi => ({ voter_id: voterId, amount_cents: cents });

describe('computeTerritoryFundraisingRoi', () => {
  it('excludes a territory below the minimum doors-knocked threshold', () => {
    const voters = [voter('v1', 't1'), voter('v2', 't1')];
    const visits = [visit('v1'), visit('v2')]; // only 2 unique doors, below MIN=3
    const result = computeTerritoryFundraisingRoi(voters, visits, [donation('v1', 5000)], [territory('t1', 'Ward A')]);
    expect(result).toEqual([]);
  });

  it('computes real cents-per-door for a territory with enough attempts', () => {
    const voters = [voter('v1', 't1'), voter('v2', 't1'), voter('v3', 't1')];
    const visits = [visit('v1'), visit('v2'), visit('v3')];
    const donations = [donation('v1', 3000)];
    const result = computeTerritoryFundraisingRoi(voters, visits, donations, [territory('t1', 'Ward A')]);
    expect(result).toEqual([
      { territoryId: 't1', name: 'Ward A', totalCents: 3000, doorsKnocked: 3, centsPerDoorKnocked: 1000 }
    ]);
  });

  it('counts a repeat-visited door once toward doorsKnocked', () => {
    const voters = [voter('v1', 't1'), voter('v2', 't1'), voter('v3', 't1')];
    const visits = [visit('v1'), visit('v1'), visit('v2'), visit('v3')]; // v1 attempted twice
    const result = computeTerritoryFundraisingRoi(voters, visits, [], [territory('t1', 'Ward A')]);
    expect(result[0].doorsKnocked).toBe(3);
  });

  it('ignores donations with no linked voter_id', () => {
    const voters = [voter('v1', 't1'), voter('v2', 't1'), voter('v3', 't1')];
    const visits = [visit('v1'), visit('v2'), visit('v3')];
    const result = computeTerritoryFundraisingRoi(voters, visits, [donation(null, 9999)], [territory('t1', 'Ward A')]);
    expect(result[0].totalCents).toBe(0);
  });

  it('ranks the highest revenue-per-door territory first', () => {
    const voters = [
      voter('v1', 't1'), voter('v2', 't1'), voter('v3', 't1'),
      voter('v4', 't2'), voter('v5', 't2'), voter('v6', 't2')
    ];
    const visits = [visit('v1'), visit('v2'), visit('v3'), visit('v4'), visit('v5'), visit('v6')];
    const donations = [donation('v1', 1000), donation('v4', 9000)];
    const result = computeTerritoryFundraisingRoi(voters, visits, donations, [
      territory('t1', 'Ward A'),
      territory('t2', 'Ward B')
    ]);
    expect(result.map((r) => r.territoryId)).toEqual(['t2', 't1']);
  });

  it('attributes nothing for a door not assigned to any territory', () => {
    const voters = [voter('v1', null)];
    const visits = [visit('v1')];
    const result = computeTerritoryFundraisingRoi(voters, visits, [donation('v1', 5000)], []);
    expect(result).toEqual([]);
  });
});
