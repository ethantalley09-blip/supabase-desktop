// Data-fetching for Staffing (shifts) and Logistics (hotel_bookings),
// migration 0033_staffing_logistics.sql. Kept out of staffingMath.ts (pure)
// per the codebase's route.ts/useTurf.ts split. RLS: a viewer without
// hr.view still sees their own shifts (profile_id = auth.uid()); hotel
// bookings need hr.view. Both need hr.manage to create.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
export function useShifts(projectId) {
    return useQuery({
        queryKey: ['shifts', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('shifts')
                .select('id, project_id, profile_id, shift_date, status, team_name, profiles:profile_id(full_name, email)')
                .eq('project_id', projectId)
                .order('shift_date', { ascending: false })
                .limit(1000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useCreateShift() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('shifts').insert({
                project_id: input.projectId,
                profile_id: input.profileId,
                shift_date: input.shiftDate,
                team_name: input.teamName?.trim() || null,
                created_by: user.id
            });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['shifts', vars.projectId] })
    });
}
export function useUpdateShiftStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('shifts').update({ status: input.status }).eq('id', input.shiftId);
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['shifts', vars.projectId] })
    });
}
export function useHotelBookings(projectId) {
    return useQuery({
        queryKey: ['hotel-bookings', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('hotel_bookings')
                .select('id, project_id, hotel_name, team_name, check_in, check_out, room_count, nightly_rate_cents')
                .eq('project_id', projectId)
                .order('check_in', { ascending: false })
                .limit(500);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useCreateHotelBooking() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: async (input) => {
            const { error } = await supabase.from('hotel_bookings').insert({
                project_id: input.projectId,
                hotel_name: input.hotelName.trim(),
                team_name: input.teamName?.trim() || null,
                check_in: input.checkIn,
                check_out: input.checkOut,
                room_count: input.roomCount,
                nightly_rate_cents: input.nightlyRateCents,
                created_by: user.id
            });
            if (error)
                throw error;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['hotel-bookings', vars.projectId] })
    });
}
