-- ============================================================================
-- LUNA.OS — BASE DE DADOS (PostgreSQL / Supabase)
-- Versão 1.0 · Schema completo, multi-tenant por treinador, com RLS
-- ----------------------------------------------------------------------------
-- COMO APLICAR:
--   Opção A (SQL Editor do Supabase): colar este ficheiro inteiro e correr.
--   Opção B (CLI): guardar em supabase/migrations/0001_luna_os.sql e `supabase db push`.
-- Depois, aplicar LUNA_OS_DB_seed.sql (opcional, dados de demonstração).
-- ----------------------------------------------------------------------------
-- MODELO DE ACESSO (resumo):
--   * auth.users (Supabase) ⇄ public.profiles (1:1), com papel (admin/coach/athlete/staff).
--   * Todo o dado de domínio pertence a um treinador (coach_id = profiles.id).
--   * RLS garante que cada treinador SÓ vê/edita os SEUS dados (coach_id = auth.uid()).
--   * Admin de organização pode ver os treinadores da sua organização.
--   * O próprio atleta (se tiver login) vê os seus próprios dados (athletes.user_id).
-- ============================================================================

-- ---------- 0. EXTENSÕES ----------
create extension if not exists "pgcrypto";      -- gen_random_uuid(), crypt()
create extension if not exists "citext";        -- emails case-insensitive
create extension if not exists "btree_gist";    -- constraint anti-sobreposição de marcações

-- ---------- 0.1 FUNÇÃO updated_at ----------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================================
-- 1. ENUMS (tipos fechados, alinhados com o código real verificado)
-- ============================================================================
create type public.user_role          as enum ('admin','coach','athlete','staff');
create type public.org_member_role     as enum ('owner','admin','coach','member');

-- Atleta: estados reais (blocked/'Bloqueado', rtp/'Return to Play', ...)
create type public.athlete_status      as enum ('active','blocked','return_to_play','injured','inactive','archived');
create type public.allergy_severity    as enum ('mild','moderate','severe','critical');
create type public.document_status     as enum ('valid','expiring','expired','missing','pending');

-- Calendário: tipos e estados de marcação + marcadores de dia (9 estados verificados)
create type public.booking_type        as enum ('training','consultation','competition','class','assessment','other');
create type public.booking_status      as enum ('pending','confirmed','cancelled','completed','no_show','waitlisted');
create type public.day_marker_type     as enum ('unavailable','holiday','off','vacation','competition','travel');
create type public.waitlist_status     as enum ('waiting','promoted','expired','cancelled');

-- Sessões (Live)
create type public.session_phase       as enum ('setup','live','paused','done','cancelled');

-- Studio
create type public.exercise_category   as enum ('strength','cardio','mobility','plyometric','balance','rehab','skill','other');
create type public.workout_type        as enum ('standard','superset','circuit','emom','amrap','interval','custom');
create type public.assignment_status   as enum ('active','scheduled','completed','cancelled');
create type public.assignment_target   as enum ('athlete','group');

-- Data.OS
create type public.variable_type       as enum ('number','boolean','duration','percentage','scale','text');
create type public.variable_source     as enum ('manual','wearable','form','session','computed');
create type public.formula_log_status  as enum ('success','no_match','error','skipped');

-- Forms.OS
create type public.form_field_type     as enum ('text','textarea','number','scale','rpe','select','multiselect','boolean','date','time','rating','signature');
create type public.form_status         as enum ('draft','published','archived');
create type public.response_status     as enum ('pending','partial','submitted');
create type public.form_target         as enum ('athlete','group');

-- Analytics.OS
create type public.chart_type          as enum ('line','bar','area','scatter','pie','radar','table','number');
create type public.report_format       as enum ('screen','pdf','csv','xlsx');

-- Sistema
create type public.metric_source       as enum ('manual','wearable','form','session','formula');
create type public.notification_type   as enum ('booking','session','formula','conflict','athlete','form','report','integration','message','security','system');
create type public.notification_channel as enum ('in_app','push','email','sms');
create type public.integration_provider as enum ('google_calendar','outlook','apple_calendar','calendly','apple_health','garmin','whoop','strava','polar','stripe','whatsapp','slack');
create type public.integration_status  as enum ('connected','disconnected','error','pending');
create type public.theme_pref          as enum ('dark','light','auto');
create type public.density_pref        as enum ('compact','comfortable','spacious');

-- ============================================================================
-- 2. IDENTIDADE (perfis, organizações/clubes, membros)
-- ============================================================================

-- 2.1 Perfis — 1:1 com auth.users (Supabase). Fonte de identidade da app.
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          public.user_role not null default 'coach',
  full_name     text not null default 'Treinador',
  email         citext,
  avatar_url    text,
  phone         text,
  title         text,                         -- "função" (ex.: Treinador principal)
  locale        text not null default 'pt',
  timezone      text not null default 'Europe/Lisbon',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'Perfil do utilizador; espelha auth.users. role define o tipo de acesso.';

-- 2.2 Organizações (clubes/equipas) — permite multi-treinador com admin.
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          citext unique,
  logo_url      text,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 2.3 Membros da organização (papel dentro do clube)
create table public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  role            public.org_member_role not null default 'member',
  created_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index on public.organization_members (user_id);
create index on public.organization_members (organization_id);

-- ============================================================================
-- 3. ATLETAS & GRUPOS  (o "coração relacional" — escopo principal de acesso)
-- ============================================================================

-- 3.1 Atletas — pertencem a um treinador (coach_id). user_id = login próprio (futuro).
create table public.athletes (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,   -- app do atleta (futuro)
  organization_id uuid references public.organizations(id) on delete set null,
  name          text not null,
  email         citext,
  phone         text,
  birth_date    date,
  sex           text,
  sport         text,
  status        public.athlete_status not null default 'active',
  status_note   text,
  avatar_url    text,
  height_cm     numeric(5,1) check (height_cm is null or height_cm between 50 and 300),
  weight_kg     numeric(5,1) check (weight_kg is null or weight_kg between 20 and 400),
  current_plan_id uuid,                          -- FK adicionada após a tabela plans
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.athletes (coach_id);
create index on public.athletes (coach_id, status);
create index on public.athletes (user_id);
create index on public.athletes (organization_id);
comment on column public.athletes.coach_id is 'Dono do registo. RLS: o treinador só vê atletas com coach_id = auth.uid().';

-- 3.2 Grupos de atletas
create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null,
  color         text,                            -- token de cor (UI)
  description   text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.groups (coach_id);

-- 3.3 Pertença a grupo (N:N atleta⇄grupo)
create table public.group_members (
  group_id      uuid not null references public.groups(id) on delete cascade,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  added_at      timestamptz not null default now(),
  primary key (group_id, athlete_id)
);
create index on public.group_members (athlete_id);
create index on public.group_members (coach_id);

-- 3.4 Alergias do atleta (segurança clínica — banner persistente no Atleta 360)
create table public.athlete_allergies (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  allergen      text not null,
  severity      public.allergy_severity not null default 'moderate',
  reaction      text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.athlete_allergies (athlete_id);
create index on public.athlete_allergies (coach_id);

-- 3.5 Documentos do atleta (estado/validade — ex.: "Documento expirado")
create table public.athlete_documents (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null,
  doc_type      text,
  status        public.document_status not null default 'valid',
  issued_on     date,
  expires_on    date,
  file_path     text,                            -- Supabase Storage
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.athlete_documents (athlete_id);
create index on public.athlete_documents (coach_id);
create index on public.athlete_documents (expires_on);

-- 3.6 Métricas do atleta (objetivas/subjetivas, com PROVENIÊNCIA = source pills)
create table public.athlete_metrics (
  id            uuid primary key default gen_random_uuid(),
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  metric_key    text not null,                   -- ex.: 'sleep_hours','rpe','hrv','weight_kg','readiness'
  value         numeric,
  text_value    text,
  unit          text,
  source        public.metric_source not null default 'manual',
  recorded_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index on public.athlete_metrics (athlete_id, metric_key, recorded_at desc);
create index on public.athlete_metrics (coach_id);

-- ============================================================================
-- 4. STUDIO (Treinos.OS) — biblioteca de conteúdo de treino
-- ============================================================================

-- 4.1 Exercícios  (entidade teal)
create table public.exercises (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name          text not null,
  category      public.exercise_category not null default 'strength',
  description   text,
  video_url     text,
  muscles       text[] not null default '{}',
  equipment     text[] not null default '{}',
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.exercises (coach_id);

-- 4.2 Treinos  (entidade gold) — suporta supersets/circuitos via workout_exercises
create table public.workouts (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name             text not null,
  description      text,
  type             public.workout_type not null default 'standard',
  est_duration_min int,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index on public.workouts (coach_id);

-- 4.3 Exercícios dentro do treino (ordem, prescrição, superset/circuito)
create table public.workout_exercises (
  id             uuid primary key default gen_random_uuid(),
  workout_id     uuid not null references public.workouts(id) on delete cascade,
  exercise_id    uuid not null references public.exercises(id) on delete restrict,
  coach_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  position       int not null default 0,
  superset_group int,                            -- nº do grupo p/ superset/circuito (null = isolado)
  target_sets    int,
  target_reps    text,                           -- ex.: '8-12'
  target_load    text,                           -- ex.: '70% 1RM' / 'RPE 8'
  rest_seconds   int,
  notes          text
);
create index on public.workout_exercises (workout_id, position);
create index on public.workout_exercises (exercise_id);
create index on public.workout_exercises (coach_id);

-- 4.4 Planos  (entidade orange) — sequência de treinos
create table public.plans (
  id             uuid primary key default gen_random_uuid(),
  coach_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name           text not null,
  description    text,
  duration_weeks int,
  goals          text,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on public.plans (coach_id);

-- 4.5 Treinos dentro do plano (semana/dia/ordem)
create table public.plan_workouts (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.plans(id) on delete cascade,
  workout_id  uuid not null references public.workouts(id) on delete restrict,
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  week        int,
  weekday     smallint check (weekday between 0 and 6),
  position    int not null default 0
);
create index on public.plan_workouts (plan_id);
create index on public.plan_workouts (workout_id);
create index on public.plan_workouts (coach_id);

-- 4.6 Aulas  (entidade sky) — com capacidade
create table public.classes (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name                 text not null,
  description          text,
  capacity             int not null default 10 check (capacity > 0),
  default_duration_min int not null default 60,
  instructor           text,
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index on public.classes (coach_id);

-- 4.7 Atribuições (treino/plano → atleta/grupo). Geram marcações no calendário.
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  target      public.assignment_target not null,
  athlete_id  uuid references public.athletes(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  workout_id  uuid references public.workouts(id) on delete set null,
  plan_id     uuid references public.plans(id) on delete set null,
  status      public.assignment_status not null default 'active',
  starts_on   date,
  ends_on     date,
  schedule    jsonb not null default '{}'::jsonb,   -- dias/horas para gerar sessões
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint assignment_one_source  check (num_nonnulls(workout_id, plan_id) = 1),
  constraint assignment_target_match check (
    (target = 'athlete' and athlete_id is not null and group_id is null) or
    (target = 'group'   and group_id  is not null and athlete_id is null)
  )
);
create index on public.assignments (coach_id);
create index on public.assignments (athlete_id);
create index on public.assignments (group_id);

-- Ligar o "plano atual" do atleta (FK adiada até existir a tabela plans)
alter table public.athletes
  add constraint athletes_current_plan_fk
  foreign key (current_plan_id) references public.plans(id) on delete set null;

-- ============================================================================
-- 5. CALENDÁRIO (disponibilidade, marcadores de dia, marcações, lista de espera)
-- ============================================================================

-- 5.1 Disponibilidade semanal recorrente do treinador
create table public.availability (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),   -- 0=Dom ... 6=Sáb
  start_time   time not null,
  end_time     time not null,
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_time > start_time)
);
create index on public.availability (coach_id, weekday);

-- 5.2 Marcadores de dia (feriado/folga/férias/competição/viagem/indisponível)
create table public.day_markers (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id  uuid references public.athletes(id) on delete cascade,  -- ex.: férias de um atleta
  date        date not null,
  marker      public.day_marker_type not null,
  title       text,
  created_at  timestamptz not null default now()
);
create index on public.day_markers (coach_id, date);

-- 5.3 Marcações / Eventos (fonte de verdade da agenda)
create table public.bookings (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id    uuid references public.athletes(id) on delete cascade,   -- null em aulas/bloqueios
  class_id      uuid references public.classes(id) on delete set null,
  assignment_id uuid references public.assignments(id) on delete set null,
  type          public.booking_type not null default 'training',
  status        public.booking_status not null default 'pending',
  title         text,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  location      text,
  notes         text,
  capacity      int,                              -- aulas: lotação
  source        text not null default 'manual',   -- manual | assignment | integration
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index on public.bookings (coach_id, starts_at);
create index on public.bookings (athlete_id, starts_at);
create index on public.bookings (coach_id, status);
create index on public.bookings (class_id);

-- 5.3.1 REGRA CRÍTICA (servidor): sem sobreposição de marcações do mesmo treinador
--       (exclui aulas, que têm capacidade própria; só conta pendentes/confirmadas)
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    coach_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','confirmed') and type <> 'class');

-- 5.4 Lista de espera (para aulas/horários cheios) — base da auto-promoção
create table public.waitlist (
  id                  uuid primary key default gen_random_uuid(),
  coach_id            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id          uuid not null references public.athletes(id) on delete cascade,
  class_id            uuid references public.classes(id) on delete cascade,
  class_booking_id    uuid references public.bookings(id) on delete cascade,  -- slot de aula concreto
  requested_starts_at timestamptz,
  priority            int not null default 100,   -- menor = maior prioridade
  status              public.waitlist_status not null default 'waiting',
  promoted_booking_id uuid references public.bookings(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.waitlist (coach_id);
create index on public.waitlist (class_booking_id) where status = 'waiting';
create index on public.waitlist (athlete_id);

-- 5.4.1 Função de AUTO-PROMOÇÃO: ao cancelar uma marcação, promove o 1º da fila
create or replace function public.promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.waitlist%rowtype;
  new_booking_id uuid;
begin
  if (old.status in ('pending','confirmed')) and (new.status = 'cancelled') then
    select * into w
    from public.waitlist
    where status = 'waiting'
      and coach_id = new.coach_id
      and (
            (new.class_id is not null and class_id = new.class_id)
         or (class_booking_id = new.id)
         or (requested_starts_at = new.starts_at)
      )
    order by priority asc, created_at asc
    limit 1;

    if found then
      insert into public.bookings (coach_id, athlete_id, class_id, type, status,
                                   title, starts_at, ends_at, location, source)
      values (new.coach_id, w.athlete_id, new.class_id, new.type, 'confirmed',
              new.title, new.starts_at, new.ends_at, new.location, 'waitlist')
      returning id into new_booking_id;

      update public.waitlist
        set status = 'promoted', promoted_booking_id = new_booking_id, updated_at = now()
        where id = w.id;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_bookings_autopromote
  after update of status on public.bookings
  for each row execute function public.promote_from_waitlist();

-- ============================================================================
-- 6. SESSÕES (Live) — execução real, set-by-set, com timer
-- ============================================================================

create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  coach_id        uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id      uuid references public.athletes(id) on delete set null,
  booking_id      uuid references public.bookings(id) on delete set null,
  workout_id      uuid references public.workouts(id) on delete set null,
  phase           public.session_phase not null default 'setup',
  started_at      timestamptz,
  ended_at        timestamptz,
  elapsed_seconds int not null default 0,
  summary         jsonb not null default '{}'::jsonb,   -- volume, PRs, médias…
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on public.sessions (coach_id, started_at desc);
create index on public.sessions (athlete_id);
create index on public.sessions (booking_id);

create table public.session_exercises (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  exercise_id  uuid references public.exercises(id) on delete set null,
  coach_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  position     int not null default 0,
  target_sets  int,
  rest_seconds int,
  notes        text
);
create index on public.session_exercises (session_id, position);
create index on public.session_exercises (coach_id);

create table public.session_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.sessions(id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  coach_id            uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  set_index           int not null default 1,
  reps                int check (reps is null or reps >= 0),
  load_kg             numeric(6,2) check (load_kg is null or load_kg >= 0),
  rpe                 numeric(3,1) check (rpe is null or rpe between 0 and 10),
  completed           boolean not null default true,
  rest_taken_seconds  int,
  recorded_at         timestamptz not null default now()
);
create index on public.session_sets (session_exercise_id, set_index);
create index on public.session_sets (session_id);
create index on public.session_sets (coach_id);

-- ============================================================================
-- 7. DATA.OS — variáveis, fórmulas (IF/THEN) e registo de execuções
-- ============================================================================

-- 7.1 Variáveis (o que se mede). key único por treinador.
create table public.variables (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  key         text not null,                     -- ex.: 'sleep_hours'
  type        public.variable_type not null default 'number',
  source      public.variable_source not null default 'manual',
  unit        text,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (coach_id, key)
);
create index on public.variables (coach_id);

-- 7.2 Fórmulas (regras IF/THEN). condition/action em JSONB (AST do builder).
create table public.formulas (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  condition   jsonb not null default '{}'::jsonb,  -- ex.: {op:'<', var:'sleep_hours', value:7}
  action      jsonb not null default '{}'::jsonb,  -- ex.: {type:'adjust_load', pct:-10}
  priority    int not null default 100,            -- menor = maior precedência (resolve conflitos)
  is_active   boolean not null default true,
  applies_to  public.assignment_target,            -- 'athlete' | 'group' | null (=todos)
  athlete_id  uuid references public.athletes(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  schedule    jsonb not null default '{}'::jsonb,  -- quando corre
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.formulas (coach_id);
create index on public.formulas (coach_id, priority);

-- 7.3 Variáveis usadas por cada fórmula (integridade referencial do builder)
create table public.formula_variables (
  formula_id  uuid not null references public.formulas(id) on delete cascade,
  variable_id uuid not null references public.variables(id) on delete cascade,
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (formula_id, variable_id)
);
create index on public.formula_variables (variable_id);
create index on public.formula_variables (coach_id);

-- 7.4 Registo de execuções (auditoria do "porque é que a carga mudou?")
create table public.formula_logs (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  formula_id  uuid references public.formulas(id) on delete set null,
  athlete_id  uuid references public.athletes(id) on delete set null,
  status      public.formula_log_status not null default 'success',
  input       jsonb not null default '{}'::jsonb,
  result      jsonb not null default '{}'::jsonb,
  message     text,
  executed_at timestamptz not null default now()
);
create index on public.formula_logs (coach_id, executed_at desc);
create index on public.formula_logs (formula_id);
create index on public.formula_logs (athlete_id);

-- ============================================================================
-- 8. FORMS.OS — formulários, campos, pacotes, atribuições e respostas
-- ============================================================================

create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  status      public.form_status not null default 'draft',
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.forms (coach_id);

create table public.form_fields (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.forms(id) on delete cascade,
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  type        public.form_field_type not null default 'text',
  label       text not null,
  placeholder text,
  help_text   text,
  required    boolean not null default false,
  position    int not null default 0,
  options     jsonb not null default '[]'::jsonb,   -- p/ select/multiselect/rating
  validation  jsonb not null default '{}'::jsonb,   -- {min,max,minLength,maxLength,pattern}
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.form_fields (form_id, position);
create index on public.form_fields (coach_id);

create table public.form_packages (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.form_packages (coach_id);

create table public.package_forms (
  package_id  uuid not null references public.form_packages(id) on delete cascade,
  form_id     uuid not null references public.forms(id) on delete cascade,
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  position    int not null default 0,
  primary key (package_id, form_id)
);
create index on public.package_forms (coach_id);

create table public.form_assignments (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  form_id     uuid references public.forms(id) on delete cascade,
  package_id  uuid references public.form_packages(id) on delete cascade,
  target      public.form_target not null,
  athlete_id  uuid references public.athletes(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  due_on      date,
  status      public.assignment_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint form_assignment_one_source check (num_nonnulls(form_id, package_id) = 1),
  constraint form_assignment_target_match check (
    (target = 'athlete' and athlete_id is not null and group_id is null) or
    (target = 'group'   and group_id  is not null and athlete_id is null)
  )
);
create index on public.form_assignments (coach_id);
create index on public.form_assignments (athlete_id);
create index on public.form_assignments (group_id);

create table public.form_responses (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  form_id      uuid not null references public.forms(id) on delete cascade,
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  status       public.response_status not null default 'pending',
  answers      jsonb not null default '{}'::jsonb,
  submitted_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.form_responses (form_id);
create index on public.form_responses (athlete_id);
create index on public.form_responses (coach_id);

-- ============================================================================
-- 9. ANALYTICS.OS — queries, templates e relatórios
-- ============================================================================

create table public.queries (
  id          uuid primary key default gen_random_uuid(),
  coach_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null,
  chart_type  public.chart_type not null default 'line',
  config      jsonb not null default '{}'::jsonb,   -- eixos/dataset
  filters     jsonb not null default '{}'::jsonb,   -- data/atleta/tipo
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.queries (coach_id);

create table public.report_templates (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null,
  description  text,
  chart_type   public.chart_type not null default 'line',
  query_config jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.report_templates (coach_id);

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  coach_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name         text not null,
  query_id     uuid references public.queries(id) on delete set null,
  template_id  uuid references public.report_templates(id) on delete set null,
  data         jsonb not null default '{}'::jsonb,
  format       public.report_format not null default 'screen',
  generated_at timestamptz not null default now(),
  created_at   timestamptz not null default now()
);
create index on public.reports (coach_id, generated_at desc);

-- ============================================================================
-- 10. SISTEMA — preferências (persistência!), notificações, integrações,
--     segurança e auditoria. (Trata diretamente as lacunas dos relatórios.)
-- ============================================================================

-- 10.1 Preferências do utilizador (resolve "NÃO HÁ PERSISTÊNCIA")
create table public.user_settings (
  user_id            uuid primary key references public.profiles(id) on delete cascade,
  theme              public.theme_pref not null default 'dark',
  accent_color       text not null default '#FFB701',
  density            public.density_pref not null default 'comfortable',
  text_size          int not null default 100 check (text_size between 80 and 200),
  reduced_motion     boolean not null default false,
  language           text not null default 'pt',
  timezone           text not null default 'Europe/Lisbon',
  date_format        text not null default 'DD/MM/YYYY',
  time_format        text not null default '24h',
  -- Live
  live_units         text not null default 'kg',
  live_timer_enabled boolean not null default true,
  live_sound_enabled boolean not null default true,
  -- Notificações + horas de silêncio (passam a ter efeito real no backend)
  notif_push         boolean not null default true,
  notif_email        boolean not null default true,
  notif_sms          boolean not null default false,
  quiet_hours_start  time not null default '22:00',
  quiet_hours_end    time not null default '08:00',
  updated_at         timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

-- 10.2 Notificações in-app (centro de notificações + sino)
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,  -- destinatário
  type        public.notification_type not null default 'system',
  title       text not null,
  body        text,
  data        jsonb not null default '{}'::jsonb,
  action_url  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

-- 10.3 Integrações externas (OAuth/sync) — tokens protegidos por RLS do dono
create table public.integrations (
  id            uuid primary key default gen_random_uuid(),
  coach_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  provider      public.integration_provider not null,
  status        public.integration_status not null default 'disconnected',
  config        jsonb not null default '{}'::jsonb,
  access_token  text,                              -- produção: usar Supabase Vault
  refresh_token text,
  expires_at    timestamptz,
  last_sync_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (coach_id, provider)
);
create index on public.integrations (coach_id);

-- 10.4 Definições de segurança (alimentam o "gauge" de segurança)
create table public.security_settings (
  user_id               uuid primary key references public.profiles(id) on delete cascade,
  two_factor_enabled    boolean not null default false,
  two_factor_method     text,
  biometric_enabled     boolean not null default false,
  backup_codes_generated boolean not null default false,
  last_password_change  timestamptz,
  updated_at            timestamptz not null default now(),
  created_at            timestamptz not null default now()
);

-- 10.5 Códigos de recuperação (2FA) — guardados como HASH (nunca em claro)
create table public.backup_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.backup_codes (user_id) where used_at is null;

-- 10.6 Histórico de início de sessão (segurança)
create table public.login_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  ip         inet,
  device     text,
  location   text,
  user_agent text,
  success    boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.login_history (user_id, created_at desc);

-- 10.7 Auditoria (quem fez o quê) — boa prática transversal
create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  action     text not null,                        -- create | update | delete | login | export …
  entity     text,                                 -- nome da tabela/conceito
  entity_id  uuid,
  diff       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.audit_log (coach_id, created_at desc);

-- ============================================================================
-- 11. GATILHOS updated_at (aplicados a todas as tabelas com a coluna)
-- ============================================================================
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('drop trigger if exists trg_set_updated_at on public.%I;', r.table_name);
    execute format(
      'create trigger trg_set_updated_at before update on public.%I
         for each row execute function public.tg_set_updated_at();', r.table_name);
  end loop;
end $$;

-- ============================================================================
-- 12. SEGURANÇA — Row Level Security (RLS)
--     Regra de ouro: cada treinador só vê/edita o que é SEU (coach_id = auth.uid()).
-- ============================================================================

-- 12.1 Funções auxiliares (SECURITY DEFINER → evitam recursão de RLS)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

create or replace function public.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = auth.uid()
      and m.role in ('owner','admin')
  );
$$;

-- É o requerente admin/owner de alguma organização a que este treinador pertence?
create or replace function public.is_org_admin_of(_coach uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members me
    join public.organization_members coach_m
      on coach_m.organization_id = me.organization_id
    where me.user_id = auth.uid()
      and me.role in ('owner','admin')
      and coach_m.user_id = _coach
  );
$$;

-- Partilham organização?
create or replace function public.shares_org(_other uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m1
    join public.organization_members m2 on m1.organization_id = m2.organization_id
    where m1.user_id = auth.uid() and m2.user_id = _other
  );
$$;

-- É o atleta o próprio utilizador autenticado? (app do atleta — futuro)
create or replace function public.is_self_athlete(_athlete uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.athletes a where a.id = _athlete and a.user_id = auth.uid()
  );
$$;

-- 12.2 Política GENÉRICA para TODAS as tabelas com coach_id
--      (treinador dono OU admin da organização do treinador)
do $$
declare r record;
begin
  for r in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'coach_id'
  loop
    execute format('alter table public.%I enable row level security;', r.table_name);
    execute format('drop policy if exists coach_rls on public.%I;', r.table_name);
    execute format($f$
      create policy coach_rls on public.%I
        for all to authenticated
        using      (coach_id = (select auth.uid()) or public.is_org_admin_of(coach_id) or public.is_platform_admin())
        with check (coach_id = (select auth.uid()) or public.is_org_admin_of(coach_id) or public.is_platform_admin());
    $f$, r.table_name);
  end loop;
end $$;

-- 12.3 Acesso do PRÓPRIO ATLETA (leitura) às tabelas relevantes (app futura do atleta)
create policy athlete_self_read on public.athletes
  for select to authenticated using (user_id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array[
    'bookings','sessions','form_responses',
    'athlete_metrics','athlete_documents','athlete_allergies','assignments','form_assignments'
  ] loop
    execute format('drop policy if exists athlete_self_read on public.%I;', t);
    execute format($f$
      create policy athlete_self_read on public.%I
        for select to authenticated
        using (athlete_id is not null and public.is_self_athlete(athlete_id));
    $f$, t);
  end loop;
end $$;

-- 12.4 Tabelas SEM coach_id (escopo por utilizador / organização)

-- profiles
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or public.shares_org(id) or public.is_platform_admin());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

-- organizations
alter table public.organizations enable row level security;
drop policy if exists orgs_select on public.organizations;
create policy orgs_select on public.organizations
  for select to authenticated using (public.is_org_member(id) or public.is_platform_admin());
drop policy if exists orgs_insert on public.organizations;
create policy orgs_insert on public.organizations
  for insert to authenticated with check (created_by = (select auth.uid()));
drop policy if exists orgs_update on public.organizations;
create policy orgs_update on public.organizations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));
drop policy if exists orgs_delete on public.organizations;
create policy orgs_delete on public.organizations
  for delete to authenticated using (public.is_org_admin(id));

-- organization_members
alter table public.organization_members enable row level security;
drop policy if exists orgmem_select on public.organization_members;
create policy orgmem_select on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_org_member(organization_id));
drop policy if exists orgmem_write on public.organization_members;
create policy orgmem_write on public.organization_members
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- user_settings  (cada um só o seu)
alter table public.user_settings enable row level security;
drop policy if exists settings_rls on public.user_settings;
create policy settings_rls on public.user_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- security_settings
alter table public.security_settings enable row level security;
drop policy if exists sec_rls on public.security_settings;
create policy sec_rls on public.security_settings
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- backup_codes
alter table public.backup_codes enable row level security;
drop policy if exists backup_rls on public.backup_codes;
create policy backup_rls on public.backup_codes
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- notifications (destinatário)
alter table public.notifications enable row level security;
drop policy if exists notif_select on public.notifications;
create policy notif_select on public.notifications
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists notif_insert on public.notifications;
create policy notif_insert on public.notifications
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists notif_delete on public.notifications;
create policy notif_delete on public.notifications
  for delete to authenticated using (user_id = (select auth.uid()));

-- login_history (imutável: só select + insert do próprio)
alter table public.login_history enable row level security;
drop policy if exists login_select on public.login_history;
create policy login_select on public.login_history
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists login_insert on public.login_history;
create policy login_insert on public.login_history
  for insert to authenticated with check (user_id = (select auth.uid()));

-- 12.5 GRANTS (RLS continua a filtrar; sem grant, o role nem chega às tabelas)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant execute on functions to authenticated;
-- (anon não recebe nada: utilizador não autenticado não vê dados.)

-- ============================================================================
-- 13. PROVISIONAMENTO, FUNÇÕES DE NEGÓCIO E VISTAS
-- ============================================================================

-- 13.1 Ao criar utilizador no Supabase Auth → cria perfil + preferências + segurança
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
    values (new.id, coalesce(new.raw_user_meta_data->>'full_name','Treinador'), new.email)
    on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.security_settings (user_id, last_password_change)
    values (new.id, now()) on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 13.2 Score de segurança (alimenta o "gauge" das Definições): 0–100
create or replace function public.get_security_score(_user uuid default auth.uid())
returns int language sql stable security definer set search_path = '' as $$
  select least(100,
    70
    + case when s.two_factor_enabled    then 15 else 0 end
    + case when s.biometric_enabled      then 10 else 0 end
    + case when s.backup_codes_generated then 5  else 0 end
  )
  from public.security_settings s
  where s.user_id = coalesce(_user, auth.uid());
$$;

-- 13.3 Deteção de conflito de marcação (apoio à UI; o servidor já impede via constraint)
create or replace function public.has_booking_conflict(
  _coach uuid, _starts timestamptz, _ends timestamptz, _ignore uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.coach_id = _coach
      and b.type <> 'class'
      and b.status in ('pending','confirmed')
      and (_ignore is null or b.id <> _ignore)
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(_starts, _ends, '[)')
  );
$$;

-- 13.4 Vista: resumo do atleta (lista) — respeita RLS (security_invoker)
create or replace view public.athlete_summary
with (security_invoker = true) as
select
  a.id, a.coach_id, a.name, a.sport, a.status, a.avatar_url, a.current_plan_id,
  pl.name as current_plan_name,
  (select count(*) from public.athlete_allergies al where al.athlete_id = a.id) as allergy_count,
  (select count(*) from public.bookings b
     where b.athlete_id = a.id and b.starts_at >= now()
       and b.status in ('pending','confirmed')) as upcoming_bookings,
  (select max(s.started_at) from public.sessions s where s.athlete_id = a.id) as last_session_at,
  (select count(*) from public.form_responses fr
     where fr.athlete_id = a.id and fr.status = 'pending') as pending_forms
from public.athletes a
left join public.plans pl on pl.id = a.current_plan_id
where a.archived_at is null;

-- 13.5 Vista: agenda do dia / próximas marcações (Dashboard) — respeita RLS
create or replace view public.upcoming_bookings
with (security_invoker = true) as
select
  b.id, b.coach_id, b.athlete_id, a.name as athlete_name, a.avatar_url,
  b.type, b.status, b.title, b.starts_at, b.ends_at, b.location, b.class_id
from public.bookings b
left join public.athletes a on a.id = b.athlete_id
where b.status in ('pending','confirmed')
order by b.starts_at;

-- ============================================================================
-- FIM DO SCHEMA — LUNA.OS v1.0
-- Próximo: aplicar LUNA_OS_DB_seed.sql (demo) e gerar tipos (LUNA_OS_DB_types.ts).
-- ============================================================================
