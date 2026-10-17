-- ============================================================================
-- LUNA.OS v3 · 0007_equipa_conta — a minha conta, equipa e recuperação
-- assistida (tarefa 25)
-- ----------------------------------------------------------------------------
-- * Preferências da pessoa que a seguem entre aparelhos (tema pessoal,
--   primeiro dia da semana, idioma, fuso).
-- * Equipa (G-44): convite válido 7 dias, cancelar invalida a ligação,
--   histórico; desativar corta o acesso já e pede motivo, reativar pede motivo
--   e devolve o mesmo papel; nada se apaga.
-- * Recuperação assistida: a gerência gera um código de uso único (30 min,
--   mostrado uma vez, registado); 5 tentativas erradas bloqueiam e avisam.
-- ============================================================================

-- Preferências pessoais
alter table public.user_settings
  add column tema text check (tema in ('oceano','ouro','limao')),   -- null = o tema da organização
  add column week_start smallint not null default 1 check (week_start in (0, 1)),
  add column language text not null default 'pt-PT';

-- Convites de equipa: 7 dias
alter table public.invites alter column expires_at set default now() + interval '7 days';

-- Histórico de entradas e saídas da equipa (com motivo)
create table public.membership_events (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  action        text not null check (action in ('desativado','reativado','convidado','entrou','convite_cancelado')),
  reason        text,
  actor_user    uuid,
  created_at    timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade
);
create index on public.membership_events (org_id, created_at desc);

alter table public.membership_events enable row level security;
create policy membership_events_select on public.membership_events for select to authenticated
  using (public.has_perm(org_id, 'team.manage') or membership_id = public.my_membership_id(org_id));
grant select on public.membership_events to authenticated;
revoke insert, update, delete on public.membership_events from authenticated;

-- Desativar: corta o acesso já (o RLS deixa de reconhecer o membro em todos os
-- aparelhos na leitura seguinte); os papéis e o histórico ficam.
create or replace function public.deactivate_member(_membership uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.memberships%rowtype;
begin
  select * into m from public.memberships where id = _membership for update;
  if not found or not public.has_perm(m.org_id, 'team.manage') or m.person_id = public.my_person_id() then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(_reason), '') = '' then
    raise exception 'motivo obrigatório' using errcode = 'check_violation';
  end if;
  -- O último dono não sai
  if exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id
             where mr.membership_id = m.id and r.key = 'owner')
     and (select count(*) from public.memberships m2
          join public.membership_roles mr2 on mr2.membership_id = m2.id
          join public.roles r2 on r2.id = mr2.role_id
          where m2.org_id = m.org_id and m2.status = 'active' and r2.key = 'owner') <= 1 then
    raise exception 'a organização precisa de pelo menos um dono' using errcode = 'check_violation';
  end if;
  update public.memberships set status = 'left', left_at = now() where id = m.id;
  insert into public.membership_events (org_id, membership_id, action, reason, actor_user)
    values (m.org_id, m.id, 'desativado', trim(_reason), auth.uid());
end $$;

-- Reativar: devolve o mesmo papel (os membership_roles nunca saíram)
create or replace function public.reactivate_member(_membership uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.memberships%rowtype;
begin
  select * into m from public.memberships where id = _membership for update;
  if not found or not public.has_perm(m.org_id, 'team.manage') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(_reason), '') = '' then
    raise exception 'motivo obrigatório' using errcode = 'check_violation';
  end if;
  update public.memberships set status = 'active', left_at = null where id = m.id;
  insert into public.membership_events (org_id, membership_id, action, reason, actor_user)
    values (m.org_id, m.id, 'reativado', trim(_reason), auth.uid());
end $$;

-- Cancelar um convite invalida a ligação (o código deixa de abrir)
create or replace function public.cancel_invite(_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.invites%rowtype;
begin
  select * into i from public.invites where id = _invite for update;
  if not found or not public.has_perm(i.org_id, 'team.manage') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.invites set revoked_at = now() where id = i.id and accepted_at is null and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Recuperação assistida
-- ---------------------------------------------------------------------------
create table public.recovery_codes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  code_hash     text not null,
  created_by    uuid,
  expires_at    timestamptz not null default now() + interval '30 minutes',
  used_at       timestamptz,
  attempts      int not null default 0,
  blocked_at    timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade
);
create index on public.recovery_codes (membership_id) where used_at is null;
alter table public.recovery_codes enable row level security;
create policy recovery_codes_select on public.recovery_codes for select to authenticated
  using (public.has_perm(org_id, 'team.manage'));
grant select (id, org_id, membership_id, created_by, expires_at, used_at, attempts, blocked_at, created_at)
  on public.recovery_codes to authenticated;
revoke insert, update, delete on public.recovery_codes from authenticated;

-- A gerência gera o código (mostrado uma vez; fica registado na auditoria)
create or replace function public.create_recovery_code(_membership uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  m public.memberships%rowtype;
  v_code text := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
begin
  select * into m from public.memberships where id = _membership;
  if not found or not public.has_perm(m.org_id, 'team.manage') or m.person_id = public.my_person_id() then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.recovery_codes set used_at = now() where membership_id = m.id and used_at is null;
  insert into public.recovery_codes (org_id, membership_id, code_hash, created_by)
    values (m.org_id, m.id, encode(sha256(convert_to(v_code, 'UTF8')), 'hex'), auth.uid());
  insert into public.audit_log (org_id, person_id, actor_user, action, entity, entity_id)
    values (m.org_id, m.person_id, auth.uid(), 'recovery_code', 'memberships', m.id);
  return v_code;
end $$;

-- Só para o servidor (Edge Function com service_role): valida o código e
-- devolve o utilizador a quem mudar a palavra-passe. 5 erros bloqueiam.
create or replace function public._redeem_recovery_code(_email text, _code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c public.recovery_codes%rowtype;
  v_user uuid;
begin
  select rc.* into c
  from public.recovery_codes rc
  join public.memberships m on m.id = rc.membership_id
  join public.persons p on p.id = m.person_id
  join auth.users u on u.id = p.user_id
  where lower(u.email) = lower(trim(_email)) and rc.used_at is null and rc.expires_at > now()
  order by rc.created_at desc limit 1
  for update of rc;
  if not found then
    raise exception 'codigo_invalido' using errcode = 'invalid_parameter_value';
  end if;
  if c.blocked_at is not null then
    raise exception 'codigo_bloqueado' using errcode = 'check_violation';
  end if;
  if c.code_hash <> encode(sha256(convert_to(upper(trim(_code)), 'UTF8')), 'hex') then
    update public.recovery_codes set attempts = attempts + 1,
      blocked_at = case when attempts + 1 >= 5 then now() end
      where id = c.id;
    if c.attempts + 1 >= 5 then
      -- avisa quem gere a equipa
      insert into public.notifications (user_id, org_id, type, title, body)
        select p.user_id, c.org_id, 'security', 'Código de recuperação bloqueado',
               'Houve 5 tentativas erradas. Gera um código novo se for preciso.'
        from public.memberships m join public.persons p on p.id = m.person_id
        join public.membership_roles mr on mr.membership_id = m.id join public.roles r on r.id = mr.role_id
        where m.org_id = c.org_id and m.status = 'active' and 'team.manage' = any (r.permissions) and p.user_id is not null;
    end if;
    return null;
  end if;
  update public.recovery_codes set used_at = now() where id = c.id;
  select p.user_id into v_user from public.memberships m join public.persons p on p.id = m.person_id where m.id = c.membership_id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id)
    values (c.org_id, v_user, 'recovery_code_used', 'memberships', c.membership_id);
  return v_user;
end $$;

-- ---------------------------------------------------------------------------
-- Conflitos de gravação: o cliente envia a versão que leu (updated_at)
-- ---------------------------------------------------------------------------
-- (as atualizações usam .eq('updated_at', lida); 0 linhas = alterado por outra pessoa)

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function
  public._require_person(), public._seats_used(uuid), public._booking_conflict(uuid, timestamptz, timestamptz, uuid),
  public._link_aptidao(uuid), public._parq_pendencias(uuid), public._fim_tutela_maiores(),
  public._redeem_recovery_code(text, text),
  public.handle_new_user(), public.fn_audit(), public.promote_from_waitlist(), public.tg_set_updated_at(),
  public.tg_inherit_session_owner(), public.tg_sessao_aptidao()
from authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public._redeem_recovery_code(text, text) to service_role';
  end if;
end $$;
