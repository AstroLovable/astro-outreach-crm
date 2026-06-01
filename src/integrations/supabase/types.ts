export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          created_at: string
          description: string
          id: string
          owner_id: string
          ref_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          owner_id: string
          ref_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          owner_id?: string
          ref_id?: string | null
          type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          business: string | null
          created_at: string
          id: string
          owner_id: string | null
          page_url: string | null
          status: string
          system_prompt: string | null
          unread_count: number
          updated_at: string
          visitor_email: string | null
          visitor_name: string | null
        }
        Insert: {
          business?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          page_url?: string | null
          status?: string
          system_prompt?: string | null
          unread_count?: number
          updated_at?: string
          visitor_email?: string | null
          visitor_name?: string | null
        }
        Update: {
          business?: string | null
          created_at?: string
          id?: string
          owner_id?: string | null
          page_url?: string | null
          status?: string
          system_prompt?: string | null
          unread_count?: number
          updated_at?: string
          visitor_email?: string | null
          visitor_name?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          business: string | null
          created_at: string
          email: string | null
          follow_up_date: string | null
          follow_up_done: boolean
          id: string
          name: string
          notes: string | null
          owner_id: string
          package: string | null
          phone: string | null
          service_type: string | null
          source: string | null
          stage: string
          stage_changed_at: string
          status_note: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          business?: string | null
          created_at?: string
          email?: string | null
          follow_up_date?: string | null
          follow_up_done?: boolean
          id?: string
          name: string
          notes?: string | null
          owner_id: string
          package?: string | null
          phone?: string | null
          service_type?: string | null
          source?: string | null
          stage?: string
          stage_changed_at?: string
          status_note?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          business?: string | null
          created_at?: string
          email?: string | null
          follow_up_date?: string | null
          follow_up_done?: boolean
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          package?: string | null
          phone?: string | null
          service_type?: string | null
          source?: string | null
          stage?: string
          stage_changed_at?: string
          status_note?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      invoices: {
        Row: {
          client_id: string | null
          created_at: string
          deposit_part: string | null
          due_date: string | null
          id: string
          issue_date: string
          job_reference: string | null
          line_items: Json
          notes: string | null
          number: string
          owner_id: string
          paid_at: string | null
          parent_invoice_id: string | null
          status: string
          subtotal: number
          total: number
          updated_at: string
          vat: boolean
          vat_amount: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          deposit_part?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string
          job_reference?: string | null
          line_items?: Json
          notes?: string | null
          number: string
          owner_id: string
          paid_at?: string | null
          parent_invoice_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat?: boolean
          vat_amount?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          deposit_part?: string | null
          due_date?: string | null
          id?: string
          issue_date?: string
          job_reference?: string | null
          line_items?: Json
          notes?: string | null
          number?: string
          owner_id?: string
          paid_at?: string | null
          parent_invoice_id?: string | null
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat?: boolean
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_parent_invoice_id_fkey"
            columns: ["parent_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          client_id: string | null
          created_at: string
          id: string
          kind: string
          owner_id: string
          subject: string | null
        }
        Insert: {
          body: string
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          owner_id: string
          subject?: string | null
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      proposals: {
        Row: {
          client_id: string | null
          content: string | null
          created_at: string
          id: string
          notes: string | null
          owner_id: string
          package: string | null
          services: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id: string
          package?: string | null
          services?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          content?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          owner_id?: string
          package?: string | null
          services?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          issue_date: string
          line_items: Json
          notes: string | null
          number: string | null
          owner_id: string
          status: string
          subtotal: number
          total: number
          updated_at: string
          vat: boolean
          vat_amount: number
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          number?: string | null
          owner_id: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat?: boolean
          vat_amount?: number
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          issue_date?: string
          line_items?: Json
          notes?: string | null
          number?: string | null
          owner_id?: string
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
          vat?: boolean
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          chatbot_system_prompt: string
          company_email: string
          company_name: string
          company_website: string | null
          created_at: string
          greeting_delay_seconds: number
          id: string
          idle_close_hours: number
          invoice_prefix: string
          next_invoice_number: number
          notification_sound: boolean
          notify_new_chat: boolean
          office_days: number[]
          office_hours_end: string
          office_hours_start: string
          office_timezone: string
          owner_id: string
          services: Json
          updated_at: string
          vat_enabled: boolean
        }
        Insert: {
          chatbot_system_prompt?: string
          company_email?: string
          company_name?: string
          company_website?: string | null
          created_at?: string
          greeting_delay_seconds?: number
          id?: string
          idle_close_hours?: number
          invoice_prefix?: string
          next_invoice_number?: number
          notification_sound?: boolean
          notify_new_chat?: boolean
          office_days?: number[]
          office_hours_end?: string
          office_hours_start?: string
          office_timezone?: string
          owner_id: string
          services?: Json
          updated_at?: string
          vat_enabled?: boolean
        }
        Update: {
          chatbot_system_prompt?: string
          company_email?: string
          company_name?: string
          company_website?: string | null
          created_at?: string
          greeting_delay_seconds?: number
          id?: string
          idle_close_hours?: number
          invoice_prefix?: string
          next_invoice_number?: number
          notification_sound?: boolean
          notify_new_chat?: boolean
          office_days?: number[]
          office_hours_end?: string
          office_hours_start?: string
          office_timezone?: string
          owner_id?: string
          services?: Json
          updated_at?: string
          vat_enabled?: boolean
        }
        Relationships: []
      }
      tasks: {
        Row: {
          client_id: string | null
          created_at: string
          due_date: string | null
          id: string
          owner_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          owner_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
