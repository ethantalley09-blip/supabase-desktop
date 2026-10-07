import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
// Door Intelligence data access (migration 0039). The rollup from evidence to
// state is done by a DB trigger on canvass_visits insert, not here — so an
// offline visit replayed later produces exactly the same state as a live one,
// and a partial client failure can't leave the two out of step. All the
// scoring lives in doorAttributes.ts (pure, unit-tested); this file only
// fetches and mutates.
export function useDoorAttributes(projectId) {
    return useQuery({
        queryKey: ['door-attributes', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('door_attributes')
                .select('id, project_id, address_key, street_key, lat, lng, tag, class, first_observed_at, last_confirmed_at, observer_ids, observation_count, noted_observation_count, contradiction_count, source, status, status_changed_by, status_changed_at, status_reason')
                .eq('project_id', projectId)
                .limit(20000);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
// Staff actions only: confirm, dispute, or retract. There is no delete —
// invariant #2 — so "this tag is wrong" is a status change with an attributed
// reason, which stays visible in the Review Queue afterwards.
export function useSetAttributeStatus() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ attributeId, status, reason }) => {
            const { data: auth } = await supabase.auth.getUser();
            if (!auth.user)
                throw new Error('Not signed in');
            if (status === 'retracted' && !reason?.trim())
                throw new Error('A retraction needs a reason');
            const { error } = await supabase
                .from('door_attributes')
                .update({
                status,
                status_reason: reason?.trim() || null,
                status_changed_by: auth.user.id,
                status_changed_at: new Date().toISOString()
            })
                .eq('id', attributeId);
            if (error)
                throw error;
        },
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ['door-attributes', vars.projectId] });
        }
    });
}
export function useCanvasserCapabilities(projectId) {
    return useQuery({
        queryKey: ['canvasser-capabilities', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('canvasser_capabilities')
                .select('profile_id, capabilities, profiles!canvasser_capabilities_profile_id_fkey(full_name, email)')
                .eq('project_id', projectId);
            if (error)
                throw error;
            return data.map((r) => ({
                profile_id: r.profile_id,
                capabilities: r.capabilities ?? [],
                name: r.profiles?.full_name ?? r.profiles?.email ?? 'Canvasser'
            }));
        },
        enabled: Boolean(projectId)
    });
}
export function useSaveCanvasserCapabilities() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ projectId, profileId, capabilities }) => {
            const { error } = await supabase
                .from('canvasser_capabilities')
                .upsert({ profile_id: profileId, project_id: projectId, capabilities, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,project_id' });
            if (error)
                throw error;
        },
        onSuccess: (_r, vars) => {
            queryClient.invalidateQueries({ queryKey: ['canvasser-capabilities', vars.projectId] });
        }
    });
}
