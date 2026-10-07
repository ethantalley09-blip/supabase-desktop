import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useEntitlement } from '@/lib/entitlements/entitlements';
import { filterTools, toolsByCategory } from './toolRegistry';
// One RPC call fetches the caller's full permission map for the org (instead
// of one has_org_permission round-trip per registry entry), then the pure
// filterTools() in toolRegistry.ts does the actual customization.
function useMyPermissions(orgId) {
    return useQuery({
        queryKey: ['my-permissions', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_my_permissions', { p_org_id: orgId });
            if (error)
                throw error;
            return (data ?? {});
        },
        enabled: Boolean(orgId)
    });
}
export function useAvailableTools(orgId) {
    const aiModule = useEntitlement(orgId, 'ai_module');
    const perms = useMyPermissions(orgId);
    const tools = perms.data ? filterTools(perms.data, Boolean(aiModule.data)) : [];
    return { tools, byCategory: toolsByCategory(tools), isLoading: perms.isLoading || aiModule.isLoading };
}
