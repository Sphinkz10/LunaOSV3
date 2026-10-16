-- ============================================================================
-- LUNA.OS v3 · 0001_identidade — pessoas, organizações, equipa e ligações
-- ----------------------------------------------------------------------------
-- Esqueleto de docs/11-modelo-de-dados.md (tarefa 01, D19):
--   Person · Guardianship · Organization · Unit (+ salas) · Role · Membership ·
--   Link (+ partilhas por categoria) · Sport · OrgSport · Subscription ·
--   Entitlement · PlatformInvoice.
-- Regras:
--   * Toda a tabela de negócio tem org_id e chave única (id, org_id), para as
--     chaves estrangeiras compostas impedirem ligações entre organizações.
--   * Os papéis vivem só em Membership (membership_roles). A pessoa não tem papel.
--   * Os dados que a pessoa produz têm person_id (0002) e só se leem com Link
--     ativo e partilha da categoria (0003).
-- Nomes no código em inglês; na interface vêm do vocabulário da modalidade.
-- ============================================================================

create extension if not exists "btree_gist";    -- EXCLUDE com uuid = na agenda

create or replace function public.tg_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.org_type            as enum ('solo_coach','studio','box','gym','club','online');
create type public.membership_status   as enum ('invited','active','left');
create type public.link_type           as enum ('member','pt_client','online','athlete');
create type public.link_origin         as enum ('manual','invite','athlete_code','signup');
create type public.link_status         as enum ('pending','active','paused','ended');
create type public.client_status       as enum ('active','blocked','return_to_play','injured','inactive');
create type public.share_category      as enum ('training','measurements','photos','checkins','health');
create type public.guardianship_status as enum ('pending','active','ended');
create type public.subscription_status as enum ('trial','active','grace','read_only','cancelled');
create type public.entitlement_source  as enum ('plan','extra');
create type public.group_type          as enum ('class','portfolio','program','age_group','squad','team');

-- ---------------------------------------------------------------------------
-- Person: a pessoa, com uma só conta (user_id). Um cliente acrescentado pelo
-- PT existe sem conta (user_id null) e é gerido pela organização que o criou
-- até a pessoa ter conta.
-- ---------------------------------------------------------------------------
create table public.persons (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users(id) on delete set null,
  managed_by_org  uuid,                                -- FK depois de organizations
  full_name       text not null,
  email           text,
  phone           text,
  birth_date      date,
  avatar_url      text,
  locale          text not null default 'pt-PT',
  timezone        text not null default 'Europe/Lisbon',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (user_id is not null or managed_by_org is not null)
);
create index on public.persons (lower(email));
create index on public.persons (managed_by_org);

create table public.guardianships (
  id                 uuid primary key default gen_random_uuid(),
  guardian_person_id uuid not null references public.persons(id) on delete cascade,
  minor_person_id    uuid not null references public.persons(id) on delete cascade,
  status             public.guardianship_status not null default 'pending',
  signatures         jsonb not null default '[]'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (guardian_person_id, minor_person_id),
  check (guardian_person_id <> minor_person_id)
);
create index on public.guardianships (minor_person_id);

-- ---------------------------------------------------------------------------
-- Organization, Unit, Room
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  type        public.org_type not null,
  name        text not null,
  slug        text unique,
  brand       jsonb not null default '{}'::jsonb,       -- logótipo, nome comercial
  theme       text not null default 'oceano' check (theme in ('oceano','ouro','limao','esboco')),
  timezone    text not null default 'Europe/Lisbon',
  created_by  uuid references public.persons(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.persons
  add constraint persons_managed_by_org_fk
  foreign key (managed_by_org) references public.organizations(id) on delete set null;

create table public.units (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null,
  address             text,
  timezone            text not null default 'Europe/Lisbon',   -- todas as datas da unidade
  opening_hours       jsonb not null default '{}'::jsonb,
  technical_director  uuid,                                    -- membership; FK abaixo
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, org_id)
);
create index on public.units (org_id);

create table public.rooms (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  unit_id     uuid not null,
  name        text not null,
  capacity    int check (capacity is null or capacity > 0),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id),
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete cascade
);
create index on public.rooms (org_id, unit_id);

-- ---------------------------------------------------------------------------
-- Role (catálogo: org_id null; papéis próprios: org_id da organização)
-- Permissões (texto, verificadas por public.has_perm):
--   org.manage · team.manage · clients.read_all · clients.read_own ·
--   clients.write · schedule.read_all · schedule.write · training.write ·
--   health.read (papel clínico)
-- ---------------------------------------------------------------------------
create table public.roles (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations(id) on delete cascade,
  key           text not null,
  name          text not null,
  permissions   text[] not null default '{}',
  occupies_seat boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index roles_catalog_key on public.roles (key) where org_id is null;
create unique index roles_org_key on public.roles (org_id, key) where org_id is not null;

insert into public.roles (key, name, permissions, occupies_seat) values
  ('owner', 'Dono',
   array['org.manage','team.manage','clients.read_all','clients.read_own','clients.write',
         'schedule.read_all','schedule.write','training.write','health.read'], true),
  ('manager', 'Gerente',
   array['team.manage','clients.read_all','clients.write','schedule.read_all','schedule.write',
         'training.write'], false),
  ('coach', 'Treinador',
   array['clients.read_own','clients.write','schedule.write','training.write'], true),
  ('reception', 'Receção',
   array['clients.read_all','schedule.read_all','schedule.write'], false),
  ('clinician', 'Clínico',
   array['clients.read_own','clients.write','schedule.write','health.read'], true);

-- ---------------------------------------------------------------------------
-- Membership: pessoa que trabalha numa organização (papéis, unidades, título)
-- ---------------------------------------------------------------------------
create table public.memberships (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  person_id         uuid not null references public.persons(id) on delete cascade,
  status            public.membership_status not null default 'invited',
  title             text,                              -- título profissional
  title_valid_until date,
  joined_at         timestamptz,
  left_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, person_id)
);
create index on public.memberships (person_id);

alter table public.units
  add constraint units_technical_director_fk
  foreign key (technical_director, org_id) references public.memberships(id, org_id)
  on delete set null (technical_director);

create table public.membership_roles (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  role_id       uuid not null references public.roles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  primary key (membership_id, role_id),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade
);
create index on public.membership_roles (org_id);

create table public.membership_units (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  unit_id       uuid not null,
  primary key (membership_id, unit_id),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade,
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete cascade
);

-- Convites de equipa (aceitar → Membership ativo). Só o hash do código fica na BD.
create table public.invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  email       text not null,
  role_id     uuid not null references public.roles(id) on delete cascade,
  unit_id     uuid,
  token_hash  text not null unique,
  invited_by  uuid references public.persons(id) on delete set null,
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  foreign key (unit_id, org_id) references public.units(id, org_id) on delete set null (unit_id)
);
create index on public.invites (org_id);
create index on public.invites (lower(email)) where accepted_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Link: pessoa acompanhada por uma organização. A pessoa controla as partilhas.
-- ---------------------------------------------------------------------------
create table public.links (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  person_id                 uuid not null references public.persons(id) on delete cascade,
  type                      public.link_type not null default 'pt_client',
  origin                    public.link_origin not null default 'manual',
  status                    public.link_status not null default 'active',
  responsible_membership_id uuid,
  client_status             public.client_status not null default 'active',
  status_note               text,
  current_plan_id           uuid,                     -- FK em 0002 (plans)
  started_at                timestamptz not null default now(),
  ended_at                  timestamptz,
  archived_at               timestamptz,
  archived_reason           text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (id, org_id),
  unique (id, person_id),
  unique (org_id, person_id),
  foreign key (responsible_membership_id, org_id) references public.memberships(id, org_id)
    on delete set null (responsible_membership_id)
);
create index on public.links (person_id);
create index on public.links (org_id, status);
create index on public.links (responsible_membership_id);

-- Partilhas por categoria. Ativa = revoked_at null. Revogar corta a leitura seguinte.
create table public.link_shares (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  link_id     uuid not null,
  person_id   uuid not null,
  category    public.share_category not null,
  granted_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (link_id, person_id) references public.links(id, person_id) on delete cascade
);
create unique index link_shares_active on public.link_shares (link_id, category) where revoked_at is null;
create index on public.link_shares (person_id, category) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Sport (catálogo versionado; o conteúdo vem de packages/modalidades) e OrgSport
-- ---------------------------------------------------------------------------
create table public.sports (
  id         text not null,
  version    int not null,
  config     jsonb not null,
  created_at timestamptz not null default now(),
  primary key (id, version)
);

create table public.org_sports (
  org_id              uuid not null references public.organizations(id) on delete cascade,
  sport_id            text not null,
  sport_version       int not null,
  vocabulary_override jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  primary key (org_id, sport_id),
  foreign key (sport_id, sport_version) references public.sports(id, version)
);

-- ---------------------------------------------------------------------------
-- Subscription, Entitlement, PlatformInvoice
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null unique references public.organizations(id) on delete cascade,
  plan          text not null default 'treinador',
  seats         int not null default 1 check (seats >= 0),
  status        public.subscription_status not null default 'trial',
  trial_ends_at timestamptz,
  provider_ref  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id)
);

-- Módulos de cada plano (os planos são combinações de direitos, não ramos no código)
create table public.plan_modules (
  plan        text not null,
  module      text not null,
  limit_value int,
  primary key (plan, module)
);
insert into public.plan_modules (plan, module) values
  ('treinador','today'), ('treinador','clients'), ('treinador','schedule'),
  ('treinador','training'), ('treinador','settings');

-- Direitos calculados, por organização (e por pessoa, para um plano de atleta futuro)
create table public.entitlements (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations(id) on delete cascade,
  person_id   uuid references public.persons(id) on delete cascade,
  module      text not null,
  limit_value int,
  source      public.entitlement_source not null default 'plan',
  created_at  timestamptz not null default now(),
  check (num_nonnulls(org_id, person_id) = 1)
);
create unique index entitlements_org_module on public.entitlements (org_id, module) where org_id is not null;
create unique index entitlements_person_module on public.entitlements (person_id, module) where person_id is not null;

create table public.platform_invoices (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid not null,
  period_start    date not null,
  period_end      date not null,
  amount_cents    int not null check (amount_cents >= 0),
  currency        text not null default 'EUR',
  document_ref    text,
  created_at      timestamptz not null default now(),
  foreign key (subscription_id, org_id) references public.subscriptions(id, org_id) on delete cascade
);
create index on public.platform_invoices (org_id);

-- ---------------------------------------------------------------------------
-- Conta: preferências, segurança, notificações, entradas (por utilizador Auth)
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  theme_mode         text not null default 'auto' check (theme_mode in ('dark','light','auto')),
  density            text not null default 'comfortable' check (density in ('compact','comfortable','spacious')),
  text_size          int not null default 100 check (text_size between 80 and 200),
  reduced_motion     boolean not null default false,
  date_format        text not null default 'DD/MM/YYYY',
  time_format        text not null default '24h',
  live_timer_enabled boolean not null default true,
  live_sound_enabled boolean not null default true,
  notif_push         boolean not null default true,
  notif_email        boolean not null default true,
  notif_sms          boolean not null default false,
  quiet_hours_start  time not null default '22:00',
  quiet_hours_end    time not null default '08:00',
  last_org_id        uuid references public.organizations(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.security_settings (
  user_id                uuid primary key references auth.users(id) on delete cascade,
  two_factor_enabled     boolean not null default false,
  two_factor_method      text,
  biometric_enabled      boolean not null default false,
  backup_codes_generated boolean not null default false,
  last_password_change   timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.backup_codes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  code_hash  text not null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.backup_codes (user_id) where used_at is null;

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  type       text not null default 'system',
  title      text not null,
  body       text,
  data       jsonb not null default '{}'::jsonb,
  action_url text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications (user_id, created_at desc);
create index on public.notifications (user_id) where read_at is null;

create table public.login_history (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  ip         inet,
  device     text,
  user_agent text,
  success    boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.login_history (user_id, created_at desc);
