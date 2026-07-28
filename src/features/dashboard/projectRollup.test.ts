import { describe, expect, it } from 'vitest';
import { rankProjectsByAttention, rankProjectsByFundraising } from './projectRollup';

describe('rankProjectsByAttention', () => {
  it('ranks a bigger unmapped backlog above a smaller one', () => {
    const rows = [
      { projectId: 'a', name: 'Small', totalVoters: 100, mappedVoters: 90, raisedCents: 0 },
      { projectId: 'b', name: 'Big backlog', totalVoters: 1000, mappedVoters: 200, raisedCents: 0 }
    ];
    const ranked = rankProjectsByAttention(rows);
    expect(ranked[0].projectId).toBe('b');
  });

  it('lets real fundraising offset the unmapped backlog', () => {
    const rows = [
      { projectId: 'a', name: 'Funded', totalVoters: 500, mappedVoters: 100, raisedCents: 10_000_000 },
      { projectId: 'b', name: 'Unfunded', totalVoters: 500, mappedVoters: 100, raisedCents: 0 }
    ];
    const ranked = rankProjectsByAttention(rows);
    expect(ranked[0].projectId).toBe('b');
  });

  it('computes an honest mapped rate and never a negative unmapped count', () => {
    const ranked = rankProjectsByAttention([{ projectId: 'a', name: 'P', totalVoters: 0, mappedVoters: 0, raisedCents: 0 }]);
    expect(ranked[0].mappedRatePct).toBe(0);
    expect(ranked[0].unmappedVoters).toBe(0);
  });

  it('returns an empty list for an empty input', () => {
    expect(rankProjectsByAttention([])).toEqual([]);
  });
});

describe('rankProjectsByFundraising', () => {
  it('ranks the real highest-raising project first', () => {
    const rows = [
      { projectId: 'a', name: 'Low', totalVoters: 0, mappedVoters: 0, raisedCents: 1000 },
      { projectId: 'b', name: 'High', totalVoters: 0, mappedVoters: 0, raisedCents: 5000 }
    ];
    expect(rankProjectsByFundraising(rows)[0].projectId).toBe('b');
  });

  it('does not mutate the input array', () => {
    const rows = [{ projectId: 'a', name: 'A', totalVoters: 0, mappedVoters: 0, raisedCents: 1000 }];
    const ranked = rankProjectsByFundraising(rows);
    expect(ranked).not.toBe(rows);
  });
});
