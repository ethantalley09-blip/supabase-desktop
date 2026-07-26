// Pure logic for Peak Ask Window: the doorstep-specific analog of
// comms/sendTime.ts — real $ raised per hour of day, from linked doorstep
// donations ONLY (voter_id set, migration 0032). Every other donation
// (online, mail, event) is deliberately excluded: those don't happen "at a
// door," and mixing them in would muddy an hour-of-day signal that's
// supposed to be about canvassing shifts specifically. No Supabase import
// (pattern: visitHistory.ts) — see peakAskWindow.test.ts.
import { hourLabel } from './visitHistory';

export type DonationForPeakWindow = { voter_id: string | null; amount_cents: number; donated_at: string };

export type PeakAskWindow = {
  bestHour: number;
  bestHourLabel: string;
  totalCentsInBestHour: number;
  giftCountInBestHour: number;
  sampleSize: number; // total doorstep-linked gifts across all hours
};

// Below this many linked gifts, an hour-of-day pattern is noise, not signal.
const MIN_SAMPLE = 3;

export function computePeakAskWindow(donations: DonationForPeakWindow[]): PeakAskWindow | null {
  const linked = donations.filter((d) => d.voter_id);
  if (linked.length < MIN_SAMPLE) return null;

  const hourlyCents = new Array<number>(24).fill(0);
  const hourlyCount = new Array<number>(24).fill(0);
  for (const d of linked) {
    const h = new Date(d.donated_at).getHours();
    hourlyCents[h] += d.amount_cents;
    hourlyCount[h] += 1;
  }

  let bestHour = 0;
  for (let h = 1; h < 24; h++) {
    if (hourlyCents[h] > hourlyCents[bestHour]) bestHour = h;
  }
  if (hourlyCents[bestHour] === 0) return null;

  return {
    bestHour,
    bestHourLabel: hourLabel(bestHour),
    totalCentsInBestHour: hourlyCents[bestHour],
    giftCountInBestHour: hourlyCount[bestHour],
    sampleSize: linked.length
  };
}
