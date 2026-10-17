// ============================================================================
// LUNA.OS v3 — Tipos da base de dados (Supabase / PostgREST)
// Espelham supabase/migrations/0001..0005. Regenerar com:
//   supabase gen types typescript --local > packages/core/src/types/database.ts
// ============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Ts = string;
type Uuid = string;

/** Linha → Insert (colunas com valor por omissão ficam opcionais). */
type Ins<Row, Required extends keyof Row> = Pick<Row, Required> & Partial<Omit<Row, Required>>;
type Table<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Ins<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export type Enums = {
  org_type: 'solo_coach' | 'studio' | 'box' | 'gym' | 'club' | 'online';
  membership_status: 'invited' | 'active' | 'left';
  link_type: 'member' | 'pt_client' | 'online' | 'athlete';
  link_origin: 'manual' | 'invite' | 'athlete_code' | 'signup';
  link_status: 'pending' | 'active' | 'paused' | 'ended';
  client_status: 'active' | 'blocked' | 'return_to_play' | 'injured' | 'inactive';
  share_category: 'training' | 'measurements' | 'photos' | 'checkins' | 'health';
  guardianship_status: 'pending' | 'active' | 'ended';
  subscription_status: 'trial' | 'active' | 'grace' | 'read_only' | 'cancelled';
  entitlement_source: 'plan' | 'extra';
  group_type: 'class' | 'portfolio' | 'program' | 'age_group' | 'squad' | 'team';
  allergy_severity: 'mild' | 'moderate' | 'severe' | 'critical';
  document_status: 'valid' | 'expiring' | 'expired' | 'missing' | 'pending';
  booking_type: 'training' | 'consultation' | 'class' | 'assessment' | 'other';
  booking_status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'waitlisted';
  day_marker_type: 'unavailable' | 'holiday' | 'off' | 'vacation' | 'competition' | 'travel';
  waitlist_status: 'waiting' | 'promoted' | 'expired' | 'cancelled';
  session_phase: 'setup' | 'live' | 'paused' | 'done' | 'cancelled';
  workout_type: 'standard' | 'superset' | 'circuit' | 'emom' | 'amrap' | 'interval' | 'custom';
  assignment_status: 'active' | 'scheduled' | 'completed' | 'cancelled';
  assignment_target: 'client' | 'group';
};

/* ── Identidade ─────────────────────────────────────────────────────────── */
export type PersonRow = {
  id: Uuid; user_id: Uuid | null; managed_by_org: Uuid | null; full_name: string; email: string | null;
  phone: string | null; birth_date: string | null; avatar_url: string | null; locale: string; timezone: string;
  tax_id: string | null; created_at: Ts; updated_at: Ts;
};
export type OrganizationRow = {
  id: Uuid; type: Enums['org_type']; name: string; slug: string | null; brand: Json; theme: string;
  timezone: string; created_by: Uuid | null; created_at: Ts; updated_at: Ts;
};
export type UnitRow = {
  id: Uuid; org_id: Uuid; name: string; address: string | null; timezone: string; opening_hours: Json;
  technical_director: Uuid | null; archived_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type RoomRow = {
  id: Uuid; org_id: Uuid; unit_id: Uuid; name: string; capacity: number | null; archived_at: Ts | null;
  created_at: Ts; updated_at: Ts;
};
export type RoleRow = {
  id: Uuid; org_id: Uuid | null; key: string; name: string; permissions: string[]; occupies_seat: boolean;
  created_at: Ts; updated_at: Ts;
};
export type MembershipRow = {
  id: Uuid; org_id: Uuid; person_id: Uuid; status: Enums['membership_status']; title: string | null;
  title_valid_until: string | null; joined_at: Ts | null; left_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type MembershipRoleRow = { org_id: Uuid; membership_id: Uuid; role_id: Uuid; created_at: Ts };
export type LinkRow = {
  id: Uuid; org_id: Uuid; person_id: Uuid; type: Enums['link_type']; origin: Enums['link_origin'];
  status: Enums['link_status']; responsible_membership_id: Uuid | null; client_status: Enums['client_status'];
  status_note: string | null; current_plan_id: Uuid | null; started_at: Ts; ended_at: Ts | null;
  archived_at: Ts | null; archived_reason: string | null; created_at: Ts; updated_at: Ts;
};
export type LinkShareRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; person_id: Uuid; category: Enums['share_category'];
  granted_at: Ts; revoked_at: Ts | null;
};
export type SubscriptionRow = {
  id: Uuid; org_id: Uuid; plan: string; seats: number; status: Enums['subscription_status'];
  trial_ends_at: Ts | null; provider_ref: string | null; created_at: Ts; updated_at: Ts;
};
export type EntitlementRow = {
  id: Uuid; org_id: Uuid | null; person_id: Uuid | null; module: string; limit_value: number | null;
  source: Enums['entitlement_source']; created_at: Ts;
};
export type OrgSportRow = { org_id: Uuid; sport_id: string; sport_version: number; vocabulary_override: Json; created_at: Ts }
export type UserSettingsRow = {
  user_id: Uuid; theme_mode: string; density: string; text_size: number; reduced_motion: boolean;
  date_format: string; time_format: string; live_timer_enabled: boolean; live_sound_enabled: boolean;
  notif_push: boolean; notif_email: boolean; notif_sms: boolean; quiet_hours_start: string; quiet_hours_end: string;
  last_org_id: Uuid | null; tema: 'oceano' | 'ouro' | 'limao' | null; week_start: number; language: string;
  created_at: Ts; updated_at: Ts;
};
export type InviteRow = {
  id: Uuid; org_id: Uuid; email: string; role_id: Uuid; unit_id: Uuid | null; token_hash: string; invited_by: Uuid | null;
  expires_at: Ts; accepted_at: Ts | null; revoked_at: Ts | null; created_at: Ts;
};
export type MembershipEventRow = {
  id: number; org_id: Uuid; membership_id: Uuid; action: string; reason: string | null; actor_user: Uuid | null; created_at: Ts;
};
export type GoalRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; title: string; criterion: string | null;
  category: 'fisico' | 'habitos' | 'tecnico' | 'saude' | 'outro'; priority: number; owner_membership_id: Uuid | null;
  status: 'no_caminho' | 'em_risco' | 'atingido' | 'parado'; status_note: string | null; status_at: Ts; status_by: Uuid | null;
  due_on: string | null; archived_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type MilestoneRow = {
  id: Uuid; org_id: Uuid; goal_id: Uuid; title: string; due_on: string | null; done_at: Ts | null; done_by: Uuid | null;
  evidence_kind: 'sessao' | 'avaliacao' | 'questionario' | 'medida' | 'nota' | null; evidence_id: Uuid | null; evidence_note: string | null; created_at: Ts;
};
export type GoalResourceRow = { id: Uuid; org_id: Uuid; goal_id: Uuid; kind: 'plano' | 'treino' | 'questionario'; ref_id: Uuid; label: string; created_at: Ts };
export type ReviewRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; scheduled_on: string; every_weeks: number | null; owner_membership_id: Uuid | null;
  goal_ids: Uuid[]; done_at: Ts | null; done_by: Uuid | null; decision: string | null; created_at: Ts;
};
export type LinkEventRow = {
  id: number; org_id: Uuid; link_id: Uuid; kind: string; title: string; reason: string | null; ref_id: Uuid | null; actor_user: Uuid | null; created_at: Ts;
};
export type ImportRunRow = {
  id: Uuid; org_id: Uuid; file_name: string; total: number; ok: number; failed: number; report: Json; created_by: Uuid | null; created_at: Ts;
};
export type DraftRow = { user_id: Uuid; key: string; payload: Json; updated_at: Ts };
export type AccountDeletionRow = {
  id: Uuid; person_id: Uuid; user_id: Uuid; requested_at: Ts; scheduled_for: Ts; cancelled_at: Ts | null; done_at: Ts | null;
};
export type LoginHistoryRow = {
  id: Uuid; user_id: Uuid; ip: string | null; device: string | null; user_agent: string | null; success: boolean; created_at: Ts;
};
export type NotificationRow = {
  id: Uuid; user_id: Uuid; org_id: Uuid | null; type: string; title: string; body: string | null; data: Json;
  action_url: string | null; read_at: Ts | null; created_at: Ts;
};

/* ── Organização ────────────────────────────────────────────────────────── */
export type GroupRowDb = {
  id: Uuid; org_id: Uuid; type: Enums['group_type']; sport_id: string | null; name: string; color: string | null;
  description: string | null; archived_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type GroupMemberRowDb = { org_id: Uuid; group_id: Uuid; link_id: Uuid; added_at: Ts }
export type ExerciseRow = {
  id: Uuid; org_id: Uuid; name: string; category: string; description: string | null; video_url: string | null;
  muscles: string[]; equipment: string[]; archived_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type WorkoutRow = {
  id: Uuid; org_id: Uuid; name: string; description: string | null; type: Enums['workout_type'];
  est_duration_min: number | null; archived_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type WorkoutExerciseRow = {
  id: Uuid; org_id: Uuid; workout_id: Uuid; exercise_id: Uuid; position: number; superset_group: number | null;
  target_sets: number | null; target_reps: string | null; target_load: string | null; rest_seconds: number | null;
  notes: string | null;
};
export type PlanRow = {
  id: Uuid; org_id: Uuid; name: string; description: string | null; duration_weeks: number | null; goals: string | null;
  archived_at: Ts | null; created_at: Ts; updated_at: Ts;
};
export type ClassRow = {
  id: Uuid; org_id: Uuid; unit_id: Uuid | null; name: string; description: string | null; session_type: string | null;
  capacity: number; default_duration_min: number; instructor_membership_id: Uuid | null; archived_at: Ts | null;
  created_at: Ts; updated_at: Ts;
};
export type AssignmentRow = {
  id: Uuid; org_id: Uuid; target: Enums['assignment_target']; link_id: Uuid | null; group_id: Uuid | null;
  workout_id: Uuid | null; plan_id: Uuid | null; status: Enums['assignment_status']; starts_on: string | null;
  ends_on: string | null; schedule: Json; notes: string | null; assigned_by: Uuid | null; created_at: Ts; updated_at: Ts;
};
export type AvailabilityRow = {
  id: Uuid; org_id: Uuid; membership_id: Uuid; unit_id: Uuid | null; weekday: number; start_time: string;
  end_time: string; is_available: boolean; created_at: Ts; updated_at: Ts;
};
export type DayMarkerRow = {
  id: Uuid; org_id: Uuid; membership_id: Uuid | null; link_id: Uuid | null; date: string;
  marker: Enums['day_marker_type']; title: string | null; created_at: Ts;
};
export type BookingRow = {
  id: Uuid; org_id: Uuid; unit_id: Uuid | null; room_id: Uuid | null; membership_id: Uuid | null; link_id: Uuid | null;
  class_id: Uuid | null; assignment_id: Uuid | null; type: Enums['booking_type']; session_type: string | null;
  status: Enums['booking_status']; title: string | null; starts_at: Ts; ends_at: Ts; location: string | null;
  notes: string | null; capacity: number | null; source: string; cancel_reason: string | null; created_at: Ts; updated_at: Ts;
};
export type WaitlistRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; class_id: Uuid | null; membership_id: Uuid | null;
  requested_starts_at: Ts; priority: number; status: Enums['waitlist_status']; promoted_booking_id: Uuid | null;
  created_at: Ts; updated_at: Ts;
};
export type ClientNoteRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; author_membership_id: Uuid | null; body: string; created_at: Ts; updated_at: Ts;
};
export type ClientDocumentRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; name: string; doc_type: string | null; status: Enums['document_status'];
  issued_on: string | null; expires_on: string | null; file_path: string | null; created_at: Ts; updated_at: Ts;
};

/* ── Pessoa ─────────────────────────────────────────────────────────────── */
export type MeasurementRow = {
  id: Uuid; person_id: Uuid; org_id: Uuid | null; metric_key: string; value: number | null; text_value: string | null;
  unit: string | null; source: string; recorded_by: Uuid | null; recorded_at: Ts; created_at: Ts;
};
export type AllergyRowDb = {
  id: Uuid; person_id: Uuid; org_id: Uuid | null; allergen: string; severity: Enums['allergy_severity'];
  reaction: string | null; notes: string | null; created_at: Ts; updated_at: Ts;
};
export type SessionRow = {
  id: Uuid; person_id: Uuid; org_id: Uuid | null; link_id: Uuid | null; membership_id: Uuid | null;
  booking_id: Uuid | null; workout_id: Uuid | null; phase: Enums['session_phase']; started_at: Ts | null;
  ended_at: Ts | null; elapsed_seconds: number; paused_seconds: number; summary: Json; notes: string | null;
  created_at: Ts; updated_at: Ts;
};
export type SessionExerciseRow = {
  id: Uuid; session_id: Uuid; person_id: Uuid; org_id: Uuid | null; exercise_id: Uuid | null; position: number;
  target_sets: number | null; rest_seconds: number | null; notes: string | null;
};
export type SessionSetRow = {
  id: Uuid; session_id: Uuid; session_exercise_id: Uuid; person_id: Uuid; org_id: Uuid | null; set_index: number;
  reps: number | null; load_kg: number | null; rpe: number | null; completed: boolean;
  rest_taken_seconds: number | null; recorded_at: Ts;
};

/* ── Conta, PAR-Q, G-29, encarregado ────────────────────────────────────── */
export type ConsentRow = {
  id: number; person_id: Uuid; kind: string; version: string; granted: boolean; org_id: Uuid | null;
  link_id: Uuid | null; actor_user: Uuid | null; created_at: Ts;
};
export type PendenciaRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; membership_id: Uuid | null; kind: string; title: string;
  status: 'aberta' | 'resolvida'; created_at: Ts; resolved_at: Ts | null; resolved_by: Uuid | null;
  snoozed_until: Ts | null; snoozed_by: Uuid | null; resolution: string | null;
};
export type RestrictionRow = {
  id: Uuid; org_id: Uuid; link_id: Uuid; person_id: Uuid; kind: 'atestado' | 'permitir' | 'adaptar' | 'bloquear';
  zone: string | null; notes: string | null; valid_until: string | null; review_on: string | null; recorded_by: Uuid | null; created_at: Ts; revoked_at: Ts | null;
};
export type ParqRow = { id: Uuid; person_id: Uuid; answers: Json; has_risk: boolean; created_at: Ts };
export type GuardianshipRow = {
  id: Uuid; guardian_person_id: Uuid; minor_person_id: Uuid; status: Enums['guardianship_status']; signatures: Json;
  shares: Enums['share_category'][]; is_payer: boolean; accepted_at: Ts | null; ended_at: Ts | null; created_at: Ts; updated_at: Ts;
};

/* ── Vistas ─────────────────────────────────────────────────────────────── */
export type ClientViewRow = {
  id: Uuid; org_id: Uuid; person_id: Uuid; full_name: string; email: string | null; phone: string | null;
  birth_date: string | null; avatar_url: string | null; has_account: boolean; type: Enums['link_type'];
  origin: Enums['link_origin']; status: Enums['link_status']; client_status: Enums['client_status'];
  status_note: string | null; responsible_membership_id: Uuid | null; current_plan_id: Uuid | null;
  started_at: Ts; archived_at: Ts | null; archived_reason: string | null; created_at: Ts; updated_at: Ts;
};
export type StaffViewRow = {
  id: Uuid; org_id: Uuid; person_id: Uuid; full_name: string; email: string | null; avatar_url: string | null;
  status: Enums['membership_status']; title: string | null; title_valid_until: string | null; joined_at: Ts | null;
};

export type MyOrgRow = {
  org_id: Uuid; name: string; type: Enums['org_type']; theme: string; timezone: string; membership_id: Uuid;
  roles: string[]; permissions: string[]; subscription_status: Enums['subscription_status'] | null;
};

export interface Database {
  public: {
    Tables: {
      persons: Table<PersonRow, 'full_name'>;
      organizations: Table<OrganizationRow, 'type' | 'name'>;
      units: Table<UnitRow, 'org_id' | 'name'>;
      rooms: Table<RoomRow, 'org_id' | 'unit_id' | 'name'>;
      roles: Table<RoleRow, 'key' | 'name'>;
      memberships: Table<MembershipRow, 'org_id' | 'person_id'>;
      membership_roles: Table<MembershipRoleRow, 'org_id' | 'membership_id' | 'role_id'>;
      links: Table<LinkRow, 'org_id' | 'person_id'>;
      link_shares: Table<LinkShareRow, 'org_id' | 'link_id' | 'person_id' | 'category'>;
      subscriptions: Table<SubscriptionRow, 'org_id'>;
      entitlements: Table<EntitlementRow, 'module'>;
      org_sports: Table<OrgSportRow, 'org_id' | 'sport_id' | 'sport_version'>;
      user_settings: Table<UserSettingsRow, 'user_id'>;
      notifications: Table<NotificationRow, 'user_id' | 'title'>;
      groups: Table<GroupRowDb, 'org_id' | 'name'>;
      group_members: Table<GroupMemberRowDb, 'org_id' | 'group_id' | 'link_id'>;
      exercises: Table<ExerciseRow, 'org_id' | 'name'>;
      workouts: Table<WorkoutRow, 'org_id' | 'name'>;
      workout_exercises: Table<WorkoutExerciseRow, 'org_id' | 'workout_id' | 'exercise_id'>;
      plans: Table<PlanRow, 'org_id' | 'name'>;
      classes: Table<ClassRow, 'org_id' | 'name'>;
      assignments: Table<AssignmentRow, 'org_id' | 'target'>;
      availability: Table<AvailabilityRow, 'org_id' | 'membership_id' | 'weekday' | 'start_time' | 'end_time'>;
      day_markers: Table<DayMarkerRow, 'org_id' | 'date' | 'marker'>;
      bookings: Table<BookingRow, 'org_id' | 'starts_at' | 'ends_at'>;
      waitlist: Table<WaitlistRow, 'org_id' | 'link_id' | 'requested_starts_at'>;
      client_notes: Table<ClientNoteRow, 'org_id' | 'link_id' | 'body'>;
      client_documents: Table<ClientDocumentRow, 'org_id' | 'link_id' | 'name'>;
      measurements: Table<MeasurementRow, 'person_id' | 'metric_key'>;
      allergies: Table<AllergyRowDb, 'person_id' | 'allergen'>;
      sessions: Table<SessionRow, 'person_id'>;
      session_exercises: Table<SessionExerciseRow, 'session_id'>;
      session_sets: Table<SessionSetRow, 'session_id' | 'session_exercise_id'>;
      invites: Table<InviteRow, 'org_id' | 'email' | 'role_id' | 'token_hash'>;
      membership_events: Table<MembershipEventRow, 'org_id' | 'membership_id' | 'action'>;
      login_history: Table<LoginHistoryRow, 'user_id'>;
      account_deletion_requests: Table<AccountDeletionRow, 'person_id' | 'user_id'>;
      drafts: Table<DraftRow, 'user_id' | 'key' | 'payload'>;
      import_runs: Table<ImportRunRow, 'org_id' | 'file_name' | 'total' | 'ok' | 'failed' | 'report'>;
      goals: Table<GoalRow, 'org_id' | 'link_id' | 'title'>;
      milestones: Table<MilestoneRow, 'org_id' | 'goal_id' | 'title'>;
      goal_resources: Table<GoalResourceRow, 'org_id' | 'goal_id' | 'kind' | 'ref_id' | 'label'>;
      reviews: Table<ReviewRow, 'org_id' | 'link_id' | 'scheduled_on'>;
      link_events: Table<LinkEventRow, 'org_id' | 'link_id' | 'kind' | 'title'>;
      consents: Table<ConsentRow, 'person_id' | 'kind' | 'version' | 'granted'>;
      pendencias: Table<PendenciaRow, 'org_id' | 'link_id' | 'kind' | 'title'>;
      restrictions: Table<RestrictionRow, 'org_id' | 'link_id' | 'person_id' | 'kind'>;
      parq_responses: Table<ParqRow, 'person_id' | 'answers' | 'has_risk'>;
      guardianships: Table<GuardianshipRow, 'guardian_person_id' | 'minor_person_id'>;
    };
    Views: {
      clients: { Row: ClientViewRow; Relationships: [] };
      staff: { Row: StaffViewRow; Relationships: [] };
    };
    Functions: {
      create_organization: { Args: { _name: string; _type: Enums['org_type']; _sport?: string; _timezone?: string }; Returns: string };
      create_invite: { Args: { _org: string; _email: string; _role_key: string; _unit?: string | null; _confirm_over_seats?: boolean }; Returns: string };
      accept_invite: { Args: { _token: string }; Returns: string };
      add_client: { Args: { _org: string; _full_name: string; _email?: string | null; _phone?: string | null; _birth_date?: string | null; _responsible?: string | null; _type?: Enums['link_type']; _tax_id?: string | null }; Returns: string };
      end_link: { Args: { _link: string }; Returns: undefined };
      get_person_health: { Args: { _link: string; _reason?: string | null }; Returns: Json };
      org_audit: { Args: { _org: string; _limit?: number }; Returns: { em: string; quem: string; acao: string; entidade: string; entity_id: string | null; diff: Json }[] };
      org_health_access: { Args: { _org: string }; Returns: { em: string; quem: string; cliente: string; motivo: string | null; fora_da_carteira: boolean }[] };
      org_logins: { Args: { _org: string }; Returns: { em: string; quem: string; aparelho: string | null; sucesso: boolean }[] };
      org_two_factor: { Args: { _org: string }; Returns: { membership_id: string; nome: string; obrigatorio: boolean; ativo: boolean }[] };
      sync_title_alerts: { Args: { _org: string }; Returns: number };
      import_clients: { Args: { _org: string; _file: string; _rows: Json }; Returns: string };
      import_check: { Args: { _org: string; _rows: Json }; Returns: { linha: number; nome: string | null; motivo: string }[] };
      has_module: { Args: { _org: string; _module: string }; Returns: boolean };
      my_modules: { Args: { _org: string }; Returns: string[] };
      my_orgs: { Args: Record<string, never>; Returns: MyOrgRow[] };
      seats_summary: { Args: { _org: string }; Returns: Json };
      export_my_data: { Args: Record<string, never>; Returns: Json };
      my_today: { Args: { _now?: string }; Returns: Json };
      my_links_overview: {
        Args: Record<string, never>;
        Returns: { link_id: string; org_name: string; responsible_name: string | null; since: string; shares: Enums['share_category'][] }[];
      };
      set_my_shares: { Args: { _link: string; _shares: Enums['share_category'][] }; Returns: undefined };
      request_account_deletion: { Args: Record<string, never>; Returns: string };
      cancel_account_deletion: { Args: Record<string, never>; Returns: undefined };
      find_client_duplicates: {
        Args: { _org: string; _phone?: string | null; _email?: string | null; _nif?: string | null; _exclude?: string | null };
        Returns: { link_id: string | null; full_name: string; motivo: 'telefone' | 'email' | 'nif'; client_status: Enums['client_status']; archived: boolean; sessions: number; visible: boolean }[];
      };
      merge_clients: { Args: { _keep: string; _drop: string }; Returns: string };
      set_goal_status: { Args: { _goal: string; _status: string; _note?: string | null }; Returns: undefined };
      archive_goal: { Args: { _goal: string }; Returns: undefined };
      complete_milestone: { Args: { _id: string; _kind: string; _ref?: string | null; _note?: string | null }; Returns: undefined };
      conclude_review: { Args: { _id: string; _decision: string; _next_on?: string | null }; Returns: string | null };
      sync_overdue: { Args: { _org: string }; Returns: number };
      archive_client: { Args: { _link: string; _reason: string }; Returns: undefined };
      reactivate_client: { Args: { _link: string; _reason: string }; Returns: undefined };
      update_client_data: {
        Args: { _link: string; _seen: string; _full_name: string; _phone: string | null; _email: string | null; _birth_date: string | null; _tax_id: string | null };
        Returns: string;
      };
      client_activity: {
        Args: { _link: string; _from: string; _to?: string };
        Returns: { em: string; origem: string; titulo: string; detalhe: string; ref_kind: string; ref_id: string | null; quem: string | null }[];
      };
      client_upcoming: { Args: { _link: string; _days?: number }; Returns: { em: string; tipo: string; titulo: string; estado: string | null }[] };
      client_progress: {
        Args: { _link: string; _metric: string; _from: string; _to?: string };
        Returns: { em: string; valor: number; detalhe: string; ref_kind: string; ref_id: string | null }[];
      };
      client_metrics: { Args: { _link: string }; Returns: { chave: string; nome: string; unidade: string | null; n: number }[] };
      undo_merge: { Args: { _merge: string }; Returns: undefined };
      send_link_invite: { Args: { _link: string; _canal: 'email' | 'sms' | 'codigo'; _destino?: string | null }; Returns: string };
      export_org_data: { Args: { _org: string }; Returns: Json };
      has_booking_conflict: { Args: { _org: string; _membership: string; _starts: string; _ends: string; _ignore?: string | null }; Returns: boolean };
      get_security_score: { Args: Record<string, never>; Returns: number };
      record_consent: { Args: { _kind: string; _version: string; _granted: boolean; _person?: string | null; _org?: string | null }; Returns: undefined };
      submit_parq: { Args: { _answers: Json; _person?: string | null }; Returns: boolean };
      record_restriction: { Args: { _link: string; _kind: string; _notes?: string | null; _valid_until?: string | null; _zone?: string | null; _review_on?: string | null }; Returns: string };
      revoke_restriction: { Args: { _id: string }; Returns: undefined };
      deactivate_member: { Args: { _membership: string; _reason: string }; Returns: undefined };
      reactivate_member: { Args: { _membership: string; _reason: string }; Returns: undefined };
      cancel_invite: { Args: { _invite: string }; Returns: undefined };
      adiar_pendencia: { Args: { _id: string; _ate: string }; Returns: undefined };
      reabrir_pendencia: { Args: { _id: string }; Returns: undefined };
      atribuir_pendencia: { Args: { _id: string; _membership: string }; Returns: undefined };
      clients_overview: {
        Args: { _org: string; _now?: string };
        Returns: { link_id: string; last_training: string | null; weeks: number[] }[];
      };
      clients_attention: {
        Args: { _org: string; _now?: string };
        Returns: { link_id: string; full_name: string; reasons: string[]; last_training: string | null }[];
      };
      create_recovery_code: { Args: { _membership: string }; Returns: string };
      client_restricoes_efeito: { Args: { _link: string }; Returns: { zone: string | null; kind: string; review_on: string | null }[] };
      client_aptidao: { Args: { _link: string }; Returns: string };
      request_guardian: { Args: { _email: string; _phone?: string | null }; Returns: string };
      accept_guardianship: { Args: { _token: string; _is_payer?: boolean }; Returns: string };
      set_guardian_shares: { Args: { _shares: Enums['share_category'][] }; Returns: undefined };
      create_link_invite: { Args: { _link: string; _email?: string | null }; Returns: string };
      accept_link_invite: { Args: { _token: string; _shares: Enums['share_category'][] }; Returns: string };
      minor_waiting: { Args: { _person: string }; Returns: boolean };
      is_minor: { Args: { _person: string }; Returns: boolean };
    };
    Enums: Enums;
    CompositeTypes: Record<string, never>;
  };
}

type PublicSchema = Database['public'];
export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];
export type InsertDto<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Insert'];
export type UpdateDto<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Update'];
export type EnumOf<T extends keyof Enums> = Enums[T];
