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
      profiles: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
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
      questions: {
        Row: {
          calculator: boolean;
          chapter_id: number;
          created_at: string;
          difficulty: number;
          id: number;
          marks: number;
        };
        Insert: {
          calculator?: boolean;
          chapter_id: number;
          created_at?: string;
          difficulty?: number;
          id?: number;
          marks: number;
        };
        Update: {
          calculator?: boolean;
          chapter_id?: number;
          created_at?: string;
          difficulty?: number;
          id?: number;
          marks?: number;
        };
        Relationships: [
          {
            foreignKeyName: "questions_chapter_id_fkey";
            columns: ["chapter_id"];
            isOneToOne: false;
            referencedRelation: "chapters";
            referencedColumns: ["id"];
          },
        ];
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
      has_role: { Args: { target: string }; Returns: boolean };
      in_roles: {
        Args: { roles: Database["public"]["Enums"]["user_role"][] };
        Returns: boolean;
      };
      track_answer_view: { Args: { q_id: number }; Returns: undefined };
    };
    Enums: {
      question_bank:
        | "exam paper"
        | "past paper questions"
        | "typical questions";
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
        "typical questions",
      ],
      user_role: ["super_admin", "admin", "user"],
    },
  },
} as const;
