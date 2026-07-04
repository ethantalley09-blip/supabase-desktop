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
      donors: {
        Row: {
          address: Json | null
          created_at: string
          email: string | null
          employer: string | null
          full_name: string
          id: string
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
          occupation?: string | null
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donors_org_id_fkey"
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
      voter_records: {
        Row: {
          address_line: string | null
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
      [_ in never]: never
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
    Enums: {},
  },
} as const

