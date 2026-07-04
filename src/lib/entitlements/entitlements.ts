import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export async function hasEntitlement(orgId: string, key: string, projectId?: string) {
  const { data, error } = await supabase.rpc('has_entitlement', {
    p_org_id: orgId,
    p_key: key,
    p_project_id: projectId
  });
  if (error) throw error;
  return data ?? false;
}

export function useEntitlement(orgId: string | undefined, key: string, projectId?: string) {
  return useQuery({
    queryKey: ['entitlement', orgId, key, projectId ?? null],
    queryFn: () => hasEntitlement(orgId as string, key, projectId),
    enabled: Boolean(orgId)
  });
}
