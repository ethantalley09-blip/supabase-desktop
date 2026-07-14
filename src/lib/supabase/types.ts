export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ask_optimizations: {
        Row: {
          created_at: string | null
          donor_id: string
          id: string
          optimal_range_max: number
          optimal_range_min: number
          org_id: string
          predicted_conversion_pct: number | null
          project_id: string
          reasoning: string | null
          suggested_ask_cents: number
          valid_until: string | null
        }
        Insert: {
          created_at?: string | null
          donor_id: string
          id?: string
          optimal_range_max: number
          optimal_range_min: number
          org_id: string
          predicted_conversion_pct?: number | null
          project_id: string
          reasoning?: string | null
          suggested_ask_cents: number
          valid_until?: string | null
        }
        Update: {
          created_at?: string | null
          donor_id?: string
          id?: string
          optimal_range_max?: number
          optimal_range_min?: number
          org_id?: string
          predicted_conversion_pct?: number | null
          project_id?: string
          reasoning?: string | null
          suggested_ask_cents?: number
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ask_optimizations_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_optimizations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ask_optimizations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_rulesets: {
        Row: {
          created_at: string
          id: string
          jurisdiction: string
          org_type: string
          reviewed_by_counsel: boolean
          ruleset: Json
        }
        Insert: {
          created_at?: string
          id?: string
          jurisdiction: string
          org_type: string
          reviewed_by_counsel?: boolean
          ruleset?: Json
        }
        Update: {
          created_at?: string
          id?: string
          jurisdiction?: string
          org_type?: string
          reviewed_by_counsel?: boolean
          ruleset?: Json
        }
        Relationships: []
      }
      compliance_status: {
        Row: {
          id: string
          project_id: string
          threshold_met_at: string | null
          unlocked: boolean
        }
        Insert: {
          id?: string
          project_id: string
          threshold_met_at?: string | null
          unlocked?: boolean
        }
        Update: {
          id?: string
          project_id?: string
          threshold_met_at?: string | null
          unlocked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "compliance_status_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_variations: {
        Row: {
          base_message: string
          conversions_a: number | null
          conversions_b: number | null
          conversions_c: number | null
          created_at: string | null
          id: string
          org_id: string
          project_id: string
          test_ended_at: string | null
          test_started_at: string | null
          variant_a: string
          variant_b: string
          variant_c: string
          winning_variant: string | null
        }
        Insert: {
          base_message: string
          conversions_a?: number | null
          conversions_b?: number | null
          conversions_c?: number | null
          created_at?: string | null
          id?: string
          org_id: string
          project_id: string
          test_ended_at?: string | null
          test_started_at?: string | null
          variant_a: string
          variant_b: string
          variant_c: string
          winning_variant?: string | null
        }
        Update: {
          base_message?: string
          conversions_a?: number | null
          conversions_b?: number | null
          conversions_c?: number | null
          created_at?: string | null
          id?: string
          org_id?: string
          project_id?: string
          test_ended_at?: string | null
          test_started_at?: string | null
          variant_a?: string
          variant_b?: string
          variant_c?: string
          winning_variant?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copy_variations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copy_variations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_layouts: {
        Row: {
          id: string
          layout: Json
          org_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          layout?: Json
          org_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          layout?: Json
          org_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_layouts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboard_layouts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donations: {
        Row: {
          amount_cents: number
          created_at: string
          donated_at: string
          donor_id: string
          id: string
          payment_method: string | null
          project_id: string
          recorded_by: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          donated_at?: string
          donor_id: string
          id?: string
          payment_method?: string | null
          project_id: string
          recorded_by: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          donated_at?: string
          donor_id?: string
          id?: string
          payment_method?: string | null
          project_id?: string
          recorded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "donations_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donations_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_churn_risk: {
        Row: {
          created_at: string | null
          days_since_gift: number | null
          donor_id: string
          id: string
          last_gift_at: string | null
          org_id: string
          predicted_churn_reason:
            | Database["public"]["Enums"]["churn_reason"]
            | null
          reactivation_ask_cents: number | null
          risk_score: number
          updated_at: string | null
          win_back_drafted_at: string | null
          win_back_sent_at: string | null
        }
        Insert: {
          created_at?: string | null
          days_since_gift?: number | null
          donor_id: string
          id?: string
          last_gift_at?: string | null
          org_id: string
          predicted_churn_reason?:
            | Database["public"]["Enums"]["churn_reason"]
            | null
          reactivation_ask_cents?: number | null
          risk_score?: number
          updated_at?: string | null
          win_back_drafted_at?: string | null
          win_back_sent_at?: string | null
        }
        Update: {
          created_at?: string | null
          days_since_gift?: number | null
          donor_id?: string
          id?: string
          last_gift_at?: string | null
          org_id?: string
          predicted_churn_reason?:
            | Database["public"]["Enums"]["churn_reason"]
            | null
          reactivation_ask_cents?: number | null
          risk_score?: number
          updated_at?: string | null
          win_back_drafted_at?: string | null
          win_back_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donor_churn_risk_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_churn_risk_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_ltv_forecasts: {
        Row: {
          confidence_label: string
          created_at: string | null
          donor_id: string
          id: string
          investment_recommendation: string
          org_id: string
          predicted_ltv_cents: number
          rationale: string | null
        }
        Insert: {
          confidence_label?: string
          created_at?: string | null
          donor_id: string
          id?: string
          investment_recommendation?: string
          org_id: string
          predicted_ltv_cents?: number
          rationale?: string | null
        }
        Update: {
          confidence_label?: string
          created_at?: string | null
          donor_id?: string
          id?: string
          investment_recommendation?: string
          org_id?: string
          predicted_ltv_cents?: number
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donor_ltv_forecasts_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_ltv_forecasts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_merge_suggestions: {
        Row: {
          created_at: string | null
          donor_id_a: string
          donor_id_b: string
          id: string
          matched_fields: Json | null
          org_id: string
          rationale: string | null
          resolved_at: string | null
          similarity_score: number
          status: string
        }
        Insert: {
          created_at?: string | null
          donor_id_a: string
          donor_id_b: string
          id?: string
          matched_fields?: Json | null
          org_id: string
          rationale?: string | null
          resolved_at?: string | null
          similarity_score?: number
          status?: string
        }
        Update: {
          created_at?: string | null
          donor_id_a?: string
          donor_id_b?: string
          id?: string
          matched_fields?: Json | null
          org_id?: string
          rationale?: string | null
          resolved_at?: string | null
          similarity_score?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_merge_suggestions_donor_id_a_fkey"
            columns: ["donor_id_a"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_merge_suggestions_donor_id_b_fkey"
            columns: ["donor_id_b"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_merge_suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_personas: {
        Row: {
          avg_gift_cents: number | null
          cause_alignment: Json | null
          connector_score: number | null
          created_at: string | null
          donor_id: string
          estimated_capacity_cents: number
          gift_velocity_per_month: number | null
          id: string
          last_analyzed_at: string | null
          lifetime_value_cents: number | null
          org_id: string
          persona_label: Database["public"]["Enums"]["donor_persona_type"]
          updated_at: string | null
        }
        Insert: {
          avg_gift_cents?: number | null
          cause_alignment?: Json | null
          connector_score?: number | null
          created_at?: string | null
          donor_id: string
          estimated_capacity_cents?: number
          gift_velocity_per_month?: number | null
          id?: string
          last_analyzed_at?: string | null
          lifetime_value_cents?: number | null
          org_id: string
          persona_label: Database["public"]["Enums"]["donor_persona_type"]
          updated_at?: string | null
        }
        Update: {
          avg_gift_cents?: number | null
          cause_alignment?: Json | null
          connector_score?: number | null
          created_at?: string | null
          donor_id?: string
          estimated_capacity_cents?: number
          gift_velocity_per_month?: number | null
          id?: string
          last_analyzed_at?: string | null
          lifetime_value_cents?: number | null
          org_id?: string
          persona_label?: Database["public"]["Enums"]["donor_persona_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donor_personas_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_personas_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_reactivations: {
        Row: {
          created_at: string
          donor_id: string
          id: string
          lapse_score: number
          org_id: string
          project_id: string
          sequence: Json
          status: string
          trigger_reason: string
        }
        Insert: {
          created_at?: string
          donor_id: string
          id?: string
          lapse_score: number
          org_id: string
          project_id: string
          sequence: Json
          status?: string
          trigger_reason: string
        }
        Update: {
          created_at?: string
          donor_id?: string
          id?: string
          lapse_score?: number
          org_id?: string
          project_id?: string
          sequence?: Json
          status?: string
          trigger_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_reactivations_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_reactivations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_reactivations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      donor_retention_sequences: {
        Row: {
          created_at: string | null
          donation_id: string | null
          donor_id: string
          id: string
          message: string
          org_id: string
          scheduled_at: string
          sent_at: string | null
          stage: string
        }
        Insert: {
          created_at?: string | null
          donation_id?: string | null
          donor_id: string
          id?: string
          message: string
          org_id: string
          scheduled_at: string
          sent_at?: string | null
          stage?: string
        }
        Update: {
          created_at?: string | null
          donation_id?: string | null
          donor_id?: string
          id?: string
          message?: string
          org_id?: string
          scheduled_at?: string
          sent_at?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_retention_sequences_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_retention_sequences_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_retention_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      donors: {
        Row: {
          address: Json | null
          created_at: string
          email: string | null
          employer: string | null
          full_name: string
          id: string
          merged_into_donor_id: string | null
          occupation: string | null
          org_id: string
        }
        Insert: {
          address?: Json | null
          created_at?: string
          email?: string | null
          employer?: string | null
          full_name: string
          id?: string
          merged_into_donor_id?: string | null
          occupation?: string | null
          org_id: string
        }
        Update: {
          address?: Json | null
          created_at?: string
          email?: string | null
          employer?: string | null
          full_name?: string
          id?: string
          merged_into_donor_id?: string | null
          occupation?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donors_merged_into_donor_id_fkey"
            columns: ["merged_into_donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_fatigue_signals: {
        Row: {
          donor_id: string
          fatigue_risk_score: number
          id: string
          last_evaluated_at: string | null
          org_id: string
          recommendation: string | null
          sends_last_30d: number
        }
        Insert: {
          donor_id: string
          fatigue_risk_score?: number
          id?: string
          last_evaluated_at?: string | null
          org_id: string
          recommendation?: string | null
          sends_last_30d?: number
        }
        Update: {
          donor_id?: string
          fatigue_risk_score?: number
          id?: string
          last_evaluated_at?: string | null
          org_id?: string
          recommendation?: string | null
          sends_last_30d?: number
        }
        Relationships: [
          {
            foreignKeyName: "email_fatigue_signals_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_fatigue_signals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entitlement_id: string | null
          id: string
          key: string
          org_id: string
          project_id: string | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entitlement_id?: string | null
          id?: string
          key: string
          org_id: string
          project_id?: string | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entitlement_id?: string | null
          id?: string
          key?: string
          org_id?: string
          project_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlement_audit_log_entitlement_id_fkey"
            columns: ["entitlement_id"]
            isOneToOne: false
            referencedRelation: "entitlements"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          expires_at: string | null
          granted: boolean
          granted_by: string | null
          granted_reason: string
          id: string
          key: string
          org_id: string
          project_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          granted_reason?: string
          id?: string
          key: string
          org_id: string
          project_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted?: boolean
          granted_by?: string | null
          granted_reason?: string
          id?: string
          key?: string
          org_id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entitlements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fec_sprint_plans: {
        Row: {
          created_at: string | null
          current_pace_cents: number
          daily_plan: Json
          deadline_date: string
          goal_cents: number
          id: string
          org_id: string
          project_id: string
        }
        Insert: {
          created_at?: string | null
          current_pace_cents?: number
          daily_plan?: Json
          deadline_date: string
          goal_cents?: number
          id?: string
          org_id: string
          project_id: string
        }
        Update: {
          created_at?: string | null
          current_pace_cents?: number
          daily_plan?: Json
          deadline_date?: string
          goal_cents?: number
          id?: string
          org_id?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fec_sprint_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fec_sprint_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      funding_runway_plans: {
        Row: {
          cash_on_hand_cents: number
          created_at: string
          daily_burn_cents: number
          daily_raise_cents: number
          id: string
          org_id: string
          planned_expenses: Json
          project_id: string
          shortfall_cents: number
          shortfall_date: string | null
          strategies: Json | null
        }
        Insert: {
          cash_on_hand_cents: number
          created_at?: string
          daily_burn_cents: number
          daily_raise_cents: number
          id?: string
          org_id: string
          planned_expenses?: Json
          project_id: string
          shortfall_cents?: number
          shortfall_date?: string | null
          strategies?: Json | null
        }
        Update: {
          cash_on_hand_cents?: number
          created_at?: string
          daily_burn_cents?: number
          daily_raise_cents?: number
          id?: string
          org_id?: string
          planned_expenses?: Json
          project_id?: string
          shortfall_cents?: number
          shortfall_date?: string | null
          strategies?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "funding_runway_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "funding_runway_plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      fundraising_momentum_events: {
        Row: {
          baseline_avg_cents: number
          detected_at: string | null
          donation_count: number
          donation_total_cents: number
          id: string
          org_id: string
          project_id: string
          recommendation: string | null
          spike_multiplier: number
          window_minutes: number
        }
        Insert: {
          baseline_avg_cents?: number
          detected_at?: string | null
          donation_count?: number
          donation_total_cents?: number
          id?: string
          org_id: string
          project_id: string
          recommendation?: string | null
          spike_multiplier?: number
          window_minutes?: number
        }
        Update: {
          baseline_avg_cents?: number
          detected_at?: string | null
          donation_count?: number
          donation_total_cents?: number
          id?: string
          org_id?: string
          project_id?: string
          recommendation?: string | null
          spike_multiplier?: number
          window_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "fundraising_momentum_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fundraising_momentum_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          created_at: string
          id: string
          imported_by: string
          project_id: string
          row_count: number
          source_filename: string
        }
        Insert: {
          created_at?: string
          id?: string
          imported_by: string
          project_id: string
          row_count?: number
          source_filename: string
        }
        Update: {
          created_at?: string
          id?: string
          imported_by?: string
          project_id?: string
          row_count?: number
          source_filename?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_batches_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_events: {
        Row: {
          created_at: string
          description: string
          event_type: string
          id: string
          org_id: string
          project_id: string
          responses: Json | null
          status: string
          warm_segment_size: number
        }
        Insert: {
          created_at?: string
          description: string
          event_type: string
          id?: string
          org_id: string
          project_id: string
          responses?: Json | null
          status?: string
          warm_segment_size?: number
        }
        Update: {
          created_at?: string
          description?: string
          event_type?: string
          id?: string
          org_id?: string
          project_id?: string
          responses?: Json | null
          status?: string
          warm_segment_size?: number
        }
        Relationships: [
          {
            foreignKeyName: "issue_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      major_donor_escalations: {
        Row: {
          ask_sequence: string | null
          created_at: string | null
          donor_id: string
          id: string
          org_id: string
          readiness_score: number
          signals: Json | null
          suggested_ask_cents: number
        }
        Insert: {
          ask_sequence?: string | null
          created_at?: string | null
          donor_id: string
          id?: string
          org_id: string
          readiness_score?: number
          signals?: Json | null
          suggested_ask_cents?: number
        }
        Update: {
          ask_sequence?: string | null
          created_at?: string | null
          donor_id?: string
          id?: string
          org_id?: string
          readiness_score?: number
          signals?: Json | null
          suggested_ask_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "major_donor_escalations_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_donor_escalations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      message_acknowledgements: {
        Row: {
          acknowledged_at: string
          id: string
          message_id: string
          profile_id: string
        }
        Insert: {
          acknowledged_at?: string
          id?: string
          message_id: string
          profile_id: string
        }
        Update: {
          acknowledged_at?: string
          id?: string
          message_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_acknowledgements_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_acknowledgements_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
          org_id: string
          project_id: string | null
          subject: string
          target_role_id: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind?: string
          org_id: string
          project_id?: string | null
          subject: string
          target_role_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
          org_id?: string
          project_id?: string | null
          subject?: string
          target_role_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_threads_target_role_id_fkey"
            columns: ["target_role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "message_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      network_asks: {
        Row: {
          ask_text: string
          attributed_cents: number
          created_at: string
          donor_id: string
          id: string
          org_id: string
          project_id: string
          relationship: string
          status: string
        }
        Insert: {
          ask_text: string
          attributed_cents?: number
          created_at?: string
          donor_id: string
          id?: string
          org_id: string
          project_id: string
          relationship: string
          status?: string
        }
        Update: {
          ask_text?: string
          attributed_cents?: number
          created_at?: string
          donor_id?: string
          id?: string
          org_id?: string
          project_id?: string
          relationship?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_asks_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_asks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "network_asks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      opponent_records: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          occurred_on: string
          org_id: string
          project_id: string
          record_type: string
          source: string | null
          status: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_on: string
          org_id: string
          project_id: string
          record_type: string
          source?: string | null
          status?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_on?: string
          org_id?: string
          project_id?: string
          record_type?: string
          source?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "opponent_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opponent_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opponent_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      org_memberships: {
        Row: {
          created_at: string
          id: string
          org_id: string
          profile_id: string
          role_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          profile_id: string
          role_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          role_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_contact_email: string | null
          billing_contact_name: string | null
          created_at: string
          created_by: string
          ein: string | null
          fec_committee_id: string | null
          id: string
          name: string
          org_type: string
          state_of_registration: string | null
          status: string
        }
        Insert: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          created_at?: string
          created_by: string
          ein?: string | null
          fec_committee_id?: string | null
          id?: string
          name: string
          org_type: string
          state_of_registration?: string | null
          status?: string
        }
        Update: {
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          created_at?: string
          created_by?: string
          ein?: string | null
          fec_committee_id?: string | null
          id?: string
          name?: string
          org_type?: string
          state_of_registration?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_recovery_alerts: {
        Row: {
          detected_at: string | null
          donor_id: string
          failed_amount_cents: number
          failure_type: string
          id: string
          org_id: string
          project_id: string | null
          recovered_at: string | null
          recovery_message: string | null
          status: string
        }
        Insert: {
          detected_at?: string | null
          donor_id: string
          failed_amount_cents?: number
          failure_type?: string
          id?: string
          org_id: string
          project_id?: string | null
          recovered_at?: string | null
          recovery_message?: string | null
          status?: string
        }
        Update: {
          detected_at?: string | null
          donor_id?: string
          failed_amount_cents?: number
          failure_type?: string
          id?: string
          org_id?: string
          project_id?: string | null
          recovered_at?: string | null
          recovery_message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_recovery_alerts_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_recovery_alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_super_admin: boolean
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_super_admin?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_super_admin?: boolean
        }
        Relationships: []
      }
      project_memberships: {
        Row: {
          created_at: string
          id: string
          profile_id: string
          project_id: string
          role_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id: string
          project_id: string
          role_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string
          project_id?: string
          role_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memberships_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_memberships_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          org_id: string
          state: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          org_id: string
          state?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          org_id?: string
          state?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_upgrade_prompts: {
        Row: {
          current_monthly_cents: number
          donor_id: string
          id: string
          months_active: number
          org_id: string
          prompted_at: string | null
          responded: boolean
          suggested_monthly_cents: number
          upgrade_message: string
        }
        Insert: {
          current_monthly_cents?: number
          donor_id: string
          id?: string
          months_active?: number
          org_id: string
          prompted_at?: string | null
          responded?: boolean
          suggested_monthly_cents?: number
          upgrade_message: string
        }
        Update: {
          current_monthly_cents?: number
          donor_id?: string
          id?: string
          months_active?: number
          org_id?: string
          prompted_at?: string | null
          responded?: boolean
          suggested_monthly_cents?: number
          upgrade_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_upgrade_prompts_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_upgrade_prompts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_records: {
        Row: {
          donation_id: string | null
          id: string
          org_id: string
          reason: string | null
          recorded_at: string | null
          refunded_amount_cents: number
        }
        Insert: {
          donation_id?: string | null
          id?: string
          org_id: string
          reason?: string | null
          recorded_at?: string | null
          refunded_amount_cents?: number
        }
        Update: {
          donation_id?: string | null
          id?: string
          org_id?: string
          reason?: string | null
          recorded_at?: string | null
          refunded_amount_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_records_donation_id_fkey"
            columns: ["donation_id"]
            isOneToOne: false
            referencedRelation: "donations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_risk_alerts: {
        Row: {
          analysis: string | null
          baseline_refund_rate: number
          created_at: string | null
          current_refund_rate: number
          id: string
          org_id: string
          project_id: string | null
          refund_count: number
          risk_level: string
          total_refunded_cents: number
          window_days: number
        }
        Insert: {
          analysis?: string | null
          baseline_refund_rate?: number
          created_at?: string | null
          current_refund_rate?: number
          id?: string
          org_id: string
          project_id?: string | null
          refund_count?: number
          risk_level?: string
          total_refunded_cents?: number
          window_days?: number
        }
        Update: {
          analysis?: string | null
          baseline_refund_rate?: number
          created_at?: string | null
          current_refund_rate?: number
          id?: string
          org_id?: string
          project_id?: string | null
          refund_count?: number
          risk_level?: string
          total_refunded_cents?: number
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "refund_risk_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_risk_alerts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: string
          is_template: boolean
          name: string
          org_id: string | null
          org_type_scope: string | null
          permissions: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_template?: boolean
          name: string
          org_id?: string | null
          org_type_scope?: string | null
          permissions?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_template?: boolean
          name?: string
          org_id?: string | null
          org_type_scope?: string | null
          permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          content: string
          created_at: string
          created_by: string
          engagement_count: number | null
          id: string
          impressions: number | null
          platform: string
          project_id: string
          scheduled_for: string | null
          status: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          engagement_count?: number | null
          id?: string
          impressions?: number | null
          platform: string
          project_id: string
          scheduled_for?: string | null
          status?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          engagement_count?: number | null
          id?: string
          impressions?: number | null
          platform?: string
          project_id?: string
          scheduled_for?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      territories: {
        Row: {
          area_sq_meters: number | null
          assigned_to: string | null
          created_at: string
          created_by: string
          geometry: Json
          id: string
          name: string
          project_id: string
        }
        Insert: {
          area_sq_meters?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by: string
          geometry: Json
          id?: string
          name: string
          project_id: string
        }
        Update: {
          area_sq_meters?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          geometry?: Json
          id?: string
          name?: string
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "territories_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "territories_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      volunteer_donor_asks: {
        Row: {
          ask_message: string
          contribution_summary: string | null
          created_at: string | null
          id: string
          org_id: string
          profile_id: string
          sent_at: string | null
        }
        Insert: {
          ask_message: string
          contribution_summary?: string | null
          created_at?: string | null
          id?: string
          org_id: string
          profile_id: string
          sent_at?: string | null
        }
        Update: {
          ask_message?: string
          contribution_summary?: string | null
          created_at?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "volunteer_donor_asks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "volunteer_donor_asks_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      voter_records: {
        Row: {
          address_line: string | null
          ballot_status: string
          ballot_updated_at: string | null
          canvass_notes: string | null
          contact_status: string
          created_at: string
          data: Json
          full_name: string | null
          id: string
          import_batch_id: string | null
          lat: number | null
          lng: number | null
          project_id: string
          territory_id: string | null
        }
        Insert: {
          address_line?: string | null
          ballot_status?: string
          ballot_updated_at?: string | null
          canvass_notes?: string | null
          contact_status?: string
          created_at?: string
          data?: Json
          full_name?: string | null
          id?: string
          import_batch_id?: string | null
          lat?: number | null
          lng?: number | null
          project_id: string
          territory_id?: string | null
        }
        Update: {
          address_line?: string | null
          ballot_status?: string
          ballot_updated_at?: string | null
          canvass_notes?: string | null
          contact_status?: string
          created_at?: string
          data?: Json
          full_name?: string | null
          id?: string
          import_batch_id?: string | null
          lat?: number | null
          lng?: number | null
          project_id?: string
          territory_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voter_records_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voter_records_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voter_records_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_project_addon: {
        Args: { p_key: string; p_project_id: string }
        Returns: undefined
      }
      get_my_permissions: { Args: { p_org_id: string }; Returns: Json }
      get_project_donation_total: {
        Args: { p_project_id: string }
        Returns: number
      }
      has_entitlement: {
        Args: { p_key: string; p_org_id: string; p_project_id?: string }
        Returns: boolean
      }
      has_org_permission: {
        Args: { p_org_id: string; p_permission: string }
        Returns: boolean
      }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      lookup_profile_for_invite: {
        Args: { p_email: string; p_org_id: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      my_pending_invites: {
        Args: never
        Returns: {
          membership_id: string
          org_name: string
          role_name: string
        }[]
      }
      my_unread_broadcasts: { Args: { p_org_id: string }; Returns: number }
      project_org_id: { Args: { p_project_id: string }; Returns: string }
      shares_org_with: { Args: { p_profile_id: string }; Returns: boolean }
      thread_org_id: { Args: { p_thread_id: string }; Returns: string }
    }
    Enums: {
      churn_reason:
        | "budget_fatigue"
        | "no_recent_contact"
        | "candidate_change"
        | "external_event"
        | "low_engagement"
      donor_persona_type:
        | "recurring_small_progressive"
        | "recurring_small_conservative"
        | "major_donor_progressive"
        | "major_donor_conservative"
        | "grassroots_activist"
        | "issue_focused"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      churn_reason: [
        "budget_fatigue",
        "no_recent_contact",
        "candidate_change",
        "external_event",
        "low_engagement",
      ],
      donor_persona_type: [
        "recurring_small_progressive",
        "recurring_small_conservative",
        "major_donor_progressive",
        "major_donor_conservative",
        "grassroots_activist",
        "issue_focused",
      ],
    },
  },
} as const

