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
      exam_question_uploads: {
        Row: {
          created_at: string | null
          created_by: string | null
          error_message: string | null
          exam_id: string
          extracted_data: Json | null
          extracted_images: Json | null
          file_name: string
          file_type: string
          file_url: string
          flagged_questions: number | null
          id: string
          needs_review: boolean | null
          processed_at: string | null
          review_notes: string | null
          status: string | null
          total_questions: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          exam_id: string
          extracted_data?: Json | null
          extracted_images?: Json | null
          file_name: string
          file_type: string
          file_url: string
          flagged_questions?: number | null
          id?: string
          needs_review?: boolean | null
          processed_at?: string | null
          review_notes?: string | null
          status?: string | null
          total_questions?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          exam_id?: string
          extracted_data?: Json | null
          extracted_images?: Json | null
          file_name?: string
          file_type?: string
          file_url?: string
          flagged_questions?: number | null
          id?: string
          needs_review?: boolean | null
          processed_at?: string | null
          review_notes?: string | null
          status?: string | null
          total_questions?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_question_uploads_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_sessions: {
        Row: {
          blocked_at: string | null
          camera_heartbeat_at: string | null
          camera_status: string | null
          created_at: string | null
          end_time: string | null
          exam_status: string | null
          heartbeat_at: string | null
          id: string
          ip_address: string | null
          is_auto_submitted: boolean | null
          is_blocked: boolean | null
          is_completed: boolean | null
          latest_screen_url: string | null
          latest_snapshot_url: string | null
          proctoring_violations: Json | null
          registration_id: string
          resume_allowed_at: string | null
          snapshot_updated_at: string | null
          start_time: string | null
          submitted_at: string | null
          user_agent: string | null
          violation_count: number | null
        }
        Insert: {
          blocked_at?: string | null
          camera_heartbeat_at?: string | null
          camera_status?: string | null
          created_at?: string | null
          end_time?: string | null
          exam_status?: string | null
          heartbeat_at?: string | null
          id?: string
          ip_address?: string | null
          is_auto_submitted?: boolean | null
          is_blocked?: boolean | null
          is_completed?: boolean | null
          latest_screen_url?: string | null
          latest_snapshot_url?: string | null
          proctoring_violations?: Json | null
          registration_id: string
          resume_allowed_at?: string | null
          snapshot_updated_at?: string | null
          start_time?: string | null
          submitted_at?: string | null
          user_agent?: string | null
          violation_count?: number | null
        }
        Update: {
          blocked_at?: string | null
          camera_heartbeat_at?: string | null
          camera_status?: string | null
          created_at?: string | null
          end_time?: string | null
          exam_status?: string | null
          heartbeat_at?: string | null
          id?: string
          ip_address?: string | null
          is_auto_submitted?: boolean | null
          is_blocked?: boolean | null
          is_completed?: boolean | null
          latest_screen_url?: string | null
          latest_snapshot_url?: string | null
          proctoring_violations?: Json | null
          registration_id?: string
          resume_allowed_at?: string | null
          snapshot_updated_at?: string | null
          start_time?: string | null
          submitted_at?: string | null
          user_agent?: string | null
          violation_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_sessions_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: true
            referencedRelation: "registrations"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_subjects: {
        Row: {
          created_at: string | null
          display_order: number | null
          exam_id: string
          id: string
          subject_id: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          exam_id: string
          id?: string
          subject_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          exam_id?: string
          id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_subjects_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          approval_required: boolean | null
          auto_submit_on_violations: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number
          eligibility_category: string | null
          eligibility_class: string | null
          eligibility_year: string | null
          exam_code: string
          exam_date: string
          exam_name: string
          exam_time: string
          id: string
          instructions: string | null
          is_active: boolean | null
          liberty_level: string | null
          marks_per_question: number | null
          marks_per_wrong: number | null
          max_violations: number | null
          negative_mark_value: number | null
          negative_marking: boolean | null
          passing_marks: number | null
          photo_required: boolean | null
          proctoring_enabled: boolean | null
          registration_amount: number | null
          registration_end: string
          registration_start: string
          registration_type: string | null
          results_published: boolean | null
          results_published_at: string | null
          screen_recording_enabled: boolean | null
          signature_required: boolean | null
          status: Database["public"]["Enums"]["exam_status"] | null
          total_marks: number
          updated_at: string | null
          voice_monitoring_enabled: boolean | null
        }
        Insert: {
          approval_required?: boolean | null
          auto_submit_on_violations?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          eligibility_category?: string | null
          eligibility_class?: string | null
          eligibility_year?: string | null
          exam_code: string
          exam_date: string
          exam_name: string
          exam_time: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          liberty_level?: string | null
          marks_per_question?: number | null
          marks_per_wrong?: number | null
          max_violations?: number | null
          negative_mark_value?: number | null
          negative_marking?: boolean | null
          passing_marks?: number | null
          photo_required?: boolean | null
          proctoring_enabled?: boolean | null
          registration_amount?: number | null
          registration_end: string
          registration_start: string
          registration_type?: string | null
          results_published?: boolean | null
          results_published_at?: string | null
          screen_recording_enabled?: boolean | null
          signature_required?: boolean | null
          status?: Database["public"]["Enums"]["exam_status"] | null
          total_marks?: number
          updated_at?: string | null
          voice_monitoring_enabled?: boolean | null
        }
        Update: {
          approval_required?: boolean | null
          auto_submit_on_violations?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number
          eligibility_category?: string | null
          eligibility_class?: string | null
          eligibility_year?: string | null
          exam_code?: string
          exam_date?: string
          exam_name?: string
          exam_time?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          liberty_level?: string | null
          marks_per_question?: number | null
          marks_per_wrong?: number | null
          max_violations?: number | null
          negative_mark_value?: number | null
          negative_marking?: boolean | null
          passing_marks?: number | null
          photo_required?: boolean | null
          proctoring_enabled?: boolean | null
          registration_amount?: number | null
          registration_end?: string
          registration_start?: string
          registration_type?: string | null
          results_published?: boolean | null
          results_published_at?: string | null
          screen_recording_enabled?: boolean | null
          signature_required?: boolean | null
          status?: Database["public"]["Enums"]["exam_status"] | null
          total_marks?: number
          updated_at?: string | null
          voice_monitoring_enabled?: boolean | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          academic_year: string | null
          address: string | null
          board: string | null
          city: string | null
          class: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          mobile: string | null
          percentage: number | null
          photo_url: string | null
          pincode: string | null
          school_name: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          academic_year?: string | null
          address?: string | null
          board?: string | null
          city?: string | null
          class?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id: string
          mobile?: string | null
          percentage?: number | null
          photo_url?: string | null
          pincode?: string | null
          school_name?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_year?: string | null
          address?: string | null
          board?: string | null
          city?: string | null
          class?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          mobile?: string | null
          percentage?: number | null
          photo_url?: string | null
          pincode?: string | null
          school_name?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      question_images: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          image_type: string | null
          image_url: string
          option_key: string | null
          question_id: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_type?: string | null
          image_url: string
          option_key?: string | null
          question_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_type?: string | null
          image_url?: string
          option_key?: string | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_images_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          correct_option: string
          created_at: string | null
          exam_id: string
          id: string
          image_url: string | null
          marks: number
          needs_review: boolean | null
          ocr_confidence: number | null
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_number: number
          question_text: string
          review_status: string | null
          section_name: string
          subject_id: string | null
        }
        Insert: {
          correct_option: string
          created_at?: string | null
          exam_id: string
          id?: string
          image_url?: string | null
          marks?: number
          needs_review?: boolean | null
          ocr_confidence?: number | null
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          question_number: number
          question_text: string
          review_status?: string | null
          section_name: string
          subject_id?: string | null
        }
        Update: {
          correct_option?: string
          created_at?: string | null
          exam_id?: string
          id?: string
          image_url?: string | null
          marks?: number
          needs_review?: boolean | null
          ocr_confidence?: number | null
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          question_number?: number
          question_text?: string
          review_status?: string | null
          section_name?: string
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      registrations: {
        Row: {
          approval_remarks: string | null
          approval_status: Database["public"]["Enums"]["approval_status"] | null
          approved_at: string | null
          approved_by: string | null
          cashfree_order_id: string | null
          created_at: string | null
          email_sent_approval: boolean | null
          email_sent_payment: boolean | null
          exam_id: string
          exam_login_enabled: boolean | null
          exam_password: string | null
          id: string
          payment_amount: number | null
          payment_status: string | null
          payment_time: string | null
          photo_url: string | null
          registration_date: string | null
          registration_number: string | null
          signature_url: string | null
          student_id: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          approval_remarks?: string | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved_at?: string | null
          approved_by?: string | null
          cashfree_order_id?: string | null
          created_at?: string | null
          email_sent_approval?: boolean | null
          email_sent_payment?: boolean | null
          exam_id: string
          exam_login_enabled?: boolean | null
          exam_password?: string | null
          id?: string
          payment_amount?: number | null
          payment_status?: string | null
          payment_time?: string | null
          photo_url?: string | null
          registration_date?: string | null
          registration_number?: string | null
          signature_url?: string | null
          student_id: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_remarks?: string | null
          approval_status?:
            | Database["public"]["Enums"]["approval_status"]
            | null
          approved_at?: string | null
          approved_by?: string | null
          cashfree_order_id?: string | null
          created_at?: string | null
          email_sent_approval?: boolean | null
          email_sent_payment?: boolean | null
          exam_id?: string
          exam_login_enabled?: boolean | null
          exam_password?: string | null
          id?: string
          payment_amount?: number | null
          payment_status?: string | null
          payment_time?: string | null
          photo_url?: string | null
          registration_date?: string | null
          registration_number?: string | null
          signature_url?: string | null
          student_id?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_student_id_profiles_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      results: {
        Row: {
          calculated_at: string | null
          correct_count: number
          exam_id: string
          id: string
          is_pass: boolean | null
          obtained_marks: number
          percentile: number | null
          rank: number | null
          section_wise_scores: Json | null
          session_id: string
          student_id: string
          total_marks: number
          unanswered_count: number
          wrong_count: number
        }
        Insert: {
          calculated_at?: string | null
          correct_count?: number
          exam_id: string
          id?: string
          is_pass?: boolean | null
          obtained_marks: number
          percentile?: number | null
          rank?: number | null
          section_wise_scores?: Json | null
          session_id: string
          student_id: string
          total_marks: number
          unanswered_count?: number
          wrong_count?: number
        }
        Update: {
          calculated_at?: string | null
          correct_count?: number
          exam_id?: string
          id?: string
          is_pass?: boolean | null
          obtained_marks?: number
          percentile?: number | null
          rank?: number | null
          section_wise_scores?: Json | null
          session_id?: string
          student_id?: string
          total_marks?: number
          unanswered_count?: number
          wrong_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "results_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: true
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "results_student_id_profiles_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_answers: {
        Row: {
          answered_at: string | null
          id: string
          is_marked_for_review: boolean | null
          question_id: string
          selected_option: string | null
          session_id: string
        }
        Insert: {
          answered_at?: string | null
          id?: string
          is_marked_for_review?: boolean | null
          question_id: string
          selected_option?: string | null
          session_id: string
        }
        Update: {
          answered_at?: string | null
          id?: string
          is_marked_for_review?: boolean | null
          question_id?: string
          selected_option?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_answers_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "exam_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_exam_password: { Args: { dob: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_student: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "student"
      approval_status: "pending" | "approved" | "rejected"
      exam_status:
        | "draft"
        | "registration_open"
        | "registration_closed"
        | "conducted"
        | "results_published"
      gender_type: "male" | "female" | "other"
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
    Enums: {
      app_role: ["admin", "student"],
      approval_status: ["pending", "approved", "rejected"],
      exam_status: [
        "draft",
        "registration_open",
        "registration_closed",
        "conducted",
        "results_published",
      ],
      gender_type: ["male", "female", "other"],
    },
  },
} as const
