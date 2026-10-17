-- ============================================================
-- LUNA.OS v3 · 0010 · Clientes (tarefa 17, P-07): duplicados por
-- telemóvel, email ou NIF; juntar mantendo o histórico dos dois e com
-- desfazer; convidar para a app por email, SMS ou código; rascunhos de
-- 7 dias que passam entre aparelhos.
-- ============================================================

alter table public.persons add column tax_id text;   -- NIF (faturas na F2; aqui serve os duplicados)

-- Telemóvel comparável: só dígitos, sem o indicativo de Portugal
create or replace function public._tel(_t text) returns text
language sql immutable set search_path = '' as $$
  select case
    when _t is null or regexp_replace(_t, '\D', '', 'g') = '' then null
    when regexp_replace(_t, '\D', '', 'g') ~ '^(00)?351\d{9}$' then right(regexp_replace(_t, '\D', '', 'g'), 9)
    else regexp_replace(_t, '\D', '', 'g')
  end;
$$;
create index persons_tel on public.persons (public._tel(phone));
create index persons_nif on public.persons (tax_id) where tax_id is not null;

-- ---------------------------------------------------------------------------
-- Duplicados ao escrever (P-07). Quem não vê o cliente sabe que existe, mas
-- não vê os dados (pede à gerência para juntar).
-- ---------------------------------------------------------------------------
create or replace function public.find_client_duplicates(
  _org uuid, _phone text default null, _email text default null, _nif text default null, _exclude uuid default null
) returns table (link_id uuid, full_name text, motivo text, client_status public.client_status, archived boolean, sessions int, visible boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(_org, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  return query
  select
    case when public.can_see_link(l.id) then l.id end,
    case when public.can_see_link(l.id) then p.full_name else 'Cliente de outro responsável' end,
    case
      when _phone is not null and public._tel(p.phone) = public._tel(_phone) then 'telefone'
      when _email is not null and lower(p.email) = lower(trim(_email)) then 'email'
      else 'nif' end,
    l.client_status, l.archived_at is not null,
    (select count(*)::int from public.bookings b where b.link_id = l.id and b.status = 'completed')
      + (select count(*)::int from public.sessions s where s.link_id = l.id and s.phase = 'done'),
    public.can_see_link(l.id)
  from public.links l join public.persons p on p.id = l.person_id
  where l.org_id = _org and l.status <> 'ended' and (_exclude is null or l.id <> _exclude)
    and ((_phone is not null and length(public._tel(_phone)) >= 9 and public._tel(p.phone) = public._tel(_phone))
      or (_email is not null and trim(_email) <> '' and lower(p.email) = lower(trim(_email)))
      or (_nif is not null and trim(_nif) <> '' and p.tax_id = trim(_nif)))
  limit 5;
end $$;

-- add_client com telemóvel e NIF a contar para duplicados
drop function public.add_client(uuid, text, text, text, date, uuid, public.link_type);
create function public.add_client(
  _org uuid, _full_name text, _email text default null, _phone text default null,
  _birth_date date default null, _responsible uuid default null,
  _type public.link_type default 'pt_client', _tax_id text default null
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
  if not public.has_perm(_org, 'clients.read_all') then
    v_responsible := v_mine;
  elsif v_responsible is not null and not exists (
      select 1 from public.memberships m
      where m.id = v_responsible and m.org_id = _org and m.status = 'active') then
    raise exception 'responsável inválido' using errcode = 'invalid_parameter_value';
  end if;
  -- Nenhum cliente fica duplicado pelo mesmo telemóvel, email ou NIF (P-07)
  if exists (
      select 1 from public.links l join public.persons p on p.id = l.person_id
      where l.org_id = _org and l.status <> 'ended'
        and ((_email is not null and trim(_email) <> '' and lower(p.email) = lower(trim(_email)))
          or (_phone is not null and public._tel(_phone) is not null and public._tel(p.phone) = public._tel(_phone))
          or (_tax_id is not null and trim(_tax_id) <> '' and p.tax_id = trim(_tax_id)))) then
    raise exception 'duplicate_client' using errcode = 'unique_violation';
  end if;

  insert into public.persons (managed_by_org, full_name, email, phone, birth_date, tax_id)
    values (_org, trim(_full_name), nullif(lower(trim(_email)), ''), nullif(trim(_phone), ''), _birth_date, nullif(trim(_tax_id), ''))
    returning id into v_person;
  insert into public.links (org_id, person_id, type, origin, status, responsible_membership_id)
    values (_org, v_person, _type, 'manual', 'active', coalesce(v_responsible, v_mine))
    returning id into v_link;
  insert into public.link_shares (org_id, link_id, person_id, category)
    select _org, v_link, v_person, c
    from unnest(enum_range(null::public.share_category)) c;
  return v_link;
end $$;

-- ---------------------------------------------------------------------------
-- Juntar dois clientes: o histórico dos dois fica no que se mantém; o outro
-- fica arquivado. Tudo o que mudou fica registado para Desfazer.
-- ---------------------------------------------------------------------------
create table public.client_merges (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  keep_link   uuid not null,
  drop_link   uuid not null,
  drop_person uuid not null,
  moved       jsonb not null,
  merged_by   uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  undone_at   timestamptz,
  foreign key (keep_link, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (drop_link, org_id) references public.links(id, org_id) on delete cascade
);
alter table public.client_merges enable row level security;
create policy client_merges_select on public.client_merges for select to authenticated
  using (public.can_see_link(keep_link));
grant select on public.client_merges to authenticated;
revoke all on public.client_merges from anon;

create or replace function public.merge_clients(_keep uuid, _drop uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  k public.links%rowtype; d public.links%rowtype;
  v_moved jsonb := '{}'::jsonb; v_ids uuid[]; v_id uuid;
begin
  select * into k from public.links where id = _keep;
  select * into d from public.links where id = _drop;
  if k.id is null or d.id is null or k.org_id <> d.org_id or k.id = d.id
     or not public.can_see_link(k.id) or not public.can_see_link(d.id) or not public.has_perm(k.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.persons p where p.id = d.person_id and p.user_id is not null) then
    raise exception 'o cliente a juntar já tem conta própria; junta ao contrário' using errcode = 'check_violation';
  end if;

  with m as (update public.bookings set link_id = k.id where link_id = d.id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('bookings', coalesce(v_ids, '{}'));
  with m as (update public.assignments a set link_id = k.id where a.link_id = d.id
               and not exists (select 1 from public.assignments x where x.link_id = k.id and x.status in ('active','scheduled')
                               and a.status in ('active','scheduled') and (x.plan_id = a.plan_id or x.workout_id = a.workout_id))
             returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('assignments', coalesce(v_ids, '{}'));
  with m as (update public.client_notes set link_id = k.id where link_id = d.id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('client_notes', coalesce(v_ids, '{}'));
  with m as (update public.client_documents set link_id = k.id where link_id = d.id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('client_documents', coalesce(v_ids, '{}'));
  with m as (update public.pendencias p set link_id = k.id where p.link_id = d.id
               and not exists (select 1 from public.pendencias x where x.link_id = k.id and x.kind = p.kind and x.status = 'aberta' and p.status = 'aberta')
             returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('pendencias', coalesce(v_ids, '{}'));
  -- Grupos: entra nos grupos do outro (sem repetir)
  with m as (insert into public.group_members (org_id, group_id, link_id)
               select k.org_id, gm.group_id, k.id from public.group_members gm where gm.link_id = d.id
               on conflict do nothing returning group_id) select array_agg(group_id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('groups_added', coalesce(v_ids, '{}'));
  -- Dados da pessoa gerida (sem conta) passam para a pessoa que fica
  with m as (update public.sessions set link_id = k.id, person_id = k.person_id where link_id = d.id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('sessions', coalesce(v_ids, '{}'));
  with m as (update public.sessions set person_id = k.person_id where person_id = d.person_id and link_id is null returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('sessions_person', coalesce(v_ids, '{}'));
  with m as (update public.restrictions set link_id = k.id, person_id = k.person_id where link_id = d.id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('restrictions', coalesce(v_ids, '{}'));
  with m as (update public.measurements set person_id = k.person_id where person_id = d.person_id and org_id = k.org_id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('measurements', coalesce(v_ids, '{}'));
  with m as (update public.allergies set person_id = k.person_id where person_id = d.person_id returning id) select array_agg(id) into v_ids from m;
  v_moved := v_moved || jsonb_build_object('allergies', coalesce(v_ids, '{}'));

  update public.links set archived_at = now(), archived_reason = 'Juntado com ' || (select full_name from public.persons where id = k.person_id)
    where id = d.id;
  insert into public.client_merges (org_id, keep_link, drop_link, drop_person, moved, merged_by)
    values (k.org_id, k.id, d.id, d.person_id, v_moved, auth.uid()) returning id into v_id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id)
    values (k.org_id, auth.uid(), 'cliente.juntar', 'links', k.id);
  return v_id;
end $$;

create or replace function public.undo_merge(_merge uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.client_merges%rowtype; mv jsonb;
begin
  select * into g from public.client_merges where id = _merge for update;
  if not found or g.undone_at is not null or not public.can_see_link(g.keep_link) or not public.has_perm(g.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  mv := g.moved;
  update public.bookings set link_id = g.drop_link where id in (select (jsonb_array_elements_text(mv->'bookings'))::uuid);
  update public.assignments set link_id = g.drop_link where id in (select (jsonb_array_elements_text(mv->'assignments'))::uuid);
  update public.client_notes set link_id = g.drop_link where id in (select (jsonb_array_elements_text(mv->'client_notes'))::uuid);
  update public.client_documents set link_id = g.drop_link where id in (select (jsonb_array_elements_text(mv->'client_documents'))::uuid);
  update public.pendencias set link_id = g.drop_link where id in (select (jsonb_array_elements_text(mv->'pendencias'))::uuid);
  delete from public.group_members where link_id = g.keep_link and group_id in (select (jsonb_array_elements_text(mv->'groups_added'))::uuid);
  update public.sessions set link_id = g.drop_link, person_id = g.drop_person where id in (select (jsonb_array_elements_text(mv->'sessions'))::uuid);
  update public.sessions set person_id = g.drop_person where id in (select (jsonb_array_elements_text(mv->'sessions_person'))::uuid);
  update public.restrictions set link_id = g.drop_link, person_id = g.drop_person where id in (select (jsonb_array_elements_text(mv->'restrictions'))::uuid);
  update public.measurements set person_id = g.drop_person where id in (select (jsonb_array_elements_text(mv->'measurements'))::uuid);
  update public.allergies set person_id = g.drop_person where id in (select (jsonb_array_elements_text(mv->'allergies'))::uuid);
  update public.links set archived_at = null, archived_reason = null where id = g.drop_link;
  update public.client_merges set undone_at = now() where id = g.id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id)
    values (g.org_id, auth.uid(), 'cliente.desfazer_juntar', 'links', g.keep_link);
end $$;

-- ---------------------------------------------------------------------------
-- Convidar para a app (P-07): email, SMS ou código; vale 7 dias e liga à
-- conta que a pessoa já tiver (accept_link_invite funde).
-- ---------------------------------------------------------------------------
create or replace function public.send_link_invite(_link uuid, _canal text, _destino text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; p public.persons%rowtype; v_token text;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.persons where id = l.person_id;
  if p.user_id is not null then raise exception 'já usa a app' using errcode = 'check_violation'; end if;
  if l.archived_at is not null then raise exception 'cliente arquivado' using errcode = 'check_violation'; end if;
  if _canal not in ('email','sms','codigo') then raise exception 'canal inválido' using errcode = 'invalid_parameter_value'; end if;
  if _canal = 'email' and coalesce(trim(coalesce(_destino, p.email)), '') = '' then
    raise exception 'falta o email' using errcode = 'check_violation';
  end if;
  if _canal = 'sms' and public._tel(coalesce(_destino, p.phone)) is null then
    raise exception 'falta o telemóvel' using errcode = 'check_violation';
  end if;
  v_token := public.create_link_invite(_link, case when _canal = 'email' then coalesce(_destino, p.email) end);
  if _canal = 'sms' then
    insert into public.outbox (channel, recipient, template, payload)
      values ('sms', public._tel(coalesce(_destino, p.phone)), 'convite_cliente', jsonb_build_object('token', v_token, 'org', l.org_id));
  end if;
  return v_token;
end $$;

-- ---------------------------------------------------------------------------
-- Rascunhos (7 dias) que passam entre aparelhos: são de cada pessoa.
-- ---------------------------------------------------------------------------
create table public.drafts (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null check (length(key) between 1 and 200),
  payload    jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.drafts enable row level security;
create policy drafts_own on public.drafts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.drafts to authenticated;
revoke all on public.drafts from anon;

revoke execute on function public.find_client_duplicates(uuid, text, text, text, uuid),
  public.add_client(uuid, text, text, text, date, uuid, public.link_type, text),
  public.merge_clients(uuid, uuid), public.undo_merge(uuid), public.send_link_invite(uuid, text, text), public._tel(text)
  from public, anon;
grant execute on function public.find_client_duplicates(uuid, text, text, text, uuid),
  public.add_client(uuid, text, text, text, date, uuid, public.link_type, text),
  public.merge_clients(uuid, uuid), public.undo_merge(uuid), public.send_link_invite(uuid, text, text)
  to authenticated;
