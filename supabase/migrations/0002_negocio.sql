-- ============================================================================
-- LUNA.OS v3 · 0002_negocio — módulos da organização e dados da pessoa
-- ----------------------------------------------------------------------------
-- Da organização (org_id, chaves compostas (x_id, org_id)):
--   grupos · biblioteca (exercícios, treinos, planos) · aulas · atribuições ·
--   disponibilidade · marcadores de dia · marcações · lista de espera ·
--   notas e documentos do cliente · integrações (tokens no Vault) ·
--   auditoria (só acrescentar) · registo de leituras de saúde
-- Da pessoa (person_id; org_id = organização que registou, null no modo solo):
--   medidas · alergias (saúde) · sessões, exercícios e séries (treino)
-- ============================================================================

create type public.allergy_severity  as enum ('mild','moderate','severe','critical');
create type public.document_status   as enum ('valid','expiring','expired','missing','pending');
create type public.booking_type      as enum ('training','consultation','class','assessment','other');
create type public.booking_status    as enum ('pending','confirmed','cancelled','completed','no_show','waitlisted');
create type public.day_marker_type   as enum ('unavailable','holiday','off','vacation','competition','travel');
create type public.waitlist_status   as enum ('waiting','promoted','expired','cancelled');
create type public.session_phase     as enum ('setup','live','paused','done','cancelled');
create type public.workout_type      as enum ('standard','superset','circuit','emom','amrap','interval','custom');
create type public.assignment_status as enum ('active','scheduled','completed','cancelled');
create type public.assignment_target as enum ('client','group');

-- ---------------------------------------------------------------------------
-- Grupos (turma, carteira, programa…; o tipo vem da modalidade)
-- ---------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  type        public.group_type not null default 'program',
  sport_id    text,
  name        text not null,
  color       text,                               -- nome de token de dado (ex.: 'dado-2')
  description text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.groups (org_id);

create table public.group_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  group_id   uuid not null,
  link_id    uuid not null,
  added_at   timestamptz not null default now(),
  primary key (group_id, link_id),
  foreign key (group_id, org_id) references public.groups(id, org_id) on delete cascade,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create index on public.group_members (link_id);
create index on public.group_members (org_id);

-- ---------------------------------------------------------------------------
-- Biblioteca: exercícios, treinos, planos (categorias vêm da modalidade)
-- ---------------------------------------------------------------------------
create table public.exercises (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null,
  category    text not null default 'forca',     -- categorias_biblioteca da modalidade
  description text,
  video_url   text,
  muscles     text[] not null default '{}',
  equipment   text[] not null default '{}',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.exercises (org_id);

create table public.workouts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  description      text,
  type             public.workout_type not null default 'standard',
  est_duration_min int check (est_duration_min is null or est_duration_min > 0),
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.workouts (org_id);

create table public.workout_exercises (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  workout_id     uuid not null,
  exercise_id    uuid not null,
  position       int not null default 0,
  superset_group int,
  target_sets    int check (target_sets is null or target_sets > 0),
  target_reps    text,
  target_load    text,
  rest_seconds   int check (rest_seconds is null or rest_seconds >= 0),
  notes          text,
  foreign key (workout_id, org_id) references public.workouts(id, org_id) on delete cascade,
  foreign key (exercise_id, org_id) references public.exercises(id, org_id) on delete restrict
);
create index on public.workout_exercises (workout_id, position);
create index on public.workout_exercises (exercise_id);

create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null,
  description    text,
  duration_weeks int check (duration_weeks is null or duration_weeks > 0),
  goals          text,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.plans (org_id);

create table public.plan_workouts (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  plan_id    uuid not null,
  workout_id uuid not null,
  week       int,
  weekday    smallint check (weekday between 0 and 6),
  position   int not null default 0,
  foreign key (plan_id, org_id) references public.plans(id, org_id) on delete cascade,
  foreign key (workout_id, org_id) references public.workouts(id, org_id) on delete restrict
);
create index on public.plan_workouts (plan_id);
create index on public.plan_workouts (workout_id);

alter table public.links
  add constraint links_current_plan_fk
  foreign key (current_plan_id, org_id) references public.plans(id, org_id)
  on delete set null (current_plan_id);

-- ---------------------------------------------------------------------------
-- Aulas e atribuições
-- ---------------------------------------------------------------------------
create table public.classes (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  unit_id                  uuid,
  name                     text not null,
  description              text,
  session_type             text,                   -- da modalidade (ex.: aula_de_grupo)
  capacity                 int not null default 10 check (capacity > 0),
  default_duration_min     int not null default 60 check (default_duration_min > 0),
  instructor_membership_id uuid,
  archived_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, org_id),
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete set null (unit_id),
  foreign key (instructor_membership_id, org_id) references public.memberships(id, org_id)
    on delete set null (instructor_membership_id)
);
create index on public.classes (org_id);

create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  target      public.assignment_target not null,
  link_id     uuid,
  group_id    uuid,
  workout_id  uuid,
  plan_id     uuid,
  status      public.assignment_status not null default 'active',
  starts_on   date,
  ends_on     date,
  schedule    jsonb not null default '{}'::jsonb,
  notes       text,
  assigned_by uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (group_id, org_id) references public.groups(id, org_id) on delete cascade,
  foreign key (workout_id, org_id) references public.workouts(id, org_id) on delete set null (workout_id),
  foreign key (plan_id, org_id) references public.plans(id, org_id) on delete set null (plan_id),
  foreign key (assigned_by, org_id) references public.memberships(id, org_id) on delete set null (assigned_by),
  constraint assignment_target_match check (
    (target = 'client' and link_id is not null and group_id is null) or
    (target = 'group'  and group_id is not null and link_id is null)
  ),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index on public.assignments (org_id);
create index on public.assignments (link_id);
create index on public.assignments (group_id);
-- Atribuir duas vezes o mesmo plano ao mesmo cliente não duplica (auditoria, Alto)
create unique index assignments_one_active_plan on public.assignments (link_id, plan_id)
  where status in ('active','scheduled') and link_id is not null and plan_id is not null;
create unique index assignments_one_active_workout on public.assignments (link_id, workout_id)
  where status in ('active','scheduled') and link_id is not null and workout_id is not null;

-- ---------------------------------------------------------------------------
-- Horário: disponibilidade, marcadores, marcações, lista de espera
-- ---------------------------------------------------------------------------
create table public.availability (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  unit_id       uuid,
  weekday       smallint not null check (weekday between 0 and 6),
  start_time    time not null,
  end_time      time not null,
  is_available  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_time > start_time),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade,
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete set null (unit_id)
);
create index on public.availability (org_id, membership_id, weekday);

create table public.day_markers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid,
  link_id       uuid,
  date          date not null,
  marker        public.day_marker_type not null,
  title         text,
  created_at    timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create index on public.day_markers (org_id, date);

create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  unit_id       uuid,
  room_id       uuid,
  membership_id uuid,                               -- quem dá a sessão
  link_id       uuid,                               -- cliente (null em aulas e bloqueios)
  class_id      uuid,
  assignment_id uuid,
  type          public.booking_type not null default 'training',
  session_type  text,                               -- da modalidade (pt_individual, …)
  status        public.booking_status not null default 'pending',
  title         text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  location      text,
  notes         text,
  capacity      int check (capacity is null or capacity > 0),
  source        text not null default 'manual' check (source in ('manual','assignment','integration','waitlist','client')),
  cancel_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (id, org_id),
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete set null (unit_id),
  foreign key (room_id, org_id) references public.rooms(id, org_id) on delete set null (room_id),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete set null (membership_id),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (class_id, org_id) references public.classes(id, org_id) on delete set null (class_id),
  foreign key (assignment_id, org_id) references public.assignments(id, org_id) on delete set null (assignment_id)
);
create index on public.bookings (org_id, starts_at);
create index on public.bookings (membership_id, starts_at);
create index on public.bookings (link_id, starts_at);
create index on public.bookings (class_id, starts_at);

-- Sem sobreposição para a mesma pessoa da equipa (aulas têm lotação própria)
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    membership_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','confirmed') and type <> 'class' and membership_id is not null);

create table public.waitlist (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  link_id             uuid not null,
  class_id            uuid,
  membership_id       uuid,
  requested_starts_at timestamptz,
  priority            int not null default 100,
  status              public.waitlist_status not null default 'waiting',
  promoted_booking_id uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- a fila é sempre para um horário concreto (aula ou sessão de um membro da equipa)
  check (requested_starts_at is not null and (class_id is not null or membership_id is not null)),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (class_id, org_id) references public.classes(id, org_id) on delete cascade,
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade,
  foreign key (promoted_booking_id, org_id) references public.bookings(id, org_id)
    on delete set null (promoted_booking_id)
);
create index on public.waitlist (org_id);
create index on public.waitlist (class_id, requested_starts_at) where status = 'waiting';
create index on public.waitlist (membership_id, requested_starts_at) where status = 'waiting';
create unique index waitlist_one_per_slot on public.waitlist
  (link_id, coalesce(class_id, membership_id), requested_starts_at) where status = 'waiting';

-- ---------------------------------------------------------------------------
-- Cliente: notas da equipa (o cliente nunca as vê) e documentos
-- ---------------------------------------------------------------------------
create table public.client_notes (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  link_id              uuid not null,
  author_membership_id uuid,
  body                 text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (author_membership_id, org_id) references public.memberships(id, org_id)
    on delete set null (author_membership_id)
);
create index on public.client_notes (link_id, created_at desc);

create table public.client_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  link_id     uuid not null,
  name        text not null,
  doc_type    text,
  status      public.document_status not null default 'valid',
  issued_on   date,
  expires_on  date,
  file_path   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create index on public.client_documents (link_id);
create index on public.client_documents (org_id, expires_on);

-- ---------------------------------------------------------------------------
-- Integrações: tokens no Supabase Vault (só o id do segredo fica aqui)
-- ---------------------------------------------------------------------------
create table public.integrations (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  membership_id           uuid not null,
  provider                text not null,
  status                  text not null default 'disconnected' check (status in ('connected','disconnected','error','pending')),
  config                  jsonb not null default '{}'::jsonb,
  access_token_secret_id  uuid,                   -- vault.secrets.id
  refresh_token_secret_id uuid,                   -- vault.secrets.id
  expires_at              timestamptz,
  last_sync_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (membership_id, provider),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade
);
create index on public.integrations (org_id);

-- ---------------------------------------------------------------------------
-- Auditoria (só acrescentar) e leituras de saúde
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id         bigint generated always as identity primary key,
  org_id     uuid references public.organizations(id) on delete cascade,
  person_id  uuid references public.persons(id) on delete cascade,
  actor_user uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  diff       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (org_id, created_at desc);
create index on public.audit_log (person_id, created_at desc);

create table public.health_access_log (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  person_id  uuid not null references public.persons(id) on delete cascade,
  link_id    uuid,
  actor_user uuid not null,
  created_at timestamptz not null default now()
);
create index on public.health_access_log (person_id, created_at desc);
create index on public.health_access_log (org_id, created_at desc);

-- ============================================================================
-- Dados da pessoa
-- ============================================================================
create table public.measurements (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons(id) on delete cascade,
  org_id      uuid references public.organizations(id) on delete set null,
  metric_key  text not null,                     -- da modalidade (carga, fc, peso…)
  value       numeric,
  text_value  text,
  unit        text,
  source      text not null default 'manual' check (source in ('manual','wearable','form','session','formula')),
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
create index on public.measurements (person_id, metric_key, recorded_at desc);

create table public.allergies (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.persons(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete set null,
  allergen   text not null,
  severity   public.allergy_severity not null default 'moderate',
  reaction   text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.allergies (person_id);

create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  person_id        uuid not null references public.persons(id) on delete cascade,
  org_id           uuid references public.organizations(id) on delete set null,
  link_id          uuid,
  membership_id    uuid,
  booking_id       uuid,
  workout_id       uuid,
  phase            public.session_phase not null default 'setup',
  started_at       timestamptz,
  ended_at         timestamptz,
  elapsed_seconds  int not null default 0 check (elapsed_seconds >= 0),
  paused_seconds   int not null default 0 check (paused_seconds >= 0),
  summary          jsonb not null default '{}'::jsonb,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, person_id),
  check (ended_at is null or started_at is null or ended_at >= started_at),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete set null (link_id),
  foreign key (link_id, person_id) references public.links(id, person_id) on delete set null (link_id),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete set null (membership_id),
  foreign key (booking_id, org_id) references public.bookings(id, org_id) on delete set null (booking_id),
  foreign key (workout_id, org_id) references public.workouts(id, org_id) on delete set null (workout_id)
);
create index on public.sessions (person_id, started_at desc);
create index on public.sessions (org_id, started_at desc);
create index on public.sessions (booking_id);
-- Uma sessão em curso por cliente e organização: as órfãs fecham-se, não se acumulam
create unique index sessions_one_open on public.sessions (person_id, org_id)
  where phase in ('setup','live','paused') and org_id is not null;

create table public.session_exercises (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null,
  person_id    uuid not null,
  org_id       uuid,
  exercise_id  uuid,
  position     int not null default 0,
  target_sets  int check (target_sets is null or target_sets > 0),
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),
  notes        text,
  unique (id, person_id),
  unique (session_id, position),
  foreign key (session_id, person_id) references public.sessions(id, person_id) on delete cascade,
  foreign key (exercise_id, org_id) references public.exercises(id, org_id) on delete set null (exercise_id)
);
create index on public.session_exercises (person_id);

create table public.session_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null,
  session_exercise_id uuid not null,
  person_id           uuid not null,
  org_id              uuid,
  set_index           int not null default 1 check (set_index > 0),
  reps                int check (reps is null or reps >= 0),
  load_kg             numeric(6,2) check (load_kg is null or load_kg >= 0),
  rpe                 numeric(3,1) check (rpe is null or rpe between 0 and 10),
  completed           boolean not null default true,
  rest_taken_seconds  int check (rest_taken_seconds is null or rest_taken_seconds >= 0),
  recorded_at         timestamptz not null default now(),
  unique (session_exercise_id, set_index),
  foreign key (session_id, person_id) references public.sessions(id, person_id) on delete cascade,
  foreign key (session_exercise_id, person_id) references public.session_exercises(id, person_id) on delete cascade
);
create index on public.session_sets (session_id);
create index on public.session_sets (person_id);

-- Exercícios e séries herdam dono e organização da sessão (o cliente não os envia)
create or replace function public.tg_inherit_session_owner()
returns trigger language plpgsql set search_path = '' as $$
declare s record;
begin
  select person_id, org_id into s from public.sessions where id = new.session_id;
  if not found then
    raise exception 'sessão inexistente' using errcode = 'foreign_key_violation';
  end if;
  new.person_id := s.person_id;
  new.org_id := s.org_id;
  return new;
end $$;

create trigger trg_inherit_owner before insert or update of session_id on public.session_exercises
  for each row execute function public.tg_inherit_session_owner();
create trigger trg_inherit_owner before insert or update of session_id on public.session_sets
  for each row execute function public.tg_inherit_session_owner();

-- ---------------------------------------------------------------------------
-- updated_at em todas as tabelas com a coluna
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
      and table_name in (select table_name from information_schema.tables
                         where table_schema = 'public' and table_type = 'BASE TABLE')
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I', r.table_name);
    execute format('create trigger trg_set_updated_at before update on public.%I
                    for each row execute function public.tg_set_updated_at()', r.table_name);
  end loop;
end $$;
