import { describe, expect, it } from 'vitest';
import { summarizeLogistics, summarizeShiftsForDate } from './staffingMath';
import type { HotelBookingLike, ShiftLike } from './staffingMath';

describe('summarizeShiftsForDate', () => {
  const shifts: ShiftLike[] = [
    { profile_id: 'a', profile_name: 'Ana', shift_date: '2026-01-15', status: 'scheduled', team_name: 'North' },
    { profile_id: 'b', profile_name: 'Ben', shift_date: '2026-01-15', status: 'worked', team_name: 'North' },
    { profile_id: 'c', profile_name: 'Cam', shift_date: '2026-01-15', status: 'off', team_name: 'South' },
    { profile_id: 'd', profile_name: 'Dee', shift_date: '2026-01-15', status: 'pending_swap', team_name: null },
    { profile_id: 'e', profile_name: 'Eli', shift_date: '2026-01-16', status: 'scheduled', team_name: 'North' }
  ];

  it('only counts shifts on the requested date', () => {
    const result = summarizeShiftsForDate(shifts, '2026-01-15');
    expect(result.scheduled).toBe(1);
    expect(result.worked).toBe(1);
    expect(result.off).toBe(1);
    expect(result.pendingSwap).toBe(1);
    expect(result.people).toHaveLength(4);
  });

  it('lists distinct real team names, sorted, ignoring nulls', () => {
    const result = summarizeShiftsForDate(shifts, '2026-01-15');
    expect(result.teams).toEqual(['North', 'South']);
  });

  it('returns all zeros for a date with no shifts', () => {
    const result = summarizeShiftsForDate(shifts, '2026-02-01');
    expect(result.scheduled + result.worked + result.off + result.pendingSwap).toBe(0);
    expect(result.people).toEqual([]);
  });
});

describe('summarizeLogistics', () => {
  it('computes real nights and estimated cost from staff-entered numbers', () => {
    const bookings: HotelBookingLike[] = [
      { hotel_name: 'Hampton Inn', team_name: 'North', check_in: '2026-01-10', check_out: '2026-01-13', room_count: 2, nightly_rate_cents: 12000 }
    ];
    const result = summarizeLogistics(bookings);
    expect(result.bookings[0].nights).toBe(3);
    expect(result.bookings[0].estimatedCostCents).toBe(2 * 12000 * 3);
    expect(result.totalRooms).toBe(2);
    expect(result.totalEstimatedCostCents).toBe(72000);
  });

  it('is defensive against an invalid or backwards date range', () => {
    const bookings: HotelBookingLike[] = [
      { hotel_name: 'Bad Dates', team_name: null, check_in: '2026-01-13', check_out: '2026-01-10', room_count: 1, nightly_rate_cents: 10000 }
    ];
    const result = summarizeLogistics(bookings);
    expect(result.bookings[0].nights).toBe(0);
    expect(result.bookings[0].estimatedCostCents).toBe(0);
  });

  it('sums across multiple real bookings', () => {
    const bookings: HotelBookingLike[] = [
      { hotel_name: 'A', team_name: null, check_in: '2026-01-01', check_out: '2026-01-02', room_count: 1, nightly_rate_cents: 10000 },
      { hotel_name: 'B', team_name: null, check_in: '2026-01-01', check_out: '2026-01-03', room_count: 3, nightly_rate_cents: 5000 }
    ];
    const result = summarizeLogistics(bookings);
    expect(result.totalRooms).toBe(4);
    expect(result.totalEstimatedCostCents).toBe(10000 + 3 * 5000 * 2);
  });

  it('returns empty totals for no bookings', () => {
    const result = summarizeLogistics([]);
    expect(result.totalRooms).toBe(0);
    expect(result.totalEstimatedCostCents).toBe(0);
    expect(result.bookings).toEqual([]);
  });
});
