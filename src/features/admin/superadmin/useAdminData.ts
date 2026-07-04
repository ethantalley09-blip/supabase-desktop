import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { Organization } from '@/features/orgs/useOrganizations';
import { useAuth } from '@/providers/AuthProvider';

export type OrgWithCreator = Organization & {
  profiles: { email: string; full_name: string | null } | null;
};

export function useAllOrganizations() {
  return useQuery({
    queryKey: ['admin-all-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('*, profiles!organizations_created_by_fkey(email, full_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as OrgWithCreator[];
    }
  });
}

export type Entitlement = {
  id: string;
  org_id: string;
  project_id: string | null;
  key: string;
  granted: boolean;
  granted_reason: string;
  expires_at: string | null;
  created_at: string;
};

export function useOrgEntitlements(orgId: string | undefined) {
  return useQuery({
    queryKey: ['admin-entitlements', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entitlements')
        .select('*')
        .eq('org_id', orgId!)
        .order('created_at');
      if (error) throw error;
      return data as Entitlement[];
    },
    enabled: Boolean(orgId)
  });
}

export function useActivateOrg() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (orgId: string) => {
      // Grant the tenant entitlement first: if this insert fails the org
      // stays pending instead of ending up active-but-unusable.
      const { error: entError } = await supabase.from('entitlements').insert({
        org_id: orgId,
        key: 'org_active',
        granted_by: user!.id,
        granted_reason: 'manual_admin'
      });
      if (entError) throw entError;

      const { error: orgError } = await supabase
        .from('organizations')
        .update({ status: 'active' })
        .eq('id', orgId);
      if (orgError) throw orgError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-all-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['admin-entitlements'] });
    }
  });
}

export function useSetEntitlement() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      orgId: string;
      key: string;
      granted: boolean;
      projectId?: string | null;
      existingId?: string;
    }) => {
      if (input.existingId) {
        const { error } = await supabase
          .from('entitlements')
          .update({ granted: input.granted, granted_reason: 'manual_admin' })
          .eq('id', input.existingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('entitlements').insert({
          org_id: input.orgId,
          project_id: input.projectId ?? null,
          key: input.key,
          granted: input.granted,
          granted_by: user!.id,
          granted_reason: 'manual_admin'
        });
        if (error) throw error;
      }
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['admin-entitlements', vars.orgId] });
      queryClient.invalidateQueries({ queryKey: ['entitlement'] });
    }
  });
}
