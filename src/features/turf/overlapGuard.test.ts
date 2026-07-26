import { describe, expect, it } from 'vitest';
import type { Household } from './households';
import { detectCrossCanvasserOverlap, type VisitForOverlap } from './overlapGuard';
import type { VoterRecord } from './useTurf';

const voter = (id: string): VoterRecord =>
  ({ id, project_id: 'p1', full_name: `Voter ${id}`, address_line: '1 Main St' }) as VoterRecord;

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

describe('detectCrossCanvasserOverlap', () => {
  it('flags a household visited by two different canvassers', () => {
    const alerts = detectCrossCanvasserOverlap(
      [household('h1', ['v1'])],
      [
        visit({ voter_id: 'v1', canvasser_id: 'c1', canvasser_name: 'Finn' }),
        visit({ voter_id: 'v1', canvasser_id: 'c2', canvasser_name: 'Carol' })
      ]
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ householdKey: 'h1', visitCount: 2 });
    expect(alerts[0].canvassers.sort()).toEqual(['Carol', 'Finn']);
  });

  it('does not flag the same canvasser revisiting their own door', () => {
    const alerts = detectCrossCanvasserOverlap(
      [household('h1', ['v1'])],
      [visit({ voter_id: 'v1', canvasser_id: 'c1' }), visit({ voter_id: 'v1', canvasser_id: 'c1' })]
    );
    expect(alerts).toEqual([]);
  });

  it('counts visits across different members of the same household', () => {
    const alerts = detectCrossCanvasserOverlap(
      [household('h1', ['v1', 'v2'])],
      [
        visit({ voter_id: 'v1', canvasser_id: 'c1', canvasser_name: 'Finn' }),
        visit({ voter_id: 'v2', canvasser_id: 'c2', canvasser_name: 'Carol' })
      ]
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].visitCount).toBe(2);
  });

  it('ignores visits outside the lookback window', () => {
    const stale = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const alerts = detectCrossCanvasserOverlap(
      [household('h1', ['v1'])],
      [
        visit({ voter_id: 'v1', canvasser_id: 'c1', occurred_at: stale }),
        visit({ voter_id: 'v1', canvasser_id: 'c2', occurred_at: stale })
      ],
      { lookbackDays: 7 }
    );
    expect(alerts).toEqual([]);
  });

  it('sorts by visit count descending', () => {
    const alerts = detectCrossCanvasserOverlap(
      [household('h1', ['v1']), household('h2', ['v2'])],
      [
        visit({ voter_id: 'v1', canvasser_id: 'c1' }),
        visit({ voter_id: 'v1', canvasser_id: 'c2' }),
        visit({ voter_id: 'v2', canvasser_id: 'c1' }),
        visit({ voter_id: 'v2', canvasser_id: 'c2' }),
        visit({ voter_id: 'v2', canvasser_id: 'c3', canvasser_name: 'Admin' })
      ]
    );
    expect(alerts.map((a) => a.householdKey)).toEqual(['h2', 'h1']);
  });
});
