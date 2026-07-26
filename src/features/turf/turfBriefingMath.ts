// Pure logic for Turf Briefing: party inference, persuadability scoring, map
// heatmap weighting, and the real-time shift snapshot. No Supabase import
// (pattern: route.ts, doorstep.ts) — see turfBriefingMath.test.ts. Kept
// separate from route.ts because this is a distinct concern (live-shift
// tactics, not walk-order/import parsing), even though voterParty reuses
// pickField. Named turfBriefingMath.ts rather than turfBriefing.ts because
// this dev box's filesystem is case-insensitive and TurfBriefing.tsx (the
// component) would otherwise collide with it.
import { pickField } from './route';
import type { ContactStatus, Territory, VoterRecord } from './useTurf';

// useTurf.ts defines isKnockable too, but importing it here would pull in
// the Supabase client (useTurf.ts imports it) and break this module's
// no-network unit-testability — the check itself is one line, so it's
// inlined instead of shared (same "kept out of useTurf.ts" reasoning
// route.ts already documents at the top of this file).
function knockable(v: VoterRecord): boolean {
  return v.contact_status === ('active' as ContactStatus);
}

export type Party = 'democrat' | 'republican' | 'independent' | 'other';

// Voter files that carry party registration use many header spellings and
// many value spellings ("D", "Dem", "DEMOCRATIC"). "Liberal"/"conservative"
// are ideology labels, not registration values, and voter files don't carry
// them — so they're deliberately not aliased here rather than guessed at.
// Unaffiliated/no-party-preference registrations bucket under independent,
// the closest real-world equivalent. Anything present but unrecognized
// (Green, Libertarian, Working Families, ...) buckets under "other" rather
// than being dropped, so a minor-party electorate is still visible on the
// map. A genuinely missing/blank field returns null — "not available" is
// shown honestly rather than guessed.
const PARTY_ALIASES: Record<string, Party> = {
  d: 'democrat',
  dem: 'democrat',
  dems: 'democrat',
  democrat: 'democrat',
  democratic: 'democrat',
  r: 'republican',
  rep: 'republican',
  reps: 'republican',
  republican: 'republican',
  gop: 'republican',
  i: 'independent',
  ind: 'independent',
  independent: 'independent',
  unaffiliated: 'independent',
  'non-affiliated': 'independent',
  'no party': 'independent',
  'no party preference': 'independent',
  npp: 'independent',
  nonpartisan: 'independent',
  'non-partisan': 'independent',
  'decline to state': 'independent',
  dts: 'independent',
  none: 'independent',
  unknown: 'independent'
};

export function voterParty(v: VoterRecord): Party | null {
  const raw = pickField(v.data, ['party', 'political party', 'party affiliation', 'voter party', 'reg party', 'party registration', 'party_registration']);
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  return PARTY_ALIASES[normalized] ?? 'other';
}

// Reuses the app's existing hex values (TERRITORY_COLORS in TurfTab.tsx) so
// party mode doesn't introduce a new palette — same colors, new meaning.
export const PARTY_COLORS: Record<Party | 'unknown', string> = {
  democrat: '#2563eb',
  republican: '#dc2626',
  independent: '#7c3aed',
  other: '#d97706',
  unknown: '#d4d4d4'
};

export const PARTY_LABELS: Record<Party | 'unknown', string> = {
  democrat: 'Democrat',
  republican: 'Republican',
  independent: 'Independent / unaffiliated',
  other: 'Other party',
  unknown: 'Not available'
};

export type PersuadabilityBucket = 'base_support' | 'persuadable' | 'opposed' | 'unknown';

type Signal = { phrase: string; support?: number; persuadable?: number; opposed?: number; reason: string };

// A separate signal table from doorstep.ts's NOTE_SIGNALS on purpose: that
// one scores "is this door worth a donation ask", this one scores "which way
// does this door lean" — different questions, some overlapping phrases, not
// worth forcing into one shared table (three similar lines beats a
// premature abstraction).
const PERSUADABILITY_SIGNALS: Signal[] = [
  { phrase: 'big supporter', support: 40, reason: 'noted as a big supporter' },
  { phrase: 'supporter', support: 25, reason: 'noted as a supporter' },
  { phrase: 'volunteer', support: 20, reason: 'asked about volunteering' },
  { phrase: 'yard sign', support: 20, reason: 'wants a yard sign' },
  { phrase: 'donat', support: 15, reason: 'mentioned donating' },
  { phrase: 'undecided', persuadable: 40, reason: 'noted as undecided' },
  { phrase: 'unsure', persuadable: 25, reason: 'noted as unsure' },
  { phrase: 'leaning', persuadable: 20, reason: 'noted as leaning' },
  { phrase: 'considering', persuadable: 20, reason: 'noted as still considering' },
  { phrase: 'not voting for us', opposed: 50, reason: 'noted as voting against us' },
  { phrase: 'voting for the other', opposed: 45, reason: 'noted as voting against us' },
  { phrase: 'opposed', opposed: 40, reason: 'noted as opposed' },
  { phrase: 'against us', opposed: 40, reason: 'noted as opposed' },
  { phrase: 'hostile', opposed: 30, reason: 'noted as hostile' }
];

const PERSUADABLE_THRESHOLD = 20;

// Which way a door leans, from the canvasser's own notes — never a purchased
// or modeled score, unlike a batch voter file from a data vendor. Every
// score ships with human-readable reasons (pattern: doorstep.ts scoreDoors),
// so a canvass captain can see WHY, not just a number. Narrowed to just the
// three fields it reads (rather than the full VoterRecord) so callers that
// only have a status/notes patch in hand — like useTurf.ts's visit logger —
// can call it without fabricating the rest of a voter row.
export function classifyPersuadability(
  v: Pick<VoterRecord, 'contact_status' | 'canvass_notes' | 'ballot_status'>
): { bucket: PersuadabilityBucket; score: number; reasons: string[] } {
  // Dead, hostile-by-status, or already-excluded doors carry no directional
  // signal worth acting on.
  if (v.contact_status !== 'active') return { bucket: 'unknown', score: 0, reasons: [] };

  const notes = (v.canvass_notes ?? '').toLowerCase();
  let support = 0;
  let persuadable = 0;
  let opposed = 0;
  const reasons: string[] = [];

  for (const s of PERSUADABILITY_SIGNALS) {
    if (!notes.includes(s.phrase)) continue;
    if (s.support) support += s.support;
    if (s.persuadable) persuadable += s.persuadable;
    if (s.opposed) opposed += s.opposed;
    reasons.push(s.reason);
  }

  // An already-returned ballot reinforces committed support but never
  // implies a direction on its own — civic engagement isn't a lean.
  if (v.ballot_status === 'returned' && support > 0) support += 10;

  const top = Math.max(support, persuadable, opposed);
  if (top < PERSUADABLE_THRESHOLD) return { bucket: 'unknown', score: 0, reasons: [] };
  if (opposed === top) return { bucket: 'opposed', score: opposed, reasons };
  if (persuadable === top) return { bucket: 'persuadable', score: persuadable, reasons };
  return { bucket: 'base_support', score: support, reasons };
}

// A distinct diverging scale from PARTY_COLORS (opposed's dark red is
// intentionally a different shade from Republican red) so the two color
// MODES never get visually confused even though only one is ever active at
// a time.
export const PERSUADABILITY_COLORS: Record<PersuadabilityBucket, string> = {
  base_support: '#16a34a',
  persuadable: '#d97706',
  opposed: '#991b1b',
  unknown: '#d4d4d4'
};

export const PERSUADABILITY_LABELS: Record<PersuadabilityBucket, string> = {
  base_support: 'Base support',
  persuadable: 'Persuadable',
  opposed: 'Opposed',
  unknown: 'Unknown'
};

export type HeatmapMode = 'density' | 'persuadability' | 'fundraising' | 'staleness';

// A lighter phrase set than doorstep.ts's scoreDoors — this only needs a 0-1
// weight for the heatmap, not a ranked, reasoned list, so it doesn't need
// the full scoring table. Intentional small duplication of a few phrases
// rather than importing scoreDoors' internals.
const FUNDRAISING_PHRASES = ['big supporter', 'supporter', 'volunteer', 'yard sign', 'donat'];

function fundraisingWeight(v: VoterRecord): number {
  if (v.contact_status !== 'active') return 0;
  const notes = (v.canvass_notes ?? '').toLowerCase();
  const hits = FUNDRAISING_PHRASES.filter((p) => notes.includes(p)).length;
  if (hits === 0) return v.ballot_status === 'returned' ? 0.15 : 0;
  return Math.min(1, 0.4 + hits * 0.2);
}

const STALENESS_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function stalenessWeight(v: VoterRecord, nowMs: number): number {
  if (!v.last_contacted_at) return 1; // never contacted is the hottest
  const ageMs = nowMs - new Date(v.last_contacted_at).getTime();
  return Math.max(0, Math.min(1, ageMs / STALENESS_WINDOW_MS));
}

// 0-1 weight per voter for the live map heatmap. Called only on already-
// mapped voters (the map layer filters to lat/lng present before this runs).
export function heatmapWeight(v: VoterRecord, mode: HeatmapMode, nowMs: number = Date.now()): number {
  switch (mode) {
    case 'density':
      return 1;
    case 'persuadability': {
      const { bucket } = classifyPersuadability(v);
      if (bucket === 'persuadable') return 1;
      if (bucket === 'base_support') return 0.4;
      if (bucket === 'opposed') return 0.1;
      return 0.2;
    }
    case 'fundraising':
      return fundraisingWeight(v);
    case 'staleness':
      return stalenessWeight(v, nowMs);
    default:
      return 1;
  }
}

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const VERY_RECENT_WINDOW_MS = 4 * 60 * 60 * 1000;

// Knockable, mapped doors nobody has touched in the configured "today"
// window (default 24h, customizable per user via turf_briefing_preferences
// -> statWindows.todayHours) — the exact set both the stat bar's
// doorsRemainingToday count and the "Rebalance now" button operate on, kept
// as one function so the two never drift apart.
export function remainingDoorsToday(
  voters: VoterRecord[],
  nowMs: number = Date.now(),
  opts?: { todayWindowMs?: number }
): VoterRecord[] {
  const todayWindowMs = opts?.todayWindowMs ?? RECENT_WINDOW_MS;
  return voters.filter((v) => {
    if (!knockable(v) || v.lat === null || v.lng === null) return false;
    const contactedMs = v.last_contacted_at ? new Date(v.last_contacted_at).getTime() : null;
    return contactedMs === null || nowMs - contactedMs > todayWindowMs;
  });
}

export type BriefingSnapshot = {
  totalActive: number;
  contactedLast4h: number;
  contactedLast24h: number;
  contactRatePerHour: number;
  doorsRemainingToday: number; // knockable, mapped, not contacted in the last 24h
  persuadable: number;
  baseSupport: number;
  opposed: number;
  directionUnknown: number;
  topRemainingTerritories: { name: string; remaining: number }[];
};

// The ONLY thing sent to the turf_briefing AI purpose — a compact aggregate,
// never raw voter rows, matching the existing data-driven-purpose boundary
// (buildTurfSnapshot in this same file's sibling functions, buildFundraisingSnapshot).
// recentWindowMs/todayWindowMs default to 4h/24h but are customizable per
// user (turf_briefing_preferences -> statWindows) via turfPreferences.ts.
export function buildBriefingSnapshot(
  voters: VoterRecord[],
  territories: Territory[],
  nowMs: number = Date.now(),
  opts?: { recentWindowMs?: number; todayWindowMs?: number }
): BriefingSnapshot {
  const recentWindowMs = opts?.recentWindowMs ?? VERY_RECENT_WINDOW_MS;
  const todayWindowMs = opts?.todayWindowMs ?? RECENT_WINDOW_MS;
  let contactedLast4h = 0;
  let contactedLast24h = 0;
  let persuadable = 0;
  let baseSupport = 0;
  let opposed = 0;
  let directionUnknown = 0;
  const activeVoters = voters.filter((v) => v.contact_status === ('active' as ContactStatus));

  for (const v of activeVoters) {
    const contactedMs = v.last_contacted_at ? new Date(v.last_contacted_at).getTime() : null;
    if (contactedMs !== null && nowMs - contactedMs <= recentWindowMs) contactedLast4h += 1;
    if (contactedMs !== null && nowMs - contactedMs <= todayWindowMs) contactedLast24h += 1;

    const { bucket } = classifyPersuadability(v);
    if (bucket === 'persuadable') persuadable += 1;
    else if (bucket === 'base_support') baseSupport += 1;
    else if (bucket === 'opposed') opposed += 1;
    else directionUnknown += 1;
  }

  const remainingDoors = remainingDoorsToday(voters, nowMs, { todayWindowMs });
  const remainingByTerritory = new Map<string, number>();
  for (const v of remainingDoors) {
    if (v.territory_id) remainingByTerritory.set(v.territory_id, (remainingByTerritory.get(v.territory_id) ?? 0) + 1);
  }

  const topRemainingTerritories = [...remainingByTerritory.entries()]
    .map(([territoryId, remaining]) => ({
      name: territories.find((t) => t.id === territoryId)?.name ?? 'Unnamed territory',
      remaining
    }))
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 3);

  return {
    totalActive: activeVoters.length,
    contactedLast4h,
    contactedLast24h,
    contactRatePerHour: Math.round((contactedLast4h / (recentWindowMs / 3600000)) * 10) / 10,
    doorsRemainingToday: remainingDoors.length,
    persuadable,
    baseSupport,
    opposed,
    directionUnknown,
    topRemainingTerritories
  };
}
