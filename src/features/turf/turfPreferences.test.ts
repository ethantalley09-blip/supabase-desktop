import { describe, expect, it } from 'vitest';
import { DEFAULT_TURF_PREFERENCES, mergePreferences } from './turfPreferences';

describe('mergePreferences', () => {
  it('returns all defaults for an empty/legacy row', () => {
    expect(mergePreferences({})).toEqual(DEFAULT_TURF_PREFERENCES);
    expect(mergePreferences(null)).toEqual(DEFAULT_TURF_PREFERENCES);
    expect(mergePreferences(undefined)).toEqual(DEFAULT_TURF_PREFERENCES);
  });

  it('overlays a partial top-level section without touching others', () => {
    const merged = mergePreferences({ household: { minSize: 3 } });
    expect(merged.household).toEqual({ minSize: 3 });
    expect(merged.daylight).toEqual(DEFAULT_TURF_PREFERENCES.daylight);
  });

  it('fills in a missing nested field within a partially-saved section', () => {
    const merged = mergePreferences({ persuasionDrift: { showCooled: false } as never });
    expect(merged.persuasionDrift.showCooled).toBe(false);
    expect(merged.persuasionDrift.lookbackDays).toBe(DEFAULT_TURF_PREFERENCES.persuasionDrift.lookbackDays);
    expect(merged.persuasionDrift.showWarmed).toBe(DEFAULT_TURF_PREFERENCES.persuasionDrift.showWarmed);
  });

  it('overlays the highlight filter', () => {
    const merged = mergePreferences({ highlightFilter: { mode: 'party', value: 'democrat' } });
    expect(merged.highlightFilter).toEqual({ mode: 'party', value: 'democrat' });
  });

  it('overlays the Round 4 sections (leaderboard/overlap/revisit) independently', () => {
    const merged = mergePreferences({ revisitQueue: { minAttempts: 5 } });
    expect(merged.revisitQueue).toEqual({ minAttempts: 5 });
    expect(merged.canvasserLeaderboard).toEqual(DEFAULT_TURF_PREFERENCES.canvasserLeaderboard);
    expect(merged.overlapGuard).toEqual(DEFAULT_TURF_PREFERENCES.overlapGuard);
  });
});
