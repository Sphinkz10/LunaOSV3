// ============================================================================
// LUNA.OS — Tipos TypeScript da base de dados (Supabase / PostgREST)
// Para usar com @supabase/supabase-js: createClient<Database>(url, key)
// Podes regenerar com:  supabase gen types typescript --project-id <id> > database.types.ts
// ============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: Enums["user_role"]
          full_name: string
          email: string | null
          avatar_url: string | null
          phone: string | null
          title: string | null
          locale: string
          timezone: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: Enums["user_role"]
          full_name?: string
          email?: string | null
          avatar_url?: string | null
          phone?: string | null
          title?: string | null
          locale?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          role?: Enums["user_role"]
          full_name?: string
          email?: string | null
          avatar_url?: string | null
          phone?: string | null
          title?: string | null
          locale?: string
          timezone?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          id: string
          name: string
          slug: string | null
          logo_url: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug?: string | null
          logo_url?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string | null
          logo_url?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: string
          organization_id: string
          user_id: string
          role: Enums["org_member_role"]
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          user_id: string
          role?: Enums["org_member_role"]
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          user_id?: string
          role?: Enums["org_member_role"]
          created_at?: string
        }
        Relationships: []
      }
      athletes: {
        Row: {
          id: string
          coach_id: string
          user_id: string | null
          organization_id: string | null
          name: string
          email: string | null
          phone: string | null
          birth_date: string | null
          sex: string | null
          sport: string | null
          status: Enums["athlete_status"]
          status_note: string | null
          avatar_url: string | null
          height_cm: number | null
          weight_kg: number | null
          current_plan_id: string | null
          notes: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          user_id?: string | null
          organization_id?: string | null
          name: string
          email?: string | null
          phone?: string | null
          birth_date?: string | null
          sex?: string | null
          sport?: string | null
          status?: Enums["athlete_status"]
          status_note?: string | null
          avatar_url?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          current_plan_id?: string | null
          notes?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          user_id?: string | null
          organization_id?: string | null
          name?: string
          email?: string | null
          phone?: string | null
          birth_date?: string | null
          sex?: string | null
          sport?: string | null
          status?: Enums["athlete_status"]
          status_note?: string | null
          avatar_url?: string | null
          height_cm?: number | null
          weight_kg?: number | null
          current_plan_id?: string | null
          notes?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      groups: {
        Row: {
          id: string
          coach_id: string
          name: string
          color: string | null
          description: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          color?: string | null
          description?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          color?: string | null
          description?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          athlete_id: string
          coach_id: string
          added_at: string
        }
        Insert: {
          group_id: string
          athlete_id: string
          coach_id?: string
          added_at?: string
        }
        Update: {
          group_id?: string
          athlete_id?: string
          coach_id?: string
          added_at?: string
        }
        Relationships: []
      }
      athlete_allergies: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          allergen: string
          severity: Enums["allergy_severity"]
          reaction: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id?: string
          allergen: string
          severity?: Enums["allergy_severity"]
          reaction?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          athlete_id?: string
          coach_id?: string
          allergen?: string
          severity?: Enums["allergy_severity"]
          reaction?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      athlete_documents: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          name: string
          doc_type: string | null
          status: Enums["document_status"]
          issued_on: string | null
          expires_on: string | null
          file_path: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id?: string
          name: string
          doc_type?: string | null
          status?: Enums["document_status"]
          issued_on?: string | null
          expires_on?: string | null
          file_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          athlete_id?: string
          coach_id?: string
          name?: string
          doc_type?: string | null
          status?: Enums["document_status"]
          issued_on?: string | null
          expires_on?: string | null
          file_path?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      athlete_metrics: {
        Row: {
          id: string
          athlete_id: string
          coach_id: string
          metric_key: string
          value: number | null
          text_value: string | null
          unit: string | null
          source: Enums["metric_source"]
          recorded_at: string
          created_at: string
        }
        Insert: {
          id?: string
          athlete_id: string
          coach_id?: string
          metric_key: string
          value?: number | null
          text_value?: string | null
          unit?: string | null
          source?: Enums["metric_source"]
          recorded_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          athlete_id?: string
          coach_id?: string
          metric_key?: string
          value?: number | null
          text_value?: string | null
          unit?: string | null
          source?: Enums["metric_source"]
          recorded_at?: string
          created_at?: string
        }
        Relationships: []
      }
      exercises: {
        Row: {
          id: string
          coach_id: string
          name: string
          category: Enums["exercise_category"]
          description: string | null
          video_url: string | null
          muscles: string[]
          equipment: string[]
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          category?: Enums["exercise_category"]
          description?: string | null
          video_url?: string | null
          muscles?: string[]
          equipment?: string[]
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          category?: Enums["exercise_category"]
          description?: string | null
          video_url?: string | null
          muscles?: string[]
          equipment?: string[]
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          type: Enums["workout_type"]
          est_duration_min: number | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          type?: Enums["workout_type"]
          est_duration_min?: number | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          type?: Enums["workout_type"]
          est_duration_min?: number | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          id: string
          workout_id: string
          exercise_id: string
          coach_id: string
          position: number
          superset_group: number | null
          target_sets: number | null
          target_reps: string | null
          target_load: string | null
          rest_seconds: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          workout_id: string
          exercise_id: string
          coach_id?: string
          position?: number
          superset_group?: number | null
          target_sets?: number | null
          target_reps?: string | null
          target_load?: string | null
          rest_seconds?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          workout_id?: string
          exercise_id?: string
          coach_id?: string
          position?: number
          superset_group?: number | null
          target_sets?: number | null
          target_reps?: string | null
          target_load?: string | null
          rest_seconds?: number | null
          notes?: string | null
        }
        Relationships: []
      }
      plans: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          duration_weeks: number | null
          goals: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          duration_weeks?: number | null
          goals?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          duration_weeks?: number | null
          goals?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      plan_workouts: {
        Row: {
          id: string
          plan_id: string
          workout_id: string
          coach_id: string
          week: number | null
          weekday: number | null
          position: number
        }
        Insert: {
          id?: string
          plan_id: string
          workout_id: string
          coach_id?: string
          week?: number | null
          weekday?: number | null
          position?: number
        }
        Update: {
          id?: string
          plan_id?: string
          workout_id?: string
          coach_id?: string
          week?: number | null
          weekday?: number | null
          position?: number
        }
        Relationships: []
      }
      classes: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          capacity: number
          default_duration_min: number
          instructor: string | null
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          capacity?: number
          default_duration_min?: number
          instructor?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          capacity?: number
          default_duration_min?: number
          instructor?: string | null
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      assignments: {
        Row: {
          id: string
          coach_id: string
          target: Enums["assignment_target"]
          athlete_id: string | null
          group_id: string | null
          workout_id: string | null
          plan_id: string | null
          status: Enums["assignment_status"]
          starts_on: string | null
          ends_on: string | null
          schedule: Json
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          target: Enums["assignment_target"]
          athlete_id?: string | null
          group_id?: string | null
          workout_id?: string | null
          plan_id?: string | null
          status?: Enums["assignment_status"]
          starts_on?: string | null
          ends_on?: string | null
          schedule?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          target?: Enums["assignment_target"]
          athlete_id?: string | null
          group_id?: string | null
          workout_id?: string | null
          plan_id?: string | null
          status?: Enums["assignment_status"]
          starts_on?: string | null
          ends_on?: string | null
          schedule?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      availability: {
        Row: {
          id: string
          coach_id: string
          weekday: number
          start_time: string
          end_time: string
          is_available: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          weekday: number
          start_time: string
          end_time: string
          is_available?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          weekday?: number
          start_time?: string
          end_time?: string
          is_available?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      day_markers: {
        Row: {
          id: string
          coach_id: string
          athlete_id: string | null
          date: string
          marker: Enums["day_marker_type"]
          title: string | null
          created_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          athlete_id?: string | null
          date: string
          marker: Enums["day_marker_type"]
          title?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          athlete_id?: string | null
          date?: string
          marker?: Enums["day_marker_type"]
          title?: string | null
          created_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          coach_id: string
          athlete_id: string | null
          class_id: string | null
          assignment_id: string | null
          type: Enums["booking_type"]
          status: Enums["booking_status"]
          title: string | null
          starts_at: string
          ends_at: string
          location: string | null
          notes: string | null
          capacity: number | null
          source: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          athlete_id?: string | null
          class_id?: string | null
          assignment_id?: string | null
          type?: Enums["booking_type"]
          status?: Enums["booking_status"]
          title?: string | null
          starts_at: string
          ends_at: string
          location?: string | null
          notes?: string | null
          capacity?: number | null
          source?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          athlete_id?: string | null
          class_id?: string | null
          assignment_id?: string | null
          type?: Enums["booking_type"]
          status?: Enums["booking_status"]
          title?: string | null
          starts_at?: string
          ends_at?: string
          location?: string | null
          notes?: string | null
          capacity?: number | null
          source?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          id: string
          coach_id: string
          athlete_id: string
          class_id: string | null
          class_booking_id: string | null
          requested_starts_at: string | null
          priority: number
          status: Enums["waitlist_status"]
          promoted_booking_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          athlete_id: string
          class_id?: string | null
          class_booking_id?: string | null
          requested_starts_at?: string | null
          priority?: number
          status?: Enums["waitlist_status"]
          promoted_booking_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          athlete_id?: string
          class_id?: string | null
          class_booking_id?: string | null
          requested_starts_at?: string | null
          priority?: number
          status?: Enums["waitlist_status"]
          promoted_booking_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          id: string
          coach_id: string
          athlete_id: string | null
          booking_id: string | null
          workout_id: string | null
          phase: Enums["session_phase"]
          started_at: string | null
          ended_at: string | null
          elapsed_seconds: number
          summary: Json
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          athlete_id?: string | null
          booking_id?: string | null
          workout_id?: string | null
          phase?: Enums["session_phase"]
          started_at?: string | null
          ended_at?: string | null
          elapsed_seconds?: number
          summary?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          athlete_id?: string | null
          booking_id?: string | null
          workout_id?: string | null
          phase?: Enums["session_phase"]
          started_at?: string | null
          ended_at?: string | null
          elapsed_seconds?: number
          summary?: Json
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      session_exercises: {
        Row: {
          id: string
          session_id: string
          exercise_id: string | null
          coach_id: string
          position: number
          target_sets: number | null
          rest_seconds: number | null
          notes: string | null
        }
        Insert: {
          id?: string
          session_id: string
          exercise_id?: string | null
          coach_id?: string
          position?: number
          target_sets?: number | null
          rest_seconds?: number | null
          notes?: string | null
        }
        Update: {
          id?: string
          session_id?: string
          exercise_id?: string | null
          coach_id?: string
          position?: number
          target_sets?: number | null
          rest_seconds?: number | null
          notes?: string | null
        }
        Relationships: []
      }
      session_sets: {
        Row: {
          id: string
          session_id: string
          session_exercise_id: string
          coach_id: string
          set_index: number
          reps: number | null
          load_kg: number | null
          rpe: number | null
          completed: boolean
          rest_taken_seconds: number | null
          recorded_at: string
        }
        Insert: {
          id?: string
          session_id: string
          session_exercise_id: string
          coach_id?: string
          set_index?: number
          reps?: number | null
          load_kg?: number | null
          rpe?: number | null
          completed?: boolean
          rest_taken_seconds?: number | null
          recorded_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          session_exercise_id?: string
          coach_id?: string
          set_index?: number
          reps?: number | null
          load_kg?: number | null
          rpe?: number | null
          completed?: boolean
          rest_taken_seconds?: number | null
          recorded_at?: string
        }
        Relationships: []
      }
      variables: {
        Row: {
          id: string
          coach_id: string
          name: string
          key: string
          type: Enums["variable_type"]
          source: Enums["variable_source"]
          unit: string | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          key: string
          type?: Enums["variable_type"]
          source?: Enums["variable_source"]
          unit?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          key?: string
          type?: Enums["variable_type"]
          source?: Enums["variable_source"]
          unit?: string | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      formulas: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          condition: Json
          action: Json
          priority: number
          is_active: boolean
          applies_to: Enums["assignment_target"] | null
          athlete_id: string | null
          group_id: string | null
          schedule: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          condition?: Json
          action?: Json
          priority?: number
          is_active?: boolean
          applies_to?: Enums["assignment_target"] | null
          athlete_id?: string | null
          group_id?: string | null
          schedule?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          condition?: Json
          action?: Json
          priority?: number
          is_active?: boolean
          applies_to?: Enums["assignment_target"] | null
          athlete_id?: string | null
          group_id?: string | null
          schedule?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      formula_variables: {
        Row: {
          formula_id: string
          variable_id: string
          coach_id: string
        }
        Insert: {
          formula_id: string
          variable_id: string
          coach_id?: string
        }
        Update: {
          formula_id?: string
          variable_id?: string
          coach_id?: string
        }
        Relationships: []
      }
      formula_logs: {
        Row: {
          id: string
          coach_id: string
          formula_id: string | null
          athlete_id: string | null
          status: Enums["formula_log_status"]
          input: Json
          result: Json
          message: string | null
          executed_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          formula_id?: string | null
          athlete_id?: string | null
          status?: Enums["formula_log_status"]
          input?: Json
          result?: Json
          message?: string | null
          executed_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          formula_id?: string | null
          athlete_id?: string | null
          status?: Enums["formula_log_status"]
          input?: Json
          result?: Json
          message?: string | null
          executed_at?: string
        }
        Relationships: []
      }
      forms: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          status: Enums["form_status"]
          archived_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          status?: Enums["form_status"]
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          status?: Enums["form_status"]
          archived_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_fields: {
        Row: {
          id: string
          form_id: string
          coach_id: string
          type: Enums["form_field_type"]
          label: string
          placeholder: string | null
          help_text: string | null
          required: boolean
          position: number
          options: Json
          validation: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          form_id: string
          coach_id?: string
          type?: Enums["form_field_type"]
          label: string
          placeholder?: string | null
          help_text?: string | null
          required?: boolean
          position?: number
          options?: Json
          validation?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          form_id?: string
          coach_id?: string
          type?: Enums["form_field_type"]
          label?: string
          placeholder?: string | null
          help_text?: string | null
          required?: boolean
          position?: number
          options?: Json
          validation?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_packages: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      package_forms: {
        Row: {
          package_id: string
          form_id: string
          coach_id: string
          position: number
        }
        Insert: {
          package_id: string
          form_id: string
          coach_id?: string
          position?: number
        }
        Update: {
          package_id?: string
          form_id?: string
          coach_id?: string
          position?: number
        }
        Relationships: []
      }
      form_assignments: {
        Row: {
          id: string
          coach_id: string
          form_id: string | null
          package_id: string | null
          target: Enums["form_target"]
          athlete_id: string | null
          group_id: string | null
          due_on: string | null
          status: Enums["assignment_status"]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          form_id?: string | null
          package_id?: string | null
          target: Enums["form_target"]
          athlete_id?: string | null
          group_id?: string | null
          due_on?: string | null
          status?: Enums["assignment_status"]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          form_id?: string | null
          package_id?: string | null
          target?: Enums["form_target"]
          athlete_id?: string | null
          group_id?: string | null
          due_on?: string | null
          status?: Enums["assignment_status"]
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      form_responses: {
        Row: {
          id: string
          coach_id: string
          form_id: string
          athlete_id: string
          status: Enums["response_status"]
          answers: Json
          submitted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          form_id: string
          athlete_id: string
          status?: Enums["response_status"]
          answers?: Json
          submitted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          form_id?: string
          athlete_id?: string
          status?: Enums["response_status"]
          answers?: Json
          submitted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      queries: {
        Row: {
          id: string
          coach_id: string
          name: string
          chart_type: Enums["chart_type"]
          config: Json
          filters: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          chart_type?: Enums["chart_type"]
          config?: Json
          filters?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          chart_type?: Enums["chart_type"]
          config?: Json
          filters?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_templates: {
        Row: {
          id: string
          coach_id: string
          name: string
          description: string | null
          chart_type: Enums["chart_type"]
          query_config: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          description?: string | null
          chart_type?: Enums["chart_type"]
          query_config?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          description?: string | null
          chart_type?: Enums["chart_type"]
          query_config?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          id: string
          coach_id: string
          name: string
          query_id: string | null
          template_id: string | null
          data: Json
          format: Enums["report_format"]
          generated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          name: string
          query_id?: string | null
          template_id?: string | null
          data?: Json
          format?: Enums["report_format"]
          generated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          name?: string
          query_id?: string | null
          template_id?: string | null
          data?: Json
          format?: Enums["report_format"]
          generated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          user_id: string
          theme: Enums["theme_pref"]
          accent_color: string
          density: Enums["density_pref"]
          text_size: number
          reduced_motion: boolean
          language: string
          timezone: string
          date_format: string
          time_format: string
          live_units: string
          live_timer_enabled: boolean
          live_sound_enabled: boolean
          notif_push: boolean
          notif_email: boolean
          notif_sms: boolean
          quiet_hours_start: string
          quiet_hours_end: string
          updated_at: string
          created_at: string
        }
        Insert: {
          user_id: string
          theme?: Enums["theme_pref"]
          accent_color?: string
          density?: Enums["density_pref"]
          text_size?: number
          reduced_motion?: boolean
          language?: string
          timezone?: string
          date_format?: string
          time_format?: string
          live_units?: string
          live_timer_enabled?: boolean
          live_sound_enabled?: boolean
          notif_push?: boolean
          notif_email?: boolean
          notif_sms?: boolean
          quiet_hours_start?: string
          quiet_hours_end?: string
          updated_at?: string
          created_at?: string
        }
        Update: {
          user_id?: string
          theme?: Enums["theme_pref"]
          accent_color?: string
          density?: Enums["density_pref"]
          text_size?: number
          reduced_motion?: boolean
          language?: string
          timezone?: string
          date_format?: string
          time_format?: string
          live_units?: string
          live_timer_enabled?: boolean
          live_sound_enabled?: boolean
          notif_push?: boolean
          notif_email?: boolean
          notif_sms?: boolean
          quiet_hours_start?: string
          quiet_hours_end?: string
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: Enums["notification_type"]
          title: string
          body: string | null
          data: Json
          action_url: string | null
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type?: Enums["notification_type"]
          title: string
          body?: string | null
          data?: Json
          action_url?: string | null
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          type?: Enums["notification_type"]
          title?: string
          body?: string | null
          data?: Json
          action_url?: string | null
          read_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          id: string
          coach_id: string
          provider: Enums["integration_provider"]
          status: Enums["integration_status"]
          config: Json
          access_token: string | null
          refresh_token: string | null
          expires_at: string | null
          last_sync_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          provider: Enums["integration_provider"]
          status?: Enums["integration_status"]
          config?: Json
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          last_sync_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          provider?: Enums["integration_provider"]
          status?: Enums["integration_status"]
          config?: Json
          access_token?: string | null
          refresh_token?: string | null
          expires_at?: string | null
          last_sync_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_settings: {
        Row: {
          user_id: string
          two_factor_enabled: boolean
          two_factor_method: string | null
          biometric_enabled: boolean
          backup_codes_generated: boolean
          last_password_change: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          user_id: string
          two_factor_enabled?: boolean
          two_factor_method?: string | null
          biometric_enabled?: boolean
          backup_codes_generated?: boolean
          last_password_change?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          user_id?: string
          two_factor_enabled?: boolean
          two_factor_method?: string | null
          biometric_enabled?: boolean
          backup_codes_generated?: boolean
          last_password_change?: string | null
          updated_at?: string
          created_at?: string
        }
        Relationships: []
      }
      backup_codes: {
        Row: {
          id: string
          user_id: string
          code_hash: string
          used_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          code_hash: string
          used_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          code_hash?: string
          used_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      login_history: {
        Row: {
          id: string
          user_id: string
          ip: string | null
          device: string | null
          location: string | null
          user_agent: string | null
          success: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          ip?: string | null
          device?: string | null
          location?: string | null
          user_agent?: string | null
          success?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          ip?: string | null
          device?: string | null
          location?: string | null
          user_agent?: string | null
          success?: boolean
          created_at?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          coach_id: string
          action: string
          entity: string | null
          entity_id: string | null
          diff: Json
          created_at: string
        }
        Insert: {
          id?: string
          coach_id?: string
          action: string
          entity?: string | null
          entity_id?: string | null
          diff?: Json
          created_at?: string
        }
        Update: {
          id?: string
          coach_id?: string
          action?: string
          entity?: string | null
          entity_id?: string | null
          diff?: Json
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      athlete_summary: {
        Row: {
          id: string | null
          coach_id: string | null
          name: string | null
          sport: string | null
          status: Enums["athlete_status"] | null
          avatar_url: string | null
          current_plan_id: string | null
          current_plan_name: string | null
          allergy_count: number | null
          upcoming_bookings: number | null
          last_session_at: string | null
          pending_forms: number | null
        }
        Relationships: []
      }
      upcoming_bookings: {
        Row: {
          id: string | null
          coach_id: string | null
          athlete_id: string | null
          athlete_name: string | null
          avatar_url: string | null
          type: Enums["booking_type"] | null
          status: Enums["booking_status"] | null
          title: string | null
          starts_at: string | null
          ends_at: string | null
          location: string | null
          class_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_security_score: { Args: { _user?: string }; Returns: number }
      has_booking_conflict: { Args: { _coach: string; _starts: string; _ends: string; _ignore?: string }; Returns: boolean }
    }
    Enums: {
      user_role: "admin" | "coach" | "athlete" | "staff"
      org_member_role: "owner" | "admin" | "coach" | "member"
      athlete_status: "active" | "blocked" | "return_to_play" | "injured" | "inactive" | "archived"
      allergy_severity: "mild" | "moderate" | "severe" | "critical"
      document_status: "valid" | "expiring" | "expired" | "missing" | "pending"
      booking_type: "training" | "consultation" | "competition" | "class" | "assessment" | "other"
      booking_status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show" | "waitlisted"
      day_marker_type: "unavailable" | "holiday" | "off" | "vacation" | "competition" | "travel"
      waitlist_status: "waiting" | "promoted" | "expired" | "cancelled"
      session_phase: "setup" | "live" | "paused" | "done" | "cancelled"
      exercise_category: "strength" | "cardio" | "mobility" | "plyometric" | "balance" | "rehab" | "skill" | "other"
      workout_type: "standard" | "superset" | "circuit" | "emom" | "amrap" | "interval" | "custom"
      assignment_status: "active" | "scheduled" | "completed" | "cancelled"
      assignment_target: "athlete" | "group"
      variable_type: "number" | "boolean" | "duration" | "percentage" | "scale" | "text"
      variable_source: "manual" | "wearable" | "form" | "session" | "computed"
      formula_log_status: "success" | "no_match" | "error" | "skipped"
      form_field_type: "text" | "textarea" | "number" | "scale" | "rpe" | "select" | "multiselect" | "boolean" | "date" | "time" | "rating" | "signature"
      form_status: "draft" | "published" | "archived"
      response_status: "pending" | "partial" | "submitted"
      form_target: "athlete" | "group"
      chart_type: "line" | "bar" | "area" | "scatter" | "pie" | "radar" | "table" | "number"
      report_format: "screen" | "pdf" | "csv" | "xlsx"
      metric_source: "manual" | "wearable" | "form" | "session" | "formula"
      notification_type: "booking" | "session" | "formula" | "conflict" | "athlete" | "form" | "report" | "integration" | "message" | "security" | "system"
      notification_channel: "in_app" | "push" | "email" | "sms"
      integration_provider: "google_calendar" | "outlook" | "apple_calendar" | "calendly" | "apple_health" | "garmin" | "whoop" | "strava" | "polar" | "stripe" | "whatsapp" | "slack"
      integration_status: "connected" | "disconnected" | "error" | "pending"
      theme_pref: "dark" | "light" | "auto"
      density_pref: "compact" | "comfortable" | "spacious"
    }
    CompositeTypes: {}
  }
}

// ---- Atalhos de conveniência ----
type PublicSchema = Database['public']
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type InsertDto<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert']
export type UpdateDto<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update']
export type EnumOf<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]
type Enums = Database['public']['Enums']

export type Profile = Tables<'profiles'>
export type Athlete = Tables<'athletes'>
export type Group = Tables<'groups'>
export type Booking = Tables<'bookings'>
export type Session = Tables<'sessions'>
export type Exercise = Tables<'exercises'>
export type Workout = Tables<'workouts'>
export type Plan = Tables<'plans'>
export type Class = Tables<'classes'>
export type Assignment = Tables<'assignments'>
export type Variable = Tables<'variables'>
export type Formula = Tables<'formulas'>
export type Form = Tables<'forms'>
export type FormField = Tables<'form_fields'>
export type FormResponse = Tables<'form_responses'>
export type Query = Tables<'queries'>
export type Report = Tables<'reports'>
export type Notification = Tables<'notifications'>
export type Integration = Tables<'integrations'>
export type UserSettings = Tables<'user_settings'>
export type AthleteAllergy = Tables<'athlete_allergies'>
export type AthleteMetric = Tables<'athlete_metrics'>
