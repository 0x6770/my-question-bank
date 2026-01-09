export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      answer_images: {
        Row: {
          created_at: string;
          id: number;
          position: number;
          question_id: number;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          position: number;
          question_id: number;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          position?: number;
          question_id?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "answer_images_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      chapters: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          parent_chapter_id: number | null;
          position: number;
          subject_id: number;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          parent_chapter_id?: number | null;
          position: number;
          subject_id: number;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          parent_chapter_id?: number | null;
          position?: number;
          subject_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "chapters_parent_chapter_id_fkey";
            columns: ["parent_chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "chapters_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_boards: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          question_bank: Database["public"]["Enums"]["question_bank"];
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          question_bank: Database["public"]["Enums"]["question_bank"];
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          question_bank?: Database["public"]["Enums"]["question_bank"];
        };
        Relationships: [];
      };
      exam_paper_tag_values: {
        Row: {
          created_at: string;
          exam_paper_id: number;
          tag_value_id: number;
        };
        Insert: {
          created_at?: string;
          exam_paper_id: number;
          tag_value_id: number;
        };
        Update: {
          created_at?: string;
          exam_paper_id?: number;
          tag_value_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_paper_tag_values_exam_paper_id_fkey";
            columns: ["exam_paper_id"];
            isOneToOne: false;
            referencedRelation: "exam_papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "exam_paper_tag_values_tag_value_id_fkey";
            columns: ["tag_value_id"];
            isOneToOne: false;
            referencedRelation: "subject_exam_tag_values";
            referencedColumns: ["id"];
          },
        ];
      };
      exam_papers: {
        Row: {
          created_at: string;
          id: number;
          mark_scheme_path: string | null;
          paper_code: string;
          paper_label: string;
          question_paper_path: string | null;
          season: string;
          subject_id: number;
          time_zone: string | null;
          updated_at: string;
          year: number;
        };
        Insert: {
          created_at?: string;
          id?: number;
          mark_scheme_path?: string | null;
          paper_code: string;
          paper_label: string;
          question_paper_path?: string | null;
          season: string;
          subject_id: number;
          time_zone?: string | null;
          updated_at?: string;
          year: number;
        };
        Update: {
          created_at?: string;
          id?: number;
          mark_scheme_path?: string | null;
          paper_code?: string;
          paper_label?: string;
          question_paper_path?: string | null;
          season?: string;
          subject_id?: number;
          time_zone?: string | null;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: "exam_papers_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      generated_paper_questions: {
        Row: {
          created_at: string | null;
          id: number;
          paper_id: number;
          position: number;
          question_id: number;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          paper_id: number;
          position: number;
          question_id: number;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          paper_id?: number;
          position?: number;
          question_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "generated_paper_questions_paper_id_fkey";
            columns: ["paper_id"];
            isOneToOne: false;
            referencedRelation: "generated_papers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "generated_paper_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      generated_papers: {
        Row: {
          created_at: string | null;
          id: number;
          question_bank: string;
          show_answers: boolean | null;
          title: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: number;
          question_bank: string;
          show_answers?: boolean | null;
          title?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: number;
          question_bank?: string;
          show_answers?: boolean | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_whitelisted: boolean;
          membership_expires_at: string | null;
          membership_tier: string;
          role: Database["public"]["Enums"]["user_role"];
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          is_whitelisted?: boolean;
          membership_expires_at?: string | null;
          membership_tier?: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_whitelisted?: boolean;
          membership_expires_at?: string | null;
          membership_tier?: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
      };
      question_chapters: {
        Row: {
          chapter_id: number;
          created_at: string;
          question_id: number;
        };
        Insert: {
          chapter_id: number;
          created_at?: string;
          question_id: number;
        };
        Update: {
          chapter_id?: number;
          created_at?: string;
          question_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_chapters_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_chapters_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      question_images: {
        Row: {
          created_at: string;
          id: number;
          position: number;
          question_id: number;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          position: number;
          question_id: number;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          position?: number;
          question_id?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: "question_images_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      question_tag_values: {
        Row: {
          created_at: string;
          question_id: number;
          subject_id: number;
          tag_value_id: number;
        };
        Insert: {
          created_at?: string;
          question_id: number;
          subject_id: number;
          tag_value_id: number;
        };
        Update: {
          created_at?: string;
          question_id?: number;
          subject_id?: number;
          tag_value_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "question_tag_values_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_tag_values_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "question_tag_values_tag_value_id_fkey";
            columns: ["tag_value_id"];
            isOneToOne: false;
            referencedRelation: "subject_question_tag_values";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: {
          calculator: boolean;
          created_at: string;
          difficulty: number;
          id: number;
          marks: number;
        };
        Insert: {
          calculator?: boolean;
          created_at?: string;
          difficulty?: number;
          id?: number;
          marks: number;
        };
        Update: {
          calculator?: boolean;
          created_at?: string;
          difficulty?: number;
          id?: number;
          marks?: number;
        };
        Relationships: [];
      };
      quota_configs: {
        Row: {
          basic_answer_period_days: number;
          basic_answer_quota: number;
          basic_paper_period_days: number;
          basic_paper_quota: number;
          free_answer_period_days: number;
          free_answer_quota: number;
          free_paper_period_days: number;
          free_paper_quota: number;
          id: number;
          premium_answer_period_days: number;
          premium_answer_quota: number;
          premium_paper_period_days: number;
          premium_paper_quota: number;
          updated_at: string;
        };
        Insert: {
          basic_answer_period_days?: number;
          basic_answer_quota?: number;
          basic_paper_period_days?: number;
          basic_paper_quota?: number;
          free_answer_period_days?: number;
          free_answer_quota?: number;
          free_paper_period_days?: number;
          free_paper_quota?: number;
          id?: number;
          premium_answer_period_days?: number;
          premium_answer_quota?: number;
          premium_paper_period_days?: number;
          premium_paper_quota?: number;
          updated_at?: string;
        };
        Update: {
          basic_answer_period_days?: number;
          basic_answer_quota?: number;
          basic_paper_period_days?: number;
          basic_paper_quota?: number;
          free_answer_period_days?: number;
          free_answer_quota?: number;
          free_paper_period_days?: number;
          free_paper_quota?: number;
          id?: number;
          premium_answer_period_days?: number;
          premium_answer_quota?: number;
          premium_paper_period_days?: number;
          premium_paper_quota?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      quota_overrides: {
        Row: {
          answer_period_days: number | null;
          answer_quota: number | null;
          created_at: string;
          created_by: string | null;
          notes: string | null;
          paper_period_days: number | null;
          paper_quota: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          answer_period_days?: number | null;
          answer_quota?: number | null;
          created_at?: string;
          created_by?: string | null;
          notes?: string | null;
          paper_period_days?: number | null;
          paper_quota?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answer_period_days?: number | null;
          answer_quota?: number | null;
          created_at?: string;
          created_by?: string | null;
          notes?: string | null;
          paper_period_days?: number | null;
          paper_quota?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      subject_exam_tag_values: {
        Row: {
          created_at: string;
          id: number;
          position: number;
          tag_id: number;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          position?: number;
          tag_id: number;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          position?: number;
          tag_id?: number;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_exam_tag_values_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "subject_exam_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      subject_exam_tags: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          position: number;
          required: boolean;
          subject_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          position?: number;
          required?: boolean;
          subject_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          position?: number;
          required?: boolean;
          subject_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_exam_tags_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      subject_question_tag_values: {
        Row: {
          created_at: string;
          id: number;
          position: number;
          tag_id: number;
          updated_at: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          position?: number;
          tag_id: number;
          updated_at?: string;
          value: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          position?: number;
          tag_id?: number;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_question_tag_values_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "subject_question_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      subject_question_tags: {
        Row: {
          created_at: string;
          id: number;
          is_system: boolean;
          name: string;
          position: number;
          required: boolean;
          subject_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          is_system?: boolean;
          name: string;
          position?: number;
          required?: boolean;
          subject_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          is_system?: boolean;
          name?: string;
          position?: number;
          required?: boolean;
          subject_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subject_question_tags_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
      subjects: {
        Row: {
          created_at: string;
          exam_board_id: number;
          id: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          exam_board_id: number;
          id?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          exam_board_id?: number;
          id?: number;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subjects_exam_board_id_fkey";
            columns: ["exam_board_id"];
            isOneToOne: false;
            referencedRelation: "exam_boards";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          created_at: string;
          id: number;
          name: string;
          parent_id: number | null;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
          parent_id?: number | null;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
          parent_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "tag_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      user_answer_quotas: {
        Row: {
          answers_viewed: number;
          current_period_questions: string[];
          quota_reset_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          answers_viewed?: number;
          current_period_questions?: string[];
          quota_reset_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          answers_viewed?: number;
          current_period_questions?: string[];
          quota_reset_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_paper_quotas: {
        Row: {
          current_period_papers: number[];
          papers_generated: number;
          quota_reset_at: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          current_period_papers?: number[];
          papers_generated?: number;
          quota_reset_at?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          current_period_papers?: number[];
          papers_generated?: number;
          quota_reset_at?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_questions: {
        Row: {
          answer_view_count: number | null;
          answer_viewed_at: string | null;
          completed_at: string | null;
          created_at: string;
          id: number;
          is_bookmarked: boolean;
          last_viewed_at: string | null;
          question_id: number | null;
          user_id: string;
        };
        Insert: {
          answer_view_count?: number | null;
          answer_viewed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: number;
          is_bookmarked?: boolean;
          last_viewed_at?: string | null;
          question_id?: number | null;
          user_id: string;
        };
        Update: {
          answer_view_count?: number | null;
          answer_viewed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          id?: number;
          is_bookmarked?: boolean;
          last_viewed_at?: string | null;
          question_id?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_questions_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id"];
          },
        ];
      };
      user_subject_access: {
        Row: {
          created_at: string;
          granted_by: string | null;
          subject_id: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          subject_id: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          subject_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_subject_access_subject_id_fkey";
            columns: ["subject_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      calculate_quota_reset_time: {
        Args: { p_period_days: number; p_user_id: string };
        Returns: string;
      };
      check_and_consume_answer_quota: {
        Args: { p_question_id: number; p_user_id: string };
        Returns: {
          code: string;
          message: string;
          reset_at: string;
          success: boolean;
          total: number;
          used: number;
        }[];
      };
      check_and_consume_paper_quota: {
        Args: { p_paper_id?: number; p_user_id: string };
        Returns: {
          code: string;
          message: string;
          reset_at: string;
          success: boolean;
          total: number;
          used: number;
        }[];
      };
      create_question_with_chapters: {
        Args: {
          p_calculator: boolean;
          p_chapter_ids: number[];
          p_difficulty: number;
          p_marks: number;
        };
        Returns: number;
      };
      create_question_with_chapters_and_tags: {
        Args: {
          p_calculator: boolean;
          p_chapter_ids: number[];
          p_difficulty: number;
          p_marks: number;
          p_tags: Json;
        };
        Returns: number;
      };
      get_user_membership_tier: {
        Args: { p_user_id: string };
        Returns: string;
      };
      get_user_quota_config: {
        Args: { p_quota_type: string; p_user_id: string };
        Returns: {
          is_exempt: boolean;
          period_days: number;
          quota: number;
        }[];
      };
      get_user_usage_summary: {
        Args: { p_user_id: string };
        Returns: {
          answer_quota_reset_at: string;
          answer_quota_total: number;
          answer_quota_used: number;
          is_whitelisted: boolean;
          membership_expires_at: string;
          membership_tier: string;
          paper_quota_reset_at: string;
          paper_quota_total: number;
          paper_quota_used: number;
          user_role: string;
        }[];
      };
      has_role: { Args: { target: string }; Returns: boolean };
      in_roles: {
        Args: { roles: Database["public"]["Enums"]["user_role"][] };
        Returns: boolean;
      };
      is_current_user_admin: { Args: never; Returns: boolean };
      track_answer_view: { Args: { q_id: number }; Returns: undefined };
      update_question_tags: {
        Args: { p_question_id: number; p_tags: Json };
        Returns: undefined;
      };
      update_question_tags_for_subject: {
        Args: {
          p_question_id: number;
          p_subject_id: number;
          p_tag_value_ids: number[];
        };
        Returns: undefined;
      };
      update_question_with_chapters: {
        Args: {
          p_calculator: boolean;
          p_chapter_ids: number[];
          p_difficulty: number;
          p_marks: number;
          p_question_id: number;
        };
        Returns: undefined;
      };
    };
    Enums: {
      question_bank:
        | "exam paper"
        | "past paper questions"
        | "topical questions";
      user_role: "super_admin" | "admin" | "user";
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      question_bank: [
        "exam paper",
        "past paper questions",
        "topical questions",
      ],
      user_role: ["super_admin", "admin", "user"],
    },
  },
} as const;
