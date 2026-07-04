import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { OrgType } from '@/features/rbac/roleTemplates';

export type Organization = {
  id: string;
  name: string;
  org_type: string;
  state_of_registration: string | null;
  ein: string | null;
  fec_committee_id: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  status: string;
  created_by: string;
  created_at: string;
};

export function useMyOrganizations() {
  return useQuery({
    queryKey: ['my-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase.from('organizations').select('*').order('created_at');
      if (error) throw error;
      return data as Organization[];
    }
  });
}

export type CreateOrganizationInput = {
  name: string;
  org_type: OrgType;
  state_of_registration?: string;
  ein?: string;
  fec_committee_id?: string;
  billing_contact_name?: string;
  billing_contact_email?: string;
  created_by: string;
};

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganizationInput) => {
      const { data, error } = await supabase.from('organizations').insert(input).select().single();
      if (error) throw error;
      return data as Organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    }
  });
}
