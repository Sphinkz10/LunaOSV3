-- ============================================================================
-- LUNA.OS v3 · 0006_conta — consentimentos, PAR-Q, pendências, restrição e
-- aptidão (G-29), encarregado de educação (J31), convites de cliente e dois
-- fatores para dados de saúde (tarefa 05, D18)
-- ----------------------------------------------------------------------------
-- * Consentimentos: só de acrescentar; cada um fica auditado.
-- * PAR-Q: é da pessoa; a organização nunca vê as respostas. Um "Sim" cria a
--   pendência do atestado no responsável do cliente e bloqueia a primeira
--   sessão até haver atestado ou restrição registada em G-29.
-- * Encarregado: o menor fica à espera até o encarregado autorizar com conta
--   própria; o encarregado vê só as categorias que o menor partilha; aos 18
--   anos a tutela acaba sozinha.
-- * Dados de saúde (atestado, restrições, alergias) pela organização só com
--   sessão de dois fatores (aal2).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Dois fatores: nível da sessão (Supabase: JWT claim aal; shim: app.aal)
-- ---------------------------------------------------------------------------
create or replace function public.current_aal()
returns text language sql stable set search_path = '' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'aal',
    nullif(current_setting('app.aal', true), ''),
    'aal1');
$$;

-- A data de nascimento vem do registo (para saber logo se é menor)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_nasc date;
begin
  begin
    v_nasc := nullif(new.raw_user_meta_data->>'birth_date', '')::date;
  exception when others then v_nasc := null;
  end;
  insert into public.persons (user_id, full_name, email, birth_date)
    values (new.id,
            coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Pessoa'),
            new.email, v_nasc)
    on conflict (user_id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  insert into public.security_settings (user_id, last_password_change)
    values (new.id, now()) on conflict do nothing;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Idade e tutela
-- ---------------------------------------------------------------------------
create or replace function public.is_minor(_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.birth_date > (current_date - interval '18 years')::date
                   from public.persons p where p.id = _person), false);
$$;

alter table public.guardianships
  add column shares public.share_category[] not null default '{}',
  add column is_payer boolean not null default false,
  add column accepted_at timestamptz,
  add column ended_at timestamptz;

-- O encarregado vê só o que o menor partilha com ele; a tutela acaba aos 18
create or replace function public.is_guardian_with(_person uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.guardianships g
    where g.minor_person_id = _person and g.status = 'active'
      and g.guardian_person_id = public.my_person_id()
      and _cat = any (g.shares)
      and public.is_minor(_person)
  );
$$;

-- Tutela ativa (para gerir a conta do menor: consentimentos, convites)
create or replace function public.is_self_or_guardian(_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select _person = public.my_person_id()
      or exists (select 1 from public.guardianships g
                 where g.minor_person_id = _person and g.status = 'active'
                   and g.guardian_person_id = public.my_person_id()
                   and public.is_minor(_person));
$$;

-- O menor sem encarregado ativo fica à espera
create or replace function public.minor_waiting(_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_minor(_person)
     and not exists (select 1 from public.guardianships g
                     where g.minor_person_id = _person and g.status = 'active');
$$;

-- Dados da pessoa: o próprio; o encarregado na categoria partilhada; ou a
-- organização com ligação ativa e partilha (saúde: papel clínico e aal2)
create or replace function public.org_has_share(_org uuid, _person uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.links l
    join public.link_shares s on s.link_id = l.id and s.category = _cat and s.revoked_at is null
    where l.org_id = _org and l.person_id = _person and l.status = 'active'
      and public.can_see_link(l.id)
      and (_cat <> 'health' or (public.has_perm(_org, 'health.read') and public.current_aal() = 'aal2'))
  );
$$;

create or replace function public.can_read_person_data(_person uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select _person = public.my_person_id()
      or public.is_guardian_with(_person, _cat)
      or exists (
        select 1
        from public.links l
        join public.link_shares s on s.link_id = l.id and s.category = _cat and s.revoked_at is null
        where l.person_id = _person and l.status = 'active'
          and public.can_see_link(l.id)
          and (_cat <> 'health' or (public.has_perm(l.org_id, 'health.read') and public.current_aal() = 'aal2'))
      );
$$;

-- Escrever dados da pessoa: o próprio (modo solo) ou a organização com partilha.
-- O encarregado não escreve pelo menor.
create or replace function public.can_write_person_data(_person uuid, _org uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when _org is null then _person = public.my_person_id()
    else public.has_perm(_org, 'clients.write') and public.org_has_share(_org, _person, _cat)
  end;
$$;

-- As políticas de escrita eram "for all" e por isso também abriam a leitura:
-- a saúde ficava legível sem passar por get_person_health (sem registo) e o
-- encarregado via tudo. Passam a valer só para escrever.
do $$
declare t text; cat text;
begin
  foreach t in array array['measurements','allergies','sessions','session_exercises','session_sets'] loop
    cat := case t when 'measurements' then 'measurements' when 'allergies' then 'health' else 'training' end;
    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format($f$
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (public.can_write_person_data(person_id, org_id, %2$L));
      create policy %1$s_update on public.%1$I for update to authenticated
        using (public.can_write_person_data(person_id, org_id, %2$L))
        with check (public.can_write_person_data(person_id, org_id, %2$L));
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (public.can_write_person_data(person_id, org_id, %2$L));
    $f$, t, cat);
  end loop;
end $$;

drop policy if exists allergies_select on public.allergies;
create policy allergies_select on public.allergies for select to authenticated
  using (person_id = public.my_person_id() or public.is_guardian_with(person_id, 'health'));

-- Chaves compostas com a pessoa seguem em cascata quando uma pessoa gerida
-- pela organização passa a ser a conta da própria pessoa (convite aceite)
do $$
declare r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and c.confrelid in ('public.links'::regclass, 'public.sessions'::regclass, 'public.session_exercises'::regclass)
      and exists (select 1 from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
                  where a.attname = 'person_id')
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s on update cascade', r.tbl, r.conname, r.def);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Consentimentos (só de acrescentar)
-- ---------------------------------------------------------------------------
create table public.consents (
  id         bigint generated always as identity primary key,
  person_id  uuid not null references public.persons(id) on delete cascade,
  kind       text not null check (kind in ('termos','privacidade','dados_saude','comunicacoes','partilha_org','encarregado','pagador')),
  version    text not null,
  granted    boolean not null,
  org_id     uuid references public.organizations(id) on delete set null,
  link_id    uuid,
  actor_user uuid,
  created_at timestamptz not null default now()
);
create index on public.consents (person_id, kind, created_at desc);

create or replace view public.consents_current
with (security_invoker = true) as
select distinct on (person_id, kind, coalesce(org_id::text, ''))
  person_id, kind, org_id, version, granted, created_at
from public.consents
order by person_id, kind, coalesce(org_id::text, ''), created_at desc, id desc;

create or replace function public.record_consent(
  _kind text, _version text, _granted boolean, _person uuid default null, _org uuid default null
) returns void language plpgsql security definer set search_path = '' as $$
declare v_person uuid := coalesce(_person, public.my_person_id());
begin
  if v_person is null or not public.is_self_or_guardian(v_person) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  insert into public.consents (person_id, kind, version, granted, org_id, actor_user)
    values (v_person, _kind, _version, _granted, _org, auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Pendências da Inbox (G-02): tarefas da equipa sobre um cliente
-- ---------------------------------------------------------------------------
create table public.pendencias (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  link_id       uuid not null,
  membership_id uuid,                 -- a quem cabe (o responsável do cliente)
  kind          text not null check (kind in ('parq_atestado','encarregado_em_falta','restricao_a_rever')),
  title         text not null,
  status        text not null default 'aberta' check (status in ('aberta','resolvida')),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  resolved_by   uuid,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete set null (membership_id)
);
create unique index pendencias_uma_aberta on public.pendencias (link_id, kind) where status = 'aberta';
create index on public.pendencias (org_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- PAR-Q (da pessoa; a organização nunca vê as respostas)
-- ---------------------------------------------------------------------------
create table public.parq_responses (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references public.persons(id) on delete cascade,
  answers    jsonb not null,
  has_risk   boolean not null,
  created_at timestamptz not null default now()
);
create index on public.parq_responses (person_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Restrição e aptidão (G-29)
-- ---------------------------------------------------------------------------
create table public.restrictions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  link_id       uuid not null,
  person_id     uuid not null references public.persons(id) on delete cascade,
  kind          text not null check (kind in ('atestado','permitir','adaptar','bloquear')),
  zone          text,                 -- zona do corpo (joelho esquerdo…); null = geral
  notes         text,                 -- diagnóstico/causa: só papel clínico
  valid_until   date,
  review_on     date,                 -- rever a restrição
  recorded_by   uuid,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (link_id, person_id) references public.links(id, person_id) on delete cascade,
  foreign key (recorded_by, org_id) references public.memberships(id, org_id) on delete set null (recorded_by)
);
create index on public.restrictions (link_id, created_at desc);

-- Estado do cliente para quem o acompanha, sem detalhe clínico:
-- 'livre' | 'restricao' | 'bloqueado' | 'atestado_em_falta'
create or replace function public._link_aptidao(_link uuid)
returns text language sql stable security definer set search_path = '' as $$
  with ativas as (
    select r.kind, r.zone from public.restrictions r
    where r.link_id = _link and r.revoked_at is null
      and (r.valid_until is null or r.valid_until >= current_date)
  )
  select case
    when exists (select 1 from ativas where kind = 'bloquear' and zone is null) then 'bloqueado'
    when exists (select 1 from public.pendencias p
                 where p.link_id = _link and p.kind = 'parq_atestado' and p.status = 'aberta') then 'atestado_em_falta'
    when exists (select 1 from ativas where kind in ('adaptar', 'bloquear')) then 'restricao'
    else 'livre'
  end;
$$;

-- Efeito das restrições por zona, sem a causa (para toda a equipa que vê o cliente)
create or replace function public.client_restricoes_efeito(_link uuid)
returns table (zone text, kind text, review_on date)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_see_link(_link) or public.is_my_link(_link)) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  return query
    select distinct on (coalesce(r.zone, '')) r.zone, r.kind, r.review_on
    from public.restrictions r
    where r.link_id = _link and r.revoked_at is null and r.kind in ('permitir','adaptar','bloquear')
      and (r.valid_until is null or r.valid_until >= current_date)
    order by coalesce(r.zone, ''), r.created_at desc;
end $$;

create or replace function public.client_aptidao(_link uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.can_see_link(_link) or public.is_my_link(_link)) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  return public._link_aptidao(_link);
end $$;

-- A primeira sessão fica bloqueada até haver atestado ou restrição (G-29)
create or replace function public.tg_sessao_aptidao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.link_id is not null and new.org_id is not null then
    if public._link_aptidao(new.link_id) in ('atestado_em_falta', 'bloqueado') then
      raise exception 'aptidao_em_falta' using errcode = 'check_violation',
        hint = 'Registar o atestado ou a restrição em G-29 antes da sessão.';
    end if;
  end if;
  return new;
end $$;
create trigger trg_sessao_aptidao before insert on public.sessions
  for each row execute function public.tg_sessao_aptidao();

-- Pendência do atestado para cada ligação ativa da pessoa (sem a resposta)
create or replace function public._parq_pendencias(_person uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pendencias (org_id, link_id, membership_id, kind, title)
  select l.org_id, l.id, l.responsible_membership_id, 'parq_atestado',
         'Atestado médico em falta (PAR-Q)'
  from public.links l
  where l.person_id = _person and l.status = 'active'
    and not exists (select 1 from public.restrictions r
                    where r.link_id = l.id and r.revoked_at is null
                      and (r.valid_until is null or r.valid_until >= current_date))
  on conflict do nothing;
end $$;

create or replace function public.submit_parq(_answers jsonb, _person uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid := coalesce(_person, public.my_person_id());
  v_risco boolean;
begin
  if v_person is null or not public.is_self_or_guardian(v_person) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(_answers) <> 'object' then
    raise exception 'respostas inválidas' using errcode = 'invalid_parameter_value';
  end if;
  select coalesce(bool_or(value = 'true'::jsonb), false) into v_risco from jsonb_each(_answers);
  insert into public.parq_responses (person_id, answers, has_risk) values (v_person, _answers, v_risco);
  if v_risco then perform public._parq_pendencias(v_person); end if;
  return v_risco;
end $$;

-- Registar atestado ou restrição (papel clínico, dois fatores); resolve a pendência
create or replace function public.record_restriction(
  _link uuid, _kind text, _notes text default null, _valid_until date default null,
  _zone text default null, _review_on date default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; v_id uuid;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'health.read') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if public.current_aal() <> 'aal2' then
    raise exception 'mfa_required' using errcode = 'insufficient_privilege', hint = 'Ativa os dois fatores.';
  end if;
  insert into public.restrictions (org_id, link_id, person_id, kind, zone, notes, valid_until, review_on, recorded_by)
    values (l.org_id, l.id, l.person_id, _kind, nullif(trim(_zone), ''), _notes, _valid_until, _review_on, public.my_membership_id(l.org_id))
    returning id into v_id;
  update public.pendencias set status = 'resolvida', resolved_at = now(), resolved_by = auth.uid()
    where link_id = _link and kind = 'parq_atestado' and status = 'aberta';
  return v_id;
end $$;

create or replace function public.revoke_restriction(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.restrictions%rowtype;
begin
  select * into r from public.restrictions where id = _id;
  if not found or not public.can_see_link(r.link_id) or not public.has_perm(r.org_id, 'health.read') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if public.current_aal() <> 'aal2' then
    raise exception 'mfa_required' using errcode = 'insufficient_privilege';
  end if;
  update public.restrictions set revoked_at = now() where id = _id and revoked_at is null;
end $$;

-- ---------------------------------------------------------------------------
-- Encarregado de educação (J31, C-25)
-- ---------------------------------------------------------------------------
create table public.guardian_requests (
  id              uuid primary key default gen_random_uuid(),
  minor_person_id uuid not null references public.persons(id) on delete cascade,
  guardian_email  text not null,
  guardian_phone  text,
  token_hash      text not null unique,
  status          text not null default 'pending' check (status in ('pending','accepted','expired','cancelled')),
  expires_at      timestamptz not null default now() + interval '7 days',
  created_at      timestamptz not null default now()
);
create index on public.guardian_requests (minor_person_id);

-- Saída de mensagens (SMS e email): o processador (Edge Function) envia
create table public.outbox (
  id         bigint generated always as identity primary key,
  channel    text not null check (channel in ('email','sms','push')),
  recipient  text not null,
  template   text not null,
  payload    jsonb not null default '{}'::jsonb,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.request_guardian(_email text, _phone text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_minor(me) then
    raise exception 'só para menores de 18 anos' using errcode = 'check_violation';
  end if;
  update public.guardian_requests set status = 'cancelled' where minor_person_id = me and status = 'pending';
  insert into public.guardian_requests (minor_person_id, guardian_email, guardian_phone, token_hash)
    values (me, lower(trim(_email)), _phone, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  insert into public.outbox (channel, recipient, template, payload)
    values ('email', lower(trim(_email)), 'pedido_encarregado', jsonb_build_object('token', v_token));
  if _phone is not null then
    insert into public.outbox (channel, recipient, template, payload)
      values ('sms', _phone, 'pedido_encarregado', jsonb_build_object('token', v_token));
  end if;
  return v_token;
end $$;

-- O encarregado autoriza com conta própria e assina como encarregado e pagador
create or replace function public.accept_guardianship(_token text, _is_payer boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  r public.guardian_requests%rowtype;
begin
  select * into r from public.guardian_requests
    where token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex') for update;
  if not found or r.status <> 'pending' or r.expires_at <= now() then
    raise exception 'pedido inválido ou expirado' using errcode = 'invalid_parameter_value';
  end if;
  if me = r.minor_person_id then
    raise exception 'o encarregado precisa de conta própria' using errcode = 'check_violation';
  end if;
  insert into public.guardianships (guardian_person_id, minor_person_id, status, is_payer, accepted_at, signatures)
    values (me, r.minor_person_id, 'active', _is_payer, now(),
            jsonb_build_array(jsonb_build_object('kind', 'encarregado', 'at', now()))
            || case when _is_payer then jsonb_build_array(jsonb_build_object('kind', 'pagador', 'at', now())) else '[]'::jsonb end)
    on conflict (guardian_person_id, minor_person_id)
      do update set status = 'active', is_payer = excluded.is_payer, accepted_at = now(), ended_at = null;
  insert into public.consents (person_id, kind, version, granted, actor_user)
    values (r.minor_person_id, 'encarregado', '1', true, auth.uid());
  if _is_payer then
    insert into public.consents (person_id, kind, version, granted, actor_user)
      values (r.minor_person_id, 'pagador', '1', true, auth.uid());
  end if;
  update public.guardian_requests set status = 'accepted' where id = r.id;
  update public.pendencias set status = 'resolvida', resolved_at = now(), resolved_by = auth.uid()
    where kind = 'encarregado_em_falta' and status = 'aberta'
      and link_id in (select id from public.links where person_id = r.minor_person_id);
  return r.minor_person_id;
end $$;

-- O menor escolhe o que o encarregado vê
create or replace function public.set_guardian_shares(_shares public.share_category[])
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person();
begin
  update public.guardianships set shares = _shares where minor_person_id = me and status = 'active';
  insert into public.consents (person_id, kind, version, granted, actor_user)
    values (me, 'encarregado', 'partilhas:' || array_to_string(_shares, ','), true, auth.uid());
end $$;

-- Aos 18 anos a conta passa só para o menor (corre todos os dias)
create or replace function public._fim_tutela_maiores()
returns int language sql security definer set search_path = '' as $$
  with fim as (
    update public.guardianships g set status = 'ended', ended_at = now()
    where g.status = 'active' and not public.is_minor(g.minor_person_id)
    returning 1)
  select count(*)::int from fim;
$$;

-- ---------------------------------------------------------------------------
-- Convite de cliente (C-01): a pessoa aceita e escolhe o que partilha
-- ---------------------------------------------------------------------------
create table public.link_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  link_id     uuid not null,
  email       text,
  token_hash  text not null unique,
  expires_at  timestamptz not null default now() + interval '30 days',
  accepted_at timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);

create or replace function public.create_link_invite(_link uuid, _email text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  l public.links%rowtype;
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  insert into public.link_invites (org_id, link_id, email, token_hash)
    values (l.org_id, l.id, nullif(lower(trim(_email)), ''), encode(sha256(convert_to(v_token, 'UTF8')), 'hex'));
  if _email is not null then
    insert into public.outbox (channel, recipient, template, payload)
      values ('email', lower(trim(_email)), 'convite_cliente', jsonb_build_object('token', v_token, 'org', l.org_id));
  end if;
  return v_token;
end $$;

-- Devolve 'ligado' ou 'a_espera_encarregado' (o menor fica à espera e a equipa é avisada)
create or replace function public.accept_link_invite(_token text, _shares public.share_category[])
returns text language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  i public.link_invites%rowtype;
  l public.links%rowtype;
  v_antigo uuid;
  c public.share_category;
begin
  select * into i from public.link_invites
    where token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex') for update;
  if not found or i.accepted_at is not null or i.expires_at <= now() then
    raise exception 'convite inválido ou expirado' using errcode = 'invalid_parameter_value';
  end if;
  select * into l from public.links where id = i.link_id for update;

  -- Menor sem encarregado: a conta fica à espera e a equipa é avisada
  if public.minor_waiting(me) then
    insert into public.pendencias (org_id, link_id, membership_id, kind, title)
      values (l.org_id, l.id, l.responsible_membership_id, 'encarregado_em_falta', 'Encarregado de educação por autorizar')
      on conflict do nothing;
    return 'a_espera_encarregado';
  end if;

  -- A pessoa gerida pela organização passa a ser a conta (a mesma pessoa)
  v_antigo := l.person_id;
  if v_antigo <> me then
    if exists (select 1 from public.links x where x.org_id = l.org_id and x.person_id = me) then
      raise exception 'já estás ligado a esta organização' using errcode = 'unique_violation';
    end if;
    if exists (select 1 from public.persons p where p.id = v_antigo and p.user_id is not null) then
      raise exception 'este convite já foi usado por outra conta' using errcode = 'insufficient_privilege';
    end if;
    -- As chaves (link, pessoa) e (sessão, pessoa) seguem em cascata
    update public.links set person_id = me where id = l.id;
    update public.sessions set person_id = me where person_id = v_antigo;
    update public.measurements set person_id = me where person_id = v_antigo;
    update public.allergies set person_id = me where person_id = v_antigo;
    update public.restrictions set person_id = me where person_id = v_antigo;
    delete from public.persons where id = v_antigo and user_id is null;
  end if;

  -- Partilhas exatamente como escolhidas
  update public.link_shares set revoked_at = now()
    where link_id = l.id and revoked_at is null and not (category = any (_shares));
  foreach c in array _shares loop
    insert into public.link_shares (org_id, link_id, person_id, category)
      values (l.org_id, l.id, me, c) on conflict do nothing;
  end loop;
  update public.links set status = 'active', origin = 'invite' where id = l.id;
  update public.link_invites set accepted_at = now() where id = i.id;
  insert into public.consents (person_id, kind, version, granted, org_id, link_id, actor_user)
    values (me, 'partilha_org', array_to_string(_shares, ','), true, l.org_id, l.id, auth.uid());

  -- PAR-Q com risco já respondido: a nova organização recebe a pendência
  if exists (select 1 from public.parq_responses r where r.person_id = me and r.has_risk
             and r.created_at = (select max(created_at) from public.parq_responses where person_id = me)) then
    perform public._parq_pendencias(me);
  end if;
  return 'ligado';
end $$;

-- ---------------------------------------------------------------------------
-- RLS e grants das tabelas novas
-- ---------------------------------------------------------------------------
alter table public.consents enable row level security;
alter table public.pendencias enable row level security;
alter table public.parq_responses enable row level security;
alter table public.restrictions enable row level security;
alter table public.guardian_requests enable row level security;
alter table public.outbox enable row level security;
alter table public.link_invites enable row level security;

create policy consents_select on public.consents for select to authenticated
  using (public.is_self_or_guardian(person_id));
create policy parq_select on public.parq_responses for select to authenticated
  using (public.is_self_or_guardian(person_id));
create policy pendencias_select on public.pendencias for select to authenticated
  using (public.can_see_link(link_id)
         and (membership_id = public.my_membership_id(org_id) or public.has_perm(org_id, 'clients.read_all')));
create policy pendencias_update on public.pendencias for update to authenticated
  using (public.can_see_link(link_id) and public.has_perm(org_id, 'clients.write'))
  with check (public.can_see_link(link_id) and public.has_perm(org_id, 'clients.write'));
create policy restrictions_select on public.restrictions for select to authenticated
  using ((public.has_perm(org_id, 'health.read') and public.can_see_link(link_id) and public.current_aal() = 'aal2')
         or person_id = public.my_person_id() or public.is_guardian_with(person_id, 'health'));
create policy guardian_requests_select on public.guardian_requests for select to authenticated
  using (minor_person_id = public.my_person_id());
create policy link_invites_select on public.link_invites for select to authenticated
  using (public.can_see_link(link_id));

-- Leitura com RLS; escritas só pelas funções
grant select on public.consents, public.parq_responses, public.restrictions, public.guardian_requests,
  public.link_invites, public.pendencias to authenticated;
revoke all on public.consents, public.parq_responses, public.restrictions, public.guardian_requests,
  public.outbox, public.link_invites, public.pendencias from anon;
revoke insert, update, delete on public.consents, public.parq_responses, public.restrictions,
  public.guardian_requests, public.outbox, public.link_invites from authenticated;
revoke insert, delete on public.pendencias from authenticated;
revoke update on public.pendencias from authenticated;
grant update (status, resolved_at, resolved_by) on public.pendencias to authenticated;
revoke all on public.outbox from authenticated;
grant select on public.consents_current to authenticated;

-- Auditoria dos consentimentos e das restrições
create trigger trg_audit after insert or update or delete on public.restrictions
  for each row execute function public.fn_audit();
create trigger trg_audit after insert or update or delete on public.guardianships
  for each row execute function public.fn_audit();

-- EXECUTE: anon nada; internas fora do cliente
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function
  public._require_person(), public._seats_used(uuid), public._booking_conflict(uuid, timestamptz, timestamptz, uuid),
  public._link_aptidao(uuid), public._parq_pendencias(uuid), public._fim_tutela_maiores(),
  public.handle_new_user(), public.fn_audit(), public.promote_from_waitlist(), public.tg_set_updated_at(),
  public.tg_inherit_session_owner(), public.tg_sessao_aptidao()
from authenticated;
