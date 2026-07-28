// Turns the AI Campaign Advisor's "Ask your data" box from single-shot Q&A
// into a real conversation: stitching prior turns into the next question so
// follow-ups like "Why?" resolve against what was just said, plus an honest,
// client-side (non-AI) read on how much data backs the answer. Pure and
// Supabase-free — see conversationContext.test.ts — kept out of
// AiCenterTab.tsx and cannedAnswers.ts, neither of which this file touches.
import type { FundraisingSnapshot } from '@/features/fundraising/fundraisingSnapshot';
import type { TurfSnapshot } from '@/features/turf/useTurf';

export type ConversationTurn = { question: string; answer: string };

// A fixed set of drill-down follow-ups the model can answer honestly from the
// SAME aggregate snapshot it already has — no new data required. Deliberately
// excludes anything needing history it doesn't have (e.g. "compared with
// last week") since the snapshot is a single point-in-time read.
export const FOLLOW_UP_PROMPTS = ['Why does that matter?', 'Show your math.', 'What data are you missing?'] as const;

// Only the last two turns are recapped — enough for "why?"/"what about that?"
// to resolve, without letting the prompt grow unbounded across a long session.
const MAX_RECAPPED_TURNS = 2;

export function buildFollowUpInstructions(question: string, history: ConversationTurn[]): string {
  const trimmed = question.trim();
  if (history.length === 0) return trimmed;
  const recap = history
    .slice(-MAX_RECAPPED_TURNS)
    .map((t) => `Q: ${t.question}\nA: ${t.answer}`)
    .join('\n\n');
  return `Earlier in this conversation:\n${recap}\n\nNow answer this follow-up — it may refer back to "that" or "it" above:\n${trimmed}`;
}

export type ConfidenceLevel = 'high' | 'moderate' | 'low';
export type ConfidenceAssessment = { level: ConfidenceLevel; reason: string };

const LOW_SAMPLE_VOTERS = 25;
const MODERATE_SAMPLE_VOTERS = 200;

// A blunt, honest sample-size heuristic — NOT a per-question statistical
// confidence score (the app has no way to compute that from an aggregate
// snapshot). It only answers "is there enough data here to generalize from
// at all," same spirit as "identify small samples" in the advisor spec.
export function assessConfidence(turf: TurfSnapshot): ConfidenceAssessment {
  if (turf.totalVoters === 0) {
    return { level: 'low', reason: 'no voter file imported yet' };
  }
  if (turf.totalVoters < LOW_SAMPLE_VOTERS) {
    return { level: 'low', reason: `only ${turf.totalVoters} voters in the file — a small sample to generalize from` };
  }
  if (turf.totalVoters < MODERATE_SAMPLE_VOTERS) {
    return { level: 'moderate', reason: `${turf.totalVoters} voters in the file — a modest sample` };
  }
  return { level: 'high', reason: `${turf.totalVoters.toLocaleString()} voters in the file` };
}

// The real "scope" of what an answer can draw on right now — shown once per
// conversation rather than per-turn so it doesn't repeat itself.
export function buildScopeLine(turf: TurfSnapshot, fundraising: FundraisingSnapshot | undefined): string {
  const parts = [`${turf.totalVoters.toLocaleString()} voter${turf.totalVoters === 1 ? '' : 's'}`];
  if (fundraising) {
    parts.push(`${fundraising.donationCount.toLocaleString()} donation${fundraising.donationCount === 1 ? '' : 's'}`);
  }
  return `Based on ${parts.join(' and ')} in this project.`;
}
