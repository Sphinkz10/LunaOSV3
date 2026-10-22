-- ============================================================
-- LUNA.OS v3 · 0025 · Grupos (G-08 das funções antigas, passo 22).
--   · Membros com data de entrada e, se saiu, data e motivo (nada se apaga).
--   · Arquivar e repor com motivo; arquivar pára os envios recorrentes do grupo.
--   · Responsável do grupo recebe os avisos; não muda permissões de ninguém.
--   · Histórico do grupo: antes, depois, quem e quando.
-- ============================================================

alter table public.groups
  add column responsible_membership_id uuid,
  add column archived_reason text,
  add constraint groups_responsible_fk foreign key (responsible_membership_id, org_id)
    references public.memberships(id, org_id) on delete set null (responsible_membership_id);
alter table public.group_members add column since date not null default current_date;

create table public.group_events (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  group_id   uuid not null,
  what       text not null,
  detail     text,
  actor_user uuid,
  created_at timestamptz not null default now(),
  foreign key (group_id, org_id) references public.groups(id, org_id) on delete cascade
);
create index on public.group_events (group_id, created_at desc);
alter table public.group_events enable row level security;
create policy group_events_select on public.group_events for select to authenticated using (public.is_member(org_id));
grant select on public.group_events to authenticated;
revoke all on public.group_events from anon;

-- Sair (e tirar) só por estas funções: o histórico nunca se apaga
drop policy group_members_write on public.group_members;
create policy group_members_insert on public.group_members for insert to authenticated
  with check (public.has_perm(org_id, 'clients.write') and public.can_see_link(link_id));

create or replace function public._grupo(_group uuid) returns public.groups
language plpgsql security definer set search_path = '' as $$
declare g public.groups%rowtype;
begin
  select * into g from public.groups where id = _group for update;
  if not found or not public.has_perm(g.org_id, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return g;
end $$;

create or replace function public.add_group_member(_group uuid, _link uuid, _since date default current_date)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups := public._grupo(_group);
begin
  if g.archived_at is not null then raise exception 'O grupo está arquivado. Repõe-o primeiro.' using errcode = 'check_violation'; end if;
  if not exists (select 1 from public.links where id = _link and org_id = g.org_id and public.can_see_link(id)) then raise exception 'cliente inválido' using errcode = 'insufficient_privilege'; end if;
  insert into public.group_members (org_id, group_id, link_id, since) values (g.org_id, g.id, _link, coalesce(_since, current_date))
    on conflict (group_id, link_id) do update set since = excluded.since, left_at = null, left_reason = null, added_at = now();
  insert into public.group_events (org_id, group_id, what, detail, actor_user)
    values (g.org_id, g.id, 'Entrou', (select full_name from public.clients where id = _link) || ' · desde ' || to_char(coalesce(_since, current_date), 'DD/MM/YYYY'), auth.uid());
end $$;

create or replace function public.remove_group_member(_group uuid, _link uuid, _reason text, _on date default current_date)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups := public._grupo(_group);
begin
  if coalesce(trim(_reason), '') = '' then raise exception 'Sair pede um motivo.' using errcode = 'check_violation'; end if;
  update public.group_members set left_at = coalesce(_on, current_date)::timestamptz, left_reason = trim(_reason)
    where group_id = g.id and link_id = _link and left_at is null;
  if not found then raise exception 'Não é membro ativo deste grupo.' using errcode = 'check_violation'; end if;
  insert into public.group_events (org_id, group_id, what, detail, actor_user)
    values (g.org_id, g.id, 'Saiu', (select full_name from public.clients where id = _link) || ' · ' || trim(_reason), auth.uid());
end $$;

create or replace function public.archive_group(_group uuid, _reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare g public.groups := public._grupo(_group); n int;
begin
  if coalesce(trim(_reason), '') = '' then raise exception 'Arquivar pede um motivo.' using errcode = 'check_violation'; end if;
  if g.archived_at is not null then return 0; end if;
  update public.groups set archived_at = now(), archived_reason = trim(_reason), updated_at = now() where id = g.id;
  -- Os envios recorrentes para o grupo param
  update public.request_schedules set stopped_at = now() where group_id = g.id and stopped_at is null;
  get diagnostics n = row_count;
  insert into public.group_events (org_id, group_id, what, detail, actor_user) values (g.org_id, g.id, 'Arquivado', trim(_reason), auth.uid());
  return n;
end $$;

create or replace function public.restore_group(_group uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups := public._grupo(_group);
begin
  if coalesce(trim(_reason), '') = '' then raise exception 'Repor pede um motivo.' using errcode = 'check_violation'; end if;
  update public.groups set archived_at = null, archived_reason = null, updated_at = now() where id = g.id;
  insert into public.group_events (org_id, group_id, what, detail, actor_user) values (g.org_id, g.id, 'Reposto', trim(_reason), auth.uid());
end $$;

create or replace function public.set_group_responsible(_group uuid, _membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.groups := public._grupo(_group); antes text; depois text;
begin
  if _membership is not null and not exists (select 1 from public.memberships where id = _membership and org_id = g.org_id and status = 'active') then
    raise exception 'pessoa inválida' using errcode = 'check_violation';
  end if;
  select p.full_name into antes from public.memberships m join public.persons p on p.id = m.person_id where m.id = g.responsible_membership_id;
  select p.full_name into depois from public.memberships m join public.persons p on p.id = m.person_id where m.id = _membership;
  update public.groups set responsible_membership_id = _membership, updated_at = now() where id = g.id;
  insert into public.group_events (org_id, group_id, what, detail, actor_user)
    values (g.org_id, g.id, 'Responsável mudado', coalesce(antes, '—') || ' → ' || coalesce(depois, '—'), auth.uid());
end $$;

-- Criar regista no histórico
create or replace function public._tg_grupo_criado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_events (org_id, group_id, what, detail, actor_user) values (new.org_id, new.id, 'Criado', new.name, auth.uid());
  return new;
end $$;
create trigger grupos_criado after insert on public.groups for each row execute function public._tg_grupo_criado();

-- Os grupos por onde o cliente passou (ficha)
create or replace function public.client_groups(_link uuid)
returns table (group_id uuid, nome text, desde date, saiu timestamptz, motivo text, arquivado boolean)
language sql stable security definer set search_path = '' as $$
  select g.id, g.name, m.since, m.left_at, m.left_reason, g.archived_at is not null
  from public.group_members m join public.groups g on g.id = m.group_id
  where m.link_id = _link and public.can_see_link(_link)
  order by m.left_at nulls first, m.since desc;
$$;

revoke execute on function public._grupo(uuid), public._tg_grupo_criado() from public, anon, authenticated;
revoke execute on function public.add_group_member(uuid, uuid, date), public.remove_group_member(uuid, uuid, text, date), public.archive_group(uuid, text),
  public.restore_group(uuid, text), public.set_group_responsible(uuid, uuid), public.client_groups(uuid) from public, anon;
grant execute on function public.add_group_member(uuid, uuid, date), public.remove_group_member(uuid, uuid, text, date), public.archive_group(uuid, text),
  public.restore_group(uuid, text), public.set_group_responsible(uuid, uuid), public.client_groups(uuid) to authenticated;
