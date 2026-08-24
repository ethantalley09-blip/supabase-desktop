import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/providers/AuthProvider';
// Compliance tools unlock once a project's lifetime donations cross this.
export const COMPLIANCE_THRESHOLD_CENTS = 100_000;
// Pure aggregate for the AI features (no Supabase dep); re-exported here so the
// fundraising feature has a single import surface (mirrors turf/route.ts).
export { buildFundraisingSnapshot } from './fundraisingSnapshot';
export function useDonationTotal(projectId) {
    return useQuery({
        queryKey: ['donation-total', projectId],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('get_project_donation_total', {
                p_project_id: projectId
            });
            if (error)
                throw error;
            return Number(data ?? 0);
        },
        enabled: Boolean(projectId)
    });
}
export function useDonations(projectId) {
    return useQuery({
        queryKey: ['donations', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('donations')
                .select('*, donors(full_name), recorder:recorded_by(full_name, email)')
                .eq('project_id', projectId)
                .order('donated_at', { ascending: false });
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useOrgDonors(orgId) {
    return useQuery({
        queryKey: ['donors', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('donors')
                .select('*')
                .eq('org_id', orgId)
                .order('full_name');
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
export function useRecordDonation() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    return useMutation({
        mutationFn: async (input) => {
            let donorId = input.donorId;
            if (!donorId) {
                const { data: donor, error: donorError } = await supabase
                    .from('donors')
                    .insert({ org_id: input.orgId, ...input.newDonor })
                    .select()
                    .single();
                if (donorError)
                    throw donorError;
                donorId = donor.id;
            }
            const { error } = await supabase.from('donations').insert({
                project_id: input.projectId,
                donor_id: donorId,
                amount_cents: input.amountCents,
                donated_at: input.donatedAt,
                payment_method: input.paymentMethod,
                recorded_by: user.id,
                voter_id: input.voterId
            });
            if (error)
                throw error;
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
export function formatUsd(cents) {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}
