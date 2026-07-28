// Extends the AI Campaign Advisor into sections of the owner's question-bank
// document that were previously untouched: canvassing performance (§5),
// turf/geography rankings (§7), fundraising pace/forecast (§4, §12), social
// performance (§16), cross-channel attribution (§19), and scenario planning
// (§20). Wherever Turf Briefing already computes the exact real metric
// (canvasser leaderboard, territory difficulty, best time to knock), this
// module reuses that pure logic directly rather than recomputing it — same
// numbers, same honesty guarantees, just reformatted as advisor Q&A. Pure
// and Supabase-free — see advisorInsights.test.ts.
import type { CannedAnswer } from './cannedAnswers';
import type { AdvisorSocialPost } from './advisorData';
import { computeCanvasserLeaderboard, type CanvasserVisitLike } from '@/features/turf/canvasserStats';
import { computeTerritoryDifficulty, type TerritoryDifficulty, type TerritoryVisit } from '@/features/turf/territoryDifficulty';
import { computeBestTimeToKnock, detectPersuasionDrift, type VisitForDrift, type VisitLike, type VisitOutcome } from '@/features/turf/visitHistory';
import { detectCanvasserFatigue, type VisitForFatigue } from '@/features/turf/canvasserFatigue';
import { detectSilentCanvassers, type VisitForSilence } from '@/features/turf/canvasserSilence';
import { remainingDoorsToday } from '@/features/turf/turfBriefingMath';
import { buildRevisitQueue, type RevisitTarget, type VisitForRevisit } from '@/features/turf/revisitQueue';
import { summarizeLogistics, summarizeShiftsForDate, type HotelBookingLike, type ShiftLike } from '@/features/staffing/staffingMath';
import { currentDoorScript, currentSurveyQuestions, type ScriptEntryLike } from '@/features/scripts/scriptMath';
import type { Territory, VoterRecord } from '@/features/turf/useTurf';
import type { Donation } from '@/features/fundraising/useFundraising';

const usd = (cents: number) => `$${Math.round(cents / 100).toLocaleString()}`;

// ---------------------------------------------------------------------------
// Canvassing performance (§5) — real per-canvasser production, reusing
// canvasserStats.ts's own leaderboard math (min-attempts floor included).
// ---------------------------------------------------------------------------
export function answerTopCanvasser(visits: CanvasserVisitLike[]): CannedAnswer {
  const question = 'Who is our top canvasser right now?';
  const leaderboard = computeCanvasserLeaderboard(visits);
  const top = leaderboard[0];
  if (!top) {
    return {
      id: 'top_canvasser',
      question,
      answer: 'Not enough logged visits yet to rank canvassers — each needs at least 3 attempts.',
      evidence: []
    };
  }
  return {
    id: 'top_canvasser',
    question,
    answer: `${top.name}, with ${top.contacts} real contact${top.contacts === 1 ? '' : 's'} from ${top.attempts} attempts.`,
    evidence: [`${top.contactRatePct}% contact rate`, `${leaderboard.length} canvasser${leaderboard.length === 1 ? '' : 's'} with enough visits to rank`]
  };
}

// Shared "is this visit today" filter, local-day boundaries — same pattern
// as canvasserFatigue.ts/canvasserSilence.ts, so "today" means the same
// thing everywhere in this app.
function todaysVisits<T extends { occurred_at: string }>(visits: T[], now: Date): T[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return visits.filter((v) => {
    const t = new Date(v.occurred_at).getTime();
    return t >= startMs && t < startMs + DAY_MS;
  });
}

export function answerDoorsKnockedToday(visits: { occurred_at: string }[], now = new Date()): CannedAnswer {
  const question = 'How many doors did we knock today?';
  const todays = todaysVisits(visits, now);
  return {
    id: 'doors_knocked_today',
    question,
    answer: todays.length > 0 ? `${todays.length} door${todays.length === 1 ? '' : 's'} knocked today.` : 'No doors knocked yet today.',
    evidence: []
  };
}

export function answerTodaysContactRate(visits: { occurred_at: string; outcome: VisitOutcome }[], now = new Date()): CannedAnswer {
  const question = "What was today's contact rate?";
  const todays = todaysVisits(visits, now);
  if (todays.length === 0) {
    return { id: 'todays_contact_rate', question, answer: 'No doors knocked yet today.', evidence: [] };
  }
  const contacted = todays.filter((v) => v.outcome === 'contacted').length;
  return {
    id: 'todays_contact_rate',
    question,
    answer: `${Math.round((contacted / todays.length) * 100)}% contact rate today.`,
    evidence: [`${contacted} of ${todays.length} attempts`]
  };
}

export function answerAvgDoorsPerCanvasserToday(visits: { occurred_at: string; canvasser_id: string }[], now = new Date()): CannedAnswer {
  const question = 'What was the average number of doors per canvasser today?';
  const todays = todaysVisits(visits, now);
  if (todays.length === 0) {
    return { id: 'avg_doors_per_canvasser_today', question, answer: 'No doors knocked yet today.', evidence: [] };
  }
  const canvassers = new Set(todays.map((v) => v.canvasser_id));
  return {
    id: 'avg_doors_per_canvasser_today',
    question,
    answer: `${Math.round((todays.length / canvassers.size) * 10) / 10} doors per canvasser today.`,
    evidence: [`${todays.length} doors across ${canvassers.size} canvasser${canvassers.size === 1 ? '' : 's'}`]
  };
}

export function answerTopCanvasserThisWeek(visits: (CanvasserVisitLike & { occurred_at: string })[], now = new Date()): CannedAnswer {
  const question = 'Who has been the top canvasser this week?';
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  const leaderboard = computeCanvasserLeaderboard(visits.filter((v) => new Date(v.occurred_at) >= weekAgo));
  const top = leaderboard[0];
  if (!top) {
    return { id: 'top_canvasser_week', question, answer: 'Not enough logged visits this week to rank canvassers.', evidence: [] };
  }
  return {
    id: 'top_canvasser_week',
    question,
    answer: `${top.name}, with ${top.contacts} real contact${top.contacts === 1 ? '' : 's'} this week.`,
    evidence: [`${top.contactRatePct}% contact rate`, `${top.attempts} attempts`]
  };
}

// Improving-fastest / losing-momentum (§5 items 9-10): the week-scoped
// analog of canvasserFatigue.ts's same-day pace-decline detector — first
// half of the trailing week vs. the second half, per canvasser.
export type CanvasserMomentum = {
  canvasserId: string;
  name: string;
  earlyContactRatePct: number;
  laterContactRatePct: number;
  changePct: number; // positive = improving, negative = losing momentum
};

const MIN_ATTEMPTS_PER_HALF_WEEK = 5;

export function computeCanvasserMomentum(
  visits: (CanvasserVisitLike & { occurred_at: string })[],
  now = new Date()
): CanvasserMomentum[] {
  const weekAgoMs = now.getTime() - 7 * DAY_MS;
  const midpointMs = weekAgoMs + (now.getTime() - weekAgoMs) / 2;
  const byCanvasser = new Map<
    string,
    { early: (CanvasserVisitLike & { occurred_at: string })[]; later: (CanvasserVisitLike & { occurred_at: string })[]; name: string | null }
  >();
  for (const v of visits) {
    const t = new Date(v.occurred_at).getTime();
    if (t < weekAgoMs) continue;
    const entry = byCanvasser.get(v.canvasser_id) ?? { early: [], later: [], name: v.canvasser_name };
    if (t < midpointMs) entry.early.push(v);
    else entry.later.push(v);
    if (!entry.name && v.canvasser_name) entry.name = v.canvasser_name;
    byCanvasser.set(v.canvasser_id, entry);
  }
  const results: CanvasserMomentum[] = [];
  for (const [canvasserId, { early, later, name }] of byCanvasser) {
    if (early.length < MIN_ATTEMPTS_PER_HALF_WEEK || later.length < MIN_ATTEMPTS_PER_HALF_WEEK) continue;
    const earlyRate = early.filter((v) => v.outcome === 'contacted').length / early.length;
    const laterRate = later.filter((v) => v.outcome === 'contacted').length / later.length;
    results.push({
      canvasserId,
      name: name || 'Canvasser',
      earlyContactRatePct: Math.round(earlyRate * 100),
      laterContactRatePct: Math.round(laterRate * 100),
      changePct: Math.round((laterRate - earlyRate) * 100)
    });
  }
  return results.sort((a, b) => b.changePct - a.changePct);
}

export function answerCanvasserMomentum(visits: (CanvasserVisitLike & { occurred_at: string })[], now = new Date()): CannedAnswer {
  const question = 'Which canvassers are improving fastest, and which are losing momentum?';
  const momentum = computeCanvasserMomentum(visits, now);
  if (momentum.length === 0) {
    return { id: 'canvasser_momentum', question, answer: 'Not enough logged visits this week to compare trends.', evidence: [] };
  }
  const improving = momentum[0];
  const declining = momentum[momentum.length - 1];
  const parts: string[] = [];
  if (improving.changePct > 0) parts.push(`${improving.name} improving most (+${improving.changePct}pt)`);
  if (declining.changePct < 0 && declining.canvasserId !== improving.canvasserId) parts.push(`${declining.name} declining most (${declining.changePct}pt)`);
  return {
    id: 'canvasser_momentum',
    question,
    answer:
      parts.length > 0
        ? `${parts.join('; ')} in contact rate, comparing this week's first half to its second half.`
        : 'No significant week-over-week shifts detected.',
    evidence: [`${momentum.length} canvasser${momentum.length === 1 ? '' : 's'} with enough visits to compare`]
  };
}

// Team contact rate (§5 items 16-17) — the one item here that's genuinely
// cross-domain: canvass_visits has no team field, but the new shifts table
// (migration 0033) does, keyed by profile_id + shift_date. Only visits that
// actually match a team-tagged shift on the same day get attributed.
export type TeamContactStat = { team: string; attempts: number; contacts: number; contactRatePct: number };

export function computeTeamContactRates(
  visits: { canvasser_id: string; occurred_at: string; outcome: VisitOutcome }[],
  shifts: { profile_id: string; shift_date: string; team_name: string | null }[]
): TeamContactStat[] {
  const teamByCanvasserDate = new Map<string, string>();
  for (const s of shifts) {
    if (s.team_name) teamByCanvasserDate.set(`${s.profile_id}|${s.shift_date}`, s.team_name);
  }
  const stats = new Map<string, { attempts: number; contacts: number }>();
  for (const v of visits) {
    const date = new Date(v.occurred_at).toISOString().slice(0, 10);
    const team = teamByCanvasserDate.get(`${v.canvasser_id}|${date}`);
    if (!team) continue;
    const e = stats.get(team) ?? { attempts: 0, contacts: 0 };
    e.attempts += 1;
    if (v.outcome === 'contacted') e.contacts += 1;
    stats.set(team, e);
  }
  return [...stats.entries()]
    .map(([team, s]) => ({ team, attempts: s.attempts, contacts: s.contacts, contactRatePct: Math.round((s.contacts / s.attempts) * 100) }))
    .sort((a, b) => b.contactRatePct - a.contactRatePct);
}

export function answerTeamContactRate(
  visits: { canvasser_id: string; occurred_at: string; outcome: VisitOutcome }[],
  shifts: { profile_id: string; shift_date: string; team_name: string | null }[]
): CannedAnswer {
  const question = 'Which team has the strongest contact rate?';
  const teams = computeTeamContactRates(visits, shifts);
  const top = teams[0];
  if (!top) {
    return { id: 'team_contact_rate', question, answer: 'No team-tagged shifts match logged visits yet.', evidence: [] };
  }
  return {
    id: 'team_contact_rate',
    question,
    answer: `${top.team}, with a ${top.contactRatePct}% contact rate.`,
    evidence: teams.slice(1, 3).map((t) => `${t.team}: ${t.contactRatePct}%`)
  };
}

// Day-of-week performance (§5 items 19-20).
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MIN_DAY_ATTEMPTS = 5;

export function computeDayOfWeekPerformance(
  visits: { occurred_at: string; outcome: VisitOutcome }[]
): { day: string; attempts: number; contactRatePct: number }[] {
  const byDay = new Map<number, { attempts: number; contacts: number }>();
  for (const v of visits) {
    const day = new Date(v.occurred_at).getDay();
    const e = byDay.get(day) ?? { attempts: 0, contacts: 0 };
    e.attempts += 1;
    if (v.outcome === 'contacted') e.contacts += 1;
    byDay.set(day, e);
  }
  return [...byDay.entries()]
    .map(([day, s]) => ({ day: WEEKDAY_NAMES[day], attempts: s.attempts, contactRatePct: Math.round((s.contacts / s.attempts) * 100) }))
    .sort((a, b) => b.contactRatePct - a.contactRatePct);
}

export function answerBestDayOfWeek(visits: { occurred_at: string; outcome: VisitOutcome }[]): CannedAnswer {
  const question = 'What day of the week produces the best results?';
  const days = computeDayOfWeekPerformance(visits).filter((d) => d.attempts >= MIN_DAY_ATTEMPTS);
  const top = days[0];
  if (!top) {
    return { id: 'best_day_of_week', question, answer: 'Not enough logged visits yet to compare days of the week.', evidence: [] };
  }
  return {
    id: 'best_day_of_week',
    question,
    answer: `${top.day}, with a ${top.contactRatePct}% contact rate.`,
    evidence: [`based on ${top.attempts} logged visits`]
  };
}

export function answerWeekendVsWeekday(visits: { occurred_at: string; outcome: VisitOutcome }[]): CannedAnswer {
  const question = 'How does weekend canvassing compare with weekday canvassing?';
  const weekend = visits.filter((v) => [0, 6].includes(new Date(v.occurred_at).getDay()));
  const weekday = visits.filter((v) => ![0, 6].includes(new Date(v.occurred_at).getDay()));
  if (weekend.length < MIN_DAY_ATTEMPTS || weekday.length < MIN_DAY_ATTEMPTS) {
    return {
      id: 'weekend_vs_weekday',
      question,
      answer: 'Not enough logged visits yet on both weekends and weekdays to compare.',
      evidence: []
    };
  }
  const rate = (arr: typeof visits) => Math.round((arr.filter((v) => v.outcome === 'contacted').length / arr.length) * 100);
  return {
    id: 'weekend_vs_weekday',
    question,
    answer: `Weekends: ${rate(weekend)}% contact rate. Weekdays: ${rate(weekday)}% contact rate.`,
    evidence: [`${weekend.length} weekend visits`, `${weekday.length} weekday visits`]
  };
}

// Coaching pairing (§5 item 25) — deliberately framed as a shadow-shift
// suggestion, never a performance writeup, same spirit as
// canvasserFatigue.ts's "supportive check-in, not a performance writeup."
// Items 26-27 of this section ("who's ready to be a team lead," "who may
// need a performance conversation") are left out — those are personnel
// judgments a manager should make from evidence, not a ranking this app
// should assert.
export function answerCoachingPairs(visits: CanvasserVisitLike[]): CannedAnswer {
  const question = 'Which canvassers should be paired for coaching?';
  const leaderboard = computeCanvasserLeaderboard(visits);
  if (leaderboard.length < 2) {
    return { id: 'coaching_pairs', question, answer: 'Not enough canvassers with enough logged visits yet to suggest a pairing.', evidence: [] };
  }
  const strongest = leaderboard[0];
  const mostRoomToGrow = [...leaderboard].sort((a, b) => a.contactRatePct - b.contactRatePct)[0];
  if (strongest.canvasserId === mostRoomToGrow.canvasserId) {
    return { id: 'coaching_pairs', question, answer: 'No clear coaching pairing yet — contact rates are close across the team.', evidence: [] };
  }
  return {
    id: 'coaching_pairs',
    question,
    answer: `Pair ${strongest.name} (${strongest.contactRatePct}% contact rate) with ${mostRoomToGrow.name} (${mostRoomToGrow.contactRatePct}%) for a ride-along or shadow shift.`,
    evidence: [`${strongest.name}: ${strongest.contacts}/${strongest.attempts}`, `${mostRoomToGrow.name}: ${mostRoomToGrow.contacts}/${mostRoomToGrow.attempts}`]
  };
}

// Today vs. baseline (§5 items 29-30) — a plain trailing-7-day comparison,
// not a statistical anomaly test; also gives an honest read on whether a
// shift is more likely explained by staffing changes than pace changes.
export function answerTodayVsBaseline(visits: { occurred_at: string; canvasser_id: string }[], now = new Date()): CannedAnswer {
  const question = "How unusual was today's production?";
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todays = visits.filter((v) => new Date(v.occurred_at).getTime() >= todayStart.getTime());
  const weekAgoMs = todayStart.getTime() - 7 * DAY_MS;
  const priorWeek = visits.filter((v) => {
    const t = new Date(v.occurred_at).getTime();
    return t >= weekAgoMs && t < todayStart.getTime();
  });
  if (todays.length === 0 || priorWeek.length === 0) {
    return { id: 'today_vs_baseline', question, answer: 'Not enough data yet to compare today against a baseline.', evidence: [] };
  }
  const priorDailyAvg = priorWeek.length / 7;
  const changePct = Math.round(((todays.length - priorDailyAvg) / priorDailyAvg) * 100);
  const todayCanvassers = new Set(todays.map((v) => v.canvasser_id)).size;
  const priorCanvasserDays = new Set(priorWeek.map((v) => `${v.canvasser_id}|${new Date(v.occurred_at).toDateString()}`)).size;
  const priorAvgCanvassers = priorCanvasserDays / 7;
  const staffChangePct = priorAvgCanvassers > 0 ? Math.round(((todayCanvassers - priorAvgCanvassers) / priorAvgCanvassers) * 100) : 0;
  const direction = changePct > 15 ? 'well above' : changePct < -15 ? 'well below' : 'in line with';
  const staffNote =
    Math.abs(staffChangePct) > 15
      ? ` Staffing today (${todayCanvassers}) is ${staffChangePct > 0 ? 'up' : 'down'} ${Math.abs(staffChangePct)}% vs. the trailing average, which may explain some of the shift.`
      : '';
  return {
    id: 'today_vs_baseline',
    question,
    answer: `Today's ${todays.length} doors is ${direction} the trailing 7-day daily average of ${Math.round(priorDailyAvg)}.${staffNote}`,
    evidence: [`${Math.round(priorDailyAvg)} average doors/day over the prior week`, `${todayCanvassers} canvassers active today`]
  };
}

// ---------------------------------------------------------------------------
// Turf/geography rankings (§7) — reuses territoryDifficulty.ts.
// ---------------------------------------------------------------------------
export function answerHardestTerritory(voters: VoterRecord[], visits: TerritoryVisit[], territories: Territory[]): CannedAnswer {
  const question = 'Which territory is hardest to work right now?';
  const ranked = computeTerritoryDifficulty(voters, visits, territories);
  const hardest = ranked[0];
  if (!hardest) {
    return {
      id: 'hardest_territory',
      question,
      answer: 'Not enough logged visits yet to compare territories — each needs at least 3 attempts.',
      evidence: []
    };
  }
  return {
    id: 'hardest_territory',
    question,
    answer: `${hardest.name}, with ${hardest.oppositionPct}% opposition and ${hardest.deadDoorPct}% dead doors.`,
    evidence: [`${hardest.contactRatePct}% contact rate`, `${hardest.remainingDoors} doors still remaining`]
  };
}

export function rankTerritoriesByContactRate(ranked: TerritoryDifficulty[]): { best: TerritoryDifficulty | null; worst: TerritoryDifficulty | null } {
  if (ranked.length === 0) return { best: null, worst: null };
  const byContact = [...ranked].sort((a, b) => b.contactRatePct - a.contactRatePct);
  return { best: byContact[0], worst: byContact[byContact.length - 1] };
}

export function answerBestContactRateTerritory(voters: VoterRecord[], visits: TerritoryVisit[], territories: Territory[]): CannedAnswer {
  const question = 'Which turf has the highest contact rate?';
  const { best } = rankTerritoriesByContactRate(computeTerritoryDifficulty(voters, visits, territories));
  if (!best) {
    return { id: 'best_contact_rate_territory', question, answer: 'Not enough logged visits yet to compare territories.', evidence: [] };
  }
  return {
    id: 'best_contact_rate_territory',
    question,
    answer: `${best.name}, with a ${best.contactRatePct}% contact rate.`,
    evidence: [`${best.attempts} attempts logged`]
  };
}

export function answerWorstContactRateTerritory(voters: VoterRecord[], visits: TerritoryVisit[], territories: Territory[]): CannedAnswer {
  const question = 'Which turf has the lowest contact rate?';
  const { worst } = rankTerritoriesByContactRate(computeTerritoryDifficulty(voters, visits, territories));
  if (!worst) {
    return { id: 'worst_contact_rate_territory', question, answer: 'Not enough logged visits yet to compare territories.', evidence: [] };
  }
  return {
    id: 'worst_contact_rate_territory',
    question,
    answer: `${worst.name}, with a ${worst.contactRatePct}% contact rate.`,
    evidence: [`${worst.attempts} attempts logged`]
  };
}

// "Which turf should we canvass next?" — deliberately NOT filtered by
// territoryDifficulty.ts's 3-attempt floor (that floor exists so a
// difficulty RATE isn't asserted on a tiny sample; a fresh, totally
// untouched territory has no rate to protect and can still have the most
// remaining doors). Reuses turfBriefingMath.ts's own real "remaining today"
// definition so this never disagrees with what the live heatmap shows.
export function answerNextTerritoryToCanvass(voters: VoterRecord[], territories: Territory[], now = new Date()): CannedAnswer {
  const question = 'Which turf should we canvass next?';
  const remaining = remainingDoorsToday(voters, now.getTime());
  const counts = new Map<string, number>();
  for (const v of remaining) {
    if (v.territory_id) counts.set(v.territory_id, (counts.get(v.territory_id) ?? 0) + 1);
  }
  const ranked = [...counts.entries()]
    .map(([id, count]) => ({ name: territories.find((t) => t.id === id)?.name ?? 'Unnamed territory', count }))
    .sort((a, b) => b.count - a.count);
  const top = ranked[0];
  if (!top) {
    return { id: 'next_territory', question, answer: 'No territory has remaining doors to work right now.', evidence: [] };
  }
  return {
    id: 'next_territory',
    question,
    answer: `${top.name} — ${top.count} door${top.count === 1 ? '' : 's'} still remaining to knock today.`,
    evidence: ranked.slice(1, 3).map((r) => `${r.name}: ${r.count} remaining`)
  };
}

// Support/persuadable breakdown by territory (§7 items 5-6) — the real
// persuadability_bucket already logged per visit, aggregated by turf.
export type TerritorySupportBreakdown = { territoryId: string; name: string; baseSupport: number; persuadable: number; opposed: number };

export function computeTerritorySupportBreakdown(
  voters: VoterRecord[],
  visits: TerritoryVisit[],
  territories: Territory[]
): TerritorySupportBreakdown[] {
  const voterTerritory = new Map(voters.map((v) => [v.id, v.territory_id]));
  const stats = new Map<string, { baseSupport: number; persuadable: number; opposed: number }>();
  for (const v of visits) {
    const territoryId = voterTerritory.get(v.voter_id);
    if (!territoryId) continue;
    const e = stats.get(territoryId) ?? { baseSupport: 0, persuadable: 0, opposed: 0 };
    if (v.persuadability_bucket === 'base_support') e.baseSupport += 1;
    else if (v.persuadability_bucket === 'persuadable') e.persuadable += 1;
    else if (v.persuadability_bucket === 'opposed') e.opposed += 1;
    stats.set(territoryId, e);
  }
  return [...stats.entries()].map(([id, s]) => ({
    territoryId: id,
    name: territories.find((t) => t.id === id)?.name ?? 'Unnamed territory',
    ...s
  }));
}

export function answerTerritorySupportBreakdown(voters: VoterRecord[], visits: TerritoryVisit[], territories: Territory[]): CannedAnswer {
  const question = 'Which turf is producing the most supporters, and which the most undecided voters?';
  const breakdown = computeTerritorySupportBreakdown(voters, visits, territories);
  if (breakdown.length === 0) {
    return { id: 'territory_support_breakdown', question, answer: 'Not enough logged visits yet to break this down by turf.', evidence: [] };
  }
  const bySupport = [...breakdown].sort((a, b) => b.baseSupport - a.baseSupport)[0];
  const byPersuadable = [...breakdown].sort((a, b) => b.persuadable - a.persuadable)[0];
  if (bySupport.baseSupport === 0 && byPersuadable.persuadable === 0) {
    return { id: 'territory_support_breakdown', question, answer: 'No real support or persuadable signals logged yet in any turf.', evidence: [] };
  }
  return {
    id: 'territory_support_breakdown',
    question,
    answer: `${bySupport.name} has the most real supporters logged (${bySupport.baseSupport}); ${byPersuadable.name} has the most undecided/persuadable voters logged (${byPersuadable.persuadable}).`,
    evidence: []
  };
}

// Walkbook sizing (§7 item 16) — real voter counts per territory vs. the
// real average, not a fixed target (none exists in this app).
export type WalkbookSize = { territoryId: string; name: string; voterCount: number };

export function computeWalkbookSizes(voters: VoterRecord[], territories: Territory[]): WalkbookSize[] {
  const counts = new Map<string, number>();
  for (const v of voters) {
    if (v.territory_id) counts.set(v.territory_id, (counts.get(v.territory_id) ?? 0) + 1);
  }
  return territories.map((t) => ({ territoryId: t.id, name: t.name, voterCount: counts.get(t.id) ?? 0 }));
}

const WALKBOOK_OUTLIER_THRESHOLD = 0.5; // 50% above/below the real average counts as an outlier

export function answerWalkbookSizeOutliers(voters: VoterRecord[], territories: Territory[]): CannedAnswer {
  const question = 'Which walkbooks are too large or too small?';
  const sizes = computeWalkbookSizes(voters, territories).filter((s) => s.voterCount > 0);
  if (sizes.length < 2) {
    return { id: 'walkbook_size_outliers', question, answer: 'Not enough territories with assigned voters yet to compare walkbook sizes.', evidence: [] };
  }
  const avg = sizes.reduce((s, w) => s + w.voterCount, 0) / sizes.length;
  const tooLarge = sizes.filter((s) => s.voterCount > avg * (1 + WALKBOOK_OUTLIER_THRESHOLD));
  const tooSmall = sizes.filter((s) => s.voterCount < avg * (1 - WALKBOOK_OUTLIER_THRESHOLD));
  if (tooLarge.length === 0 && tooSmall.length === 0) {
    return {
      id: 'walkbook_size_outliers',
      question,
      answer: `All ${sizes.length} walkbooks are reasonably close to the real average size (${Math.round(avg)} voters).`,
      evidence: []
    };
  }
  const parts: string[] = [];
  if (tooLarge.length > 0) parts.push(`${tooLarge.map((t) => t.name).join(', ')} ${tooLarge.length === 1 ? 'is' : 'are'} oversized`);
  if (tooSmall.length > 0) parts.push(`${tooSmall.map((t) => t.name).join(', ')} ${tooSmall.length === 1 ? 'is' : 'are'} undersized`);
  return {
    id: 'walkbook_size_outliers',
    question,
    answer: `${parts.join('; ')}, vs. a real average of ${Math.round(avg)} voters per walkbook.`,
    evidence: sizes.map((s) => `${s.name}: ${s.voterCount}`)
  };
}

// Unattempted doors (§7 item 19) — real voters with zero logged visits.
export function answerUnattemptedDoors(voters: VoterRecord[], visits: { voter_id: string }[]): CannedAnswer {
  const question = 'Which doors have not been attempted?';
  const attempted = new Set(visits.map((v) => v.voter_id));
  const active = voters.filter((v) => v.contact_status === 'active' && v.lat !== null && v.lng !== null);
  if (active.length === 0) {
    return { id: 'unattempted_doors', question, answer: 'No mapped, active voters in this project yet.', evidence: [] };
  }
  const unattempted = active.filter((v) => !attempted.has(v.id));
  return {
    id: 'unattempted_doors',
    question,
    answer: `${unattempted.length.toLocaleString()} door${unattempted.length === 1 ? '' : 's'} (${Math.round((unattempted.length / active.length) * 100)}%) have never been attempted.`,
    evidence: [`${active.length.toLocaleString()} mapped, active doors total`]
  };
}

// Revisit candidates (§7 item 20) — reuses revisitQueue.ts's real
// repeated-no-answer detector directly.
export function answerRevisitCandidates(voters: VoterRecord[], visits: VisitForRevisit[]): CannedAnswer {
  const question = 'Which doors should be reattempted, and when?';
  const targets: RevisitTarget[] = voters.map((v) => ({ id: v.id, full_name: v.full_name }));
  const queue = buildRevisitQueue(targets, visits);
  if (queue.length === 0) {
    return { id: 'revisit_candidates', question, answer: 'No doors with repeated no-answer attempts yet — nothing stubborn to flag.', evidence: [] };
  }
  const top = queue[0];
  const daysSince = Math.floor((Date.now() - new Date(top.lastAttemptAt).getTime()) / 86_400_000);
  return {
    id: 'revisit_candidates',
    question,
    answer: `${queue.length} door${queue.length === 1 ? '' : 's'} worth a planned revisit. Top priority: ${top.name}, ${top.attempts} attempts, last tried ${daysSince} day${daysSince === 1 ? '' : 's'} ago.`,
    evidence: queue.slice(1, 3).map((c) => `${c.name}: ${c.attempts} attempts`)
  };
}

// ---------------------------------------------------------------------------
// §5/§10 — reuses visitHistory.ts's contact-rate-by-hour math.
// ---------------------------------------------------------------------------
export function answerBestTimeToKnock(visits: VisitLike[]): CannedAnswer {
  const question = 'What time of day gets the best contact rate?';
  const insight = computeBestTimeToKnock(visits);
  if (!insight) {
    return {
      id: 'best_time_to_knock',
      question,
      answer: 'Not enough logged visits yet to tell — need at least 5 total, with 3+ in the winning hour.',
      evidence: []
    };
  }
  return {
    id: 'best_time_to_knock',
    question,
    answer: `${insight.bestHourLabel}, with a ${insight.contactRatePct}% contact rate.`,
    evidence: [`based on ${insight.sampleSize} logged visits`]
  };
}

// ---------------------------------------------------------------------------
// Contact quality/persuasion (§6) — reuses visitHistory.ts's real
// between-visit lean-change detector (opposed <-> warm only; a persuadable
// <-> base_support wobble is too minor to surface).
// ---------------------------------------------------------------------------
export function answerPersuasionDrift(visits: VisitForDrift[]): CannedAnswer {
  const question = "Has anyone's support changed recently?";
  const alerts = detectPersuasionDrift(visits);
  if (alerts.length === 0) {
    return { id: 'persuasion_drift', question, answer: 'No detected shifts between visits yet.', evidence: [] };
  }
  const warmed = alerts.filter((a) => a.direction === 'warmed').length;
  const cooled = alerts.filter((a) => a.direction === 'cooled').length;
  const latest = alerts[0];
  return {
    id: 'persuasion_drift',
    question,
    answer: `${alerts.length} voter${alerts.length === 1 ? '' : 's'} shifted lean between visits — most recently ${latest.name} ${latest.direction === 'warmed' ? 'warmed up' : 'cooled off'}.`,
    evidence: [`${warmed} warmed up`, `${cooled} cooled off`]
  };
}

// ---------------------------------------------------------------------------
// Coaching/QA/safety (§10) — reuses canvasserFatigue.ts's real today-only
// pace-decline detector and canvasserSilence.ts's real gone-quiet detector.
// Framed the same supportive, never-punitive way those two already are.
// ---------------------------------------------------------------------------
export function answerCanvasserWellbeing(visits: (VisitForFatigue & VisitForSilence)[], now = new Date()): CannedAnswer {
  const question = 'Does anyone need a check-in right now?';
  const fatigue = detectCanvasserFatigue(visits, now);
  const silent = detectSilentCanvassers(visits, now);
  if (fatigue.length === 0 && silent.length === 0) {
    return { id: 'canvasser_wellbeing', question, answer: 'No fatigue or check-in signals right now.', evidence: [] };
  }
  const parts: string[] = [];
  if (fatigue.length > 0) parts.push(`${fatigue.length} showing a real pace drop today`);
  if (silent.length > 0) parts.push(`${silent.length} gone quiet for 90+ minutes after an active start`);
  return {
    id: 'canvasser_wellbeing',
    question,
    answer: `Yes — ${parts.join(' and ')}. Worth a supportive check-in, not a performance callout.`,
    evidence: [
      ...fatigue.slice(0, 2).map((f) => `${f.name}: ${f.earlyContactRatePct}% → ${f.laterContactRatePct}% contact rate today`),
      ...silent.slice(0, 2).map((s) => `${s.name}: quiet for ${Math.round(s.minutesSinceLastVisit / 60)}h after an active start`)
    ]
  };
}

// ---------------------------------------------------------------------------
// Alerts/anomalies (§21) — a real, honest data-freshness check. Genuine
// anomaly detection (day-over-day swings) would need a stored daily-metrics
// history this app doesn't have; this only checks how stale the visit log
// itself is, which needs no history at all.
// ---------------------------------------------------------------------------
export function describeDataFreshnessAlert(visits: { occurred_at: string }[], now = new Date()): string | null {
  if (visits.length === 0) return null;
  const mostRecentMs = Math.max(...visits.map((v) => new Date(v.occurred_at).getTime()));
  const hoursSince = (now.getTime() - mostRecentMs) / 3_600_000;
  if (hoursSince < 48) return null;
  const days = Math.floor(hoursSince / 24);
  return `No canvass visits logged in the last ${days} day${days === 1 ? '' : 's'} — this data may be stale.`;
}

// ---------------------------------------------------------------------------
// Fundraising pace/forecast (§4, §12) — real week-over-week trend from
// donation timestamps already on every row (no new migration needed).
// ---------------------------------------------------------------------------
export type FundraisingPace = {
  last7DaysCents: number;
  prior7DaysCents: number;
  dailyAverageCents: number;
  trend: 'up' | 'down' | 'flat';
  trendPct: number | null;
};

const DAY_MS = 86_400_000;

export function computeFundraisingPace(donations: Donation[], now = new Date()): FundraisingPace {
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const last7 = donations.filter((d) => new Date(d.donated_at) >= since7);
  const prior7 = donations.filter((d) => {
    const t = new Date(d.donated_at);
    return t >= since14 && t < since7;
  });
  const last7DaysCents = last7.reduce((s, d) => s + d.amount_cents, 0);
  const prior7DaysCents = prior7.reduce((s, d) => s + d.amount_cents, 0);
  const dailyAverageCents = Math.round(last7DaysCents / 7);

  let trend: FundraisingPace['trend'] = 'flat';
  let trendPct: number | null = null;
  if (prior7DaysCents > 0) {
    trendPct = Math.round(((last7DaysCents - prior7DaysCents) / prior7DaysCents) * 100);
    trend = trendPct > 10 ? 'up' : trendPct < -10 ? 'down' : 'flat';
  } else if (last7DaysCents > 0) {
    trend = 'up';
  }
  return { last7DaysCents, prior7DaysCents, dailyAverageCents, trend, trendPct };
}

export function answerFundraisingPace(donations: Donation[], now = new Date()): CannedAnswer {
  const question = 'Are we raising more or less than last week?';
  if (donations.length === 0) {
    return { id: 'fundraising_pace', question, answer: 'No donations recorded yet.', evidence: [] };
  }
  const pace = computeFundraisingPace(donations, now);
  const trendWord = pace.trend === 'up' ? 'up' : pace.trend === 'down' ? 'down' : 'about flat';
  const trendDetail = pace.trendPct !== null ? ` (${pace.trendPct > 0 ? '+' : ''}${pace.trendPct}%)` : '';
  return {
    id: 'fundraising_pace',
    question,
    answer: `${usd(pace.last7DaysCents)} in the last 7 days, ${trendWord}${trendDetail} vs. the 7 days before that.`,
    evidence: [`${usd(pace.dailyAverageCents)}/day average this week`, `${usd(pace.prior7DaysCents)} in the prior 7 days`]
  };
}

// A momentum ALERT (§21) — only fires on a genuinely notable swing (>25%),
// otherwise returns null so a normal week doesn't generate noise.
export function describeFundraisingMomentumAlert(pace: FundraisingPace): string | null {
  if (pace.trendPct === null || Math.abs(pace.trendPct) < 25) return null;
  return pace.trendPct > 0
    ? `Fundraising is up ${pace.trendPct}% this week (${usd(pace.last7DaysCents)} vs ${usd(pace.prior7DaysCents)} the week before) — worth a "why" follow-up.`
    : `Fundraising is down ${Math.abs(pace.trendPct)}% this week (${usd(pace.last7DaysCents)} vs ${usd(pace.prior7DaysCents)} the week before) — worth a look.`;
}

// ---------------------------------------------------------------------------
// Fundraising (§12 items 5-6, 11-14) — reuses the same Donation rows already
// fetched for answerFundraisingPace/answerDoorstepAttribution.
// ---------------------------------------------------------------------------
export type FundraiserLike = { amount_cents: number; recorder?: { full_name: string | null; email: string | null } | null };

export function answerTopFundraiser(donations: FundraiserLike[]): CannedAnswer {
  const question = 'Who are the top fundraisers?';
  const byRecorder = new Map<string, { name: string; totalCents: number; count: number }>();
  for (const d of donations) {
    if (!d.recorder) continue;
    const key = d.recorder.full_name || d.recorder.email || 'Unknown';
    const e = byRecorder.get(key) ?? { name: key, totalCents: 0, count: 0 };
    e.totalCents += d.amount_cents;
    e.count += 1;
    byRecorder.set(key, e);
  }
  const ranked = [...byRecorder.values()].sort((a, b) => b.totalCents - a.totalCents);
  const top = ranked[0];
  if (!top) {
    return { id: 'top_fundraiser', question, answer: 'No donations have a staff member recorded against them yet.', evidence: [] };
  }
  return {
    id: 'top_fundraiser',
    question,
    answer: `${top.name}, with ${usd(top.totalCents)} recorded across ${top.count} donation${top.count === 1 ? '' : 's'}.`,
    evidence: ranked.slice(1, 3).map((r) => `${r.name}: ${usd(r.totalCents)}`)
  };
}

export type PaymentMethodLike = { amount_cents: number; payment_method: string | null };

// The closest honest proxy this app has to "fundraising source" — no
// online/mail/event/social channel is tracked on a donation, only how it
// was paid. Framed as payment method, not channel, to stay accurate.
export function answerPaymentMethodBreakdown(donations: PaymentMethodLike[]): CannedAnswer {
  const question = 'Which payment method is producing the most money?';
  if (donations.length === 0) {
    return { id: 'payment_method_breakdown', question, answer: 'No donations recorded yet.', evidence: [] };
  }
  const byMethod = new Map<string, number>();
  for (const d of donations) {
    const key = d.payment_method?.trim() || 'Not specified';
    byMethod.set(key, (byMethod.get(key) ?? 0) + d.amount_cents);
  }
  const ranked = [...byMethod.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  return {
    id: 'payment_method_breakdown',
    question,
    answer: `${top[0]}, with ${usd(top[1])} raised.`,
    evidence: ranked.slice(1, 3).map(([method, cents]) => `${method}: ${usd(cents)}`)
  };
}

export type DonorTrendLike = { donor_id: string; amount_cents: number; donated_at: string };

export function answerDonorGrowthVsAverageGift(donations: DonorTrendLike[], now = new Date()): CannedAnswer {
  const question = 'Is donor count growing even if the average gift is falling?';
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const last7 = donations.filter((d) => new Date(d.donated_at) >= since7);
  const prior7 = donations.filter((d) => {
    const t = new Date(d.donated_at);
    return t >= since14 && t < since7;
  });
  if (last7.length === 0 || prior7.length === 0) {
    return { id: 'donor_growth_vs_avg_gift', question, answer: 'Not enough donations in the last two weeks to compare trends.', evidence: [] };
  }
  const last7Donors = new Set(last7.map((d) => d.donor_id)).size;
  const prior7Donors = new Set(prior7.map((d) => d.donor_id)).size;
  const last7Avg = last7.reduce((s, d) => s + d.amount_cents, 0) / last7.length;
  const prior7Avg = prior7.reduce((s, d) => s + d.amount_cents, 0) / prior7.length;
  const donorTrend = last7Donors > prior7Donors ? 'up' : last7Donors < prior7Donors ? 'down' : 'flat';
  const giftTrend = last7Avg > prior7Avg * 1.05 ? 'up' : last7Avg < prior7Avg * 0.95 ? 'down' : 'flat';
  return {
    id: 'donor_growth_vs_avg_gift',
    question,
    answer: `Donor count is ${donorTrend} (${prior7Donors} → ${last7Donors}) and the average gift is ${giftTrend} (${usd(Math.round(prior7Avg))} → ${usd(Math.round(last7Avg))}), comparing this week to the week before.`,
    evidence: []
  };
}

export function answerDonorConcentration(donations: DonorTrendLike[]): CannedAnswer {
  const question = 'Are we relying too heavily on a small number of donors?';
  if (donations.length === 0) {
    return { id: 'donor_concentration', question, answer: 'No donations recorded yet.', evidence: [] };
  }
  const byDonor = new Map<string, number>();
  let total = 0;
  for (const d of donations) {
    byDonor.set(d.donor_id, (byDonor.get(d.donor_id) ?? 0) + d.amount_cents);
    total += d.amount_cents;
  }
  const sorted = [...byDonor.values()].sort((a, b) => b - a);
  const topN = Math.max(1, Math.ceil(sorted.length * 0.1));
  const topShare = sorted.slice(0, topN).reduce((s, c) => s + c, 0);
  const pct = total > 0 ? Math.round((topShare / total) * 100) : 0;
  return {
    id: 'donor_concentration',
    question,
    answer: `Your top ${topN} donor${topN === 1 ? '' : 's'} (the top 10% of ${sorted.length} total) account${topN === 1 ? 's' : ''} for ${pct}% of everything raised.`,
    evidence: [pct > 50 ? 'That is a meaningful concentration — worth diversifying.' : 'That is a reasonably broad base.']
  };
}

// "First-time" here means a donor with only one gift in the data provided,
// not necessarily their literal first-ever gift outside this window — worth
// being precise about since it's a simplification.
export function answerDonorRepeatShare(donations: DonorTrendLike[]): CannedAnswer {
  const question = 'What percentage of revenue comes from first-time vs. repeat donors?';
  if (donations.length === 0) {
    return { id: 'donor_repeat_share', question, answer: 'No donations recorded yet.', evidence: [] };
  }
  const countByDonor = new Map<string, number>();
  for (const d of donations) countByDonor.set(d.donor_id, (countByDonor.get(d.donor_id) ?? 0) + 1);
  let repeatCents = 0;
  let firstTimeCents = 0;
  for (const d of donations) {
    if ((countByDonor.get(d.donor_id) ?? 0) > 1) repeatCents += d.amount_cents;
    else firstTimeCents += d.amount_cents;
  }
  const total = repeatCents + firstTimeCents;
  const repeatPct = total > 0 ? Math.round((repeatCents / total) * 100) : 0;
  return {
    id: 'donor_repeat_share',
    question,
    answer: `${repeatPct}% of revenue comes from donors who have given more than once; ${100 - repeatPct}% from first-time donors.`,
    evidence: [`${usd(repeatCents)} from repeat donors`, `${usd(firstTimeCents)} from first-time donors`]
  };
}

// ---------------------------------------------------------------------------
// Social/press performance (§16) — real impressions/engagement as staff
// record them (social_posts, migration 0013); honest about being manually
// recorded, same as the existing Social Scheduler panel.
// ---------------------------------------------------------------------------
export type SocialPerformance = {
  totalImpressions: number;
  totalEngagement: number;
  postedCount: number;
  engagementRatePct: number;
  topPlatform: { platform: string; impressions: number } | null;
};

export function computeSocialPerformance(posts: AdvisorSocialPost[]): SocialPerformance {
  const posted = posts.filter((p) => p.status === 'posted');
  const totalImpressions = posted.reduce((s, p) => s + (p.impressions ?? 0), 0);
  const totalEngagement = posted.reduce((s, p) => s + (p.engagement_count ?? 0), 0);
  const byPlatform = new Map<string, number>();
  for (const p of posted) byPlatform.set(p.platform, (byPlatform.get(p.platform) ?? 0) + (p.impressions ?? 0));
  const top = [...byPlatform.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    totalImpressions,
    totalEngagement,
    postedCount: posted.length,
    engagementRatePct: totalImpressions > 0 ? Math.round((totalEngagement / totalImpressions) * 1000) / 10 : 0,
    topPlatform: top ? { platform: top[0], impressions: top[1] } : null
  };
}

export function answerSocialPerformance(posts: AdvisorSocialPost[]): CannedAnswer {
  const question = 'How is our social media performing?';
  const stats = computeSocialPerformance(posts);
  if (stats.postedCount === 0) {
    return { id: 'social_performance', question, answer: 'No posted social content with recorded metrics yet.', evidence: [] };
  }
  return {
    id: 'social_performance',
    question,
    answer: `${stats.totalImpressions.toLocaleString()} total impressions across ${stats.postedCount} post${stats.postedCount === 1 ? '' : 's'}, ${stats.engagementRatePct}% engagement rate.`,
    evidence: stats.topPlatform ? [`${stats.topPlatform.platform} is the top platform (${stats.topPlatform.impressions.toLocaleString()} impressions)`] : []
  };
}

export function answerWeeklySocialReach(posts: AdvisorSocialPost[], now = new Date()): CannedAnswer {
  const question = 'What was our total social reach this week?';
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const thisWeek = posts.filter((p) => p.status === 'posted' && new Date(p.created_at) >= since7);
  if (thisWeek.length === 0) {
    return { id: 'weekly_social_reach', question, answer: 'No posted content with recorded metrics this week.', evidence: [] };
  }
  const totalImpressions = thisWeek.reduce((s, p) => s + (p.impressions ?? 0), 0);
  return {
    id: 'weekly_social_reach',
    question,
    answer: `${totalImpressions.toLocaleString()} impressions across ${thisWeek.length} post${thisWeek.length === 1 ? '' : 's'} this week.`,
    evidence: []
  };
}

// Below this many real impressions, an "engagement rate" is one lucky/
// unlucky viewer, not a real signal — same min-sample discipline as the
// canvassing leaderboard.
const MIN_IMPRESSIONS_FOR_BEST_POST = 50;

export function answerBestPerformingPost(posts: AdvisorSocialPost[]): CannedAnswer {
  const question = 'Which post performed best?';
  const eligible = posts.filter((p) => p.status === 'posted' && (p.impressions ?? 0) >= MIN_IMPRESSIONS_FOR_BEST_POST);
  if (eligible.length === 0) {
    return { id: 'best_performing_post', question, answer: 'No posted content with enough recorded impressions yet to compare.', evidence: [] };
  }
  const ranked = [...eligible].sort(
    (a, b) => (b.engagement_count ?? 0) / (b.impressions || 1) - (a.engagement_count ?? 0) / (a.impressions || 1)
  );
  const top = ranked[0];
  const rate = Math.round(((top.engagement_count ?? 0) / (top.impressions || 1)) * 1000) / 10;
  const preview = top.content.length > 80 ? `${top.content.slice(0, 80)}…` : top.content;
  return {
    id: 'best_performing_post',
    question,
    answer: `On ${top.platform}: "${preview}" — ${rate}% engagement rate.`,
    evidence: [`${(top.impressions ?? 0).toLocaleString()} impressions`, `${top.engagement_count ?? 0} engagements`]
  };
}

// Deliberately factual only — this app sets no target posting cadence, so
// "too often" is left as the reader's judgment call, not an asserted answer.
export function answerPostingFrequency(posts: AdvisorSocialPost[], now = new Date()): CannedAnswer {
  const question = 'Are we posting too often or not often enough?';
  const since28 = new Date(now.getTime() - 28 * DAY_MS);
  const recent = posts.filter((p) => p.status === 'posted' && new Date(p.created_at) >= since28);
  if (recent.length === 0) {
    return { id: 'posting_frequency', question, answer: "No posted content in the last 4 weeks to measure a pace from.", evidence: [] };
  }
  const perWeek = Math.round((recent.length / 4) * 10) / 10;
  return {
    id: 'posting_frequency',
    question,
    answer: `Averaging ${perWeek} post${perWeek === 1 ? '' : 's'}/week over the last 4 weeks. This app doesn't set a target pace — that's a judgment call for your team.`,
    evidence: [`${recent.length} posts in the last 28 days`]
  };
}

// ---------------------------------------------------------------------------
// Cross-channel attribution (§19) — the one honest attribution link the app
// actually has: donations.voter_id (migration 0032), set only when a gift
// was recorded from a real door via Doorstep Donations.
// ---------------------------------------------------------------------------
export type DoorstepAttribution = {
  doorstepCount: number;
  otherCount: number;
  doorstepTotalCents: number;
  pctOfDonationsFromDoorstep: number;
};

export function computeDoorstepAttribution(donations: Donation[]): DoorstepAttribution {
  const doorstep = donations.filter((d) => d.voter_id !== null);
  return {
    doorstepCount: doorstep.length,
    otherCount: donations.length - doorstep.length,
    doorstepTotalCents: doorstep.reduce((s, d) => s + d.amount_cents, 0),
    pctOfDonationsFromDoorstep: donations.length > 0 ? Math.round((doorstep.length / donations.length) * 100) : 0
  };
}

export function answerDoorstepAttribution(donations: Donation[]): CannedAnswer {
  const question = 'How many donations came directly from a doorstep ask?';
  if (donations.length === 0) {
    return { id: 'doorstep_attribution', question, answer: 'No donations recorded yet.', evidence: [] };
  }
  const stats = computeDoorstepAttribution(donations);
  return {
    id: 'doorstep_attribution',
    question,
    answer: `${stats.doorstepCount} of ${donations.length} donation${donations.length === 1 ? '' : 's'} (${stats.pctOfDonationsFromDoorstep}%) were recorded directly from a door, totaling ${usd(stats.doorstepTotalCents)}.`,
    evidence: [`${stats.otherCount} from other channels (online, mail, event)`]
  };
}

// ---------------------------------------------------------------------------
// Staffing (§9) and Logistics (§11) — reuses staffingMath.ts over the new
// shifts/hotel_bookings tables (migration 0033_staffing_logistics.sql).
// ---------------------------------------------------------------------------
export function answerTodaysStaffing(shifts: ShiftLike[], date: string): CannedAnswer {
  const question = 'Who is scheduled today?';
  const summary = summarizeShiftsForDate(shifts, date);
  const onShift = summary.scheduled + summary.worked;
  if (onShift + summary.off + summary.pendingSwap === 0) {
    return { id: 'todays_staffing', question, answer: 'No shifts logged for today yet.', evidence: [] };
  }
  return {
    id: 'todays_staffing',
    question,
    answer: `${onShift} on shift today${summary.teams.length > 0 ? ` across ${summary.teams.length} team${summary.teams.length === 1 ? '' : 's'} (${summary.teams.join(', ')})` : ''}.`,
    evidence: [
      `${summary.worked} already worked`,
      `${summary.off} off today`,
      ...(summary.pendingSwap > 0 ? [`${summary.pendingSwap} pending a shift-swap decision`] : [])
    ]
  };
}

export function answerLodgingCost(bookings: HotelBookingLike[]): CannedAnswer {
  const question = 'What is our projected hotel cost for this project?';
  if (bookings.length === 0) {
    return { id: 'lodging_cost', question, answer: 'No hotel bookings recorded yet.', evidence: [] };
  }
  const summary = summarizeLogistics(bookings);
  const hotels = [...new Set(summary.bookings.map((b) => b.hotelName))];
  return {
    id: 'lodging_cost',
    question,
    answer: `${usd(summary.totalEstimatedCostCents)} projected across ${summary.totalRooms} room${summary.totalRooms === 1 ? '' : 's'}.`,
    evidence: [`${hotels.length} hotel${hotels.length === 1 ? '' : 's'}: ${hotels.slice(0, 3).join(', ')}`]
  };
}

// ---------------------------------------------------------------------------
// Survey/script (§8, items 1-2 only — [Now] tier). Reuses scriptMath.ts over
// the new campaign_scripts table (migration 0034_campaign_scripts.sql).
// ---------------------------------------------------------------------------
export function answerCurrentDoorScript(entries: ScriptEntryLike[]): CannedAnswer {
  const question = 'What is the current door script?';
  const script = currentDoorScript(entries);
  return {
    id: 'current_door_script',
    question,
    answer: script ?? 'No door script has been entered yet.',
    evidence: []
  };
}

export function answerCurrentSurveyQuestions(entries: ScriptEntryLike[]): CannedAnswer {
  const question = 'What questions are in the current survey?';
  const qs = currentSurveyQuestions(entries);
  return {
    id: 'current_survey_questions',
    question,
    answer:
      qs.length > 0
        ? `${qs.length} question${qs.length === 1 ? '' : 's'}: ${qs.join(' / ')}`
        : 'No survey questions have been entered yet.',
    evidence: qs.length > 0 ? qs.slice(0, 5) : []
  };
}

// ---------------------------------------------------------------------------
// Scenario / "what if" planning (§20) — generic pure math over a real
// current daily rate, so it works for either a fundraising pace (dollars/day)
// or a canvassing pace (contacts/day); the caller supplies which.
// ---------------------------------------------------------------------------
export type PaceScenario = { label: string; dailyRateAfter: number; daysToTarget: number | null };

export function scenarioAdjustPace(currentDailyRate: number, remaining: number, changePct: number): PaceScenario {
  const dailyRateAfter = Math.max(0, Math.round(currentDailyRate * (1 + changePct / 100)));
  return {
    label: `${changePct > 0 ? '+' : ''}${changePct}% daily pace`,
    dailyRateAfter,
    daysToTarget: remaining <= 0 ? 0 : dailyRateAfter > 0 ? Math.ceil(remaining / dailyRateAfter) : null
  };
}

export function scenarioAddWorkers(currentDailyRate: number, perWorkerDailyRate: number, extraWorkers: number, remaining: number): PaceScenario {
  const dailyRateAfter = Math.max(0, currentDailyRate + perWorkerDailyRate * extraWorkers);
  return {
    label: `${extraWorkers >= 0 ? '+' : ''}${extraWorkers} worker${Math.abs(extraWorkers) === 1 ? '' : 's'}`,
    dailyRateAfter,
    daysToTarget: remaining <= 0 ? 0 : dailyRateAfter > 0 ? Math.ceil(remaining / dailyRateAfter) : null
  };
}

// Real trailing daily-door average — the canvassing-side input to
// scenarioAdjustPace/scenarioAddWorkers, same role computeFundraisingPace's
// dailyAverageCents plays for the fundraising simulator.
export function computeAverageDailyDoors(visits: { occurred_at: string }[], now = new Date(), windowDays = 7): number {
  const sinceMs = now.getTime() - windowDays * DAY_MS;
  const recent = visits.filter((v) => new Date(v.occurred_at).getTime() >= sinceMs);
  return recent.length / windowDays;
}

// "What happens if we skip one day of canvassing?" (§20 item 6) — most of
// §20's other phrasings (add/lose N canvassers, productivity +/-X%, weather
// halves production) are just parameterizations of scenarioAdjustPace/
// scenarioAddWorkers already above; the UI simulator lets a user try any of
// them by changing its inputs, so they don't need one bespoke function each.
export function answerSkipADayImpact(visits: { occurred_at: string }[], now = new Date()): CannedAnswer {
  const question = 'What happens if we skip one day of canvassing?';
  const avgDaily = computeAverageDailyDoors(visits, now);
  if (avgDaily === 0) {
    return { id: 'skip_a_day_impact', question, answer: "Not enough recent visits yet to estimate a day's worth of production.", evidence: [] };
  }
  return {
    id: 'skip_a_day_impact',
    question,
    answer: `Roughly ${Math.round(avgDaily)} fewer doors knocked, based on the real 7-day daily average.`,
    evidence: [`${Math.round(avgDaily)} doors/day average`]
  };
}

// ---------------------------------------------------------------------------
// Alerts/anomalies (§21) — a second, genuinely distinct alert from
// describeDataFreshnessAlert/describeFundraisingMomentumAlert: those are
// about VOLUME (doors knocked, dollars raised); this one is about QUALITY
// (contact rate), which can drop for reasons volume alone wouldn't show
// (bad turf, bad script, bad targeting).
// ---------------------------------------------------------------------------
export function describeContactRateDropAlert(visits: { occurred_at: string; outcome: VisitOutcome }[], now = new Date()): string | null {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayStartMs = todayStart.getTime();
  const todays = visits.filter((v) => {
    const t = new Date(v.occurred_at).getTime();
    return t >= todayStartMs && t < todayStartMs + DAY_MS;
  });
  if (todays.length < MIN_DAY_ATTEMPTS) return null;
  const priorWeek = visits.filter((v) => {
    const t = new Date(v.occurred_at).getTime();
    return t >= todayStartMs - 7 * DAY_MS && t < todayStartMs;
  });
  if (priorWeek.length < MIN_DAY_ATTEMPTS) return null;
  const todayRate = todays.filter((v) => v.outcome === 'contacted').length / todays.length;
  const priorRate = priorWeek.filter((v) => v.outcome === 'contacted').length / priorWeek.length;
  const dropPts = Math.round((priorRate - todayRate) * 100);
  if (dropPts < 15) return null;
  return `Today's contact rate (${Math.round(todayRate * 100)}%) is ${dropPts}pt below the trailing week's average (${Math.round(priorRate * 100)}%) — worth a look.`;
}
