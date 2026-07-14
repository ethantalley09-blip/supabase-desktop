// Pure logic for Send-Time Insight: the best hour/day to reach supporters,
// computed from the campaign's OWN donation timestamps (a real behavior
// signal, not generic industry advice). No Supabase imports — unit tested in
// sendTime.test.ts. Overview and the Comms tab both read this.

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export type SendTimeInsight = {
  bestHour: number;        // 0-23, local time
  bestHourLabel: string;   // "2–3 PM"
  bestDay: string;         // "Tuesday"
  hourlyCounts: number[];  // 24 buckets, gift counts (for the mini bar chart)
  sampleSize: number;
};

function hourLabel(h: number): string {
  const start = h % 12 === 0 ? 12 : h % 12;
  const startSuffix = h < 12 ? 'AM' : 'PM';
  const endHour = (h + 1) % 24;
  const end = endHour % 12 === 0 ? 12 : endHour % 12;
  const endSuffix = endHour < 12 ? 'AM' : 'PM';
  return startSuffix === endSuffix ? `${start}–${end} ${endSuffix}` : `${start} ${startSuffix}–${end} ${endSuffix}`;
}

// Requires a minimum sample so the "insight" isn't noise from 2 lucky gifts.
const MIN_SAMPLE = 5;

export function computeSendTimeInsights(donations: { donated_at: string }[]): SendTimeInsight | null {
  if (donations.length < MIN_SAMPLE) return null;

  const hourlyCounts = new Array<number>(24).fill(0);
  const dayCounts = new Array<number>(7).fill(0);
  for (const d of donations) {
    const t = new Date(d.donated_at);
    hourlyCounts[t.getHours()] += 1;
    dayCounts[t.getDay()] += 1;
  }

  const bestHour = hourlyCounts.indexOf(Math.max(...hourlyCounts));
  const bestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));

  return {
    bestHour,
    bestHourLabel: hourLabel(bestHour),
    bestDay: DAY_NAMES[bestDayIdx],
    hourlyCounts,
    sampleSize: donations.length
  };
}
