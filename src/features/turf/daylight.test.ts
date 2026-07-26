import { describe, expect, it } from 'vitest';
import { computeDaylight } from './daylight';

describe('computeDaylight', () => {
  it('gives longer daylight in summer than winter at a mid-latitude', () => {
    const summer = computeDaylight(40, -83, new Date('2026-06-21T12:00:00Z'));
    const winter = computeDaylight(40, -83, new Date('2026-12-21T12:00:00Z'));
    expect(summer.daylightMinutesTotal).toBeGreaterThan(winter.daylightMinutesTotal);
  });

  it('gives roughly 12 hours of daylight at the equator year-round', () => {
    const summer = computeDaylight(0, 0, new Date('2026-06-21T12:00:00Z'));
    const winter = computeDaylight(0, 0, new Date('2026-12-21T12:00:00Z'));
    expect(Math.abs(summer.daylightMinutesTotal - 720)).toBeLessThan(30);
    expect(Math.abs(winter.daylightMinutesTotal - 720)).toBeLessThan(30);
  });

  it('is self-consistent: 2 hours before its own computed sunset reads ~120 minutes left', () => {
    const base = computeDaylight(40, -83, new Date('2026-06-21T12:00:00Z'));
    const twoHoursBefore = new Date(base.sunsetUtc.getTime() - 2 * 3600000);
    const result = computeDaylight(40, -83, twoHoursBefore);
    expect(Math.abs(result.minutesOfDaylightLeft - 120)).toBeLessThan(5);
  });

  it('clamps minutes-of-daylight-left to 0 after sunset', () => {
    const base = computeDaylight(40, -83, new Date('2026-06-21T12:00:00Z'));
    const afterSunset = new Date(base.sunsetUtc.getTime() + 10 * 60000);
    const result = computeDaylight(40, -83, afterSunset);
    expect(result.minutesOfDaylightLeft).toBe(0);
  });

  it('never returns NaN even at extreme polar latitudes', () => {
    const result = computeDaylight(85, 0, new Date('2026-06-21T12:00:00Z'));
    expect(Number.isNaN(result.minutesOfDaylightLeft)).toBe(false);
    expect(Number.isNaN(result.daylightMinutesTotal)).toBe(false);
  });
});
