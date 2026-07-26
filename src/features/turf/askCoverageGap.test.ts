import { describe, expect, it } from 'vitest';
import { findAskCoverageGaps } from './askCoverageGap';
import type { WarmDoor } from './doorstep';
import type { Household } from './households';
import type { VisitForOverlap } from './overlapGuard';
import type { VoterRecord } from './useTurf';

const voter = (id: string): VoterRecord => ({ id, full_name: `Voter ${id}` }) as VoterRecord;

const household = (key: string, memberIds: string[]): Household => ({
  key,
  address: '1 Main St',
  lat: 0,
  lng: 0,
  members: memberIds.map(voter),
  memberCount: memberIds.length
});

const visit = (over: Partial<VisitForOverlap>): VisitForOverlap => ({
  voter_id: 'v1',
  canvasser_id: 'c1',
  canvasser_name: 'Finn',
  occurred_at: new Date().toISOString(),
  ...over
});

const warmDoor = (voterId: string): WarmDoor => ({
  voterId,
  name: 'Voter',
  address: '1 Main St',
  score: 40,
  reasons: ['noted as a supporter']
});

describe('findAskCoverageGaps', () => {
  it('flags a warm household visited by two canvassers with no gift yet', () => {
    const gaps = findAskCoverageGaps(
      [household('h1', ['v1'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1' }), visit({ voter_id: 'v1', canvasser_id: 'c2', canvasser_name: 'Carol' })],
      [warmDoor('v1')],
      []
    );
    expect(gaps).toHaveLength(1);
    expect(gaps[0].warmDoor.voterId).toBe('v1');
    expect(gaps[0].canvassers.sort()).toEqual(['Carol', 'Finn']);
  });

  it('does not flag a household visited by only one canvasser', () => {
    const gaps = findAskCoverageGaps(
      [household('h1', ['v1'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1' }), visit({ voter_id: 'v1', canvasser_id: 'c1' })],
      [warmDoor('v1')],
      []
    );
    expect(gaps).toEqual([]);
  });

  it('does not flag a household with no warm door at all', () => {
    const gaps = findAskCoverageGaps(
      [household('h1', ['v1'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1' }), visit({ voter_id: 'v1', canvasser_id: 'c2' })],
      [],
      []
    );
    expect(gaps).toEqual([]);
  });

  it('does not flag a household whose warm member already gave', () => {
    const gaps = findAskCoverageGaps(
      [household('h1', ['v1'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1' }), visit({ voter_id: 'v1', canvasser_id: 'c2' })],
      [warmDoor('v1')],
      [{ voter_id: 'v1' }]
    );
    expect(gaps).toEqual([]);
  });

  it('ignores visits outside the lookback window', () => {
    const stale = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const gaps = findAskCoverageGaps(
      [household('h1', ['v1'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1', occurred_at: stale }), visit({ voter_id: 'v1', canvasser_id: 'c2', occurred_at: stale })],
      [warmDoor('v1')],
      [],
      { lookbackDays: 7 }
    );
    expect(gaps).toEqual([]);
  });

  it('finds the warm member across different household members', () => {
    const gaps = findAskCoverageGaps(
      [household('h1', ['v1', 'v2'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1' }), visit({ voter_id: 'v2', canvasser_id: 'c2' })],
      [warmDoor('v2')],
      []
    );
    expect(gaps[0].warmDoor.voterId).toBe('v2');
  });
});
