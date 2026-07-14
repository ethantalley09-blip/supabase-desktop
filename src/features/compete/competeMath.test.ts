import { describe, expect, it } from 'vitest';
import { buildCompeteSnapshot, computeMoneyGap } from './competeMath';

describe('buildCompeteSnapshot', () => {
  const rec = (date: string, content: string) => ({
    record_type: 'statement',
    occurred_on: date,
    source: 'Daily Herald',
    content
  });

  it('sorts newest first and reports the true total count', () => {
    const snap = JSON.parse(buildCompeteSnapshot([rec('2026-01-01', 'old'), rec('2026-06-01', 'new')]));
    expect(snap.record_count).toBe(2);
    expect(snap.records[0].content).toBe('new');
  });

  it('caps the record list and truncates long content', () => {
    const many = Array.from({ length: 50 }, (_, i) => rec(`2026-03-${String((i % 28) + 1).padStart(2, '0')}`, 'x'.repeat(400)));
    const snap = JSON.parse(buildCompeteSnapshot(many));
    expect(snap.record_count).toBe(50);
    expect(snap.records.length).toBe(40);
    expect(snap.records[0].content.length).toBeLessThanOrEqual(301); // 300 + ellipsis
  });
});

describe('computeMoneyGap', () => {
  it('identifies the leader and the gap', () => {
    expect(computeMoneyGap(500_000, 300_000)).toEqual({ leader: 'us', gapCents: 200_000, ratio: 1.67 });
    expect(computeMoneyGap(100_000, 400_000)).toEqual({ leader: 'them', gapCents: 300_000, ratio: 0.25 });
    expect(computeMoneyGap(100, 100).leader).toBe('tied');
  });

  it('handles an opponent with no filed money yet', () => {
    expect(computeMoneyGap(50_000, 0)).toEqual({ leader: 'us', gapCents: 50_000, ratio: null });
  });
});
