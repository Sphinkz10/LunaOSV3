-- ============================================================================
-- LUNA.OS v3 · 0004_funcoes — conta, organização, convites, clientes, direitos,
-- saúde, exportação, agenda e lista de espera
-- ----------------------------------------------------------------------------
-- Regra (AUD-70): nenhuma função confia num id passado por parâmetro sem
-- verificar quem chama. As internas começam por "_" e não são executáveis
-- pelo cliente. anon não executa nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Conta nova: cria a pessoa, sem papel nenhum (AUD-71). Papel só ao criar uma
-- organização ou aceitar um convite.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.persons (user_id, full_name, email)
    values (new.id,
            coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Pessoa'),
            new.email)
    on conflict (user_id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.security_settings (user_id, last_password_change)
    values (new.id, now()) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public._require_person()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public.my_person_id();
begin
  if me is null then
    raise exception 'sessão necessária' using errcode = 'insufficient_privilege';
  end if;
  return me;
end $$;

-- ---------------------------------------------------------------------------
-- Criar organização (X-04): dono, unidade principal, período experimental,
-- direitos do plano e modalidade.
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  _name text, _type public.org_type, _sport text default 'fitness', _timezone text default 'Europe/Lisbon'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  v_org uuid;
  v_membership uuid;
  v_version int;
begin
  if coalesce(trim(_name), '') = '' then
    raise exception 'nome obrigatório' using errcode = 'check_violation';
  end if;

  insert into public.organizations (type, name, timezone, created_by)
    values (_type, trim(_name), _timezone, me) returning id into v_org;
  insert into public.units (org_id, name, timezone) values (v_org, 'Principal', _timezone);
  insert into public.memberships (org_id, person_id, status, joined_at)
    values (v_org, me, 'active', now()) returning id into v_membership;
  insert into public.membership_roles (org_id, membership_id, role_id)
    select v_org, v_membership, r.id from public.roles r where r.org_id is null and r.key = 'owner';

  insert into public.subscriptions (org_id, plan, seats, status, trial_ends_at)
    values (v_org, 'treinador', case when _type = 'solo_coach' then 1 else 3 end,
            'trial', now() + interval '30 days');
  insert into public.entitlements (org_id, module, limit_value, source)
    select v_org, pm.module, pm.limit_value, 'plan' from public.plan_modules pm where pm.plan = 'treinador';

  select max(s.version) into v_version from public.sports s where s.id = _sport;
  if v_version is not null then
    insert into public.org_sports (org_id, sport_id, sport_version) values (v_org, _sport, v_version);
  end if;

  update public.user_settings set last_org_id = v_org where user_id = auth.uid();
  return v_org;
end $$;

-- ---------------------------------------------------------------------------
-- Lugares e convites de equipa (G-44, J33)
-- ---------------------------------------------------------------------------
create or replace function public._seats_used(_org uuid)
returns int language sql stable security definer set search_path = '' as $$
  select (
    select count(distinct m.id)::int
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.org_id = _org and m.status = 'active' and r.occupies_seat
  ) + (
    select count(*)::int
    from public.invites i join public.roles r on r.id = i.role_id
    where i.org_id = _org and r.occupies_seat
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  );
$$;

create or replace function public.seats_summary(_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(_org) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'seats', (select s.seats from public.subscriptions s where s.org_id = _org),
    'used',  public._seats_used(_org));
end $$;

-- Devolve o código do convite (só aqui aparece em claro; a BD guarda o hash).
create or replace function public.create_invite(
  _org uuid, _email text, _role_key text, _unit uuid default null, _confirm_over_seats boolean default false
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role public.roles%rowtype;
  v_seats int;
  v_token text;
begin
  perform public._require_person();
  if not public.has_perm(_org, 'team.manage') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  select * into v_role from public.roles r
    where r.key = _role_key and (r.org_id = _org or r.org_id is null)
    order by r.org_id nulls last limit 1;
  if not found then
    raise exception 'papel desconhecido' using errcode = 'invalid_parameter_value';
  end if;
  if v_role.key = 'owner' and not public.has_perm(_org, 'org.manage') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;

  if v_role.occupies_seat then
    select s.seats into v_seats from public.subscriptions s where s.org_id = _org for update;
    if public._seats_used(_org) >= coalesce(v_seats, 0) then
      -- Acima dos lugares: só com confirmação de quem gere a subscrição (regra 4)
      if not _confirm_over_seats then
        raise exception 'seats_exceeded' using errcode = 'P0001',
          hint = 'Confirmar o lugar extra antes de convidar.';
      end if;
      if not public.has_perm(_org, 'org.manage') then
        raise exception 'sem permissão' using errcode = 'insufficient_privilege';
      end if;
      update public.subscriptions set seats = seats + 1 where org_id = _org;
    end if;
  end if;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invites (org_id, email, role_id, unit_id, token_hash, invited_by)
    values (_org, lower(trim(_email)), v_role.id, _unit,
            encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), public.my_person_id());
  return v_token;
end $$;

create or replace function public.accept_invite(_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  v_inv public.invites%rowtype;
  v_email text;
  v_membership uuid;
begin
  select * into v_inv from public.invites i
    where i.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
    for update;
  if not found or v_inv.accepted_at is not null or v_inv.revoked_at is not null
     or v_inv.expires_at <= now() then
    raise exception 'convite inválido ou expirado' using errcode = 'invalid_parameter_value';
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();
  if v_email is distinct from v_inv.email then
    raise exception 'este convite é para outro email' using errcode = 'insufficient_privilege';
  end if;

  insert into public.memberships (org_id, person_id, status, joined_at)
    values (v_inv.org_id, me, 'active', now())
    on conflict (org_id, person_id)
      do update set status = 'active', joined_at = now(), left_at = null
    returning id into v_membership;
  insert into public.membership_roles (org_id, membership_id, role_id)
    values (v_inv.org_id, v_membership, v_inv.role_id) on conflict do nothing;
  if v_inv.unit_id is not null then
    insert into public.membership_units (org_id, membership_id, unit_id)
      values (v_inv.org_id, v_membership, v_inv.unit_id) on conflict do nothing;
  end if;
  update public.invites set accepted_at = now() where id = v_inv.id;
  return v_inv.org_id;
end $$;

-- ---------------------------------------------------------------------------
-- Clientes: acrescentar (pessoa gerida pela organização até ter conta) e desligar
-- ---------------------------------------------------------------------------
create or replace function public.add_client(
  _org uuid, _full_name text, _email text default null, _phone text default null,
  _birth_date date default null, _responsible uuid default null,
  _type public.link_type default 'pt_client'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_mine uuid := public.my_membership_id(_org);
  v_responsible uuid := _responsible;
  v_person uuid;
  v_link uuid;
begin
  if not public.has_perm(_org, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(trim(_full_name), '') = '' then
    raise exception 'nome obrigatório' using errcode = 'check_violation';
  end if;
  -- Quem só vê os seus fica responsável pelo cliente que cria
  if not public.has_perm(_org, 'clients.read_all') then
    v_responsible := v_mine;
  elsif v_responsible is not null and not exists (
      select 1 from public.memberships m
      where m.id = v_responsible and m.org_id = _org and m.status = 'active') then
    raise exception 'responsável inválido' using errcode = 'invalid_parameter_value';
  end if;
  -- Duplicados (G-06): o mesmo email já é cliente desta organização
  if _email is not null and exists (
      select 1 from public.links l join public.persons p on p.id = l.person_id
      where l.org_id = _org and lower(p.email) = lower(trim(_email))) then
    raise exception 'duplicate_client' using errcode = 'unique_violation';
  end if;

  insert into public.persons (managed_by_org, full_name, email, phone, birth_date)
    values (_org, trim(_full_name), nullif(lower(trim(_email)), ''), _phone, _birth_date)
    returning id into v_person;
  insert into public.links (org_id, person_id, type, origin, status, responsible_membership_id)
    values (_org, v_person, _type, 'manual', 'active', coalesce(v_responsible, v_mine))
    returning id into v_link;
  -- Pessoa sem conta: a organização gere as partilhas até a pessoa assumir a conta
  insert into public.link_shares (org_id, link_id, person_id, category)
    select _org, v_link, v_person, c
    from unnest(enum_range(null::public.share_category)) c;
  return v_link;
end $$;

-- A pessoa desliga-se (J37): o acesso acaba na leitura seguinte.
create or replace function public.end_link(_link uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_my_link(_link) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.links set status = 'ended', ended_at = now() where id = _link;
  update public.link_shares set revoked_at = now() where link_id = _link and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Saúde: cada leitura pela organização é verificada e fica registada
-- ---------------------------------------------------------------------------
create or replace function public.get_person_health(_link uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link)
     or not public.org_has_share(l.org_id, l.person_id, 'health') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  insert into public.health_access_log (org_id, person_id, link_id, actor_user)
    values (l.org_id, l.person_id, l.id, auth.uid());
  return jsonb_build_object(
    'allergies', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'allergen', a.allergen, 'severity', a.severity,
                                          'reaction', a.reaction, 'notes', a.notes)
                       order by a.severity desc, a.allergen)
      from public.allergies a where a.person_id = l.person_id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Direitos (substituem as feature flags): a UI pergunta, os módulos desligados
-- não aparecem.
-- ---------------------------------------------------------------------------
create or replace function public.has_module(_org uuid, _module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(_org)
     and exists (select 1 from public.subscriptions s
                 where s.org_id = _org and s.status <> 'cancelled')
     and exists (select 1 from public.entitlements e
                 where e.org_id = _org and e.module = _module);
$$;

create or replace function public.my_modules(_org uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(e.module order by e.module), '{}')
  from public.entitlements e
  where e.org_id = _org and public.has_module(_org, e.module);
$$;

-- Seletor de organização (G-00): onde trabalho, com que papéis e permissões
create or replace function public.my_orgs()
returns table (
  org_id uuid, name text, type public.org_type, theme text, timezone text,
  membership_id uuid, roles text[], permissions text[], subscription_status public.subscription_status
) language sql stable security definer set search_path = '' as $$
  select o.id, o.name, o.type, o.theme, o.timezone, m.id,
         array(select r.key from public.membership_roles mr
               join public.roles r on r.id = mr.role_id
               where mr.membership_id = m.id order by r.key),
         array(select distinct perm from public.membership_roles mr
               join public.roles r on r.id = mr.role_id
               cross join unnest(r.permissions) perm
               where mr.membership_id = m.id order by perm),
         s.status
  from public.memberships m
  join public.persons p on p.id = m.person_id and p.user_id = auth.uid()
  join public.organizations o on o.id = m.org_id
  left join public.subscriptions s on s.org_id = o.id
  where m.status = 'active'
  order by o.name;
$$;

-- ---------------------------------------------------------------------------
-- Exportação (RGPD art. 15/20) — só os próprios dados, verificado aqui dentro
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person();
begin
  return jsonb_build_object(
    'person',            (select to_jsonb(p) - 'managed_by_org' from public.persons p where p.id = me),
    'settings',          (select to_jsonb(s) from public.user_settings s where s.user_id = auth.uid()),
    'links',             coalesce((select jsonb_agg(to_jsonb(l)) from public.links l where l.person_id = me), '[]'),
    'shares',            coalesce((select jsonb_agg(to_jsonb(s)) from public.link_shares s where s.person_id = me), '[]'),
    'memberships',       coalesce((select jsonb_agg(to_jsonb(m)) from public.memberships m where m.person_id = me), '[]'),
    'measurements',      coalesce((select jsonb_agg(to_jsonb(x)) from public.measurements x where x.person_id = me), '[]'),
    'allergies',         coalesce((select jsonb_agg(to_jsonb(x)) from public.allergies x where x.person_id = me), '[]'),
    'sessions',          coalesce((select jsonb_agg(to_jsonb(x)) from public.sessions x where x.person_id = me), '[]'),
    'session_exercises', coalesce((select jsonb_agg(to_jsonb(x)) from public.session_exercises x where x.person_id = me), '[]'),
    'session_sets',      coalesce((select jsonb_agg(to_jsonb(x)) from public.session_sets x where x.person_id = me), '[]'),
    'health_reads',      coalesce((select jsonb_agg(to_jsonb(x)) from public.health_access_log x where x.person_id = me), '[]'),
    'exported_at',       now());
end $$;

-- Dados da organização: só quem a gere. Os dados das pessoas não entram
-- (são delas); as integrações saem sem os ids dos segredos.
create or replace function public.export_org_data(_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
  t text;
  chunk jsonb;
begin
  if not public.has_perm(_org, 'org.manage') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  result := jsonb_build_object(
    'organization', (select to_jsonb(o) from public.organizations o where o.id = _org),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object('link_id', l.id, 'full_name', p.full_name,
                                          'email', p.email, 'phone', p.phone))
      from public.links l join public.persons p on p.id = l.person_id
      where l.org_id = _org), '[]'),
    'exported_at', now());
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'org_id' and tb.table_type = 'BASE TABLE'
      and c.table_name not in ('audit_log','health_access_log','measurements','allergies',
                               'sessions','session_exercises','session_sets','notifications',
                               'entitlements','integrations')
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.org_id = $1', t)
      into chunk using _org;
    result := result || jsonb_build_object(t, chunk);
  end loop;
  result := result || jsonb_build_object('integrations', coalesce((
    select jsonb_agg(to_jsonb(i) - 'access_token_secret_id' - 'refresh_token_secret_id')
    from public.integrations i where i.org_id = _org), '[]'));
  return result;
end $$;

-- ---------------------------------------------------------------------------
-- Agenda: conflitos (sem espreitar outras organizações)
-- ---------------------------------------------------------------------------
create or replace function public._booking_conflict(
  _membership uuid, _starts timestamptz, _ends timestamptz, _ignore uuid default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.membership_id = _membership
      and b.type <> 'class'
      and b.status in ('pending','confirmed')
      and (_ignore is null or b.id <> _ignore)
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(_starts, _ends, '[)')
  );
$$;

create or replace function public.has_booking_conflict(
  _org uuid, _membership uuid, _starts timestamptz, _ends timestamptz, _ignore uuid default null
) returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(_org)
     or not exists (select 1 from public.memberships m where m.id = _membership and m.org_id = _org) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  return public._booking_conflict(_membership, _starts, _ends, _ignore);
end $$;

-- Pontuação de segurança (gauge das Definições): só a própria conta
create or replace function public.get_security_score()
returns int language sql stable security definer set search_path = '' as $$
  select least(100,
    70
    + case when s.two_factor_enabled     then 15 else 0 end
    + case when s.biometric_enabled      then 10 else 0 end
    + case when s.backup_codes_generated then 5  else 0 end)
  from public.security_settings s
  where s.user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Lista de espera: ao cancelar, promove o primeiro do MESMO horário, com a
-- linha bloqueada e a lotação verificada (auditoria, Médio).
-- ---------------------------------------------------------------------------
create or replace function public.promote_from_waitlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  w public.waitlist%rowtype;
  v_capacity int;
  v_taken int;
  v_booking uuid;
begin
  if not (old.status in ('pending','confirmed') and new.status = 'cancelled') then
    return new;
  end if;

  if new.class_id is not null then
    -- Serializa as promoções desta aula
    select c.capacity into v_capacity from public.classes c where c.id = new.class_id for update;
    v_capacity := coalesce(new.capacity, v_capacity);
    select count(*) into v_taken from public.bookings b
      where b.class_id = new.class_id and b.starts_at = new.starts_at
        and b.link_id is not null and b.status in ('pending','confirmed');
    if v_taken >= v_capacity then
      return new;
    end if;
    select * into w from public.waitlist q
      where q.status = 'waiting' and q.class_id = new.class_id and q.requested_starts_at = new.starts_at
      order by q.priority, q.created_at
      limit 1 for update skip locked;
  elsif new.membership_id is not null then
    select * into w from public.waitlist q
      where q.status = 'waiting' and q.class_id is null
        and q.membership_id = new.membership_id and q.requested_starts_at = new.starts_at
      order by q.priority, q.created_at
      limit 1 for update skip locked;
    if found and public._booking_conflict(new.membership_id, new.starts_at, new.ends_at, new.id) then
      return new;  -- o horário já não está livre: o candidato fica à espera
    end if;
  end if;

  if w.id is null then
    return new;
  end if;

  insert into public.bookings (org_id, unit_id, room_id, membership_id, link_id, class_id, type,
                               session_type, status, title, starts_at, ends_at, location, source)
    values (new.org_id, new.unit_id, new.room_id, new.membership_id, w.link_id, new.class_id, new.type,
            new.session_type, 'confirmed', new.title, new.starts_at, new.ends_at, new.location, 'waitlist')
    returning id into v_booking;
  update public.waitlist set status = 'promoted', promoted_booking_id = v_booking where id = w.id;
  return new;
end $$;

create trigger trg_bookings_autopromote
  after update of status on public.bookings
  for each row execute function public.promote_from_waitlist();

-- ---------------------------------------------------------------------------
-- Integrações: tokens no Supabase Vault, nunca em colunas
-- ---------------------------------------------------------------------------
create or replace function public.set_integration_tokens(
  _integration uuid, _access text, _refresh text default null, _expires timestamptz default null
) returns void language plpgsql security definer set search_path = '' as $$
declare i public.integrations%rowtype;
begin
  select * into i from public.integrations where id = _integration for update;
  if not found or i.membership_id is distinct from public.my_membership_id(i.org_id) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if i.access_token_secret_id is null then
    i.access_token_secret_id := vault.create_secret(_access, 'integration:' || i.id || ':access');
  else
    perform vault.update_secret(i.access_token_secret_id, _access);
  end if;
  if _refresh is not null then
    if i.refresh_token_secret_id is null then
      i.refresh_token_secret_id := vault.create_secret(_refresh, 'integration:' || i.id || ':refresh');
    else
      perform vault.update_secret(i.refresh_token_secret_id, _refresh);
    end if;
  end if;
  update public.integrations
    set access_token_secret_id = i.access_token_secret_id,
        refresh_token_secret_id = i.refresh_token_secret_id,
        expires_at = _expires, status = 'connected'
    where id = i.id;
end $$;

-- ---------------------------------------------------------------------------
-- Vistas (respeitam o RLS de quem lê)
-- ---------------------------------------------------------------------------
create or replace view public.clients
with (security_invoker = true) as
select
  l.id, l.org_id, l.person_id, p.full_name, p.email, p.phone, p.birth_date, p.avatar_url,
  (p.user_id is not null) as has_account,
  l.type, l.origin, l.status, l.client_status, l.status_note,
  l.responsible_membership_id, l.current_plan_id,
  l.started_at, l.archived_at, l.archived_reason, l.created_at, l.updated_at
from public.links l
join public.persons p on p.id = l.person_id;

create or replace view public.staff
with (security_invoker = true) as
select
  m.id, m.org_id, m.person_id, p.full_name, p.email, p.avatar_url,
  m.status, m.title, m.title_valid_until, m.joined_at
from public.memberships m
join public.persons p on p.id = m.person_id;

grant select on public.clients, public.staff to authenticated;

-- ---------------------------------------------------------------------------
-- EXECUTE: anon nada; authenticated só as funções de API e de apoio ao RLS
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function
  public._require_person(),
  public._seats_used(uuid),
  public._booking_conflict(uuid, timestamptz, timestamptz, uuid),
  public.handle_new_user(),
  public.fn_audit(),
  public.promote_from_waitlist(),
  public.tg_set_updated_at(),
  public.tg_inherit_session_owner()
from authenticated;

alter default privileges in schema public revoke execute on functions from public;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'alter default privileges in schema public revoke execute on functions from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
end $$;
