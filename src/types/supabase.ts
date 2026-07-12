export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
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
            foreignKeyName: "box_articles_box_id_fkey"
            columns: ["box_id"]
            isOneToOne: false
            referencedRelation: "boxes"
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
            foreignKeyName: "box_elo_history_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "box_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      box_members: {
        Row: {
          amount_cents: number | null
          box_id: string | null
          id: string
          joined_at: string | null
          member_id: string | null
          plan_id: string | null
          platform_fee_cents: number | null
          role: string
          status: string | null
          stripe_checkout_session_id: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
        }
        Insert: {
          amount_cents?: number | null
          box_id?: string | null
          id?: string
          joined_at?: string | null
          member_id?: string | null
          plan_id?: string | null
          platform_fee_cents?: number | null
          role?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
        }
        Update: {
          amount_cents?: number | null
          box_id?: string | null
          id?: string
          joined_at?: string | null
          member_id?: string | null
          plan_id?: string | null
          platform_fee_cents?: number | null
          role?: string
          status?: string | null
          stripe_checkout_session_id?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
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
        ]
      }
      class_reservations: {
        Row: {
          attended: boolean | null
          box_id: string | null
          created_at: string | null
          id: string
          member_id: string | null
          schedule_id: string | null
          status: string
        }
        Insert: {
          attended?: boolean | null
          box_id?: string | null
          created_at?: string | null
          id?: string
          member_id?: string | null
          schedule_id?: string | null
          status?: string
        }
        Update: {
          attended?: boolean | null
          box_id?: string | null
          created_at?: string | null
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
            foreignKeyName: "class_reservations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
        ]
      }
      daily_tournament_scores: {
        Row: {
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
        ]
      }
      daily_tournaments: {
        Row: {
          created_at: string | null
          creator_id: string
          duration: number
          elo_reward: number
          ends_at: string
          gender_target: string | null
          id: string
          level: string
          max_players: number
          movements: string
          score_mode: string
          scoring: string | null
          starts_at: string
          status: string
          wod_name: string
          wod_type: string
        }
        Insert: {
          created_at?: string | null
          creator_id: string
          duration?: number
          elo_reward?: number
          ends_at?: string
          gender_target?: string | null
          id?: string
          level?: string
          max_players?: number
          movements: string
          score_mode?: string
          scoring?: string | null
          starts_at?: string
          status?: string
          wod_name: string
          wod_type: string
        }
        Update: {
          created_at?: string | null
          creator_id?: string
          duration?: number
          elo_reward?: number
          ends_at?: string
          gender_target?: string | null
          id?: string
          level?: string
          max_players?: number
          movements?: string
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
            foreignKeyName: "friend_requests_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "inter_bracket_matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "inter_bracket_matches_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "inter_pool_matches_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          athlete1_id: string
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
          athlete1_id: string
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
          athlete1_id?: string
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
            foreignKeyName: "inter_swiss_pairings_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          athlete1_id: string
          athlete1_score: number | null
          athlete1_validated: boolean | null
          athlete1_video_url: string | null
          athlete2_id: string
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
          athlete1_id: string
          athlete1_score?: number | null
          athlete1_validated?: boolean | null
          athlete1_video_url?: string | null
          athlete2_id: string
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
          athlete1_id?: string
          athlete1_score?: number | null
          athlete1_validated?: boolean | null
          athlete1_video_url?: string | null
          athlete2_id?: string
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
            foreignKeyName: "matches_athlete2_id_fkey"
            columns: ["athlete2_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          max_sessions_per_week: number | null
          name: string
          price_cents: number
          sort_order: number
          stripe_price_id: string | null
          stripe_product_id: string | null
        }
        Insert: {
          box_id: string
          color?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_sessions_per_week?: number | null
          name: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
        }
        Update: {
          box_id?: string
          color?: string
          created_at?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_sessions_per_week?: number | null
          name?: string
          price_cents?: number
          sort_order?: number
          stripe_price_id?: string | null
          stripe_product_id?: string | null
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
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mini_tournaments: {
        Row: {
          created_at: string | null
          created_by: string | null
          day: string
          id: string
          level: string
          max_participants: number
          name: string
          status: string
          wod_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          day?: string
          id?: string
          level: string
          max_participants?: number
          name: string
          status?: string
          wod_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          day?: string
          id?: string
          level?: string
          max_participants?: number
          name?: string
          status?: string
          wod_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mini_tournaments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mini_tournaments_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "wods"
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
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          daily_reminder: boolean | null
          friend_requests: boolean | null
          reminder_hour: number | null
          score_comments: boolean | null
          score_reactions: boolean | null
          score_updates: boolean | null
          tournament_updates: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_reminder?: boolean | null
          friend_requests?: boolean | null
          reminder_hour?: number | null
          score_comments?: boolean | null
          score_reactions?: boolean | null
          score_updates?: boolean | null
          tournament_updates?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_reminder?: boolean | null
          friend_requests?: boolean | null
          reminder_hour?: number | null
          score_comments?: boolean | null
          score_reactions?: boolean | null
          score_updates?: boolean | null
          tournament_updates?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      program_scores: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          program_wod_id: string
          rx: boolean | null
          score_type: string
          score_value: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          program_wod_id: string
          rx?: boolean | null
          score_type?: string
          score_value: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          program_wod_id?: string
          rx?: boolean | null
          score_type?: string
          score_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_scores_program_wod_id_fkey"
            columns: ["program_wod_id"]
            isOneToOne: false
            referencedRelation: "program_wods"
            referencedColumns: ["id"]
          },
        ]
      }
      program_wods: {
        Row: {
          created_at: string | null
          day_number: number | null
          description: string
          id: string
          notes: string | null
          program_id: string
          scheduled_date: string | null
          scoring_type: string | null
          sort_order: number | null
          time_cap_seconds: number | null
          title: string
          week_number: number | null
          wod_type: string | null
        }
        Insert: {
          created_at?: string | null
          day_number?: number | null
          description: string
          id?: string
          notes?: string | null
          program_id: string
          scheduled_date?: string | null
          scoring_type?: string | null
          sort_order?: number | null
          time_cap_seconds?: number | null
          title: string
          week_number?: number | null
          wod_type?: string | null
        }
        Update: {
          created_at?: string | null
          day_number?: number | null
          description?: string
          id?: string
          notes?: string | null
          program_id?: string
          scheduled_date?: string | null
          scoring_type?: string | null
          sort_order?: number | null
          time_cap_seconds?: number | null
          title?: string
          week_number?: number | null
          wod_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "program_wods_program_id_fkey"
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
          owner_id: string
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
          owner_id: string
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
          owner_id?: string
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
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "scores_wod_id_fkey"
            columns: ["wod_id"]
            isOneToOne: false
            referencedRelation: "wods"
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
            foreignKeyName: "tournament_bracket_matches_participant1_id_fkey"
            columns: ["participant1_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "tournament_elo_history_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
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
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_movement_stats: {
        Row: {
          best_weight: number | null
          movement: string
          total_reps: number
          user_id: string
        }
        Insert: {
          best_weight?: number | null
          movement: string
          total_reps?: number
          user_id: string
        }
        Update: {
          best_weight?: number | null
          movement?: string
          total_reps?: number
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
        ]
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
        ]
      }
    }
    Functions: {
      advance_bracket_round: {
        Args: { p_completed_round: number; p_tournament_id: string }
        Returns: number
      }
      advance_inter_bracket_round: {
        Args: { p_competition_id: string; p_completed_round: number }
        Returns: number
      }
      calculate_elo: {
        Args: { k_factor?: number; loser_elo: number; winner_elo: number }
        Returns: {
          elo_change: number
          new_loser_elo: number
          new_winner_elo: number
        }[]
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
      delete_user_account: { Args: never; Returns: undefined }
      end_season_and_advance: {
        Args: { p_tournament_id: string }
        Returns: number
      }
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
      get_box_mate_ids: { Args: never; Returns: string[] }
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
      get_user_box_id: { Args: never; Returns: string }
      get_user_box_ids: { Args: never; Returns: string[] }
      increment_movement_stats: {
        Args: {
          p_movement: string
          p_reps: number
          p_user_id: string
          p_weight?: number
        }
        Returns: undefined
      }
      is_blocked_pair: { Args: { u1: string; u2: string }; Returns: boolean }
      is_box_admin: { Args: { p_box_id: string }; Returns: boolean }
      is_box_coach: { Args: { p_box_id: string }; Returns: boolean }
      is_box_member: { Args: { p_box_id: string }; Returns: boolean }
      is_box_owner: { Args: { p_box_id: string }; Returns: boolean }
      is_box_owner_member: { Args: { p_box_id: string }; Returns: boolean }
      is_inter_competition_manager: {
        Args: { p_competition_id: string }
        Returns: boolean
      }
      is_privileged_backend: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tournament_manager: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      promote_relegate_divisions: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      recalc_division_points: {
        Args: { p_tournament_id: string }
        Returns: undefined
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
      update_user_elo: {
        Args: {
          p_increment_matches?: number
          p_increment_wins?: number
          p_new_elo: number
          p_user_id: string
        }
        Returns: undefined
      }
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

