// Pure logic for Momentum Ask: cross-references Persuasion Drift
// (visitHistory.ts's detectPersuasionDrift) against real linked doorstep
// donations (migration 0032) to find the single highest-leverage ask
// target — a door that just warmed up (opposed/unknown -> persuadable/
// base_support) and has never given. This exact window is real and
// narrow: a canvasser who just watched someone come around is the person
// who should ask next, not a mail piece three weeks later. No Supabase
// import (pattern: route.ts, doorstep.ts) — see momentumAsk.test.ts.
import type { DriftAlert } from './visitHistory';

export type DonationForMomentum = { voter_id: string | null };

export type MomentumAskTarget = DriftAlert;

// Only "warmed" drift (never "cooled") makes an ask target — asking a door
// that just turned hostile would be tone-deaf, not opportunistic.
export function findMomentumAskTargets(
  driftAlerts: DriftAlert[],
  donations: DonationForMomentum[]
): MomentumAskTarget[] {
  const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
  return driftAlerts.filter((a) => a.direction === 'warmed' && !alreadyGiven.has(a.voterId));
}
