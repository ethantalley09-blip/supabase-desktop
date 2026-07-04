import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export async function hasOrgPermission(orgId: string, permission: string) {
  const { data, error } = await supabase.rpc('has_org_permission', {
    p_org_id: orgId,
    p_permission: permission
  });
  if (error) throw error;
  return data ?? false;
}

export function useHasPermission(orgId: string | undefined, permission: string) {
  return useQuery({
    queryKey: ['org-permission', orgId, permission],
    queryFn: () => hasOrgPermission(orgId as string, permission),
    enabled: Boolean(orgId)
  });
}
