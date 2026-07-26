import { describe, expect, it } from 'vitest';
import { findMomentumAskTargets } from './momentumAsk';
import type { DriftAlert } from './visitHistory';

const alert = (over: Partial<DriftAlert>): DriftAlert => ({
  voterId: 'v1',
  name: 'Pat Voter',
  from: 'opposed',
  to: 'persuadable',
  direction: 'warmed',
  occurredAt: '2026-07-22T18:00:00Z',
  ...over
});

describe('findMomentumAskTargets', () => {
  it('includes a warmed door with no prior donation', () => {
    const targets = findMomentumAskTargets([alert({})], []);
    expect(targets).toHaveLength(1);
  });

  it('excludes a cooled door even with no prior donation', () => {
    const targets = findMomentumAskTargets([alert({ direction: 'cooled', from: 'base_support', to: 'opposed' })], []);
    expect(targets).toEqual([]);
  });

  it('excludes a warmed door that has already given', () => {
    const targets = findMomentumAskTargets([alert({ voterId: 'v1' })], [{ voter_id: 'v1' }]);
    expect(targets).toEqual([]);
  });

  it('ignores donations with no linked voter_id', () => {
    const targets = findMomentumAskTargets([alert({ voterId: 'v1' })], [{ voter_id: null }]);
    expect(targets).toHaveLength(1);
  });

  it('keeps other warmed doors when only one has already given', () => {
    const targets = findMomentumAskTargets(
      [alert({ voterId: 'v1' }), alert({ voterId: 'v2', name: 'Other Voter' })],
      [{ voter_id: 'v1' }]
    );
    expect(targets.map((t) => t.voterId)).toEqual(['v2']);
  });
});
