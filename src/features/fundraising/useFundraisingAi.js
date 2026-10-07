import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { extractJson } from '@/lib/ai/extractJson';
import { useAiAssist } from '@/lib/ai/useAiAssist';
// Fetch top connectors (donors who can activate networks).
export function useTopConnectors(orgId) {
    return useQuery({
        queryKey: ['top-connectors', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('donor_personas')
                .select('*')
                .eq('org_id', orgId)
                .gt('connector_score', 0.7)
                .order('connector_score', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Fetch at-risk donors (churn prediction).
export function useChurnRisk(orgId) {
    return useQuery({
        queryKey: ['churn-risk', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('donor_churn_risk')
                .select('*')
                .eq('org_id', orgId)
                .gt('risk_score', 0.6)
                .order('risk_score', { ascending: false })
                .limit(50);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Generate ask optimization for a single donor.
export function useOptimizeAsk() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, donorHistory }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'ask_optimization',
                context: donorHistory
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse ask optimization');
            // Save to DB (will be done by the component if accepted).
            return parsed;
        }
    });
}
// Generate churn prediction + win-back message for a donor.
export function usePredictChurn() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorHistory }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'churn_prediction',
                context: donorHistory
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse churn prediction');
            return parsed;
        }
    });
}
// Score a donor's connector potential.
export function useScoreConnector() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorProfile }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'connector_scoring',
                context: donorProfile
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse connector score');
            return parsed;
        }
    });
}
// Generate compliant A/B test variations.
export function useGenerateVariations() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, baseMessage, orgContext }) => {
            const result = await ai.mutateAsync({
                orgId,
                projectId,
                purpose: 'compliant_variation',
                instructions: baseMessage,
                context: orgContext
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse variations');
            // Save to DB.
            const { error } = await supabase.from('copy_variations').insert({
                project_id: projectId,
                org_id: orgId,
                base_message: baseMessage,
                variant_a: parsed.variant_a,
                variant_b: parsed.variant_b,
                variant_c: parsed.variant_c
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['copy-variations', vars.projectId] });
        }
    });
}
// Record which variant won an A/B test.
export function useRecordVariationWinner() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ variationId, winningVariant, conversionsA, conversionsB, conversionsC }) => {
            const { error } = await supabase.from('copy_variations')
                .update({
                winning_variant: winningVariant,
                conversions_a: conversionsA,
                conversions_b: conversionsB,
                conversions_c: conversionsC,
                test_ended_at: new Date().toISOString()
            })
                .eq('id', variationId);
            if (error)
                throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['copy-variations'] });
        }
    });
}
// Fetch donors flagged ready for a major-gift ask.
export function useMajorDonorEscalations(orgId) {
    return useQuery({
        queryKey: ['major-donor-escalations', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('major_donor_escalations')
                .select('*')
                .eq('org_id', orgId)
                .gt('readiness_score', 0.6)
                .order('readiness_score', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Analyze a donor and draft the major-gift escalation ask.
export function useAssessMajorDonor() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, signals }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'major_donor_escalation', context: signals });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse major-donor assessment');
            const { error } = await supabase.from('major_donor_escalations').insert({
                donor_id: donorId,
                org_id: orgId,
                readiness_score: parsed.readiness_score,
                signals: JSON.parse(signals),
                suggested_ask_cents: parsed.suggested_ask_cents,
                ask_sequence: parsed.ask_sequence
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['major-donor-escalations', vars.orgId] });
        }
    });
}
// Check whether a donor is at risk of email fatigue before the next send.
export function useCheckFatigue() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async ({ orgId, projectId, sendHistory }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'fatigue_guard', context: sendHistory });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse fatigue assessment');
            return parsed;
        }
    });
}
// Build a day-by-day sprint plan to hit an FEC deadline goal.
export function useBuildSprintPlan() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, deadlineDate, currentPaceCents, goalCents }) => {
            const daysRemaining = Math.max(1, Math.ceil((new Date(deadlineDate).getTime() - Date.now()) / 86_400_000));
            const context = JSON.stringify({ deadlineDate, daysRemaining, currentPaceCents, goalCents });
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'fec_sprint_plan', context });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse sprint plan');
            const { error } = await supabase.from('fec_sprint_plans').insert({
                project_id: projectId,
                org_id: orgId,
                deadline_date: deadlineDate,
                current_pace_cents: currentPaceCents,
                goal_cents: goalCents,
                daily_plan: parsed.daily_plan
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['fec-sprint-plans', vars.projectId] });
        }
    });
}
export function useLatestSprintPlan(projectId) {
    return useQuery({
        queryKey: ['fec-sprint-plans', projectId],
        queryFn: async () => {
            const { data, error } = await supabase.from('fec_sprint_plans')
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
// Draft the post-donation retention sequence (thank-you -> impact -> 2nd ask).
export function useDraftRetentionSequence() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, donationId, donationContext }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'retention_sequence', context: donationContext });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse retention sequence');
            const now = Date.now();
            const rows = [
                { stage: 'thank_you', message: parsed.thank_you, scheduled_at: new Date(now).toISOString() },
                {
                    stage: 'impact_update',
                    message: parsed.impact_update,
                    scheduled_at: new Date(now + parsed.impact_update_delay_days * 86_400_000).toISOString()
                },
                {
                    stage: 'second_ask',
                    message: parsed.second_ask,
                    scheduled_at: new Date(now + parsed.second_ask_delay_days * 86_400_000).toISOString()
                }
            ].map((r) => ({ ...r, donor_id: donorId, donation_id: donationId ?? null, org_id: orgId }));
            const { error } = await supabase.from('donor_retention_sequences').insert(rows);
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['retention-sequences', vars.orgId] });
        }
    });
}
// Pending recurring-payment failures, oldest-first — silent revenue leak
// nobody catches without this.
export function usePendingPaymentRecoveries(orgId) {
    return useQuery({
        queryKey: ['payment-recoveries', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('payment_recovery_alerts')
                .select('*')
                .eq('org_id', orgId)
                .eq('status', 'pending')
                .order('detected_at', { ascending: true })
                .limit(50);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Draft (and save) the recovery message for a single failed payment.
export function useDraftPaymentRecovery() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, failureType, failedAmountCents }) => {
            const context = JSON.stringify({ failure_type: failureType, failed_amount_cents: failedAmountCents });
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'payment_recovery', context });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse recovery message');
            const { error } = await supabase.from('payment_recovery_alerts').insert({
                donor_id: donorId,
                org_id: orgId,
                project_id: projectId,
                failure_type: failureType,
                failed_amount_cents: failedAmountCents,
                recovery_message: parsed.message,
                status: 'sent'
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['payment-recoveries', vars.orgId] });
        }
    });
}
// Active org members, for the volunteer-to-donor bridge picker. Same shape as
// TeamTab's member query; kept separate here since this hook only needs id+name.
export function useOrgMembersForBridge(orgId) {
    return useQuery({
        queryKey: ['org-members-bridge', orgId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('org_memberships')
                .select('profile_id, profiles(email, full_name)')
                .eq('org_id', orgId)
                .eq('status', 'active');
            if (error)
                throw error;
            return data.map((m) => ({ profile_id: m.profile_id, full_name: m.profiles?.full_name || m.profiles?.email || 'Unknown' }));
        },
        enabled: Boolean(orgId)
    });
}
// Draft the first-ask invitation for a volunteer who has never donated,
// citing their real field contribution. Cross-domain (turf + fundraising) —
// no single-purpose donation platform can build this.
export function useDraftVolunteerAsk() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, profileId, contributionSummary }) => {
            const context = JSON.stringify({ contribution_summary: contributionSummary });
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'volunteer_donor_bridge', context });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse volunteer ask');
            const { error } = await supabase.from('volunteer_donor_asks').insert({
                org_id: orgId,
                profile_id: profileId,
                contribution_summary: contributionSummary,
                ask_message: parsed.message
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['volunteer-donor-asks', vars.orgId] });
        }
    });
}
export function useVolunteerDonorAsks(orgId) {
    return useQuery({
        queryKey: ['volunteer-donor-asks', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('volunteer_donor_asks')
                .select('*')
                .eq('org_id', orgId)
                .order('created_at', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Detects a real donation-velocity spike (computed client-side from actual
// recent donations, not fabricated) and drafts the rapid-response ask.
export function useDetectMomentum() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, windowMinutes, donationCount, donationTotalCents, baselineAvgCents, trigger }) => {
            const spikeMultiplier = baselineAvgCents > 0 ? donationTotalCents / baselineAvgCents : 1;
            const context = JSON.stringify({
                window_minutes: windowMinutes,
                donation_count: donationCount,
                donation_total_cents: donationTotalCents,
                baseline_avg_cents: baselineAvgCents,
                spike_multiplier: spikeMultiplier,
                trigger: trigger ?? null
            });
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'momentum_alert', context });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse momentum alert');
            const { error } = await supabase.from('fundraising_momentum_events').insert({
                org_id: orgId,
                project_id: projectId,
                window_minutes: windowMinutes,
                donation_count: donationCount,
                donation_total_cents: donationTotalCents,
                baseline_avg_cents: baselineAvgCents,
                spike_multiplier: spikeMultiplier,
                recommendation: parsed.message
            });
            if (error)
                throw error;
            return { ...parsed, spikeMultiplier };
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['momentum-events', vars.projectId] });
        }
    });
}
// Anniversary-timed ask to increase a long-tenured recurring donor's monthly gift.
export function useDraftRecurringUpgrade() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, monthsActive, currentMonthlyCents }) => {
            const context = JSON.stringify({ months_active: monthsActive, current_monthly_cents: currentMonthlyCents });
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'recurring_upgrade', context });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse upgrade ask');
            const { error } = await supabase.from('recurring_upgrade_prompts').insert({
                donor_id: donorId,
                org_id: orgId,
                months_active: monthsActive,
                current_monthly_cents: currentMonthlyCents,
                suggested_monthly_cents: parsed.suggested_monthly_cents,
                upgrade_message: parsed.message
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['recurring-upgrades', vars.orgId] });
        }
    });
}
// Forecast a donor's long-term value tier from their early giving pattern, to
// guide where staff spend relationship-building time.
export function useForecastLtv() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorId, giftHistory }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'ltv_forecast', context: giftHistory });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse LTV forecast');
            const { error } = await supabase.from('donor_ltv_forecasts').insert({ donor_id: donorId, org_id: orgId, ...parsed });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['ltv-forecasts', vars.orgId] });
        }
    });
}
export function useCultivateList(orgId) {
    return useQuery({
        queryKey: ['ltv-forecasts', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('donor_ltv_forecasts')
                .select('*')
                .eq('org_id', orgId)
                .eq('investment_recommendation', 'cultivate')
                .order('predicted_ltv_cents', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Assess whether two donor records (likely imported from different sources)
// are the same person. Suggestion only — never auto-merges.
export function useAssessDuplicate() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donorIdA, donorIdB, recordsContext }) => {
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'donor_dedup', context: recordsContext });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse duplicate assessment');
            const { error } = await supabase.from('donor_merge_suggestions').insert({
                org_id: orgId,
                donor_id_a: donorIdA,
                donor_id_b: donorIdB,
                similarity_score: parsed.same_person_likelihood,
                matched_fields: parsed.matched_fields,
                rationale: parsed.rationale
            });
            if (error)
                throw error;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['merge-suggestions', vars.orgId] });
        }
    });
}
export function usePendingMergeSuggestions(orgId) {
    return useQuery({
        queryKey: ['merge-suggestions', orgId],
        queryFn: async () => {
            const { data, error } = await supabase.from('donor_merge_suggestions')
                .select('*')
                .eq('org_id', orgId)
                .eq('status', 'pending')
                .order('similarity_score', { ascending: false })
                .limit(20);
            if (error)
                throw error;
            return data;
        },
        enabled: Boolean(orgId)
    });
}
// Human-approved merge: reassign donor B's donations to donor A, then mark B
// as merged (append-only — never a hard delete, per invariant #2).
export function useConfirmMerge() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ suggestionId, donorIdA, donorIdB, orgId }) => {
            const { error: reassignError } = await supabase
                .from('donations')
                .update({ donor_id: donorIdA })
                .eq('donor_id', donorIdB);
            if (reassignError)
                throw reassignError;
            const { error: mergeError } = await supabase
                .from('donors')
                .update({ merged_into_donor_id: donorIdA })
                .eq('id', donorIdB);
            if (mergeError)
                throw mergeError;
            const { error: statusError } = await supabase.from('donor_merge_suggestions')
                .update({ status: 'merged', resolved_at: new Date().toISOString() })
                .eq('id', suggestionId);
            if (statusError)
                throw statusError;
            return { orgId };
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['merge-suggestions', vars.orgId] });
            queryClient.invalidateQueries({ queryKey: ['donors', vars.orgId] });
        }
    });
}
export function useRejectMerge() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ suggestionId, orgId }) => {
            const { error } = await supabase.from('donor_merge_suggestions')
                .update({ status: 'rejected', resolved_at: new Date().toISOString() })
                .eq('id', suggestionId);
            if (error)
                throw error;
            return { orgId };
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['merge-suggestions', vars.orgId] });
        }
    });
}
// Records a refund/chargeback (staff-logged, same pattern as recording a
// donation) and re-checks the campaign's risk level against its own baseline.
export function useLogRefundAndScan() {
    const ai = useAiAssist();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ orgId, projectId, donationId, refundedAmountCents, reason, windowDays, refundCount, totalRefundedCents, baselineRefundRate }) => {
            const { error: logError } = await supabase.from('refund_records').insert({
                donation_id: donationId ?? null,
                org_id: orgId,
                refunded_amount_cents: refundedAmountCents,
                reason
            });
            if (logError)
                throw logError;
            const currentRefundRate = refundCount > 0 ? refundCount / windowDays : 0;
            const context = JSON.stringify({
                window_days: windowDays,
                refund_count: refundCount,
                total_refunded_cents: totalRefundedCents,
                baseline_refund_rate: baselineRefundRate,
                current_refund_rate: currentRefundRate
            });
            const result = await ai.mutateAsync({ orgId, projectId, purpose: 'refund_risk_scan', context });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse refund risk scan');
            const { error: alertError } = await supabase.from('refund_risk_alerts').insert({
                org_id: orgId,
                project_id: projectId,
                window_days: windowDays,
                refund_count: refundCount,
                total_refunded_cents: totalRefundedCents,
                baseline_refund_rate: baselineRefundRate,
                current_refund_rate: currentRefundRate,
                risk_level: parsed.risk_level,
                analysis: parsed.analysis
            });
            if (alertError)
                throw alertError;
            return parsed;
        },
        onSuccess: (_data, vars) => {
            queryClient.invalidateQueries({ queryKey: ['refund-alerts', vars.projectId] });
        }
    });
}
export function useLatestRefundAlert(projectId) {
    return useQuery({
        queryKey: ['refund-alerts', projectId],
        queryFn: async () => {
            const { data, error } = await supabase.from('refund_risk_alerts')
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
// Drafting-only, no table — same pattern as door_objection_assist/
// emergency_ask, since the cluster itself is already real, computed data
// (bundlerNetwork.ts) and there's nothing further to persist per ask.
export function useBundlerCultivationAsk() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'bundler_cultivation_ask',
                context: JSON.stringify({
                    employer: input.employer,
                    anchorDonorName: input.anchorDonorName,
                    donorCount: input.donorCount,
                    totalDollars: input.totalCents / 100
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the bundler cultivation ask');
            return parsed;
        }
    });
}
export function useEventPlanningBriefing() {
    const ai = useAiAssist();
    return useMutation({
        mutationFn: async (input) => {
            const result = await ai.mutateAsync({
                orgId: input.orgId,
                projectId: input.projectId,
                purpose: 'event_planning_briefing',
                context: JSON.stringify({
                    targetDollars: input.targetCents / 100,
                    invitees: input.invitees.map((i) => ({
                        name: i.name,
                        totalGivenDollars: i.totalGivenCents / 100,
                        suggestedAskDollars: i.suggestedAskCents / 100
                    })),
                    realisticLowDollars: input.realisticLowCents / 100,
                    realisticHighDollars: input.realisticHighCents / 100
                })
            });
            const parsed = extractJson(result.text);
            if (!parsed)
                throw new Error('Could not parse the event planning briefing');
            return parsed;
        }
    });
}
