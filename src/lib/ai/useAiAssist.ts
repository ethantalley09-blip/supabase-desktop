import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export type AiPurpose =
  | 'broadcast'
  | 'canvassing_script'
  | 'relational_text'
  | 'note_summary'
  | 'data_qa'
  | 'field_coach'
  | 'import_mapping'
  | 'translate'
  | 'donor_message'
  | 'segment_filter'
  | 'content_pack'
  | 'refine'
  | 'ask_optimization'
  | 'churn_prediction'
  | 'connector_scoring'
  | 'compliant_variation'
  | 'major_donor_escalation'
  | 'fatigue_guard'
  | 'fec_sprint_plan'
  | 'retention_sequence'
  | 'payment_recovery'
  | 'volunteer_donor_bridge'
  | 'momentum_alert'
  | 'recurring_upgrade'
  | 'ltv_forecast'
  | 'donor_dedup'
  | 'refund_risk_scan'
  | 'funding_runway'
  | 'network_ask'
  | 'reactivation_sequence'
  | 'issue_response'
  | 'emergency_ask'
  | 'contrast_message'
  | 'rebuttal'
  | 'debate_prep'
  | 'self_opposition'
  | 'opponent_digest'
  | 'doorstep_pitch'
  | 'email_campaign'
  | 'press_release'
  | 'media_pitch'
  | 'direct_mail'
  | 'phone_script'
  | 'volunteer_pipeline'
  | 'gotv_sprint_plan'
  | 'mistake_response'
  | 'interview_prep'
  | 'endorsement_ask'
  | 'quick_insight'
  | 'geocode_strategy'
  | 'turf_briefing'
  | 'door_objection_assist'
  | 'door_script_personalize'
  | 'door_explainer'
  | 'door_language_prep'
  | 'shift_debrief'
  | 'territory_difficulty_briefing'
  | 'revisit_strategy'
  | 'momentum_ask_script'
  | 'household_cascade_ask'
  | 'peak_ask_briefing'
  | 'territory_roi_briefing'
  | 'persistence_ask_script'
  | 'golden_hour_ask_plan'
  | 'ask_coverage_alert'
  | 'canvasser_ask_coaching'
  | 'election_countdown_ask'
  | 'doorstep_recurring_ask'
  | 'priority_door_briefing'
  | 'canvasser_checkin_prompt'
  | 'territory_staffing_briefing'
  | 'canvasser_silence_checkin'
  | 'neighborhood_proof_ask'
  | 'donation_objection_handler'
  | 'ask_rehearsal_prep'
  | 'doorstep_referral_ask'
  | 'bundler_cultivation_ask'
  | 'event_planning_briefing'
  | 'map_area_briefing';

export type AiAssistInput = {
  orgId: string;
  projectId?: string;
  purpose: AiPurpose;
  // Required for most purposes; note_summary reads `notes`, field_coach reads
  // only `context`, data_qa needs both `instructions` (the question) + `context`.
  instructions?: string;
  audience?: string;
  tone?: string;
  // note_summary only: raw free-text canvass notes to digest.
  notes?: string[];
  // data_qa / field_coach / import_mapping only: JSON string of an aggregate
  // snapshot or column sample.
  context?: string;
  // translate only: target language for `instructions`.
  language?: string;
};

// Calls the `ai-assist` edge function, which holds the Anthropic key and
// enforces the `ai_module` premium gate server-side. On a non-2xx the function
// returns a JSON `{ error }`; supabase-js surfaces that as a FunctionsHttpError
// whose `context` is the raw Response, so we dig the message out for the UI.
export function useAiAssist() {
  return useMutation({
    mutationFn: async (input: AiAssistInput): Promise<{ text: string }> => {
      const { data, error } = await supabase.functions.invoke('ai-assist', { body: input });
      if (error) {
        let message = error.message;
        const ctx = (error as { context?: Response }).context;
        try {
          const parsed = await ctx?.json?.();
          if (parsed?.error) message = parsed.error;
        } catch {
          // fall back to the generic error message
        }
        throw new Error(message);
      }
      return data as { text: string };
    }
  });
}
