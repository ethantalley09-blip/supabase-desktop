// Pure logic for Staffing (question-bank §9) and Logistics (§11) — the two
// [Now]-tier sections that only needed the underlying data to exist (see
// migration 0033_staffing_logistics.sql). Framework-free, no Supabase import
// — see staffingMath.test.ts. Mirrors the split used everywhere else in this
// app (route.ts, doorstep.ts, canvasserStats.ts, ...).

export type ShiftStatus = 'scheduled' | 'worked' | 'off' | 'pending_swap';

export type ShiftLike = {
  profile_id: string;
  profile_name: string | null;
  shift_date: string; // 'YYYY-MM-DD'
  status: ShiftStatus;
  team_name: string | null;
};

export type ShiftDaySummary = {
  date: string;
  scheduled: number;
  worked: number;
  off: number;
  pendingSwap: number;
  teams: string[];
  people: { name: string; status: ShiftStatus; team: string | null }[];
};

export function summarizeShiftsForDate(shifts: ShiftLike[], date: string): ShiftDaySummary {
  const todays = shifts.filter((s) => s.shift_date === date);
  const teams = [...new Set(todays.map((s) => s.team_name).filter((t): t is string => Boolean(t)))].sort();
  return {
    date,
    scheduled: todays.filter((s) => s.status === 'scheduled').length,
    worked: todays.filter((s) => s.status === 'worked').length,
    off: todays.filter((s) => s.status === 'off').length,
    pendingSwap: todays.filter((s) => s.status === 'pending_swap').length,
    teams,
    people: todays.map((s) => ({ name: s.profile_name || 'Team member', status: s.status, team: s.team_name }))
  };
}

export type HotelBookingLike = {
  hotel_name: string;
  team_name: string | null;
  check_in: string; // date
  check_out: string; // date
  room_count: number;
  nightly_rate_cents: number;
};

export type LogisticsBooking = {
  hotelName: string;
  teamName: string | null;
  checkIn: string;
  checkOut: string;
  rooms: number;
  nights: number;
  estimatedCostCents: number;
};

export type LogisticsSummary = {
  totalRooms: number;
  totalEstimatedCostCents: number;
  bookings: LogisticsBooking[];
};

const DAY_MS = 86_400_000;

function nightsBetween(checkIn: string, checkOut: string): number {
  const inMs = new Date(checkIn).getTime();
  const outMs = new Date(checkOut).getTime();
  if (Number.isNaN(inMs) || Number.isNaN(outMs) || outMs <= inMs) return 0;
  return Math.round((outMs - inMs) / DAY_MS);
}

// The projected cost is real staff-entered rate x room x nights — an
// estimate, never a promise (no tax/fees modeled), same "real numbers,
// honest about being an estimate" spirit as the rest of the app's math.
export function summarizeLogistics(bookings: HotelBookingLike[]): LogisticsSummary {
  const enriched = bookings.map((b) => {
    const nights = nightsBetween(b.check_in, b.check_out);
    return {
      hotelName: b.hotel_name,
      teamName: b.team_name,
      checkIn: b.check_in,
      checkOut: b.check_out,
      rooms: b.room_count,
      nights,
      estimatedCostCents: b.room_count * b.nightly_rate_cents * nights
    };
  });
  return {
    totalRooms: enriched.reduce((s, b) => s + b.rooms, 0),
    totalEstimatedCostCents: enriched.reduce((s, b) => s + b.estimatedCostCents, 0),
    bookings: enriched
  };
}
