import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
export async function hasEntitlement(orgId, key, projectId) {
    const { data, error } = await supabase.rpc('has_entitlement', {
        p_org_id: orgId,
        p_key: key,
        p_project_id: projectId
    });
    if (error)
        throw error;
    return data ?? false;
}
export function useEntitlement(orgId, key, projectId) {
    return useQuery({
        queryKey: ['entitlement', orgId, key, projectId ?? null],
        queryFn: () => hasEntitlement(orgId, key, projectId),
        enabled: Boolean(orgId)
    });
}
