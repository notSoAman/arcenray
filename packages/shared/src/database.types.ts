export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      content_reports: {
        Row: {
          created_at: string;
          film_id: string | null;
          id: string;
          message_id: string | null;
          profile_id: string | null;
          reason: string;
          reporter_id: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          film_id?: string | null;
          id?: string;
          message_id?: string | null;
          profile_id?: string | null;
          reason: string;
          reporter_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          film_id?: string | null;
          id?: string;
          message_id?: string | null;
          profile_id?: string | null;
          reason?: string;
          reporter_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_reports_film_id_fkey";
            columns: ["film_id"];
            isOneToOne: false;
            referencedRelation: "films";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "messages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "content_reports_reporter_id_fkey";
            columns: ["reporter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          last_read_at: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          last_read_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          last_read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          user_high: string;
          user_low: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          user_high: string;
          user_low: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          user_high?: string;
          user_low?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_user_high_fkey";
            columns: ["user_high"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_user_low_fkey";
            columns: ["user_low"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      film_bookmarks: {
        Row: {
          created_at: string;
          film_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          film_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          film_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "film_bookmarks_film_id_fkey";
            columns: ["film_id"];
            isOneToOne: false;
            referencedRelation: "films";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "film_bookmarks_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      film_credits: {
        Row: {
          created_at: string;
          display_name: string;
          film_id: string;
          id: string;
          profile_id: string | null;
          role: string;
          verification_state: string;
          verified_at: string | null;
          verified_by: string | null;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          film_id: string;
          id?: string;
          profile_id?: string | null;
          role: string;
          verification_state?: string;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          film_id?: string;
          id?: string;
          profile_id?: string | null;
          role?: string;
          verification_state?: string;
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "film_credits_film_id_fkey";
            columns: ["film_id"];
            isOneToOne: false;
            referencedRelation: "films";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "film_credits_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "film_credits_verified_by_fkey";
            columns: ["verified_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      film_likes: {
        Row: {
          created_at: string;
          film_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          film_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          film_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "film_likes_film_id_fkey";
            columns: ["film_id"];
            isOneToOne: false;
            referencedRelation: "films";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "film_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      films: {
        Row: {
          created_at: string;
          duration_seconds: number | null;
          film_asset_id: string | null;
          film_key: string | null;
          genres: string[];
          hook_asset_id: string | null;
          hook_key: string | null;
          id: string;
          language: string | null;
          location_city: string | null;
          mood_tags: string[];
          owner_id: string;
          poster_asset_id: string | null;
          poster_key: string | null;
          provider_id: string | null;
          published_at: string | null;
          search_document: unknown;
          source: string;
          status: string;
          synopsis: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          duration_seconds?: number | null;
          film_asset_id?: string | null;
          film_key?: string | null;
          genres?: string[];
          hook_asset_id?: string | null;
          hook_key?: string | null;
          id?: string;
          language?: string | null;
          location_city?: string | null;
          mood_tags?: string[];
          owner_id: string;
          poster_asset_id?: string | null;
          poster_key?: string | null;
          provider_id?: string | null;
          published_at?: string | null;
          search_document?: unknown;
          source?: string;
          status?: string;
          synopsis?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          duration_seconds?: number | null;
          film_asset_id?: string | null;
          film_key?: string | null;
          genres?: string[];
          hook_asset_id?: string | null;
          hook_key?: string | null;
          id?: string;
          language?: string | null;
          location_city?: string | null;
          mood_tags?: string[];
          owner_id?: string;
          poster_asset_id?: string | null;
          poster_key?: string | null;
          provider_id?: string | null;
          published_at?: string | null;
          search_document?: unknown;
          source?: string;
          status?: string;
          synopsis?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "films_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          client_id: string;
          conversation_id: string;
          created_at: string;
          film_id: string | null;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          client_id?: string;
          conversation_id: string;
          created_at?: string;
          film_id?: string | null;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          client_id?: string;
          conversation_id?: string;
          created_at?: string;
          film_id?: string | null;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_film_id_fkey";
            columns: ["film_id"];
            isOneToOne: false;
            referencedRelation: "films";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profile_follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profile_follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "profile_follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          bio: string;
          created_at: string;
          full_name: string;
          handle: string;
          id: string;
          location_city: string | null;
          onboarding_completed: boolean;
          profile_pic_key: string | null;
          roles: string[];
          search_document: unknown;
          skills_gear: string[];
          updated_at: string;
        };
        Insert: {
          bio?: string;
          created_at?: string;
          full_name?: string;
          handle: string;
          id: string;
          location_city?: string | null;
          onboarding_completed?: boolean;
          profile_pic_key?: string | null;
          roles?: string[];
          search_document?: unknown;
          skills_gear?: string[];
          updated_at?: string;
        };
        Update: {
          bio?: string;
          created_at?: string;
          full_name?: string;
          handle?: string;
          id?: string;
          location_city?: string | null;
          onboarding_completed?: boolean;
          profile_pic_key?: string | null;
          roles?: string[];
          search_document?: unknown;
          skills_gear?: string[];
          updated_at?: string;
        };
        Relationships: [];
      };
      user_blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey";
            columns: ["blocked_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey";
            columns: ["blocker_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      backend_asset: { Args: { p_id: string; p_owner: string }; Returns: Json };
      backend_claim_expired_assets: {
        Args: never;
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      backend_duplicate_sources: {
        Args: never;
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      backend_expired_assets: {
        Args: never;
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "media_assets";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      backend_link_identity: {
        Args: { p_issuer: string; p_profile: string; p_subject: string };
        Returns: undefined;
      };
      backend_promote_asset: {
        Args: { p_id: string; p_owner: string };
        Returns: Json;
      };
      backend_rate_limit: {
        Args: { p_limit: number; p_operation: string; p_user: string };
        Returns: boolean;
      };
      backend_release_asset: { Args: { p_id: string }; Returns: undefined };
      backend_set_embedding: {
        Args: {
          p_embedding: string;
          p_hash: string;
          p_id: string;
          p_kind: string;
          p_owner: string;
          p_updated_at: string;
        };
        Returns: boolean;
      };
      backend_source_deleted: { Args: { p_id: string }; Returns: undefined };
      backend_verify_asset: {
        Args: {
          p_bytes: number;
          p_duration?: number;
          p_etag: string;
          p_height: number;
          p_id: string;
          p_owner: string;
          p_width: number;
        };
        Returns: Json;
      };
      current_profile_id: { Args: never; Returns: string };
      ensure_current_profile: { Args: never; Returns: string };
      get_loop_feed: {
        Args: { p_exclude_ids?: string[]; p_limit?: number };
        Returns: {
          created_at: string;
          duration_seconds: number | null;
          film_asset_id: string | null;
          film_key: string | null;
          genres: string[];
          hook_asset_id: string | null;
          hook_key: string | null;
          id: string;
          language: string | null;
          location_city: string | null;
          mood_tags: string[];
          owner_id: string;
          poster_asset_id: string | null;
          poster_key: string | null;
          provider_id: string | null;
          published_at: string | null;
          search_document: unknown;
          source: string;
          status: string;
          synopsis: string;
          title: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "films";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_my_asset: { Args: { p_asset_id: string }; Returns: Json };
      get_my_film_feedback: {
        Args: never;
        Returns: {
          film_id: string;
          preference: string;
        }[];
      };
      get_my_storage: { Args: never; Returns: Json };
      get_personalized_feed: {
        Args: { p_genre?: string; p_limit?: number; p_offset?: number };
        Returns: {
          created_at: string;
          duration_seconds: number | null;
          film_asset_id: string | null;
          film_key: string | null;
          genres: string[];
          hook_asset_id: string | null;
          hook_key: string | null;
          id: string;
          language: string | null;
          location_city: string | null;
          mood_tags: string[];
          owner_id: string;
          poster_asset_id: string | null;
          poster_key: string | null;
          provider_id: string | null;
          published_at: string | null;
          search_document: unknown;
          source: string;
          status: string;
          synopsis: string;
          title: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "films";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      hybrid_search: {
        Args: {
          p_city?: string;
          p_embedding?: string;
          p_genre?: string;
          p_kind?: string;
          p_limit?: number;
          p_query: string;
          p_role?: string;
        };
        Returns: {
          id: string;
          kind: string;
          score: number;
          summary: string;
          title: string;
        }[];
      };
      open_conversation: { Args: { p_other_user: string }; Returns: string };
      publish_film: {
        Args: { p_film_id: string };
        Returns: {
          created_at: string;
          duration_seconds: number | null;
          film_asset_id: string | null;
          film_key: string | null;
          genres: string[];
          hook_asset_id: string | null;
          hook_key: string | null;
          id: string;
          language: string | null;
          location_city: string | null;
          mood_tags: string[];
          owner_id: string;
          poster_asset_id: string | null;
          poster_key: string | null;
          provider_id: string | null;
          published_at: string | null;
          search_document: unknown;
          source: string;
          status: string;
          synopsis: string;
          title: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "films";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      record_event: {
        Args: {
          p_film_id: string;
          p_idempotency_key: string;
          p_kind: string;
          p_watch_seconds?: number;
        };
        Returns: undefined;
      };
      reserve_upload: {
        Args: { p_bytes: number; p_content_type: string; p_kind: string };
        Returns: Json;
      };
      respond_to_credit: {
        Args: { p_accept: boolean; p_credit_id: string };
        Returns: undefined;
      };
      set_film_feedback: {
        Args: { p_film_id: string; p_preference: string };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
