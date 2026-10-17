-- ============================================================
-- LUNA.OS v3 · 0008 · Dia a dia (tarefa 09): Hoje e Inbox.
--   · "Clientes em atenção" com as 4 regras fixas de D18 (as dos packs
--     entram com os packs, tarefa 26 parte A), cada uma com o motivo.
--   · Inbox: adiar pede uma data e no dia volta ao topo; atribuir a outra
--     pessoa da equipa. Resolve-se no ecrã dono (nada se apaga).
-- ============================================================

alter table public.pendencias
  add column snoozed_until timestamptz,
  add column snoozed_by    uuid references auth.users(id) on delete set null,
  add column resolution    text;     -- comprovativo: o que a resolveu (atestado registado, …)

-- Quem resolveu o quê fica visível em "Resolvidas"
create or replace function public._pendencia_resolvida() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'resolvida' and old.status = 'aberta' then
    new.resolved_at := coalesce(new.resolved_at, now());
    new.resolved_by := coalesce(new.resolved_by, auth.uid());
    new.snoozed_until := null;
  end if;
  return new;
end $$;
create trigger pendencias_resolvida before update on public.pendencias
  for each row execute function public._pendencia_resolvida();

-- Adiar: pede uma data (até 90 dias); no dia volta a aparecer no topo.
create or replace function public.adiar_pendencia(_id uuid, _ate timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pendencias%rowtype;
begin
  select * into p from public.pendencias where id = _id;
  if not found or not public.can_see_link(p.link_id) or not public.has_perm(p.org_id, 'clients.write')
     or not (p.membership_id = public.my_membership_id(p.org_id) or public.has_perm(p.org_id, 'clients.read_all')) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if p.status <> 'aberta' then raise exception 'pendência já resolvida' using errcode = 'check_violation'; end if;
  if _ate is null or _ate <= now() or _ate > now() + interval '90 days' then
    raise exception 'escolhe uma data entre amanhã e 90 dias' using errcode = 'check_violation';
  end if;
  update public.pendencias set snoozed_until = _ate, snoozed_by = auth.uid() where id = _id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id)
    values (p.org_id, auth.uid(), 'pendencia.adiar', 'pendencias', _id);
end $$;

-- Reabrir antes do dia (desfazer o adiar)
create or replace function public.reabrir_pendencia(_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pendencias%rowtype;
begin
  select * into p from public.pendencias where id = _id;
  if not found or not public.can_see_link(p.link_id) or not public.has_perm(p.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.pendencias set snoozed_until = null, snoozed_by = null where id = _id;
end $$;

-- Atribuir a outra pessoa da equipa (quem vê a carteira toda)
create or replace function public.atribuir_pendencia(_id uuid, _membership uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pendencias%rowtype;
begin
  select * into p from public.pendencias where id = _id;
  if not found or not public.has_perm(p.org_id, 'clients.read_all') or not public.has_perm(p.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.memberships m where m.id = _membership and m.org_id = p.org_id and m.status = 'active') then
    raise exception 'essa pessoa não está ativa na equipa' using errcode = 'invalid_parameter_value';
  end if;
  update public.pendencias set membership_id = _membership where id = _id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id)
    values (p.org_id, auth.uid(), 'pendencia.atribuir', 'pendencias', _id);
end $$;

-- ---------------------------------------------------------------------------
-- Clientes em atenção (D18). Corre com os direitos de quem pede (RLS): o PT
-- vê só a sua carteira. Motivos:
--   sem_treinar_7d   · sem sessão feita nem marcação concluída há 7 dias
--   falta_sem_aviso  · a última marcação passada ficou como falta
--   pack_2_sessoes   · pack com 2 sessões ou menos      (tarefa 26 parte A)
--   pack_validade_7d · pack a acabar a validade em 7 dias (tarefa 26 parte A)
-- ---------------------------------------------------------------------------
create or replace function public.clients_attention(_org uuid, _now timestamptz default now())
returns table (link_id uuid, full_name text, reasons text[], last_training timestamptz)
language sql stable security invoker set search_path = '' as $$
  with c as (
    select cl.id, cl.full_name, cl.created_at from public.clients cl
    where cl.org_id = _org and cl.status = 'active' and cl.client_status = 'active' and cl.archived_at is null
  ),
  treinos as (
    select s.link_id, coalesce(s.ended_at, s.started_at) as em from public.sessions s
      where s.org_id = _org and s.phase = 'done' and s.link_id is not null
    union all
    select b.link_id, b.starts_at from public.bookings b
      where b.org_id = _org and b.status = 'completed' and b.link_id is not null and b.starts_at <= _now
  ),
  ult as (select t.link_id, max(t.em) as em from treinos t group by t.link_id),
  ultima as (
    select distinct on (b.link_id) b.link_id, b.status from public.bookings b
    where b.org_id = _org and b.link_id is not null and b.starts_at < _now and b.status <> 'cancelled'
    order by b.link_id, b.starts_at desc
  ),
  r as (
    select c.id, c.full_name, u.em,
      array_remove(array[
        case when coalesce(u.em, c.created_at) < _now - interval '7 days' then 'sem_treinar_7d' end,
        case when ul.status = 'no_show' then 'falta_sem_aviso' end
      ], null) as reasons
    from c left join ult u on u.link_id = c.id left join ultima ul on ul.link_id = c.id
  )
  select r.id, r.full_name, r.reasons, r.em from r
  where cardinality(r.reasons) > 0
  order by cardinality(r.reasons) desc, r.em asc nulls first, r.full_name;
$$;

revoke execute on function public.adiar_pendencia(uuid, timestamptz), public.reabrir_pendencia(uuid),
  public.atribuir_pendencia(uuid, uuid), public.clients_attention(uuid, timestamptz), public._pendencia_resolvida() from public, anon;
grant execute on function public.adiar_pendencia(uuid, timestamptz), public.reabrir_pendencia(uuid),
  public.atribuir_pendencia(uuid, uuid), public.clients_attention(uuid, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Lista de clientes (G-03): última vez e assiduidade das últimas 8 semanas
-- (sessões feitas e marcações concluídas), com os direitos de quem pede.
-- ---------------------------------------------------------------------------
create or replace function public.clients_overview(_org uuid, _now timestamptz default now())
returns table (link_id uuid, last_training timestamptz, weeks int[])
language sql stable security invoker set search_path = '' as $$
  with treinos as (
    select s.link_id, coalesce(s.ended_at, s.started_at) as em from public.sessions s
      where s.org_id = _org and s.phase = 'done' and s.link_id is not null
    union all
    select b.link_id, b.starts_at from public.bookings b
      where b.org_id = _org and b.status = 'completed' and b.link_id is not null and b.starts_at <= _now
  ),
  semanas as (select generate_series(7, 0, -1) as k)
  select c.id,
    (select max(t.em) from treinos t where t.link_id = c.id),
    array(select (select count(*)::int from treinos t
                  where t.link_id = c.id
                    and t.em >  _now - ((sm.k + 1) * interval '7 days')
                    and t.em <= _now - (sm.k * interval '7 days'))
          from semanas sm order by sm.k desc)
  from public.clients c
  where c.org_id = _org and c.archived_at is null;
$$;
revoke execute on function public.clients_overview(uuid, timestamptz) from public, anon;
grant execute on function public.clients_overview(uuid, timestamptz) to authenticated;
