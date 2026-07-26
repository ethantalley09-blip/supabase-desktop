// Pure logic for Golden Hour Push: cross-references the Daylight-Aware
// Shift Clock (daylight.ts) with warm-door scoring (doorstep.ts). Once real
// daylight is running low, the priority genuinely shifts from "more doors"
// to "the highest-$-potential doors still reachable" — an in-person ask
// takes longer than a knock-and-go canvass contact, so the closing window
// is better spent asking than knocking one more unscored door. No Supabase
// import (pattern: doorstep.ts) — see goldenHourPush.test.ts.
import type { WarmDoor } from './doorstep';

export type DonationForGoldenHour = { voter_id: string | null };

// Only doors that are BOTH warm (real note signals) AND still reachable
// today AND not already given make the cut — a door that already gave
// doesn't need an ask, and a door outside today's remaining set can't be
// reached before dark regardless of how warm it is.
export function findGoldenHourTargets(
  warmDoors: WarmDoor[],
  remainingDoorIds: Set<string>,
  donations: DonationForGoldenHour[],
  limit = 3
): WarmDoor[] {
  const alreadyGiven = new Set(donations.filter((d) => d.voter_id).map((d) => d.voter_id));
  return warmDoors.filter((d) => remainingDoorIds.has(d.voterId) && !alreadyGiven.has(d.voterId)).slice(0, limit);
}
