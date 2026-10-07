import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
export function useLatestRunwayPlan(projectId) {
    return useQuery({
        queryKey: ['runway-plan', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('funding_runway_plans')
                .select('*')
                .eq('project_id', projectId)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
// Saves the client-computed runway, then (if there IS a shortfall) asks the
// AI for closing strategies. Segment counts are aggregates only — no rows.
export function useRunwayAnalysis() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, cashOnHandCents, dailyBurnCents, dailyRaiseCents, plannedExpenses, runway, segmentCounts }) => {
            let strategies = null;
            if (runway.shortfallDate) {
                const result = await ai.mutateAsync({
                    orgId,
                    projectId,
                    purpose: 'funding_runway',
                    context: JSON.stringify({
                        shortfall_date: runway.shortfallDate,
                        shortfall_cents: runway.shortfallCents,
                        days_until_shortfall: runway.daysUntilShortfall,
                        cash_on_hand_cents: cashOnHandCents,
                        daily_burn_cents: dailyBurnCents,
                        daily_raise_cents: dailyRaiseCents,
                        planned_expenses: plannedExpenses,
                        segments: {
                            major_donors: { count: segmentCounts.major, avg_gift_cents: segmentCounts.majorAvgCents },
                            mid_tier: { count: segmentCounts.mid, avg_gift_cents: segmentCounts.midAvgCents },
                            small_dollar: { count: segmentCounts.small, avg_gift_cents: segmentCounts.smallAvgCents }
                        }
                    })
                });
                strategies = extractJson(result.text);
                if (!strategies)
                    throw new Error('Could not parse runway strategies');
            }
            const { data, error } = await supabase
                .from('funding_runway_plans')
                .insert({
                org_id: orgId,
                project_id: projectId,
                cash_on_hand_cents: cashOnHandCents,
                daily_burn_cents: dailyBurnCents,
                daily_raise_cents: dailyRaiseCents,
                planned_expenses: plannedExpenses,
                shortfall_date: runway.shortfallDate,
                shortfall_cents: runway.shortfallCents,
                strategies
            })
                .select()
                .single();
            if (error)
                throw error;
            return data;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['runway-plan', vars.projectId] })
    });
}
export function useNetworkAsks(projectId) {
    return useQuery({
        queryKey: ['network-asks', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('network_asks')
                .select('*')
                .eq('project_id', projectId)
                .neq('status', 'dismissed')
                .order('created_at', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useDraftNetworkAsk() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, donorName, relationship, donorReason }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'network_ask',
                context: JSON.stringify({
                    donor_first_name: donorName.split(' ')[0],
                    relationship,
                    donor_reason_for_giving: donorReason
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse network ask');
            const { error } = await supabase.from('network_asks').insert({
                org_id: orgId,
                project_id: projectId,
                donor_id: donorId,
                relationship,
                ask_text: parsed.ask_text
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['network-asks', vars.projectId] })
    });
}
export function useReactivations(projectId) {
    return useQuery({
        queryKey: ['reactivations', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('donor_reactivations')
                .select('*')
                .eq('project_id', projectId)
                .eq('status', 'drafted')
                .order('lapse_score', { ascending: false })
                .limit(10);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useDraftReactivation() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, lapseScore, triggerReason, typicalGiftCents, giftCount }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'reactivation_sequence',
                context: JSON.stringify({
                    trigger_reason: triggerReason,
                    typical_gift_cents: typicalGiftCents,
                    total_gifts: giftCount
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse reactivation sequence');
            const { error } = await supabase.from('donor_reactivations').insert({
                org_id: orgId,
                project_id: projectId,
                donor_id: donorId,
                lapse_score: lapseScore,
                trigger_reason: triggerReason,
                sequence: parsed
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['reactivations', vars.projectId] })
    });
}
// Drafting-only (no table): the pack is copied out and sent through the
// campaign's own channels immediately — persistence adds nothing here.
export function useEmergencyAsk() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, goalCents, deadline, reason, warmDonorCount, avgRecentGiftCents }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'emergency_ask',
                context: JSON.stringify({
                    goal_cents: goalCents,
                    deadline,
                    reason,
                    warm_donor_count: warmDonorCount,
                    avg_recent_gift_cents: avgRecentGiftCents
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse emergency ask pack');
            return parsed;
        }
    });
}
export function useIssueEvents(projectId) {
    return useQuery({
        queryKey: ['issue-events', projectId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('issue_events')
                .select('*')
                .eq('project_id', projectId)
                .neq('status', 'archived')
                .order('created_at', { ascending: false })
                .limit(5);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(projectId)
    });
}
export function useDraftIssueResponse() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, eventType, description, warmSegmentSize }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'issue_response',
                context: JSON.stringify({ event_type: eventType, description })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse issue response pack');
            const { error } = await supabase.from('issue_events').insert({
                org_id: orgId,
                project_id: projectId,
                event_type: eventType,
                description,
                responses: parsed,
                warm_segment_size: warmSegmentSize
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['issue-events', vars.projectId] })
    });
}
