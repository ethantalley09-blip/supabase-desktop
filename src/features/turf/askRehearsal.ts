// Pure logic for Ask Rehearsal Prep: a confidence-building tool BEFORE a
// canvasser starts asking, distinct from Canvasser Ask Coach (which coaches
// AFTER the fact from real ask-rate stats). Builds an aggregate-only
// snapshot from today's real warm doors (never raw notes or addresses,
// matching the data-driven-purpose boundary in doorstep.ts/route.ts) so the
// AI can anticipate the donor questions a canvasser is actually likely to
// hear today, grounded in the real reasons those doors are warm. No
// Supabase import — see askRehearsal.test.ts.
import type { WarmDoor } from './doorstep';

export type AskRehearsalSnapshot = {
  doorCount: number;
  // Top distinct real reasons across today's warm doors, most frequent
  // first — an aggregate signal, never tied back to a specific voter.
  commonReasons: string[];
};

const MAX_COMMON_REASONS = 5;

export function buildAskRehearsalSnapshot(warmDoors: Pick<WarmDoor, 'reasons'>[]): AskRehearsalSnapshot | null {
  if (warmDoors.length === 0) return null;

  const counts = new Map<string, number>();
  for (const door of warmDoors) {
    for (const reason of door.reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    }
  }

  const commonReasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_COMMON_REASONS)
    .map(([reason]) => reason);

  return { doorCount: warmDoors.length, commonReasons };
}
