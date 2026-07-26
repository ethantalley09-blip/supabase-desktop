// Per-user Turf Briefing customization: the shape of turf_briefing_
// preferences.settings (migration 0031) plus its defaults and a resilient
// merge so a preferences row saved before some field existed still works.
// No Supabase import (pattern: route.ts, doorstep.ts) — see
// turfPreferences.test.ts.

export type HighlightMode = 'none' | 'party' | 'persuadability';

export type TurfPreferences = {
  statWindows: { recentHours: number; todayHours: number };
  bestTimeToKnock: { minSample: number; minHourAttempts: number; lookbackDays: number };
  persuasionDrift: { lookbackDays: number; showWarmed: boolean; showCooled: boolean };
  household: { minSize: number };
  daylight: { warnMinutes: number };
  heatmap: { minWeightToShow: number };
  highlightFilter: { mode: HighlightMode; value: string | null };
  canvasserLeaderboard: { minAttempts: number };
  overlapGuard: { lookbackDays: number };
  revisitQueue: { minAttempts: number };
};

// Mirrors the constants each pure module already used before this round
// (turfBriefingMath.ts's 4h/24h windows, visitHistory.ts's MIN_SAMPLE=5/
// MIN_HOUR_ATTEMPTS=3) — customizing settings changes behavior, but nobody
// who never opens the Customize panel sees anything different.
export const DEFAULT_TURF_PREFERENCES: TurfPreferences = {
  statWindows: { recentHours: 4, todayHours: 24 },
  bestTimeToKnock: { minSample: 5, minHourAttempts: 3, lookbackDays: 30 },
  persuasionDrift: { lookbackDays: 30, showWarmed: true, showCooled: true },
  household: { minSize: 1 },
  daylight: { warnMinutes: 60 },
  heatmap: { minWeightToShow: 0 },
  highlightFilter: { mode: 'none', value: null },
  canvasserLeaderboard: { minAttempts: 3 },
  overlapGuard: { lookbackDays: 7 },
  revisitQueue: { minAttempts: 2 }
};

// Fills in any missing top-level or nested field from a partial/legacy
// settings blob with the current default — resilient to both an empty '{}'
// row (a user who's never customized anything) and a row saved before a
// field this version added existed.
export function mergePreferences(partial: Partial<TurfPreferences> | null | undefined): TurfPreferences {
  const p = partial ?? {};
  return {
    statWindows: { ...DEFAULT_TURF_PREFERENCES.statWindows, ...p.statWindows },
    bestTimeToKnock: { ...DEFAULT_TURF_PREFERENCES.bestTimeToKnock, ...p.bestTimeToKnock },
    persuasionDrift: { ...DEFAULT_TURF_PREFERENCES.persuasionDrift, ...p.persuasionDrift },
    household: { ...DEFAULT_TURF_PREFERENCES.household, ...p.household },
    daylight: { ...DEFAULT_TURF_PREFERENCES.daylight, ...p.daylight },
    heatmap: { ...DEFAULT_TURF_PREFERENCES.heatmap, ...p.heatmap },
    highlightFilter: { ...DEFAULT_TURF_PREFERENCES.highlightFilter, ...p.highlightFilter },
    canvasserLeaderboard: { ...DEFAULT_TURF_PREFERENCES.canvasserLeaderboard, ...p.canvasserLeaderboard },
    overlapGuard: { ...DEFAULT_TURF_PREFERENCES.overlapGuard, ...p.overlapGuard },
    revisitQueue: { ...DEFAULT_TURF_PREFERENCES.revisitQueue, ...p.revisitQueue }
  };
}
