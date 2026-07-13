import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';

export type Donor = {
  id: string;
  org_id: string;
  full_name: string;
  email: string | null;
  employer: string | null;
  occupation: string | null;
};

export type Donation = {
  id: string;
  project_id: string;
  donor_id: string;
  amount_cents: number;
  donated_at: string;
  payment_method: string | null;
  donors?: { full_name: string } | null;
};

// Compliance tools unlock once a project's lifetime donations cross this.
export const COMPLIANCE_THRESHOLD_CENTS = 100_000;

// Pure aggregate for the AI features (no Supabase dep); re-exported here so the
// fundraising feature has a single import surface (mirrors turf/route.ts).
export { buildFundraisingSnapshot, type FundraisingSnapshot } from './fundraisingSnapshot';

export function useDonationTotal(projectId: string | undefined) {
  return useQuery({
    queryKey: ['donation-total', projectId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_project_donation_total', {
        p_project_id: projectId!
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
    enabled: Boolean(projectId)
  });
}

export function useDonations(projectId: string | undefined) {
  return useQuery({
    queryKey: ['donations', projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donations')
        .select('*, donors(full_name)')
        .eq('project_id', projectId!)
        .order('donated_at', { ascending: false });
      if (error) throw error;
      return data as Donation[];
    },
    enabled: Boolean(projectId)
  });
}

export function useOrgDonors(orgId: string | undefined) {
  return useQuery({
    queryKey: ['donors', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donors')
        .select('*')
        .eq('org_id', orgId!)
        .order('full_name');
      if (error) throw error;
      return data as Donor[];
    },
    enabled: Boolean(orgId)
  });
}

export function useRecordDonation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      projectId: string;
      orgId: string;
      amountCents: number;
      donatedAt: string;
      paymentMethod?: string;
      // Either an existing donor or a new one to create inline.
      donorId?: string;
      newDonor?: { full_name: string; email?: string; employer?: string; occupation?: string };
    }) => {
      let donorId = input.donorId;
      if (!donorId) {
        const { data: donor, error: donorError } = await supabase
          .from('donors')
          .insert({ org_id: input.orgId, ...input.newDonor! })
          .select()
          .single();
        if (donorError) throw donorError;
        donorId = donor.id;
      }

      const { error } = await supabase.from('donations').insert({
        project_id: input.projectId,
        donor_id: donorId,
        amount_cents: input.amountCents,
        donated_at: input.donatedAt,
        payment_method: input.paymentMethod,
        recorded_by: user!.id
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['donations', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['donation-total', vars.projectId] });
      queryClient.invalidateQueries({ queryKey: ['donors', vars.orgId] });
      // A donation may cross the compliance threshold (Phase 6 trigger).
      queryClient.invalidateQueries({ queryKey: ['entitlement'] });
    }
  });
}

export function formatUsd(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
