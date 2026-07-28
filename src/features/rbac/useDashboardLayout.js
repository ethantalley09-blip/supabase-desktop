import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
// Loads/saves the caller's personal AI-dashboard arrangement (card order +
// hidden tools) for an org. One row per (user, org); RLS restricts to own
// rows, so the select needs no profile filter. Layout is presentation only.
export function useDashboardLayout(orgId) {
    return useQuery({
        queryKey: ['dashboard-layout', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('dashboard_layouts')
                .select('layout')
                .eq('org_id', orgId)
                .maybeSingle();
            if (error)
                throw error;
            return (data?.layout ?? {});
        },
        enabled: Boolean(orgId)
    });
}
export function useSaveDashboardLayout() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, layout }) => {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user)
                throw new Error('Not signed in');
            const { error } = await supabase
                .from('dashboard_layouts')
                .upsert({ profile_id: auth.user.id, org_id: orgId, layout, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,org_id' });
            if (error)
                throw error;
            return layout;
        },
        // Optimistic enough for a drag UI: write the new layout into the cache
        // immediately so cards don't snap back while the save is in flight.
        onMutate: async ({ orgId, layout }) => {
            queryClient.setQueryData(['dashboard-layout', orgId], layout);
        },
        onError: (_e, vars) => queryClient.invalidateQueries({ queryKey: ['dashboard-layout', vars.orgId] })
    });
}
