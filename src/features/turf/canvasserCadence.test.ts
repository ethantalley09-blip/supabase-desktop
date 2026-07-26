import { describe, expect, it } from 'vitest';
import { detectCanvasserCadence, type VisitForCadence } from './canvasserCadence';

const NOW = new Date('2026-07-24T12:00:00Z');

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function visit(canvasserId: string, name: string, days: number): VisitForCadence {
  return { canvasser_id: canvasserId, canvasser_name: name, occurred_at: daysAgo(days) };
}

describe('detectCanvasserCadence', () => {
  it('flags a canvasser active most weeks who has gone quiet recently', () => {
    const visits: VisitForCadence[] = [
      visit('c1', 'Finn', 14),
      visit('c1', 'Finn', 21),
      visit('c1', 'Finn', 28),
      visit('c1', 'Finn', 35)
    ];
    const signals = detectCanvasserCadence(visits, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ canvasserId: 'c1', name: 'Finn', pattern: 'lapsing' });
    expect(signals[0].situation).toMatch(/quiet for the last 2 weeks/);
  });

  it('does not flag a canvasser who is still active in the recent window', () => {
    const visits: VisitForCadence[] = [
      visit('c1', 'Finn', 2),
      visit('c1', 'Finn', 14),
      visit('c1', 'Finn', 21),
      visit('c1', 'Finn', 28)
    ];
    expect(detectCanvasserCadence(visits, NOW)).toHaveLength(0);
  });

  it('does not flag a canvasser with only a couple of prior weeks as lapsing (no established pattern)', () => {
    const visits: VisitForCadence[] = [visit('c1', 'Finn', 20), visit('c1', 'Finn', 27)];
    expect(detectCanvasserCadence(visits, NOW)).toHaveLength(0);
  });

  it('flags a newly consistent canvasser as accelerating', () => {
    const visits: VisitForCadence[] = [visit('c2', 'Carol', 1), visit('c2', 'Carol', 8)];
    const signals = detectCanvasserCadence(visits, NOW);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ canvasserId: 'c2', name: 'Carol', pattern: 'accelerating' });
  });

  it('does not flag an already-regular canvasser as accelerating', () => {
    const visits: VisitForCadence[] = [
      visit('c2', 'Carol', 1),
      visit('c2', 'Carol', 8),
      visit('c2', 'Carol', 15),
      visit('c2', 'Carol', 22),
      visit('c2', 'Carol', 29)
    ];
    expect(detectCanvasserCadence(visits, NOW)).toHaveLength(0);
  });

  it('ignores visits outside the lookback window', () => {
    const visits: VisitForCadence[] = [visit('c1', 'Finn', 100)];
    expect(detectCanvasserCadence(visits, NOW)).toHaveLength(0);
  });

  it('falls back to a generic name if canvasser_name is missing everywhere', () => {
    const visits: VisitForCadence[] = [
      { canvasser_id: 'c3', canvasser_name: null, occurred_at: daysAgo(14) },
      { canvasser_id: 'c3', canvasser_name: null, occurred_at: daysAgo(21) },
      { canvasser_id: 'c3', canvasser_name: null, occurred_at: daysAgo(28) }
    ];
    const signals = detectCanvasserCadence(visits, NOW);
    expect(signals[0].name).toBe('Canvasser');
  });

  it('returns an empty list for no visits', () => {
    expect(detectCanvasserCadence([], NOW)).toHaveLength(0);
  });
});
