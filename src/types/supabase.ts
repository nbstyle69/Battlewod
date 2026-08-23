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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          count: number
          day: string
          kind: string
          user_id: string
        }
        Insert: {
          count?: number
          day?: string
          kind: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          kind?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      app_changelog: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          type: string
        }
        Insert: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          type?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_changelog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_changelog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      appointment_bookings: {
        Row: {
          box_id: string
          created_at: string
          followup_id: string | null
          id: string
          member_id: string
          slot_id: string
          status: string
        }
        Insert: {
          box_id: string
          created_at?: string
          followup_id?: string | null
          id?: string
          member_id: string
          slot_id: string
          status?: string
        }
        Update: {
          box_id?: string
          created_at?: string
          followup_id?: string | null
          id?: string
          member_id?: string
          slot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_bookings_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_bookings_followup_id_fkey"
            columns: ["followup_id"]
            isOneToOne: false
            referencedRelation: "session_followups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_bookings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "box_appointment_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_badges: {
        Row: {
          achieved_at: string | null
          athlete_id: string | null
          badge_key: string
          id: string
        }
        Insert: {
          achieved_at?: string | null
          athlete_id?: string | null
          badge_key: string
          id?: string
        }
        Update: {
          achieved_at?: string | null
          athlete_id?: string | null
          badge_key?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_badges_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_badges_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_streaks: {
        Row: {
          athlete_id: string
          current_streak: number
          longest_streak: number
          updated_at: string
          week_session_count: number
          week_start: string
        }
        Insert: {
          athlete_id: string
          current_streak?: number
          longest_streak?: number
          updated_at?: string
          week_session_count?: number
          week_start?: string
        }
        Update: {
          athlete_id?: string
          current_streak?: number
          longest_streak?: number
          updated_at?: string
          week_session_count?: number
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_streaks_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_streaks_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      badges_catalog: {
        Row: {
          badge_key: string
          category: string
          description: string
          icon: string
          sort_order: number
          title: string
        }
        Insert: {
          badge_key: string
          category?: string
          description: string
          icon?: string
          sort_order?: number
          title: string
        }
        Update: {
          badge_key?: string
          category?: string
          description?: string
          icon?: string
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      box_appointment_slots: {
        Row: {
          box_id: string
          capacity: number
          coach: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          starts_at: string
        }
        Insert: {
          box_id: string
          capacity?: number
          coach?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          starts_at: string
        }
        Update: {
          box_id?: string
          capacity?: number
          coach?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_appointment_slots_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_appointment_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_appointment_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_article_comments: {
        Row: {
          article_id: string
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          article_id: string
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          article_id?: string
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_article_comments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "box_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_article_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_article_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_article_likes: {
        Row: {
          article_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_article_likes_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "box_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_article_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_article_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_articles: {
        Row: {
          author_id: string
          body: string
          box_id: string
          created_at: string
          id: string
          image_url: string | null
          title: string
        }
        Insert: {
          author_id: string
          body?: string
          box_id: string
          created_at?: string
          id?: string
          image_url?: string | null
          title: string
        }
        Update: {
          author_id?: string
          body?: string
          box_id?: string
          created_at?: string
          id?: string
          image_url?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_articles_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      box_cash_payments: {
        Row: {
          amount_cents: number
          box_id: string
          collected_at: string
          collected_by: string | null
          id: string
          invitation_id: string | null
          member_id: string | null
          plan_id: string | null
          plan_name: string | null
          program_id: string | null
          source: string
        }
        Insert: {
          amount_cents: number
          box_id: string
          collected_at?: string
          collected_by?: string | null
          id?: string
          invitation_id?: string | null
          member_id?: string | null
          plan_id?: string | null
          plan_name?: string | null
          program_id?: string | null
          source: string
        }
        Update: {
          amount_cents?: number
          box_id?: string
          collected_at?: string
          collected_by?: string | null
          id?: string
          invitation_id?: string | null
          member_id?: string | null
          plan_id?: string | null
          plan_name?: string | null
          program_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_cash_payments_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "box_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_cash_payments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      box_documents: {
        Row: {
          box_id: string | null
          created_at: string | null
          file_size: number | null
          file_url: string
          id: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          box_id?: string | null
          created_at?: string | null
          file_size?: number | null
          file_url: string
          id?: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          box_id?: string | null
          created_at?: string | null
          file_size?: number | null
          file_url?: string
          id?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_documents_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_elo: {
        Row: {
          box_id: string
          elo: number
          matches: number
          member_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          box_id: string
          elo?: number
          matches?: number
          member_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          box_id?: string
          elo?: number
          matches?: number
          member_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "box_elo_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_elo_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_elo_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_elo_history: {
        Row: {
          box_id: string
          created_at: string
          elo_after: number
          elo_before: number
          elo_delta: number
          id: string
          member_id: string
          rank: number
          wod_id: string
        }
        Insert: {
          box_id: string
          created_at?: string
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          member_id: string
          rank?: number
          wod_id: string
        }
        Update: {
          box_id?: string
          created_at?: string
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          member_id?: string
          rank?: number
          wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_elo_history_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_elo_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_elo_history_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_elo_history_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      box_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          box_id: string
          cash_collected: boolean
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          last_name: string | null
          last_send_error: string | null
          last_sent_at: string | null
          payment_mode: string
          plan_id: string | null
          send_count: number
          status: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          box_id: string
          cash_collected?: boolean
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_send_error?: string | null
          last_sent_at?: string | null
          payment_mode?: string
          plan_id?: string | null
          send_count?: number
          status?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          box_id?: string
          cash_collected?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          last_send_error?: string | null
          last_sent_at?: string | null
          payment_mode?: string
          plan_id?: string | null
          send_count?: number
          status?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_invitations_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_invitations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      box_members: {
        Row: {
          amount_cents: number | null
          box_id: string | null
          commitment_end_date: string | null
          dunning_attempts: number
          dunning_last_reminder_at: string | null
          dunning_reminders_sent: number
          id: string
          joined_at: string | null
          last_payment_error: string | null
          member_id: string | null
          past_due_since: string | null
          pause_resumes_at: string | null
          pause_started_at: string | null
          payment_method_type: string | null
          plan_id: string | null
          platform_fee_cents: number | null
          role: string
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_subscription_id: string | null
          subscription_cancel_at_period_end: boolean
          subscription_current_period_end: string | null
          subscription_paused: boolean
          subscription_status: string | null
        }
        Insert: {
          amount_cents?: number | null
          box_id?: string | null
          commitment_end_date?: string | null
          dunning_attempts?: number
          dunning_last_reminder_at?: string | null
          dunning_reminders_sent?: number
          id?: string
          joined_at?: string | null
          last_payment_error?: string | null
          member_id?: string | null
          past_due_since?: string | null
          pause_resumes_at?: string | null
          pause_started_at?: string | null
          payment_method_type?: string | null
          plan_id?: string | null
          platform_fee_cents?: number | null
          role?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_current_period_end?: string | null
          subscription_paused?: boolean
          subscription_status?: string | null
        }
        Update: {
          amount_cents?: number | null
          box_id?: string | null
          commitment_end_date?: string | null
          dunning_attempts?: number
          dunning_last_reminder_at?: string | null
          dunning_reminders_sent?: number
          id?: string
          joined_at?: string | null
          last_payment_error?: string | null
          member_id?: string | null
          past_due_since?: string | null
          pause_resumes_at?: string | null
          pause_started_at?: string | null
          payment_method_type?: string | null
          plan_id?: string | null
          platform_fee_cents?: number | null
          role?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_subscription_id?: string | null
          subscription_cancel_at_period_end?: boolean
          subscription_current_period_end?: string | null
          subscription_paused?: boolean
          subscription_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_members_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_members_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      box_messages: {
        Row: {
          body: string
          box_id: string
          created_at: string | null
          id: string
          sent_at: string | null
          target_group_id: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          body: string
          box_id: string
          created_at?: string | null
          id?: string
          sent_at?: string | null
          target_group_id?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          body?: string
          box_id?: string
          created_at?: string | null
          id?: string
          sent_at?: string | null
          target_group_id?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_messages_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_messages_target_group_id_fkey"
            columns: ["target_group_id"]
            isOneToOne: false
            referencedRelation: "message_group_members"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "box_messages_target_group_id_fkey"
            columns: ["target_group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      box_notifications: {
        Row: {
          body: string
          box_id: string
          created_at: string
          created_by: string | null
          id: string
          target: string
          title: string
        }
        Insert: {
          body?: string
          box_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          target?: string
          title: string
        }
        Update: {
          body?: string
          box_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          target?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_notifications_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_owner_email_prefs: {
        Row: {
          box_id: string
          updated_at: string
          user_id: string
          weekly_digest: boolean
        }
        Insert: {
          box_id: string
          updated_at?: string
          user_id: string
          weekly_digest?: boolean
        }
        Update: {
          box_id?: string
          updated_at?: string
          user_id?: string
          weekly_digest?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "box_owner_email_prefs_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_owner_email_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_owner_email_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      box_programming: {
        Row: {
          billing: string
          created_at: string
          created_by: string | null
          currency: string
          days_per_week: number | null
          description: string | null
          discipline: string | null
          id: string
          is_published: boolean
          is_template: boolean
          level: string | null
          price_cents: number
          publisher_box_id: string
          stripe_price_id: string | null
          stripe_product_id: string | null
          title: string
          updated_at: string
          weeks_count: number
        }
        Insert: {
          billing?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          days_per_week?: number | null
          description?: string | null
          discipline?: string | null
          id?: string
          is_published?: boolean
          is_template?: boolean
          level?: string | null
          price_cents?: number
          publisher_box_id: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title: string
          updated_at?: string
          weeks_count?: number
        }
        Update: {
          billing?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          days_per_week?: number | null
          description?: string | null
          discipline?: string | null
          id?: string
          is_published?: boolean
          is_template?: boolean
          level?: string | null
          price_cents?: number
          publisher_box_id?: string
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title?: string
          updated_at?: string
          weeks_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "box_programming_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_programming_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_programming_publisher_box_id_fkey"
            columns: ["publisher_box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      box_programming_subscriptions: {
        Row: {
          auto_apply_weekly: boolean
          created_at: string
          created_by: string | null
          current_period_end: string | null
          id: string
          programming_id: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscriber_box_id: string
          week_anchor: string
        }
        Insert: {
          auto_apply_weekly?: boolean
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          id?: string
          programming_id: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscriber_box_id: string
          week_anchor?: string
        }
        Update: {
          auto_apply_weekly?: boolean
          created_at?: string
          created_by?: string | null
          current_period_end?: string | null
          id?: string
          programming_id?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscriber_box_id?: string
          week_anchor?: string
        }
        Relationships: [
          {
            foreignKeyName: "box_programming_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_programming_subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_programming_subscriptions_programming_id_fkey"
            columns: ["programming_id"]
            isOneToOne: false
            referencedRelation: "box_programming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_programming_subscriptions_subscriber_box_id_fkey"
            columns: ["subscriber_box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      box_programming_wods: {
        Row: {
          block_name: string | null
          created_at: string
          day_of_week: number
          description: string | null
          emom_interval_minutes: number | null
          id: string
          leaderboard_enabled: boolean
          notes: string | null
          programming_id: string
          rounds: number | null
          sort_order: number
          tabata_rest_seconds: number | null
          tabata_work_seconds: number | null
          time_cap_seconds: number | null
          title: string
          video_url: string | null
          week_number: number
          wod_type: string | null
        }
        Insert: {
          block_name?: string | null
          created_at?: string
          day_of_week: number
          description?: string | null
          emom_interval_minutes?: number | null
          id?: string
          leaderboard_enabled?: boolean
          notes?: string | null
          programming_id: string
          rounds?: number | null
          sort_order?: number
          tabata_rest_seconds?: number | null
          tabata_work_seconds?: number | null
          time_cap_seconds?: number | null
          title: string
          video_url?: string | null
          week_number?: number
          wod_type?: string | null
        }
        Update: {
          block_name?: string | null
          created_at?: string
          day_of_week?: number
          description?: string | null
          emom_interval_minutes?: number | null
          id?: string
          leaderboard_enabled?: boolean
          notes?: string | null
          programming_id?: string
          rounds?: number | null
          sort_order?: number
          tabata_rest_seconds?: number | null
          tabata_work_seconds?: number | null
          time_cap_seconds?: number | null
          title?: string
          video_url?: string | null
          week_number?: number
          wod_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_programming_wods_programming_id_fkey"
            columns: ["programming_id"]
            isOneToOne: false
            referencedRelation: "box_programming"
            referencedColumns: ["id"]
          },
        ]
      }
      box_subscriptions: {
        Row: {
          box_id: string
          created_at: string | null
          current_period_end: string | null
          id: string
          is_early_adopter: boolean | null
          plan_tier: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          box_id: string
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          is_early_adopter?: boolean | null
          plan_tier?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          box_id?: string
          created_at?: string | null
          current_period_end?: string | null
          id?: string
          is_early_adopter?: boolean | null
          plan_tier?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_subscriptions_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: true
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      box_wods: {
        Row: {
          block: string | null
          block_name: string | null
          box_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          emom_interval_minutes: number | null
          id: string
          is_published: boolean | null
          leaderboard_enabled: boolean
          notes: string | null
          publish_at: string | null
          rounds: number | null
          scheduled_date: string
          sort_order: number
          source_programming_id: string | null
          source_programming_wod_id: string | null
          tabata_rest_seconds: number | null
          tabata_work_seconds: number | null
          time_cap_seconds: number | null
          title: string
          video_url: string | null
          wod_type: string | null
        }
        Insert: {
          block?: string | null
          block_name?: string | null
          box_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          emom_interval_minutes?: number | null
          id?: string
          is_published?: boolean | null
          leaderboard_enabled?: boolean
          notes?: string | null
          publish_at?: string | null
          rounds?: number | null
          scheduled_date: string
          sort_order?: number
          source_programming_id?: string | null
          source_programming_wod_id?: string | null
          tabata_rest_seconds?: number | null
          tabata_work_seconds?: number | null
          time_cap_seconds?: number | null
          title: string
          video_url?: string | null
          wod_type?: string | null
        }
        Update: {
          block?: string | null
          block_name?: string | null
          box_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          emom_interval_minutes?: number | null
          id?: string
          is_published?: boolean | null
          leaderboard_enabled?: boolean
          notes?: string | null
          publish_at?: string | null
          rounds?: number | null
          scheduled_date?: string
          sort_order?: number
          source_programming_id?: string | null
          source_programming_wod_id?: string | null
          tabata_rest_seconds?: number | null
          tabata_work_seconds?: number | null
          time_cap_seconds?: number | null
          title?: string
          video_url?: string | null
          wod_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "box_wods_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_wods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_wods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_wods_source_programming_id_fkey"
            columns: ["source_programming_id"]
            isOneToOne: false
            referencedRelation: "box_programming"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_wods_source_programming_wod_id_fkey"
            columns: ["source_programming_wod_id"]
            isOneToOne: false
            referencedRelation: "box_programming_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      boxes: {
        Row: {
          address: string | null
          allowed_tournament_formats: string[]
          city: string | null
          contact_email: string | null
          country: string | null
          cover_url: string | null
          created_at: string | null
          daily_publish_hour: number | null
          description: string | null
          dunning_grace_days: number
          founded_at: string | null
          google_maps_url: string | null
          id: string
          instagram_url: string | null
          invite_code: string
          is_active: boolean | null
          is_listed: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          member_count: number | null
          name: string
          opening_hours: Json | null
          owner_id: string | null
          phone: string | null
          postal_code: string | null
          services: string[] | null
          slug: string | null
          sport_type: string[] | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          tagline: string | null
          terms_pdf_url: string | null
          website_url: string | null
          weekly_publish_day: number | null
          weekly_publish_hour: number | null
        }
        Insert: {
          address?: string | null
          allowed_tournament_formats?: string[]
          city?: string | null
          contact_email?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          daily_publish_hour?: number | null
          description?: string | null
          dunning_grace_days?: number
          founded_at?: string | null
          google_maps_url?: string | null
          id?: string
          instagram_url?: string | null
          invite_code: string
          is_active?: boolean | null
          is_listed?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          member_count?: number | null
          name: string
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          postal_code?: string | null
          services?: string[] | null
          slug?: string | null
          sport_type?: string[] | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tagline?: string | null
          terms_pdf_url?: string | null
          website_url?: string | null
          weekly_publish_day?: number | null
          weekly_publish_hour?: number | null
        }
        Update: {
          address?: string | null
          allowed_tournament_formats?: string[]
          city?: string | null
          contact_email?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          daily_publish_hour?: number | null
          description?: string | null
          dunning_grace_days?: number
          founded_at?: string | null
          google_maps_url?: string | null
          id?: string
          instagram_url?: string | null
          invite_code?: string
          is_active?: boolean | null
          is_listed?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          member_count?: number | null
          name?: string
          opening_hours?: Json | null
          owner_id?: string | null
          phone?: string | null
          postal_code?: string | null
          services?: string[] | null
          slug?: string | null
          sport_type?: string[] | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tagline?: string | null
          terms_pdf_url?: string | null
          website_url?: string | null
          weekly_publish_day?: number | null
          weekly_publish_hour?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "boxes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boxes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog_reads: {
        Row: {
          changelog_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          changelog_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          changelog_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "changelog_reads_changelog_id_fkey"
            columns: ["changelog_id"]
            isOneToOne: false
            referencedRelation: "app_changelog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changelog_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changelog_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      class_reservations: {
        Row: {
          attended: boolean | null
          box_id: string | null
          created_at: string | null
          credit_id: string | null
          id: string
          member_id: string | null
          schedule_id: string | null
          status: string
        }
        Insert: {
          attended?: boolean | null
          box_id?: string | null
          created_at?: string | null
          credit_id?: string | null
          id?: string
          member_id?: string | null
          schedule_id?: string | null
          status?: string
        }
        Update: {
          attended?: boolean | null
          box_id?: string | null
          created_at?: string | null
          credit_id?: string | null
          id?: string
          member_id?: string | null
          schedule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_reservations_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_reservations_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "member_class_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_reservations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_reservations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_reservations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      class_schedules: {
        Row: {
          box_id: string | null
          coach: string | null
          created_at: string | null
          description: string | null
          end_time: string
          id: string
          max_capacity: number
          scheduled_date: string
          start_time: string
          title: string
        }
        Insert: {
          box_id?: string | null
          coach?: string | null
          created_at?: string | null
          description?: string | null
          end_time: string
          id?: string
          max_capacity?: number
          scheduled_date: string
          start_time: string
          title: string
        }
        Update: {
          box_id?: string | null
          coach?: string | null
          created_at?: string | null
          description?: string | null
          end_time?: string
          id?: string
          max_capacity?: number
          scheduled_date?: string
          start_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedules_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_participants: {
        Row: {
          competition_id: string | null
          id: string
          member_id: string | null
          registered_at: string | null
          status: string | null
          team_name: string | null
        }
        Insert: {
          competition_id?: string | null
          id?: string
          member_id?: string | null
          registered_at?: string | null
          status?: string | null
          team_name?: string | null
        }
        Update: {
          competition_id?: string | null
          id?: string
          member_id?: string | null
          registered_at?: string | null
          status?: string | null
          team_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_participants_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_participants_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      competition_scores: {
        Row: {
          competition_id: string | null
          id: string
          member_id: string | null
          points: number | null
          rank: number | null
          score_value: number
          submitted_at: string | null
          wod_id: string | null
        }
        Insert: {
          competition_id?: string | null
          id?: string
          member_id?: string | null
          points?: number | null
          rank?: number | null
          score_value: number
          submitted_at?: string | null
          wod_id?: string | null
        }
        Update: {
          competition_id?: string | null
          id?: string
          member_id?: string | null
          points?: number | null
          rank?: number | null
          score_value?: number
          submitted_at?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competition_scores_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "wods"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          box_id: string | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string
          format: string | null
          id: string
          max_participants: number | null
          scoring_type: string | null
          start_date: string
          status: string | null
          title: string
        }
        Insert: {
          box_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date: string
          format?: string | null
          id?: string
          max_participants?: number | null
          scoring_type?: string | null
          start_date: string
          status?: string | null
          title: string
        }
        Update: {
          box_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string
          format?: string | null
          id?: string
          max_participants?: number | null
          scoring_type?: string | null
          start_date?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitions_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tournament_elo_history: {
        Row: {
          calculated_at: string
          elo_after: number
          elo_before: number
          elo_delta: number
          final_rank: number
          id: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          calculated_at?: string
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          final_rank?: number
          id?: string
          tournament_id: string
          user_id: string
        }
        Update: {
          calculated_at?: string
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          final_rank?: number
          id?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_tournament_elo_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "daily_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_elo_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_elo_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tournament_participants: {
        Row: {
          id: string
          joined_at: string | null
          tournament_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          tournament_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "daily_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_participants_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tournament_scores: {
        Row: {
          capped: boolean
          contest_reason: string | null
          contested_by: string | null
          id: string
          notes: string | null
          rx: boolean | null
          score_value: number
          status: string
          submitted_at: string | null
          tournament_id: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          capped?: boolean
          contest_reason?: string | null
          contested_by?: string | null
          id?: string
          notes?: string | null
          rx?: boolean | null
          score_value: number
          status?: string
          submitted_at?: string | null
          tournament_id: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          capped?: boolean
          contest_reason?: string | null
          contested_by?: string | null
          id?: string
          notes?: string | null
          rx?: boolean | null
          score_value?: number
          status?: string
          submitted_at?: string | null
          tournament_id?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_tournament_scores_contested_by_fkey"
            columns: ["contested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_scores_contested_by_fkey"
            columns: ["contested_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_scores_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "daily_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_scores_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournament_scores_user_id_profiles_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_tournaments: {
        Row: {
          created_at: string | null
          creator_id: string | null
          duration: number
          elo_reward: number
          ends_at: string
          gender_target: string | null
          id: string
          is_official: boolean
          level: string
          max_players: number
          movements: string
          official_date: string | null
          score_mode: string
          scoring: string | null
          starts_at: string
          status: string
          wod_name: string
          wod_type: string
        }
        Insert: {
          created_at?: string | null
          creator_id?: string | null
          duration?: number
          elo_reward?: number
          ends_at?: string
          gender_target?: string | null
          id?: string
          is_official?: boolean
          level?: string
          max_players?: number
          movements: string
          official_date?: string | null
          score_mode?: string
          scoring?: string | null
          starts_at?: string
          status?: string
          wod_name: string
          wod_type: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string | null
          duration?: number
          elo_reward?: number
          ends_at?: string
          gender_target?: string | null
          id?: string
          is_official?: boolean
          level?: string
          max_players?: number
          movements?: string
          official_date?: string | null
          score_mode?: string
          scoring?: string | null
          starts_at?: string
          status?: string
          wod_name?: string
          wod_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_tournaments_creator_id_profiles_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_tournaments_creator_id_profiles_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      elo_history: {
        Row: {
          box_id: string
          created_at: string | null
          elo_after: number
          elo_before: number
          elo_delta: number
          id: string
          member_id: string
          rank: number
          wod_id: string
        }
        Insert: {
          box_id: string
          created_at?: string | null
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          member_id: string
          rank?: number
          wod_id: string
        }
        Update: {
          box_id?: string
          created_at?: string | null
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          member_id?: string
          rank?: number
          wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "elo_history_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elo_history_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      event_registrations: {
        Row: {
          event_id: string | null
          id: string
          member_id: string | null
          registered_at: string | null
          status: string | null
        }
        Insert: {
          event_id?: string | null
          id?: string
          member_id?: string | null
          registered_at?: string | null
          status?: string | null
        }
        Update: {
          event_id?: string | null
          id?: string
          member_id?: string | null
          registered_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          box_id: string | null
          cover_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          event_date: string
          id: string
          is_competition: boolean | null
          location: string | null
          max_participants: number | null
          registration_deadline: string | null
          title: string
        }
        Insert: {
          box_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_date: string
          id?: string
          is_competition?: boolean | null
          location?: string | null
          max_participants?: number | null
          registration_deadline?: string | null
          title: string
        }
        Update: {
          box_id?: string | null
          cover_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          event_date?: string
          id?: string
          is_competition?: boolean | null
          location?: string | null
          max_participants?: number | null
          registration_deadline?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_requests: {
        Row: {
          created_at: string | null
          id: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_addressee_id_fkey"
            columns: ["addressee_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_wod_scores: {
        Row: {
          completed_at: string | null
          id: string
          notes: string | null
          rx: boolean | null
          score_type: string
          score_value: number
          user_id: string
          wod_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          rx?: boolean | null
          score_type?: string
          score_value: number
          user_id: string
          wod_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          notes?: string | null
          rx?: boolean | null
          score_type?: string
          score_value?: number
          user_id?: string
          wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_wod_scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "generated_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_wods: {
        Row: {
          coach_tip: string | null
          created_at: string | null
          duration: number
          equipment: string[] | null
          format: string
          id: string
          is_benchmark: boolean | null
          is_favorite: boolean | null
          level: string
          movements: string
          scoring: string | null
          sport: string
          team_note: string | null
          user_id: string
          wod_name: string
          wod_type: string
        }
        Insert: {
          coach_tip?: string | null
          created_at?: string | null
          duration?: number
          equipment?: string[] | null
          format?: string
          id?: string
          is_benchmark?: boolean | null
          is_favorite?: boolean | null
          level?: string
          movements: string
          scoring?: string | null
          sport?: string
          team_note?: string | null
          user_id: string
          wod_name: string
          wod_type: string
        }
        Update: {
          coach_tip?: string | null
          created_at?: string | null
          duration?: number
          equipment?: string[] | null
          format?: string
          id?: string
          is_benchmark?: boolean | null
          is_favorite?: boolean | null
          level?: string
          movements?: string
          scoring?: string | null
          sport?: string
          team_note?: string | null
          user_id?: string
          wod_name?: string
          wod_type?: string
        }
        Relationships: []
      }
      group_messages: {
        Row: {
          attachment_url: string | null
          content: string
          created_at: string | null
          group_id: string
          id: string
          sender_id: string
        }
        Insert: {
          attachment_url?: string | null
          content: string
          created_at?: string | null
          group_id: string
          id?: string
          sender_id: string
        }
        Update: {
          attachment_url?: string | null
          content?: string
          created_at?: string | null
          group_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_group_members"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_bracket_matches: {
        Row: {
          competition_id: string
          completed_at: string | null
          created_at: string
          id: string
          loser_id: string | null
          match_number: number
          notes: string | null
          participant1_id: string | null
          participant2_id: string | null
          round: number
          scheduled_at: string | null
          side: string
          status: string
          winner_id: string | null
          wod_id: string | null
        }
        Insert: {
          competition_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          loser_id?: string | null
          match_number: number
          notes?: string | null
          participant1_id?: string | null
          participant2_id?: string | null
          round: number
          scheduled_at?: string | null
          side?: string
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Update: {
          competition_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          loser_id?: string | null
          match_number?: number
          notes?: string | null
          participant1_id?: string | null
          participant2_id?: string | null
          round?: number
          scheduled_at?: string | null
          side?: string
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_bracket_matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_loser_id_fkey"
            columns: ["loser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_loser_id_fkey"
            columns: ["loser_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_participant2_id_fkey"
            columns: ["participant2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_participant2_id_fkey"
            columns: ["participant2_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_bracket_matches_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "inter_competition_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_competition_wods: {
        Row: {
          competition_id: string | null
          created_at: string | null
          description: string | null
          id: string
          order_index: number
          revealed_at: string | null
          scoring_type: string | null
          time_cap: number | null
          title: string
        }
        Insert: {
          competition_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          revealed_at?: string | null
          scoring_type?: string | null
          time_cap?: number | null
          title: string
        }
        Update: {
          competition_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          order_index?: number
          revealed_at?: string | null
          scoring_type?: string | null
          time_cap?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_competition_wods_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_competitions: {
        Row: {
          banner_url: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          format: string
          id: string
          max_participants: number | null
          registration_open_at: string | null
          rules: string | null
          starts_at: string | null
          status: string
          team_size: number
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          format?: string
          id?: string
          max_participants?: number | null
          registration_open_at?: string | null
          rules?: string | null
          starts_at?: string | null
          status?: string
          team_size?: number
          title: string
          type?: string
          updated_at?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          format?: string
          id?: string
          max_participants?: number | null
          registration_open_at?: string | null
          rules?: string | null
          starts_at?: string | null
          status?: string
          team_size?: number
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_competitions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_elo_history: {
        Row: {
          athlete_id: string
          avg_opponent_elo: number
          calculated_at: string
          competition_id: string
          elo_after: number
          elo_before: number
          elo_change: number
          final_rank: number
          id: string
          participants_count: number
        }
        Insert: {
          athlete_id: string
          avg_opponent_elo: number
          calculated_at?: string
          competition_id: string
          elo_after: number
          elo_before: number
          elo_change: number
          final_rank: number
          id?: string
          participants_count: number
        }
        Update: {
          athlete_id?: string
          avg_opponent_elo?: number
          calculated_at?: string
          competition_id?: string
          elo_after?: number
          elo_before?: number
          elo_change?: number
          final_rank?: number
          id?: string
          participants_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "inter_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_elo_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_league_rounds: {
        Row: {
          competition_id: string
          completed_at: string | null
          created_at: string
          id: string
          round_number: number
          started_at: string | null
          status: string
          title: string | null
          wod_id: string | null
        }
        Insert: {
          competition_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number: number
          started_at?: string | null
          status?: string
          title?: string | null
          wod_id?: string | null
        }
        Update: {
          competition_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          round_number?: number
          started_at?: string | null
          status?: string
          title?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_league_rounds_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_league_rounds_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "inter_competition_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_league_standings: {
        Row: {
          athlete_id: string
          competition_id: string
          id: string
          podiums: number
          rounds_played: number
          team_id: string | null
          total_points: number
          updated_at: string
          wins: number
        }
        Insert: {
          athlete_id: string
          competition_id: string
          id?: string
          podiums?: number
          rounds_played?: number
          team_id?: string | null
          total_points?: number
          updated_at?: string
          wins?: number
        }
        Update: {
          athlete_id?: string
          competition_id?: string
          id?: string
          podiums?: number
          rounds_played?: number
          team_id?: string | null
          total_points?: number
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "inter_league_standings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_league_standings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_league_standings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_league_standings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "inter_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_pool_groups: {
        Row: {
          advance_count: number
          competition_id: string
          created_at: string
          group_index: number
          group_name: string
          id: string
        }
        Insert: {
          advance_count?: number
          competition_id: string
          created_at?: string
          group_index: number
          group_name: string
          id?: string
        }
        Update: {
          advance_count?: number
          competition_id?: string
          created_at?: string
          group_index?: number
          group_name?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_pool_groups_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_pool_matches: {
        Row: {
          athlete1_id: string
          athlete2_id: string
          competition_id: string
          completed_at: string | null
          created_at: string
          group_id: string
          id: string
          score1: number | null
          score2: number | null
          status: string
          winner_id: string | null
          wod_id: string | null
        }
        Insert: {
          athlete1_id: string
          athlete2_id: string
          competition_id: string
          completed_at?: string | null
          created_at?: string
          group_id: string
          id?: string
          score1?: number | null
          score2?: number | null
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Update: {
          athlete1_id?: string
          athlete2_id?: string
          competition_id?: string
          completed_at?: string | null
          created_at?: string
          group_id?: string
          id?: string
          score1?: number | null
          score2?: number | null
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_pool_matches_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "inter_pool_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_matches_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "inter_competition_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_pool_members: {
        Row: {
          athlete_id: string
          draws: number
          group_id: string
          id: string
          losses: number
          points: number
          score_against: number
          score_for: number
          wins: number
        }
        Insert: {
          athlete_id: string
          draws?: number
          group_id: string
          id?: string
          losses?: number
          points?: number
          score_against?: number
          score_for?: number
          wins?: number
        }
        Update: {
          athlete_id?: string
          draws?: number
          group_id?: string
          id?: string
          losses?: number
          points?: number
          score_against?: number
          score_for?: number
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "inter_pool_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_pool_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "inter_pool_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_registrations: {
        Row: {
          athlete_id: string | null
          box_id: string | null
          competition_id: string | null
          id: string
          registered_at: string | null
          status: string
          team_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          box_id?: string | null
          competition_id?: string | null
          id?: string
          registered_at?: string | null
          status?: string
          team_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          box_id?: string | null
          competition_id?: string | null
          id?: string
          registered_at?: string | null
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_registrations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_registrations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_registrations_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_registrations_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "inter_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_scores: {
        Row: {
          athlete_id: string | null
          competition_id: string | null
          id: string
          notes: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score_display: string | null
          score_value: number | null
          status: string
          submitted_at: string | null
          team_id: string | null
          video_local_uri: string | null
          video_url: string | null
          wod_id: string | null
        }
        Insert: {
          athlete_id?: string | null
          competition_id?: string | null
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_display?: string | null
          score_value?: number | null
          status?: string
          submitted_at?: string | null
          team_id?: string | null
          video_local_uri?: string | null
          video_url?: string | null
          wod_id?: string | null
        }
        Update: {
          athlete_id?: string | null
          competition_id?: string | null
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score_display?: string | null
          score_value?: number | null
          status?: string
          submitted_at?: string | null
          team_id?: string | null
          video_local_uri?: string | null
          video_url?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "inter_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "inter_competition_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_swiss_pairings: {
        Row: {
          athlete1_id: string | null
          athlete2_id: string | null
          competition_id: string
          created_at: string | null
          id: string
          round_id: string
          score1: number | null
          score2: number | null
          status: string
          winner_id: string | null
          wod_id: string | null
        }
        Insert: {
          athlete1_id?: string | null
          athlete2_id?: string | null
          competition_id: string
          created_at?: string | null
          id?: string
          round_id: string
          score1?: number | null
          score2?: number | null
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Update: {
          athlete1_id?: string | null
          athlete2_id?: string | null
          competition_id?: string
          created_at?: string | null
          id?: string
          round_id?: string
          score1?: number | null
          score2?: number | null
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_swiss_pairings_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "inter_swiss_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_pairings_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "inter_competition_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_swiss_rounds: {
        Row: {
          competition_id: string
          completed_at: string | null
          created_at: string | null
          id: string
          round_number: number
          status: string
        }
        Insert: {
          competition_id: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          round_number?: number
          status?: string
        }
        Update: {
          competition_id?: string
          completed_at?: string | null
          created_at?: string | null
          id?: string
          round_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_swiss_rounds_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_swiss_standings: {
        Row: {
          athlete_id: string
          buchholz: number
          competition_id: string
          created_at: string | null
          draws: number
          id: string
          losses: number
          points: number
          rounds_played: number
          updated_at: string | null
          wins: number
        }
        Insert: {
          athlete_id: string
          buchholz?: number
          competition_id: string
          created_at?: string | null
          draws?: number
          id?: string
          losses?: number
          points?: number
          rounds_played?: number
          updated_at?: string | null
          wins?: number
        }
        Update: {
          athlete_id?: string
          buchholz?: number
          competition_id?: string
          created_at?: string | null
          draws?: number
          id?: string
          losses?: number
          points?: number
          rounds_played?: number
          updated_at?: string | null
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "inter_swiss_standings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_standings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_swiss_standings_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_team_members: {
        Row: {
          answered_at: string | null
          id: string
          invited_at: string | null
          status: string
          team_id: string | null
          user_id: string | null
        }
        Insert: {
          answered_at?: string | null
          id?: string
          invited_at?: string | null
          status?: string
          team_id?: string | null
          user_id?: string | null
        }
        Update: {
          answered_at?: string | null
          id?: string
          invited_at?: string | null
          status?: string
          team_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "inter_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      inter_teams: {
        Row: {
          box_id: string | null
          captain_id: string | null
          competition_id: string | null
          created_at: string | null
          id: string
          name: string
          status: string
        }
        Insert: {
          box_id?: string | null
          captain_id?: string | null
          competition_id?: string | null
          created_at?: string | null
          id?: string
          name: string
          status?: string
        }
        Update: {
          box_id?: string | null
          captain_id?: string | null
          competition_id?: string | null
          created_at?: string | null
          id?: string
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inter_teams_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_teams_captain_id_fkey"
            columns: ["captain_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_teams_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          athlete1_id: string | null
          athlete1_score: number | null
          athlete1_validated: boolean | null
          athlete1_video_url: string | null
          athlete2_id: string | null
          athlete2_score: number | null
          athlete2_validated: boolean | null
          athlete2_video_url: string | null
          created_at: string | null
          elo_change: number | null
          id: string
          status: string
          winner_id: string | null
          wod_id: string | null
        }
        Insert: {
          athlete1_id?: string | null
          athlete1_score?: number | null
          athlete1_validated?: boolean | null
          athlete1_video_url?: string | null
          athlete2_id?: string | null
          athlete2_score?: number | null
          athlete2_validated?: boolean | null
          athlete2_video_url?: string | null
          created_at?: string | null
          elo_change?: number | null
          id?: string
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Update: {
          athlete1_id?: string | null
          athlete1_score?: number | null
          athlete1_validated?: boolean | null
          athlete1_video_url?: string | null
          athlete2_id?: string | null
          athlete2_score?: number | null
          athlete2_validated?: boolean | null
          athlete2_video_url?: string | null
          created_at?: string | null
          elo_change?: number | null
          id?: string
          status?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_athlete1_id_fkey"
            columns: ["athlete1_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "wods"
            referencedColumns: ["id"]
          },
        ]
      }
      matchmaking_queue: {
        Row: {
          created_at: string
          elo: number
          id: string
          level: string
          match_id: string | null
          opponent_elo: number | null
          opponent_level: string | null
          opponent_username: string | null
          user_id: string
          username: string
          wod_data: Json | null
        }
        Insert: {
          created_at?: string
          elo: number
          id?: string
          level: string
          match_id?: string | null
          opponent_elo?: number | null
          opponent_level?: string | null
          opponent_username?: string | null
          user_id: string
          username: string
          wod_data?: Json | null
        }
        Update: {
          created_at?: string
          elo?: number
          id?: string
          level?: string
          match_id?: string | null
          opponent_elo?: number | null
          opponent_level?: string | null
          opponent_username?: string | null
          user_id?: string
          username?: string
          wod_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "matchmaking_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matchmaking_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      member_class_credits: {
        Row: {
          box_id: string
          created_at: string
          credits_total: number
          credits_used: number
          expires_at: string
          id: string
          member_id: string
          plan_id: string | null
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent: string | null
        }
        Insert: {
          box_id: string
          created_at?: string
          credits_total: number
          credits_used?: number
          expires_at: string
          id?: string
          member_id: string
          plan_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent?: string | null
        }
        Update: {
          box_id?: string
          created_at?: string
          credits_total?: number
          credits_used?: number
          expires_at?: string
          id?: string
          member_id?: string
          plan_id?: string | null
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "member_class_credits_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_class_credits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_class_credits_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_class_credits_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_cancellation_requests: {
        Row: {
          box_id: string
          created_at: string
          document_path: string | null
          id: string
          member_id: string
          message: string | null
          reason_type: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          box_id: string
          created_at?: string
          document_path?: string | null
          id?: string
          member_id: string
          message?: string | null
          reason_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          box_id?: string
          created_at?: string
          document_path?: string | null
          id?: string
          member_id?: string
          message?: string | null
          reason_type?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_cancellation_requests_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_cancellation_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_cancellation_requests_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_cancellation_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_cancellation_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plan_groups: {
        Row: {
          group_id: string
          plan_id: string
        }
        Insert: {
          group_id: string
          plan_id: string
        }
        Update: {
          group_id?: string
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_plan_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_group_members"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "membership_plan_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "membership_plan_groups_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_plans: {
        Row: {
          box_id: string
          color: string
          commitment_months: number
          created_at: string | null
          credits: number | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          max_sessions_per_week: number | null
          name: string
          plan_type: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          terms: string | null
          validity_days: number | null
        }
        Insert: {
          box_id: string
          color?: string
          commitment_months?: number
          created_at?: string | null
          credits?: number | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_sessions_per_week?: number | null
          name: string
          plan_type?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          terms?: string | null
          validity_days?: number | null
        }
        Update: {
          box_id?: string
          color?: string
          commitment_months?: number
          created_at?: string | null
          credits?: number | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_sessions_per_week?: number | null
          name?: string
          plan_type?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          terms?: string | null
          validity_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_plans_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_promo_codes: {
        Row: {
          amount_off_cents: number | null
          box_id: string
          code: string
          created_at: string
          currency: string
          discount_type: string
          duration: string
          duration_in_months: number | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          percent_off: number | null
          stripe_coupon_id: string | null
          stripe_promotion_code_id: string | null
        }
        Insert: {
          amount_off_cents?: number | null
          box_id: string
          code: string
          created_at?: string
          currency?: string
          discount_type?: string
          duration?: string
          duration_in_months?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          percent_off?: number | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
        }
        Update: {
          amount_off_cents?: number | null
          box_id?: string
          code?: string
          created_at?: string
          currency?: string
          discount_type?: string
          duration?: string
          duration_in_months?: number | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          percent_off?: number | null
          stripe_coupon_id?: string | null
          stripe_promotion_code_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_promo_codes_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      message_groups: {
        Row: {
          box_id: string | null
          color: string | null
          created_at: string | null
          created_by: string | null
          id: string
          members: string[]
          name: string
          wod_visibility_mode: string
        }
        Insert: {
          box_id?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          members: string[]
          name: string
          wod_visibility_mode?: string
        }
        Update: {
          box_id?: string | null
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          members?: string[]
          name?: string
          wod_visibility_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_groups_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          member_id: string | null
          message_id: string | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          member_id?: string | null
          message_id?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          member_id?: string | null
          message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      message_replies: {
        Row: {
          box_id: string | null
          content: string
          created_at: string | null
          id: string
          parent_message_id: string | null
          sender_id: string | null
        }
        Insert: {
          box_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          parent_message_id?: string | null
          sender_id?: string | null
        }
        Update: {
          box_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          parent_message_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_replies_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_replies_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_replies_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_replies_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          box_id: string | null
          content: string
          created_at: string | null
          group_id: string | null
          id: string
          is_announcement: boolean | null
          message_type: string | null
          read_by: string[] | null
          receiver_id: string | null
          sender_id: string | null
        }
        Insert: {
          attachment_url?: string | null
          box_id?: string | null
          content: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_announcement?: boolean | null
          message_type?: string | null
          read_by?: string[] | null
          receiver_id?: string | null
          sender_id?: string | null
        }
        Update: {
          attachment_url?: string | null
          box_id?: string | null
          content?: string
          created_at?: string | null
          group_id?: string | null
          id?: string
          is_announcement?: boolean | null
          message_type?: string | null
          read_by?: string[] | null
          receiver_id?: string | null
          sender_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_group_members"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_logs: {
        Row: {
          id: string
          logged_at: string | null
          movement: string
          source_id: string | null
          source_type: string
          total_reps: number
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          id?: string
          logged_at?: string | null
          movement: string
          source_id?: string | null
          source_type?: string
          total_reps?: number
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          id?: string
          logged_at?: string | null
          movement?: string
          source_id?: string | null
          source_type?: string
          total_reps?: number
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "movement_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_rep_counts: {
        Row: {
          athlete_id: string
          id: string
          last_updated: string
          movement_key: string
          movement_label: string
          total_reps: number
        }
        Insert: {
          athlete_id: string
          id?: string
          last_updated?: string
          movement_key: string
          movement_label: string
          total_reps?: number
        }
        Update: {
          athlete_id?: string
          id?: string
          last_updated?: string
          movement_key?: string
          movement_label?: string
          total_reps?: number
        }
        Relationships: [
          {
            foreignKeyName: "movement_rep_counts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_rep_counts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          badge_unlocks: boolean | null
          box_announcements: boolean | null
          class_reminders: boolean | null
          created_at: string | null
          daily_reminder: boolean | null
          elo_updates: boolean | null
          friend_requests: boolean | null
          group_messages: boolean | null
          new_wod: boolean | null
          notifications_enabled: boolean | null
          reminder_hour: number | null
          score_comments: boolean | null
          score_reactions: boolean | null
          score_reminder: boolean | null
          score_updates: boolean | null
          tournament_updates: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          badge_unlocks?: boolean | null
          box_announcements?: boolean | null
          class_reminders?: boolean | null
          created_at?: string | null
          daily_reminder?: boolean | null
          elo_updates?: boolean | null
          friend_requests?: boolean | null
          group_messages?: boolean | null
          new_wod?: boolean | null
          notifications_enabled?: boolean | null
          reminder_hour?: number | null
          score_comments?: boolean | null
          score_reactions?: boolean | null
          score_reminder?: boolean | null
          score_updates?: boolean | null
          tournament_updates?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          badge_unlocks?: boolean | null
          box_announcements?: boolean | null
          class_reminders?: boolean | null
          created_at?: string | null
          daily_reminder?: boolean | null
          elo_updates?: boolean | null
          friend_requests?: boolean | null
          group_messages?: boolean | null
          new_wod?: boolean | null
          notifications_enabled?: boolean | null
          reminder_hour?: number | null
          score_comments?: boolean | null
          score_reactions?: boolean | null
          score_reminder?: boolean | null
          score_updates?: boolean | null
          tournament_updates?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      owner_subscriptions: {
        Row: {
          box_quota: number
          created_at: string
          current_period_end: string | null
          id: string
          owner_id: string
          plan_tier: string
          status: string
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          box_quota?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          owner_id: string
          plan_tier?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          box_quota?: number
          created_at?: string
          current_period_end?: string | null
          id?: string
          owner_id?: string
          plan_tier?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: true
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          instagram_url: string | null
          is_active: boolean | null
          logo_url: string | null
          name: string
          offer_code: string | null
          offer_description: string | null
          offer_title: string | null
          sort_order: number | null
          website_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          offer_code?: string | null
          offer_description?: string | null
          offer_title?: string | null
          sort_order?: number | null
          website_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          instagram_url?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          offer_code?: string | null
          offer_description?: string | null
          offer_title?: string | null
          sort_order?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      pending_entitlements: {
        Row: {
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          email: string
          id: string
          kind: string
          payload: Json
          stripe_checkout_session_id: string | null
        }
        Insert: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          email: string
          id?: string
          kind: string
          payload: Json
          stripe_checkout_session_id?: string | null
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          email?: string
          id?: string
          kind?: string
          payload?: Json
          stripe_checkout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_entitlements_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_entitlements_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      personal_records: {
        Row: {
          achieved_at: string | null
          athlete_id: string | null
          id: string
          movement: string
          unit: string
          value: number
        }
        Insert: {
          achieved_at?: string | null
          athlete_id?: string | null
          id?: string
          movement: string
          unit: string
          value: number
        }
        Update: {
          achieved_at?: string | null
          athlete_id?: string | null
          id?: string
          movement?: string
          unit?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "personal_records_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personal_records_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      physical_competitions: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string | null
          description: string | null
          end_date: string | null
          end_time: string | null
          format: string | null
          has_individual: boolean | null
          has_team: boolean | null
          id: string
          individual_genders: Json | null
          location: string | null
          logo_url: string | null
          mode: string
          name: string
          price: string | null
          registration_url: string | null
          start_date: string | null
          start_time: string | null
          status: string
          team_genders: Json | null
          team_size: number | null
          team_sizes: Json | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          format?: string | null
          has_individual?: boolean | null
          has_team?: boolean | null
          id?: string
          individual_genders?: Json | null
          location?: string | null
          logo_url?: string | null
          mode?: string
          name: string
          price?: string | null
          registration_url?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string
          team_genders?: Json | null
          team_size?: number | null
          team_sizes?: Json | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string | null
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          format?: string | null
          has_individual?: boolean | null
          has_team?: boolean | null
          id?: string
          individual_genders?: Json | null
          location?: string | null
          logo_url?: string | null
          mode?: string
          name?: string
          price?: string | null
          registration_url?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string
          team_genders?: Json | null
          team_size?: number | null
          team_sizes?: Json | null
        }
        Relationships: []
      }
      physical_wods: {
        Row: {
          competition_id: string
          created_at: string | null
          description: string | null
          id: string
          interval_seconds: number | null
          max_time: number | null
          name: string
          order_index: number | null
          rest_time: number | null
          rounds: number | null
          timer_type: string
          total_seconds: number
          with_camera: boolean | null
          work_time: number | null
        }
        Insert: {
          competition_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          interval_seconds?: number | null
          max_time?: number | null
          name: string
          order_index?: number | null
          rest_time?: number | null
          rounds?: number | null
          timer_type?: string
          total_seconds?: number
          with_camera?: boolean | null
          work_time?: number | null
        }
        Update: {
          competition_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          interval_seconds?: number | null
          max_time?: number | null
          name?: string
          order_index?: number | null
          rest_time?: number | null
          rounds?: number | null
          timer_type?: string
          total_seconds?: number
          with_camera?: boolean | null
          work_time?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "physical_wods_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "physical_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          elo: number
          email: string
          featured_badges: string[]
          full_name: string | null
          gender: string | null
          id: string
          level: string
          losses: number
          personal_records: Json | null
          referral_code: string | null
          referred_by: string | null
          role: string
          total_friends: number
          total_matches: number
          total_messages_sent: number
          total_scores_submitted: number
          total_timer_sessions: number
          total_tournament_wins: number
          total_tournaments: number
          total_wods_generated: number
          username: string
          wins: number
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          elo?: number
          email: string
          featured_badges?: string[]
          full_name?: string | null
          gender?: string | null
          id: string
          level?: string
          losses?: number
          personal_records?: Json | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          total_friends?: number
          total_matches?: number
          total_messages_sent?: number
          total_scores_submitted?: number
          total_timer_sessions?: number
          total_tournament_wins?: number
          total_tournaments?: number
          total_wods_generated?: number
          username: string
          wins?: number
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          elo?: number
          email?: string
          featured_badges?: string[]
          full_name?: string | null
          gender?: string | null
          id?: string
          level?: string
          losses?: number
          personal_records?: Json | null
          referral_code?: string | null
          referred_by?: string | null
          role?: string
          total_friends?: number
          total_matches?: number
          total_messages_sent?: number
          total_scores_submitted?: number
          total_timer_sessions?: number
          total_tournament_wins?: number
          total_tournaments?: number
          total_wods_generated?: number
          username?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      program_affiliates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      program_members: {
        Row: {
          amount_cents: number | null
          id: string
          platform_fee_cents: number | null
          program_id: string
          provenance: string
          purchased_at: string | null
          start_date: string
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_payment_intent: string | null
          stripe_subscription_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          id?: string
          platform_fee_cents?: number | null
          program_id: string
          provenance: string
          purchased_at?: string | null
          start_date: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent?: string | null
          stripe_subscription_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          id?: string
          platform_fee_cents?: number | null
          program_id?: string
          provenance?: string
          purchased_at?: string | null
          start_date?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_payment_intent?: string | null
          stripe_subscription_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_members_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          box_id: string
          created_at: string | null
          currency: string
          days_per_week: number | null
          description: string | null
          duration_weeks: number | null
          id: string
          image_url: string | null
          invite_code: string
          is_active: boolean | null
          owner_id: string | null
          price_cents: number
          stripe_price_id: string | null
          stripe_product_id: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          box_id: string
          created_at?: string | null
          currency?: string
          days_per_week?: number | null
          description?: string | null
          duration_weeks?: number | null
          id?: string
          image_url?: string | null
          invite_code: string
          is_active?: boolean | null
          owner_id?: string | null
          price_cents: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          box_id?: string
          created_at?: string | null
          currency?: string
          days_per_week?: number | null
          description?: string | null
          duration_weeks?: number | null
          id?: string
          image_url?: string | null
          invite_code?: string
          is_active?: boolean | null
          owner_id?: string | null
          price_cents?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          admin_notes: string | null
          content_id: string | null
          content_type: string
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_user_id: string | null
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          admin_notes?: string | null
          content_id?: string | null
          content_type: string
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_user_id?: string | null
          reporter_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          admin_notes?: string | null
          content_id?: string | null
          content_type?: string
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_user_id?: string | null
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_templates: {
        Row: {
          box_id: string | null
          coach: string | null
          created_at: string | null
          day_of_week: number
          description: string | null
          end_time: string
          id: string
          is_active: boolean
          max_capacity: number
          start_time: string
          title: string
        }
        Insert: {
          box_id?: string | null
          coach?: string | null
          created_at?: string | null
          day_of_week: number
          description?: string | null
          end_time: string
          id?: string
          is_active?: boolean
          max_capacity?: number
          start_time: string
          title: string
        }
        Update: {
          box_id?: string | null
          coach?: string | null
          created_at?: string | null
          day_of_week?: number
          description?: string | null
          end_time?: string
          id?: string
          is_active?: boolean
          max_capacity?: number
          start_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "schedule_templates_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      score_comments: {
        Row: {
          author_id: string | null
          box_id: string | null
          content: string
          created_at: string | null
          id: string
          score_id: string | null
        }
        Insert: {
          author_id?: string | null
          box_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          score_id?: string | null
        }
        Update: {
          author_id?: string | null
          box_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          score_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_comments_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_comments_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "wod_scores"
            referencedColumns: ["id"]
          },
        ]
      }
      score_reactions: {
        Row: {
          created_at: string | null
          emoji: string
          id: string
          score_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          emoji: string
          id?: string
          score_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: string
          score_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "score_reactions_score_id_fkey"
            columns: ["score_id"]
            isOneToOne: false
            referencedRelation: "wod_scores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      scores: {
        Row: {
          athlete_id: string
          created_at: string | null
          id: string
          match_id: string | null
          unit: string
          validated: boolean | null
          validated_at: string | null
          validated_by: string | null
          value: number
          video_url: string | null
          wod_id: string | null
        }
        Insert: {
          athlete_id: string
          created_at?: string | null
          id?: string
          match_id?: string | null
          unit: string
          validated?: boolean | null
          validated_at?: string | null
          validated_by?: string | null
          value: number
          video_url?: string | null
          wod_id?: string | null
        }
        Update: {
          athlete_id?: string
          created_at?: string | null
          id?: string
          match_id?: string | null
          unit?: string
          validated?: boolean | null
          validated_at?: string | null
          validated_by?: string | null
          value?: number
          video_url?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "wods"
            referencedColumns: ["id"]
          },
        ]
      }
      session_followups: {
        Row: {
          box_id: string
          converted_plan_id: string | null
          created_at: string
          feedback_comment: string | null
          first_seen_at: string
          id: string
          member_id: string
          rating: number | null
          reminder_d1_sent: boolean
          reminder_d3_sent: boolean
          reminder_h_sent: boolean
          reservation_id: string | null
          responded_at: string | null
          schedule_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          box_id: string
          converted_plan_id?: string | null
          created_at?: string
          feedback_comment?: string | null
          first_seen_at?: string
          id?: string
          member_id: string
          rating?: number | null
          reminder_d1_sent?: boolean
          reminder_d3_sent?: boolean
          reminder_h_sent?: boolean
          reservation_id?: string | null
          responded_at?: string | null
          schedule_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          box_id?: string
          converted_plan_id?: string | null
          created_at?: string
          feedback_comment?: string | null
          first_seen_at?: string
          id?: string
          member_id?: string
          rating?: number | null
          reminder_d1_sent?: boolean
          reminder_d3_sent?: boolean
          reminder_h_sent?: boolean
          reservation_id?: string | null
          responded_at?: string | null
          schedule_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_followups_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_followups_converted_plan_id_fkey"
            columns: ["converted_plan_id"]
            isOneToOne: false
            referencedRelation: "membership_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_followups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_followups_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_followups_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "class_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_followups_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "class_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      strength_set_logs: {
        Row: {
          id: string
          load_kg: number | null
          movement: string
          movement_label: string | null
          performed_at: string
          prescribed_load_kg: number | null
          prescribed_reps: number | null
          reps: number
          set_index: number
          source_id: string
          source_title: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          id?: string
          load_kg?: number | null
          movement: string
          movement_label?: string | null
          performed_at?: string
          prescribed_load_kg?: number | null
          prescribed_reps?: number | null
          reps: number
          set_index: number
          source_id: string
          source_title?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          id?: string
          load_kg?: number | null
          movement?: string
          movement_label?: string | null
          performed_at?: string
          prescribed_load_kg?: number | null
          prescribed_reps?: number | null
          reps?: number
          set_index?: number
          source_id?: string
          source_title?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "strength_set_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "strength_set_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      support_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          sender_role: string
          ticket_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_role?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          admin_unread: boolean
          box_id: string
          created_at: string
          created_by: string
          id: string
          last_message_at: string
          requester_unread: boolean
          status: string
          subject: string
          type: string
        }
        Insert: {
          admin_unread?: boolean
          box_id: string
          created_at?: string
          created_by: string
          id?: string
          last_message_at?: string
          requester_unread?: boolean
          status?: string
          subject: string
          type?: string
        }
        Update: {
          admin_unread?: boolean
          box_id?: string
          created_at?: string
          created_by?: string
          id?: string
          last_message_at?: string
          requester_unread?: boolean
          status?: string
          subject?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_bracket_matches: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          loser_id: string | null
          match_number: number
          notes: string | null
          participant1_id: string | null
          participant2_id: string | null
          round: number
          scheduled_at: string | null
          side: string
          status: string
          tournament_id: string
          winner_id: string | null
          wod_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          loser_id?: string | null
          match_number: number
          notes?: string | null
          participant1_id?: string | null
          participant2_id?: string | null
          round: number
          scheduled_at?: string | null
          side?: string
          status?: string
          tournament_id: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          loser_id?: string | null
          match_number?: number
          notes?: string | null
          participant1_id?: string | null
          participant2_id?: string | null
          round?: number
          scheduled_at?: string | null
          side?: string
          status?: string
          tournament_id?: string
          winner_id?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_bracket_matches_loser_id_fkey"
            columns: ["loser_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_loser_id_fkey"
            columns: ["loser_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_participant2_id_fkey"
            columns: ["participant2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_participant2_id_fkey"
            columns: ["participant2_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_bracket_matches_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "tournament_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_division_members: {
        Row: {
          athlete_id: string
          division_id: string
          id: string
          joined_at: string
          points: number
          rank: number | null
        }
        Insert: {
          athlete_id: string
          division_id: string
          id?: string
          joined_at?: string
          points?: number
          rank?: number | null
        }
        Update: {
          athlete_id?: string
          division_id?: string
          id?: string
          joined_at?: string
          points?: number
          rank?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_division_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_division_members_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_division_members_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "tournament_divisions"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_divisions: {
        Row: {
          created_at: string
          id: string
          level: number
          max_members: number
          name: string
          promote_count: number
          relegate_count: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          level: number
          max_members?: number
          name: string
          promote_count?: number
          relegate_count?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          level?: number
          max_members?: number
          name?: string
          promote_count?: number
          relegate_count?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_elo_history: {
        Row: {
          athlete_id: string
          avg_opponent_elo: number
          calculated_at: string
          elo_after: number
          elo_before: number
          elo_change: number
          final_rank: number
          id: string
          participants_count: number
          tournament_id: string
        }
        Insert: {
          athlete_id: string
          avg_opponent_elo: number
          calculated_at?: string
          elo_after: number
          elo_before: number
          elo_change: number
          final_rank: number
          id?: string
          participants_count: number
          tournament_id: string
        }
        Update: {
          athlete_id?: string
          avg_opponent_elo?: number
          calculated_at?: string
          elo_after?: number
          elo_before?: number
          elo_change?: number
          final_rank?: number
          id?: string
          participants_count?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_elo_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_match_elo_history: {
        Row: {
          athlete_id: string
          created_at: string
          elo_after: number
          elo_before: number
          elo_delta: number
          id: string
          match_id: string
          opponent_id: string | null
          result: string
          tournament_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          elo_after: number
          elo_before: number
          elo_delta: number
          id?: string
          match_id: string
          opponent_id?: string | null
          result: string
          tournament_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          match_id?: string
          opponent_id?: string | null
          result?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_match_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_match_elo_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "tournament_bracket_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_notifications_sent: {
        Row: {
          athlete_id: string
          id: string
          kind: string
          sent_at: string
          tournament_id: string
          wod_id: string | null
        }
        Insert: {
          athlete_id: string
          id?: string
          kind: string
          sent_at?: string
          tournament_id: string
          wod_id?: string | null
        }
        Update: {
          athlete_id?: string
          id?: string
          kind?: string
          sent_at?: string
          tournament_id?: string
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_notifications_sent_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_notifications_sent_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "tournament_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_participants: {
        Row: {
          athlete_id: string
          id: string
          registered_at: string | null
          score: number | null
          tournament_id: string
        }
        Insert: {
          athlete_id: string
          id?: string
          registered_at?: string | null
          score?: number | null
          tournament_id: string
        }
        Update: {
          athlete_id?: string
          id?: string
          registered_at?: string | null
          score?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_participants_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_scores: {
        Row: {
          admin_message: string | null
          ai_analysis: string | null
          athlete_id: string
          capped: boolean
          deadline_at: string | null
          elo_points: number
          id: string
          notes: string | null
          score_value: string
          status: string
          submitted_at: string
          tiebreak_value: number | null
          tournament_id: string
          tournament_wod_id: string
          validated_at: string | null
          validated_by: string | null
          video_url: string | null
        }
        Insert: {
          admin_message?: string | null
          ai_analysis?: string | null
          athlete_id: string
          capped?: boolean
          deadline_at?: string | null
          elo_points?: number
          id?: string
          notes?: string | null
          score_value: string
          status?: string
          submitted_at?: string
          tiebreak_value?: number | null
          tournament_id: string
          tournament_wod_id: string
          validated_at?: string | null
          validated_by?: string | null
          video_url?: string | null
        }
        Update: {
          admin_message?: string | null
          ai_analysis?: string | null
          athlete_id?: string
          capped?: boolean
          deadline_at?: string | null
          elo_points?: number
          id?: string
          notes?: string | null
          score_value?: string
          status?: string
          submitted_at?: string
          tiebreak_value?: number | null
          tournament_id?: string
          tournament_wod_id?: string
          validated_at?: string | null
          validated_by?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_tournament_wod_id_fkey"
            columns: ["tournament_wod_id"]
            isOneToOne: false
            referencedRelation: "tournament_wods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_season_history: {
        Row: {
          athlete_id: string
          closed_at: string
          division_id: string | null
          division_level: number
          division_name: string
          final_points: number
          final_rank: number
          id: string
          outcome: string
          season_number: number
          tournament_id: string
        }
        Insert: {
          athlete_id: string
          closed_at?: string
          division_id?: string | null
          division_level: number
          division_name: string
          final_points?: number
          final_rank: number
          id?: string
          outcome: string
          season_number: number
          tournament_id: string
        }
        Update: {
          athlete_id?: string
          closed_at?: string
          division_id?: string | null
          division_level?: number
          division_name?: string
          final_points?: number
          final_rank?: number
          id?: string
          outcome?: string
          season_number?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_season_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_season_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_season_history_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "tournament_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_season_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_wod_elo_history: {
        Row: {
          athlete_id: string
          created_at: string
          division_id: string | null
          elo_after: number
          elo_before: number
          elo_delta: number
          id: string
          rank: number
          tournament_id: string
          tournament_wod_id: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          division_id?: string | null
          elo_after: number
          elo_before: number
          elo_delta: number
          id?: string
          rank: number
          tournament_id: string
          tournament_wod_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          division_id?: string | null
          elo_after?: number
          elo_before?: number
          elo_delta?: number
          id?: string
          rank?: number
          tournament_id?: string
          tournament_wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_wod_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_wod_elo_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_wod_elo_history_tournament_wod_id_fkey"
            columns: ["tournament_wod_id"]
            isOneToOne: false
            referencedRelation: "tournament_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_wods: {
        Row: {
          bracket_stage: number | null
          closes_at: string | null
          created_at: string
          deadline_hours: number
          description: string | null
          division_id: string | null
          duration_minutes: number
          id: string
          movements: Json
          opens_at: string | null
          order_index: number
          reps_per_round: number | null
          rest_seconds: number | null
          rounds: number | null
          scoring: string
          season_number: number
          status: string
          time_cap_seconds: number | null
          timer_type: string | null
          title: string
          tournament_id: string
          type: string
          work_seconds: number | null
        }
        Insert: {
          bracket_stage?: number | null
          closes_at?: string | null
          created_at?: string
          deadline_hours?: number
          description?: string | null
          division_id?: string | null
          duration_minutes?: number
          id?: string
          movements?: Json
          opens_at?: string | null
          order_index?: number
          reps_per_round?: number | null
          rest_seconds?: number | null
          rounds?: number | null
          scoring?: string
          season_number?: number
          status?: string
          time_cap_seconds?: number | null
          timer_type?: string | null
          title: string
          tournament_id: string
          type: string
          work_seconds?: number | null
        }
        Update: {
          bracket_stage?: number | null
          closes_at?: string | null
          created_at?: string
          deadline_hours?: number
          description?: string | null
          division_id?: string | null
          duration_minutes?: number
          id?: string
          movements?: Json
          opens_at?: string | null
          order_index?: number
          reps_per_round?: number | null
          rest_seconds?: number | null
          rounds?: number | null
          scoring?: string
          season_number?: number
          status?: string
          time_cap_seconds?: number | null
          timer_type?: string | null
          title?: string
          tournament_id?: string
          type?: string
          work_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tournament_wods_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "tournament_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_wods_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          banner_url: string | null
          box_id: string | null
          created_at: string | null
          created_by: string | null
          current_season: number
          description: string | null
          end_date: string | null
          final_wod_pool: string[]
          format: string
          gender_target: string | null
          id: string
          level: string
          max_participants: number
          name: string
          prize: string | null
          require_video_proof: boolean
          rules: string | null
          start_date: string | null
          status: string
        }
        Insert: {
          banner_url?: string | null
          box_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_season?: number
          description?: string | null
          end_date?: string | null
          final_wod_pool?: string[]
          format?: string
          gender_target?: string | null
          id?: string
          level: string
          max_participants?: number
          name: string
          prize?: string | null
          require_video_proof?: boolean
          rules?: string | null
          start_date?: string | null
          status?: string
        }
        Update: {
          banner_url?: string | null
          box_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_season?: number
          description?: string | null
          end_date?: string | null
          final_wod_pool?: string[]
          format?: string
          gender_target?: string | null
          id?: string
          level?: string
          max_participants?: number
          name?: string
          prize?: string | null
          require_video_proof?: boolean
          rules?: string | null
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      user_generation_settings: {
        Row: {
          avoid_zones: Json
          goal: string
          gym_declaration: Json
          last_params: Json | null
          level_adjust: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avoid_zones?: Json
          goal?: string
          gym_declaration?: Json
          last_params?: Json | null
          level_adjust?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          avoid_zones?: Json
          goal?: string
          gym_declaration?: Json
          last_params?: Json | null
          level_adjust?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_movement_prefs: {
        Row: {
          movement: string
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          movement: string
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          movement?: string
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_movement_stats: {
        Row: {
          best_weight: number | null
          movement: string
          total_reps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          best_weight?: number | null
          movement: string
          total_reps?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          best_weight?: number | null
          movement?: string
          total_reps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_movement_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_movement_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      user_races: {
        Row: {
          category: string
          created_at: string
          format: string
          id: string
          name: string
          race_date: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          format?: string
          id?: string
          name: string
          race_date: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          format?: string
          id?: string
          name?: string
          race_date?: string
          user_id?: string
        }
        Relationships: []
      }
      user_wod_feedback: {
        Row: {
          action: string
          created_at: string
          id: string
          is_challenge: boolean
          movements: string[]
          params: Json
          rank: number | null
          reason: string | null
          rpe: string | null
          seed: number
          signature: string
          sport: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          is_challenge?: boolean
          movements?: string[]
          params?: Json
          rank?: number | null
          reason?: string | null
          rpe?: string | null
          seed: number
          signature: string
          sport: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          is_challenge?: boolean
          movements?: string[]
          params?: Json
          rank?: number | null
          reason?: string | null
          rpe?: string | null
          seed?: number
          signature?: string
          sport?: string
          user_id?: string
        }
        Relationships: []
      }
      wod_completions: {
        Row: {
          box_id: string
          completed_at: string
          id: string
          member_id: string
          wod_id: string
        }
        Insert: {
          box_id: string
          completed_at?: string
          id?: string
          member_id: string
          wod_id: string
        }
        Update: {
          box_id?: string
          completed_at?: string
          id?: string
          member_id?: string
          wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wod_completions_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_completions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_completions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_completions_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      wod_group_access: {
        Row: {
          group_id: string
          id: string
          wod_id: string
        }
        Insert: {
          group_id: string
          id?: string
          wod_id: string
        }
        Update: {
          group_id?: string
          id?: string
          wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wod_group_access_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_group_members"
            referencedColumns: ["group_id"]
          },
          {
            foreignKeyName: "wod_group_access_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "message_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_group_access_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      wod_program_access: {
        Row: {
          id: string
          program_id: string
          wod_id: string
        }
        Insert: {
          id?: string
          program_id: string
          wod_id: string
        }
        Update: {
          id?: string
          program_id?: string
          wod_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wod_program_access_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_program_access_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      wod_scores: {
        Row: {
          box_id: string | null
          capped: boolean
          id: string
          member_id: string | null
          notes: string | null
          rx: boolean | null
          scaled: boolean | null
          score_type: string | null
          score_value: number
          submitted_at: string | null
          video_url: string | null
          wod_id: string | null
        }
        Insert: {
          box_id?: string | null
          capped?: boolean
          id?: string
          member_id?: string | null
          notes?: string | null
          rx?: boolean | null
          scaled?: boolean | null
          score_type?: string | null
          score_value: number
          submitted_at?: string | null
          video_url?: string | null
          wod_id?: string | null
        }
        Update: {
          box_id?: string | null
          capped?: boolean
          id?: string
          member_id?: string | null
          notes?: string | null
          rx?: boolean | null
          scaled?: boolean | null
          score_type?: string | null
          score_value?: number
          submitted_at?: string | null
          video_url?: string | null
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wod_scores_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wod_scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      wods: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number
          equipment: string[] | null
          id: string
          level: string
          movements: Json
          scoring: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          equipment?: string[] | null
          id?: string
          level: string
          movements?: Json
          scoring: string
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          equipment?: string[] | null
          id?: string
          level?: string
          movements?: Json
          scoring?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "wods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inter_standings: {
        Row: {
          athlete_id: string | null
          box_name: string | null
          competition_id: string | null
          level: string | null
          rank: number | null
          score_display: string | null
          score_value: number | null
          scoring_type: string | null
          status: string | null
          submitted_at: string | null
          team_id: string | null
          username: string | null
          wod_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inter_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "inter_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "inter_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inter_scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "inter_competition_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      message_group_members: {
        Row: {
          box_id: string | null
          group_id: string | null
          member_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_groups_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_totals: {
        Row: {
          lifetime_reps: number | null
          movement: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movement_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_leaderboard"
            referencedColumns: ["id"]
          },
        ]
      }
      public_leaderboard: {
        Row: {
          avatar_url: string | null
          elo: number | null
          id: string | null
          level: string | null
          losses: number | null
          role: string | null
          total_matches: number | null
          username: string | null
          wins: number | null
        }
        Insert: {
          avatar_url?: string | null
          elo?: number | null
          id?: string | null
          level?: string | null
          losses?: number | null
          role?: string | null
          total_matches?: number | null
          username?: string | null
          wins?: number | null
        }
        Update: {
          avatar_url?: string | null
          elo?: number | null
          id?: string | null
          level?: string | null
          losses?: number | null
          role?: string | null
          total_matches?: number | null
          username?: string | null
          wins?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      _consume_box_invitation: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      _daily_official_template: {
        Args: { p_date: string }
        Returns: {
          duration: number
          movements: string
          score_mode: string
          wod_name: string
          wod_type: string
        }[]
      }
      _log_box_cash_payment: {
        Args: {
          p_amount_cents?: number
          p_box_id: string
          p_invitation_id: string
          p_label?: string
          p_member_id: string
          p_plan_id: string
          p_program_id?: string
          p_source: string
        }
        Returns: string
      }
      _upsert_program_member: {
        Args: {
          p_amount_cents?: number
          p_platform_fee_cents?: number
          p_program_id: string
          p_provenance: string
          p_start_date: string
          p_stripe_checkout_session_id?: string
          p_stripe_payment_intent?: string
          p_stripe_subscription_id?: string
          p_user_id: string
        }
        Returns: string
      }
      accept_box_invitation_after_payment: {
        Args: { p_invitation_id: string; p_user_id: string }
        Returns: Json
      }
      advance_bracket_round: {
        Args: { p_completed_round: number; p_tournament_id: string }
        Returns: number
      }
      advance_inter_bracket_round: {
        Args: { p_competition_id: string; p_completed_round: number }
        Returns: number
      }
      apply_program_week: {
        Args: {
          p_group_ids?: string[]
          p_replace?: boolean
          p_source_id: string
          p_source_kind: string
          p_target_monday: string
          p_week: number
        }
        Returns: Json
      }
      assign_program_cash: {
        Args: {
          p_amount_cents: number
          p_program_id: string
          p_start_date?: string
          p_user_id: string
        }
        Returns: Json
      }
      badge_condition_met: {
        Args: { p_athlete_id: string; p_badge_key: string }
        Returns: boolean
      }
      book_appointment_slot: { Args: { p_slot_id: string }; Returns: string }
      box_subscribes_programming: {
        Args: { p_programming_id: string }
        Returns: boolean
      }
      bump_ai_usage: {
        Args: { p_kind: string; p_limit: number; p_user: string }
        Returns: boolean
      }
      calculate_elo: {
        Args: { k_factor?: number; loser_elo: number; winner_elo: number }
        Returns: {
          elo_change: number
          new_loser_elo: number
          new_winner_elo: number
        }[]
      }
      can_join_daily_tournament: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      can_join_inter_competition: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      can_join_tournament: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      check_daily_limit: {
        Args: { p_box_id: string; p_date: string; p_user_id: string }
        Returns: Json
      }
      check_weekly_limit:
        | { Args: { p_box_id: string; p_user_id: string }; Returns: Json }
        | {
            Args: {
              p_box_id: string
              p_target_date?: string
              p_user_id: string
            }
            Returns: Json
          }
      claim_badge: { Args: { p_badge_key: string }; Returns: Json }
      claim_pending_entitlements: {
        Args: { p_email: string; p_user_id: string }
        Returns: number
      }
      complete_daily_tournament: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      compute_box_elo: {
        Args: { p_wod_id: string }
        Returns: {
          elo_after: number
          elo_before: number
          elo_delta: number
          member_id: string
          rank: number
        }[]
      }
      compute_daily_tournament_elo: {
        Args: { p_tournament_id: string }
        Returns: {
          elo_after: number
          elo_before: number
          elo_delta: number
          final_rank: number
          user_id: string
        }[]
      }
      compute_inter_competition_elo: {
        Args: { p_competition_id: string }
        Returns: {
          athlete_id: string
          elo_after: number
          elo_before: number
          elo_change: number
          final_rank: number
        }[]
      }
      compute_inter_league_round: {
        Args: { p_competition_id: string; p_round_number: number }
        Returns: number
      }
      compute_league_wod_elo: {
        Args: { p_tournament_wod_id: string }
        Returns: {
          athlete_id: string
          division_id: string
          elo_after: number
          elo_before: number
          elo_delta: number
          rank: number
        }[]
      }
      compute_tournament_elo: {
        Args: { p_tournament_id: string }
        Returns: {
          athlete_id: string
          elo_after: number
          elo_before: number
          elo_change: number
          final_rank: number
        }[]
      }
      compute_wod_elo: {
        Args: { p_wod_id: string }
        Returns: {
          elo_after: number
          elo_before: number
          elo_delta: number
          member_id: string
          rank: number
        }[]
      }
      consume_box_invitation: { Args: { p_token: string }; Returns: Json }
      consume_box_invitation_for: {
        Args: { p_token: string; p_user_id: string }
        Returns: Json
      }
      count_program_week_conflicts: {
        Args: {
          p_source_id: string
          p_source_kind: string
          p_target_monday: string
          p_week: number
        }
        Returns: number
      }
      create_box_invitation: {
        Args: {
          p_box_id: string
          p_cash_collected?: boolean
          p_email: string
          p_first_name?: string
          p_last_name?: string
          p_payment_mode?: string
          p_plan_id?: string
          p_valid_days?: number
        }
        Returns: Json
      }
      create_box_invitations_bulk: {
        Args: { p_box_id: string; p_rows: Json; p_valid_days?: number }
        Returns: Json
      }
      delete_user_account: { Args: never; Returns: undefined }
      delete_week_template: {
        Args: { p_template_id: string }
        Returns: boolean
      }
      detect_trial_followups: { Args: never; Returns: number }
      end_season_and_advance: {
        Args: { p_tournament_id: string }
        Returns: number
      }
      ensure_daily_official_wod: { Args: never; Returns: string }
      extend_all_class_schedules: { Args: never; Returns: number }
      generate_bracket_round_1: {
        Args: { p_tournament_id: string }
        Returns: number
      }
      generate_class_schedules_from_templates: {
        Args: { p_box_id: string; p_weeks_ahead?: number }
        Returns: number
      }
      generate_inter_bracket_round_1: {
        Args: { p_competition_id: string }
        Returns: number
      }
      generate_inter_pool_groups: {
        Args: {
          p_advance_count?: number
          p_competition_id: string
          p_groups_count?: number
        }
        Returns: number
      }
      generate_inter_swiss_round: {
        Args: { p_competition_id: string }
        Returns: number
      }
      get_athlete_private_profile: {
        Args: { p_user_id: string }
        Returns: {
          avatar_url: string
          elo: number
          full_name: string
          gender: string
          id: string
          level: string
          personal_records: Json
          username: string
        }[]
      }
      get_box_attendance_people: {
        Args: { p_box_id: string; p_risk_days?: number }
        Returns: {
          joined_at: string
          kind: string
          last_class: string
          member_id: string
          reservations_total: number
          username: string
        }[]
      }
      get_box_attendance_summary: {
        Args: { p_box_id: string; p_from: string; p_to: string }
        Returns: {
          attended_count: number
          capacity_total: number
          classes_count: number
          marked_count: number
          members_active: number
          members_at_risk: number
          members_ever_booked: number
          members_never_booked: number
          reservations_count: number
          waiting_count: number
        }[]
      }
      get_box_billing: {
        Args: { p_box_id: string }
        Returns: {
          amount_cents: number
          commitment_end_date: string
          has_stripe_sub: boolean
          id: string
          joined_at: string
          member_id: string
          pause_resumes_at: string
          pause_started_at: string
          plan_id: string
          platform_fee_cents: number
          role: string
          status: string
          subscription_cancel_at_period_end: boolean
          subscription_current_period_end: string
          subscription_paused: boolean
          subscription_status: string
        }[]
      }
      get_box_dunning: {
        Args: { p_box_id: string }
        Returns: {
          amount_cents: number
          dunning_attempts: number
          dunning_last_reminder_at: string
          dunning_reminders_sent: number
          email: string
          grace_days: number
          has_stripe_sub: boolean
          id: string
          last_payment_error: string
          past_due_since: string
          payment_method_type: string
          plan_name: string
          suspended: boolean
          username: string
        }[]
      }
      get_box_funnel_summary: {
        Args: { p_box_id: string; p_from: string; p_to: string }
        Returns: {
          invitations_accepted: number
          invitations_sent: number
          members_joined: number
          members_subscribed: number
          prospects: number
          prospects_converted: number
        }[]
      }
      get_box_mate_ids: { Args: never; Returns: string[] }
      get_box_member_emails: {
        Args: { p_box_id: string }
        Returns: {
          email: string
          member_id: string
        }[]
      }
      get_box_members_private_profiles: {
        Args: { p_box_id: string }
        Returns: {
          avatar_url: string
          elo: number
          full_name: string
          gender: string
          level: string
          member_id: string
          personal_records: Json
          username: string
        }[]
      }
      get_box_money_people: {
        Args: { p_box_id: string }
        Returns: {
          amount_cents: number
          detail: string
          email: string
          kind: string
          label: string
          member_id: string
          ref_id: string
          since: string
        }[]
      }
      get_box_money_summary: {
        Args: { p_box_id: string; p_from: string; p_to: string }
        Returns: {
          cancellations_period: number
          cash_collected_cents: number
          cash_collected_count: number
          cash_to_collect_cents: number
          cash_to_collect_count: number
          mrr_cash_cents: number
          mrr_cash_subs: number
          mrr_stripe_cents: number
          mrr_stripe_subs: number
          new_subs_period: number
          past_due_cents: number
          past_due_count: number
          program_revenue_cents: number
          program_sales_period: number
        }[]
      }
      get_box_plan_breakdown: {
        Args: { p_box_id: string }
        Returns: {
          mrr_cents: number
          plan_color: string
          plan_id: string
          plan_name: string
          price_cents: number
          subs: number
        }[]
      }
      get_box_reservation_heatmap: {
        Args: { p_box_id: string; p_from: string; p_to: string }
        Returns: {
          dow: number
          hour: number
          reservations: number
        }[]
      }
      get_my_admin_boxes: {
        Args: never
        Returns: {
          allowed_tournament_formats: string[]
          city: string
          created_at: string
          id: string
          is_active: boolean
          logo_url: string
          my_role: string
          name: string
          owner_id: string
          slug: string
        }[]
      }
      get_my_box_invite_code: { Args: { p_box_id: string }; Returns: string }
      get_my_membership_billing: {
        Args: never
        Returns: {
          amount_cents: number
          box_id: string
          commitment_end_date: string
          id: string
          joined_at: string
          pause_resumes_at: string
          plan_id: string
          status: string
          subscription_cancel_at_period_end: boolean
          subscription_current_period_end: string
          subscription_paused: boolean
          subscription_status: string
        }[]
      }
      get_my_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          elo: number
          email: string
          featured_badges: string[]
          full_name: string | null
          gender: string | null
          id: string
          level: string
          losses: number
          personal_records: Json | null
          referral_code: string | null
          referred_by: string | null
          role: string
          total_friends: number
          total_matches: number
          total_messages_sent: number
          total_scores_submitted: number
          total_timer_sessions: number
          total_tournament_wins: number
          total_tournaments: number
          total_wods_generated: number
          username: string
          wins: number
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_total_box_count: { Args: never; Returns: number }
      get_tournament_participants: {
        Args: { p_tournament_id: string }
        Returns: {
          athlete_id: string
          score: number
        }[]
      }
      get_tournament_validated_scores: {
        Args: { p_tournament_id: string }
        Returns: {
          athlete_id: string
          score_value: string
          tournament_wod_id: string
        }[]
      }
      get_user_box_ids: { Args: never; Returns: string[] }
      get_weekly_digest_batch: {
        Args: { p_days?: number }
        Returns: {
          attendances: number
          box_id: string
          box_name: string
          members_at_risk: number
          new_members: number
          owner_email: string
          owner_id: string
          past_due_count: number
        }[]
      }
      increment_movement_stats: {
        Args: {
          p_movement: string
          p_reps: number
          p_user_id: string
          p_weight?: number
        }
        Returns: undefined
      }
      invitation_target_blocker: {
        Args: { p_box_id: string; p_email: string }
        Returns: string
      }
      is_blocked_pair: { Args: { u1: string; u2: string }; Returns: boolean }
      is_box_admin: { Args: { p_box_id: string }; Returns: boolean }
      is_box_admin_of_athlete: {
        Args: { p_athlete_id: string }
        Returns: boolean
      }
      is_box_coach: { Args: { p_box_id: string }; Returns: boolean }
      is_box_member: { Args: { p_box_id: string }; Returns: boolean }
      is_box_owner: { Args: { p_box_id: string }; Returns: boolean }
      is_box_owner_admin: { Args: { p_box_id: string }; Returns: boolean }
      is_box_owner_member: { Args: { p_box_id: string }; Returns: boolean }
      is_box_staff: { Args: { p_box_id: string }; Returns: boolean }
      is_inter_competition_manager: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      is_privileged_backend: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_support_admin: { Args: never; Returns: boolean }
      is_tournament_manager: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      join_box_by_invite: { Args: { p_invite_code: string }; Returns: string }
      join_program: {
        Args: {
          p_amount_cents?: number
          p_platform_fee_cents?: number
          p_program_id: string
          p_source: string
          p_start_date?: string
          p_stripe_checkout_session_id?: string
          p_stripe_payment_intent?: string
          p_stripe_subscription_id?: string
          p_user_id?: string
        }
        Returns: string
      }
      list_applicable_programmings: {
        Args: { p_box_id: string }
        Returns: {
          auto_apply_weekly: boolean
          current_period_end: string
          days_per_week: number
          programming_id: string
          publisher_box_name: string
          subscription_id: string
          title: string
          weeks_count: number
        }[]
      }
      list_athlete_strength_sets: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          id: string
          load_kg: number
          movement: string
          movement_label: string
          performed_at: string
          prescribed_load_kg: number
          prescribed_reps: number
          reps: number
          set_index: number
          source_id: string
          source_title: string
          source_type: string
        }[]
      }
      list_program_week_conflicts: {
        Args: {
          p_source_id: string
          p_source_kind: string
          p_target_monday: string
          p_week: number
        }
        Returns: {
          has_results: boolean
          origin: string
          origin_title: string
          scheduled_date: string
          title: string
          wod_id: string
        }[]
      }
      list_week_templates: {
        Args: { p_box_id: string }
        Returns: {
          days_count: number
          template_id: string
          title: string
          updated_at: string
          wods_count: number
        }[]
      }
      manages_box: { Args: { p_box_id: string }; Returns: boolean }
      manages_box_funnel: { Args: { p_box_id: string }; Returns: boolean }
      mark_box_invitation_paid: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      mark_box_invitation_sent: {
        Args: { p_error?: string; p_invitation_id: string }
        Returns: Json
      }
      materialize_box_programming: {
        Args: { p_target_monday?: string }
        Returns: number
      }
      owner_box_count: { Args: { p_owner_id: string }; Returns: number }
      peek_box_invitation: { Args: { p_token: string }; Returns: Json }
      peer_review_daily_score: {
        Args: {
          p_action: string
          p_reason?: string
          p_tournament_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      promote_relegate_divisions: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      reactivate_box_member: {
        Args: { p_box_id: string; p_member_id: string }
        Returns: boolean
      }
      recalc_division_points: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      record_member_cash_payment: {
        Args: { p_box_member_id: string }
        Returns: Json
      }
      report_content: {
        Args: {
          p_content_id: string
          p_content_type: string
          p_details?: string
          p_reason: string
          p_reported_user_id: string
        }
        Returns: string
      }
      request_is_backend: { Args: never; Returns: boolean }
      resolve_box_invitation_for_checkout: {
        Args: { p_token: string }
        Returns: Json
      }
      resolve_inter_pool_match: {
        Args: {
          p_match_id: string
          p_score1: number
          p_score2: number
          p_scoring_type?: string
        }
        Returns: undefined
      }
      resolve_inter_swiss_pairing: {
        Args: {
          p_pairing_id: string
          p_score1: number
          p_score2: number
          p_scoring_type?: string
        }
        Returns: undefined
      }
      resolve_program_week_source: {
        Args: { p_source_id: string; p_source_kind: string; p_week: number }
        Returns: {
          box_id: string
          created_by: string
          programming_id: string
        }[]
      }
      revoke_box_invitation: {
        Args: { p_invitation_id: string }
        Returns: Json
      }
      rotate_box_invitation_token: {
        Args: { p_invitation_id: string; p_valid_days?: number }
        Returns: Json
      }
      save_week_as_template: {
        Args: {
          p_box_id: string
          p_source_monday: string
          p_template_id?: string
          p_title?: string
        }
        Returns: Json
      }
      submit_followup_feedback: {
        Args: { p_comment?: string; p_followup_id: string; p_rating: number }
        Returns: undefined
      }
      subscribe_free_programming: {
        Args: { p_programming_id: string; p_subscriber_box_id: string }
        Returns: Json
      }
      sync_tournament_activation: { Args: never; Returns: number }
      tournament_wod_accepts_scores: {
        Args: { p_tournament_id: string; p_wod_id: string }
        Returns: boolean
      }
      update_user_elo: {
        Args: {
          p_increment_matches?: number
          p_increment_wins?: number
          p_new_elo: number
          p_user_id: string
        }
        Returns: undefined
      }
      wod_access_allowed: { Args: { p_wod_id: string }; Returns: boolean }
      wod_in_my_active_program: { Args: { p_wod_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
