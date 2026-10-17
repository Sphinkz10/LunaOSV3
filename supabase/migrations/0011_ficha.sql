-- ============================================================
-- LUNA.OS v3 · 0011 · Ficha do cliente (tarefa 22): objetivos, marcos
-- com evidência, revisões com decisão, recursos ligados, atividade com
-- origem, progresso por métrica, editar com conflito e duplicados,
-- arquivar e reativar com motivo e autor.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Objetivos (o PT avalia o estado, com data); o cliente vê só para leitura
-- ---------------------------------------------------------------------------
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  link_id       uuid not null,
  title         text not null check (length(trim(title)) > 0),
  criterion     text,                                   -- como se mede (5 repetições com RPE até 8…)
  category      text not null default 'fisico' check (category in ('fisico','habitos','tecnico','saude','outro')),
  priority      int not null default 1 check (priority > 0),
  owner_membership_id uuid,
  status        text not null default 'no_caminho' check (status in ('no_caminho','em_risco','atingido','parado')),
  status_note   text,                                   -- 92,5 kg; 2,1 por semana…
  status_at     timestamptz not null default now(),
  status_by     uuid references auth.users(id) on delete set null,
  due_on        date,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (owner_membership_id, org_id) references public.memberships(id, org_id) on delete set null (owner_membership_id)
);
create index on public.goals (link_id, priority);
create trigger goals_updated before update on public.goals for each row execute function public.tg_set_updated_at();

-- Marcos: só se concluem com uma evidência
create table public.milestones (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  goal_id        uuid not null,
  title          text not null check (length(trim(title)) > 0),
  due_on         date,
  done_at        timestamptz,
  done_by        uuid references auth.users(id) on delete set null,
  evidence_kind  text check (evidence_kind in ('sessao','avaliacao','questionario','medida','nota')),
  evidence_id    uuid,
  evidence_note  text,
  created_at     timestamptz not null default now(),
  foreign key (goal_id, org_id) references public.goals(id, org_id) on delete cascade,
  constraint marco_com_evidencia check (done_at is null or (evidence_kind is not null and (evidence_id is not null or length(trim(coalesce(evidence_note, ''))) > 0)))
);
create index on public.milestones (goal_id);

-- Recursos (planos, treinos, questionários) ligados a objetivos
create table public.goal_resources (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  goal_id    uuid not null,
  kind       text not null check (kind in ('plano','treino','questionario')),
  ref_id     uuid not null,
  label      text not null,
  created_at timestamptz not null default now(),
  unique (goal_id, kind, ref_id),
  foreign key (goal_id, org_id) references public.goals(id, org_id) on delete cascade
);

-- Revisões com cadência; concluir guarda sempre a decisão
create table public.reviews (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  link_id       uuid not null,
  scheduled_on  date not null,
  every_weeks   int check (every_weeks is null or every_weeks between 1 and 52),
  owner_membership_id uuid,
  goal_ids      uuid[] not null default '{}',
  done_at       timestamptz,
  done_by       uuid references auth.users(id) on delete set null,
  decision      text,
  created_at    timestamptz not null default now(),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (owner_membership_id, org_id) references public.memberships(id, org_id) on delete set null (owner_membership_id),
  constraint revisao_com_decisao check (done_at is null or length(trim(coalesce(decision, ''))) > 0)
);
create index on public.reviews (link_id, scheduled_on);

-- Eventos da relação (arquivar, reativar, grupos, objetivos) para a atividade
create table public.link_events (
  id         bigint generated always as identity primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  link_id    uuid not null,
  kind       text not null check (kind in ('arquivado','reativado','objetivo','marco','revisao','dados')),
  title      text not null,
  reason     text,
  ref_id     uuid,
  actor_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create index on public.link_events (link_id, created_at desc);

-- Pendências em atraso entram no Hoje do PT e na Inbox
alter table public.pendencias drop constraint pendencias_kind_check;
alter table public.pendencias add constraint pendencias_kind_check
  check (kind in ('parq_atestado','encarregado_em_falta','restricao_a_rever','revisao_em_atraso','marco_em_atraso'));

-- RLS: a equipa que vê o cliente lê; escreve quem tem clients.write; o cliente só lê
alter table public.goals enable row level security;
alter table public.milestones enable row level security;
alter table public.goal_resources enable row level security;
alter table public.reviews enable row level security;
alter table public.link_events enable row level security;

create policy goals_select on public.goals for select to authenticated
  using (public.can_see_link(link_id) or public.is_my_link(link_id));
create policy goals_insert on public.goals for insert to authenticated
  with check (public.can_see_link(link_id) and public.has_perm(org_id, 'clients.write'));
create policy goals_update on public.goals for update to authenticated
  using (public.can_see_link(link_id) and public.has_perm(org_id, 'clients.write'))
  with check (public.can_see_link(link_id) and public.has_perm(org_id, 'clients.write'));
create policy milestones_select on public.milestones for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and (public.can_see_link(g.link_id) or public.is_my_link(g.link_id))));
create policy milestones_insert on public.milestones for insert to authenticated
  with check (done_at is null and exists (select 1 from public.goals g where g.id = goal_id and public.can_see_link(g.link_id) and public.has_perm(g.org_id, 'clients.write')));
create policy goal_resources_select on public.goal_resources for select to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and (public.can_see_link(g.link_id) or public.is_my_link(g.link_id))));
create policy goal_resources_insert on public.goal_resources for insert to authenticated
  with check (exists (select 1 from public.goals g where g.id = goal_id and public.can_see_link(g.link_id) and public.has_perm(g.org_id, 'clients.write')));
create policy goal_resources_delete on public.goal_resources for delete to authenticated
  using (exists (select 1 from public.goals g where g.id = goal_id and public.can_see_link(g.link_id) and public.has_perm(g.org_id, 'clients.write')));
create policy reviews_select on public.reviews for select to authenticated
  using (public.can_see_link(link_id));
create policy reviews_insert on public.reviews for insert to authenticated
  with check (done_at is null and public.can_see_link(link_id) and public.has_perm(org_id, 'clients.write'));
create policy link_events_select on public.link_events for select to authenticated
  using (public.can_see_link(link_id));

grant select on public.goals, public.milestones, public.goal_resources, public.reviews, public.link_events to authenticated;
grant insert (org_id, link_id, title, criterion, category, priority, owner_membership_id, due_on) on public.goals to authenticated;
grant update (title, criterion, category, priority, owner_membership_id, due_on) on public.goals to authenticated;
grant insert (org_id, goal_id, title, due_on) on public.milestones to authenticated;
grant insert (org_id, goal_id, kind, ref_id, label), delete on public.goal_resources to authenticated;
grant insert (org_id, link_id, scheduled_on, every_weeks, owner_membership_id, goal_ids) on public.reviews to authenticated;
revoke all on public.goals, public.milestones, public.goal_resources, public.reviews, public.link_events from anon;

-- Estado do objetivo: avaliado pelo PT, com data e registado na atividade
create or replace function public.set_goal_status(_goal uuid, _status text, _note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.goals%rowtype;
begin
  select * into g from public.goals where id = _goal;
  if not found or not public.can_see_link(g.link_id) or not public.has_perm(g.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.goals set status = _status, status_note = nullif(trim(_note), ''), status_at = now(), status_by = auth.uid() where id = _goal;
  insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user)
    values (g.org_id, g.link_id, 'objetivo', g.title || ': ' || replace(_status, '_', ' '), g.id, auth.uid());
end $$;

-- Arquivar um objetivo com marcos abertos ou recursos ligados pede para os resolver primeiro
create or replace function public.archive_goal(_goal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g public.goals%rowtype;
begin
  select * into g from public.goals where id = _goal;
  if not found or not public.can_see_link(g.link_id) or not public.has_perm(g.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.milestones m where m.goal_id = _goal and m.done_at is null)
     or exists (select 1 from public.goal_resources r where r.goal_id = _goal) then
    raise exception 'resolve primeiro os marcos abertos e os recursos ligados' using errcode = 'check_violation';
  end if;
  update public.goals set archived_at = now() where id = _goal;
end $$;

-- Concluir um marco exige evidência
create or replace function public.complete_milestone(_id uuid, _kind text, _ref uuid default null, _note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.milestones%rowtype; g public.goals%rowtype;
begin
  select * into m from public.milestones where id = _id;
  select * into g from public.goals where id = m.goal_id;
  if m.id is null or not public.can_see_link(g.link_id) or not public.has_perm(g.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if _kind is null or (_ref is null and length(trim(coalesce(_note, ''))) = 0) then
    raise exception 'um marco só se conclui com uma evidência' using errcode = 'check_violation';
  end if;
  update public.milestones set done_at = now(), done_by = auth.uid(), evidence_kind = _kind, evidence_id = _ref, evidence_note = nullif(trim(_note), '')
    where id = _id;
  update public.pendencias set status = 'resolvida', resolution = 'Marco concluído com evidência'
    where link_id = g.link_id and kind = 'marco_em_atraso' and status = 'aberta'
      and not exists (select 1 from public.milestones x join public.goals y on y.id = x.goal_id
                      where y.link_id = g.link_id and x.done_at is null and x.due_on < current_date);
  insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user)
    values (g.org_id, g.link_id, 'marco', 'Marco concluído: ' || m.title, m.id, auth.uid());
end $$;

-- Concluir revisão: a decisão fica no histórico e marca a seguinte pela cadência
create or replace function public.conclude_review(_id uuid, _decision text, _next_on date default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.reviews%rowtype; v_next uuid;
begin
  select * into r from public.reviews where id = _id for update;
  if not found or not public.can_see_link(r.link_id) or not public.has_perm(r.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if r.done_at is not null then raise exception 'revisão já concluída' using errcode = 'check_violation'; end if;
  if length(trim(coalesce(_decision, ''))) = 0 then
    raise exception 'uma revisão concluída tem sempre decisão' using errcode = 'check_violation';
  end if;
  update public.reviews set done_at = now(), done_by = auth.uid(), decision = trim(_decision) where id = _id;
  if coalesce(_next_on, case when r.every_weeks is not null then current_date + r.every_weeks * 7 end) is not null then
    insert into public.reviews (org_id, link_id, scheduled_on, every_weeks, owner_membership_id, goal_ids)
      values (r.org_id, r.link_id, coalesce(_next_on, current_date + r.every_weeks * 7), r.every_weeks, r.owner_membership_id, r.goal_ids)
      returning id into v_next;
  end if;
  update public.pendencias set status = 'resolvida', resolution = 'Revisão concluída com decisão'
    where link_id = r.link_id and kind = 'revisao_em_atraso' and status = 'aberta';
  insert into public.link_events (org_id, link_id, kind, title, reason, ref_id, actor_user)
    values (r.org_id, r.link_id, 'revisao', 'Revisão concluída', trim(_decision), r.id, auth.uid());
  return v_next;
end $$;

-- Revisões e marcos em atraso viram pendências do responsável (idempotente)
create or replace function public.sync_overdue(_org uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int := 0;
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  insert into public.pendencias (org_id, link_id, membership_id, kind, title)
    select distinct on (r.link_id) r.org_id, r.link_id, coalesce(r.owner_membership_id, l.responsible_membership_id), 'revisao_em_atraso',
      'Revisão em atraso desde ' || to_char(r.scheduled_on, 'DD/MM')
    from public.reviews r join public.links l on l.id = r.link_id
    where r.org_id = _org and r.done_at is null and r.scheduled_on < current_date and l.archived_at is null
    order by r.link_id, r.scheduled_on
    on conflict do nothing;
  get diagnostics n = row_count;
  insert into public.pendencias (org_id, link_id, membership_id, kind, title)
    select distinct on (g.link_id) g.org_id, g.link_id, coalesce(g.owner_membership_id, l.responsible_membership_id), 'marco_em_atraso',
      'Marco em atraso: ' || m.title
    from public.milestones m join public.goals g on g.id = m.goal_id join public.links l on l.id = g.link_id
    where g.org_id = _org and m.done_at is null and m.due_on < current_date and g.archived_at is null and l.archived_at is null
    order by g.link_id, m.due_on
    on conflict do nothing;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Arquivar (motivo; bloqueia com dívida ou contrato ativo quando existirem,
-- F2) e reativar (motivo; volta o histórico, plano e acesso escolhem-se de novo)
-- ---------------------------------------------------------------------------
create or replace function public.archive_client(_link uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(_reason, ''))) = 0 then raise exception 'arquivar pede motivo' using errcode = 'check_violation'; end if;
  if l.archived_at is not null then return; end if;
  -- Dívida e contrato ativo: as tabelas chegam com pagamentos (F2); a verificação entra aqui
  update public.links set archived_at = now(), archived_reason = trim(_reason) where id = _link;
  update public.assignments set status = 'cancelled' where link_id = _link and status in ('active','scheduled');
  update public.links set current_plan_id = null where id = _link;
  insert into public.link_events (org_id, link_id, kind, title, reason, actor_user)
    values (l.org_id, l.id, 'arquivado', 'Arquivado', trim(_reason), auth.uid());
end $$;

create or replace function public.reactivate_client(_link uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(_reason, ''))) = 0 then raise exception 'reativar pede motivo' using errcode = 'check_violation'; end if;
  update public.links set archived_at = null, archived_reason = null, status = 'active' where id = _link;
  insert into public.link_events (org_id, link_id, kind, title, reason, actor_user)
    values (l.org_id, l.id, 'reativado', 'Reativado', trim(_reason), auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Editar dados com duplicados e conflito: grava só se ninguém mudou entretanto
-- ---------------------------------------------------------------------------
create or replace function public.update_client_data(
  _link uuid, _seen timestamptz, _full_name text, _phone text, _email text, _birth_date date, _tax_id text
) returns timestamptz language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; p public.persons%rowtype; v timestamptz;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  select * into p from public.persons where id = l.person_id for update;
  if p.user_id is not null then
    raise exception 'os dados pessoais são da conta do cliente' using errcode = 'insufficient_privilege';
  end if;
  if p.updated_at > _seen then
    raise exception 'conflito' using errcode = 'serialization_failure',
      detail = jsonb_build_object('full_name', p.full_name, 'phone', p.phone, 'email', p.email, 'birth_date', p.birth_date, 'tax_id', p.tax_id, 'updated_at', p.updated_at)::text;
  end if;
  if exists (select 1 from public.links x join public.persons y on y.id = x.person_id
             where x.org_id = l.org_id and x.id <> l.id and x.status <> 'ended'
               and ((_phone is not null and public._tel(_phone) is not null and public._tel(y.phone) = public._tel(_phone))
                 or (_email is not null and trim(_email) <> '' and lower(y.email) = lower(trim(_email)))
                 or (_tax_id is not null and trim(_tax_id) <> '' and y.tax_id = trim(_tax_id)))) then
    raise exception 'duplicate_client' using errcode = 'unique_violation';
  end if;
  update public.persons set full_name = trim(_full_name), phone = nullif(trim(_phone), ''), email = nullif(lower(trim(_email)), ''),
    birth_date = _birth_date, tax_id = nullif(trim(_tax_id), ''), updated_at = now()
    where id = p.id returning updated_at into v;
  insert into public.link_events (org_id, link_id, kind, title, actor_user)
    values (l.org_id, l.id, 'dados', 'Dados atualizados', auth.uid());
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Atividade (cronologia por origem) e próximos 30 dias
-- ---------------------------------------------------------------------------
create or replace function public.client_activity(_link uuid, _from timestamptz, _to timestamptz default now())
returns table (em timestamptz, origem text, titulo text, detalhe text, ref_kind text, ref_id uuid, quem text)
language sql stable security invoker set search_path = '' as $$
  select b.starts_at, 'treino',
    case b.status when 'completed' then 'Sessão feita' when 'no_show' then 'Faltou' when 'cancelled' then 'Sessão cancelada' else 'Sessão marcada' end
      || coalesce(' · ' || nullif(b.title, ''), ''),
    coalesce(b.location, '') || case when b.cancel_reason is not null then ' · ' || b.cancel_reason else '' end,
    'marcacao', b.id, (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = b.membership_id)
  from public.bookings b where b.link_id = _link and b.starts_at between _from and _to
  union all
  select coalesce(s.ended_at, s.started_at), 'treino', 'Treino concluído',
    round(s.elapsed_seconds / 60.0)::text || ' min', 'sessao', s.id, null
  from public.sessions s where s.link_id = _link and s.phase = 'done' and coalesce(s.ended_at, s.started_at) between _from and _to
  union all
  select m.recorded_at, 'avaliacoes', m.metric_key || ': ' || coalesce(m.value::text, m.text_value, '') || coalesce(' ' || m.unit, ''),
    case m.source when 'session' then 'registado ao vivo' when 'form' then 'questionário' else 'registado pela equipa' end,
    'medida', m.id, null
  from public.measurements m join public.links l on l.person_id = m.person_id
  where l.id = _link and m.org_id = l.org_id and m.recorded_at between _from and _to
  union all
  select e.created_at, case when e.kind in ('objetivo','marco','revisao') then 'objetivos' else 'relacao' end, e.title, coalesce(e.reason, ''),
    e.kind, e.ref_id, (select p.full_name from public.persons p where p.user_id = e.actor_user)
  from public.link_events e where e.link_id = _link and e.created_at between _from and _to
  order by 1 desc;
$$;

create or replace function public.client_upcoming(_link uuid, _days int default 30)
returns table (em timestamptz, tipo text, titulo text, estado text)
language sql stable security invoker set search_path = '' as $$
  select b.starts_at, 'marcacao', coalesce(nullif(b.title, ''), 'Sessão'),
    case b.status when 'confirmed' then 'Confirmada' when 'pending' then 'Por confirmar' else b.status::text end
  from public.bookings b where b.link_id = _link and b.starts_at between now() and now() + make_interval(days => _days) and b.status in ('pending','confirmed')
  union all
  select r.scheduled_on::timestamptz, 'revisao', 'Revisão', (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = r.owner_membership_id)
  from public.reviews r where r.link_id = _link and r.done_at is null and r.scheduled_on <= current_date + _days
  union all
  select m.due_on::timestamptz, 'marco', m.title, 'Marco'
  from public.milestones m join public.goals g on g.id = m.goal_id
  where g.link_id = _link and m.done_at is null and m.due_on is not null and m.due_on <= current_date + _days
  order by 1;
$$;

-- ---------------------------------------------------------------------------
-- Progresso: uma métrica de cada vez, com a origem de cada valor
--   ex:<exercise_id> melhor série (kg) · peso/medidas · treinos_semana · rpe_medio · carga
-- ---------------------------------------------------------------------------
create or replace function public.client_progress(_link uuid, _metric text, _from timestamptz, _to timestamptz default now())
returns table (em timestamptz, valor numeric, detalhe text, ref_kind text, ref_id uuid)
language plpgsql stable security invoker set search_path = '' as $$
declare v_person uuid := (select l.person_id from public.links l where l.id = _link);
begin
  if _metric like 'ex:%' then
    return query
      select s.started_at, max(ss.load_kg), max(ss.load_kg)::text || ' kg × ' || (array_agg(ss.reps order by ss.load_kg desc nulls last))[1]::text,
        'sessao'::text, s.id
      from public.session_sets ss join public.session_exercises se on se.id = ss.session_exercise_id
      join public.sessions s on s.id = ss.session_id
      where s.person_id = v_person and se.exercise_id = substring(_metric from 4)::uuid and ss.load_kg is not null and ss.completed
        and s.started_at between _from and _to
      group by s.id, s.started_at order by s.started_at;
  elsif _metric = 'treinos_semana' then
    return query
      select date_trunc('week', coalesce(s.ended_at, s.started_at)), count(*)::numeric, 'treinos', 'semana'::text, null::uuid
      from public.sessions s where s.person_id = v_person and s.phase = 'done' and coalesce(s.ended_at, s.started_at) between _from and _to
      group by 1 order by 1;
  elsif _metric = 'rpe_medio' then
    return query
      select s.started_at, round(avg(ss.rpe), 1), 'RPE médio da sessão', 'sessao'::text, s.id
      from public.session_sets ss join public.sessions s on s.id = ss.session_id
      where s.person_id = v_person and ss.rpe is not null and s.started_at between _from and _to
      group by s.id, s.started_at order by s.started_at;
  elsif _metric = 'carga' then
    return query
      select s.started_at, sum(coalesce(ss.load_kg, 0) * coalesce(ss.reps, 0)), 'kg × repetições', 'sessao'::text, s.id
      from public.session_sets ss join public.sessions s on s.id = ss.session_id
      where s.person_id = v_person and ss.completed and s.started_at between _from and _to
      group by s.id, s.started_at order by s.started_at;
  else
    return query
      select m.recorded_at, m.value, coalesce(m.value::text, '') || coalesce(' ' || m.unit, ''),
        case m.source when 'session' then 'sessao' when 'form' then 'questionario' else 'medida' end, m.id
      from public.measurements m where m.person_id = v_person and m.metric_key = _metric and m.value is not null
        and m.recorded_at between _from and _to
      order by m.recorded_at;
  end if;
end $$;

-- Métricas disponíveis para este cliente (o que já tem registos)
create or replace function public.client_metrics(_link uuid)
returns table (chave text, nome text, unidade text, n int)
language sql stable security invoker set search_path = '' as $$
  select 'ex:' || e.id, e.name, 'kg', count(distinct s.id)::int
  from public.session_sets ss join public.session_exercises se on se.id = ss.session_exercise_id
  join public.exercises e on e.id = se.exercise_id join public.sessions s on s.id = ss.session_id
  where s.person_id = (select person_id from public.links where id = _link) and ss.load_kg is not null
  group by e.id, e.name
  union all
  select m.metric_key, m.metric_key, max(m.unit), count(*)::int from public.measurements m
  where m.person_id = (select person_id from public.links where id = _link) and m.value is not null
  group by m.metric_key
  order by 4 desc, 2;
$$;

revoke execute on function public.set_goal_status(uuid, text, text), public.archive_goal(uuid), public.complete_milestone(uuid, text, uuid, text),
  public.conclude_review(uuid, text, date), public.sync_overdue(uuid), public.archive_client(uuid, text), public.reactivate_client(uuid, text),
  public.update_client_data(uuid, timestamptz, text, text, text, date, text), public.client_activity(uuid, timestamptz, timestamptz),
  public.client_upcoming(uuid, int), public.client_progress(uuid, text, timestamptz, timestamptz), public.client_metrics(uuid)
  from public, anon;
grant execute on function public.set_goal_status(uuid, text, text), public.archive_goal(uuid), public.complete_milestone(uuid, text, uuid, text),
  public.conclude_review(uuid, text, date), public.sync_overdue(uuid), public.archive_client(uuid, text), public.reactivate_client(uuid, text),
  public.update_client_data(uuid, timestamptz, text, text, text, date, text), public.client_activity(uuid, timestamptz, timestamptz),
  public.client_upcoming(uuid, int), public.client_progress(uuid, text, timestamptz, timestamptz), public.client_metrics(uuid)
  to authenticated;
