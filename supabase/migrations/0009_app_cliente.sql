-- ============================================================
-- LUNA.OS v3 · 0009 · App do cliente (tarefa 09): Hoje, Eu e privacidade.
--   · my_today: o treino do dia, a próxima sessão e a semana, numa chamada.
--   · my_links_overview / set_my_shares: quem vê os meus dados e desligar
--     com um toque (efeito imediato e registado).
--   · Apagar conta: pedido com 30 dias para voltar atrás; o servidor apaga.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Hoje (C-03, F1a: sem cartão de entrada, ocupação nem check-in)
-- ---------------------------------------------------------------------------
create or replace function public.my_today(_now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  tz text := coalesce((select p.timezone from public.persons p where p.id = me), 'Europe/Lisbon');
  hoje date := (_now at time zone tz)::date;
  inicio_semana timestamptz := (date_trunc('week', (_now at time zone tz)) at time zone tz);
  v_treino jsonb;
  v_proxima jsonb;
begin
  -- Treino do dia: do plano ativo (semana e dia da semana) ou um treino atribuído
  select jsonb_build_object('nome', w.name, 'duracao_min', w.est_duration_min, 'plano', pl.name, 'org', o.name, 'workout_id', w.id)
    into v_treino
  from public.assignments a
  join public.links l on l.id = a.link_id and l.person_id = me and l.status = 'active' and l.archived_at is null
  join public.organizations o on o.id = a.org_id
  left join public.plans pl on pl.id = a.plan_id
  left join public.plan_workouts pw on pw.plan_id = a.plan_id
    and pw.weekday = extract(dow from hoje)::int
    and (pw.week is null or pw.week = ((hoje - coalesce(a.starts_on, hoje)) / 7) + 1)
  join public.workouts w on w.id = coalesce(pw.workout_id, a.workout_id)
  where a.status = 'active' and (a.starts_on is null or a.starts_on <= hoje) and (a.ends_on is null or a.ends_on >= hoje)
  order by pw.position nulls last, a.created_at desc
  limit 1;

  select jsonb_build_object('inicio', b.starts_at, 'titulo', coalesce(b.title, ''), 'tipo', b.type, 'org', o.name, 'local', b.location)
    into v_proxima
  from public.bookings b
  join public.links l on l.id = b.link_id and l.person_id = me
  join public.organizations o on o.id = b.org_id
  where b.starts_at >= _now and b.status in ('pending','confirmed')
  order by b.starts_at
  limit 1;

  return jsonb_build_object(
    'treino', v_treino,
    'proxima', v_proxima,
    'feitos_semana', (
      select count(*) from public.sessions s
      where s.person_id = me and s.phase = 'done' and coalesce(s.ended_at, s.started_at) >= inicio_semana),
    'organizacoes', (select count(*) from public.links l where l.person_id = me and l.status = 'active' and l.archived_at is null)
  );
end $$;

-- ---------------------------------------------------------------------------
-- Privacidade e partilha (C-24)
-- ---------------------------------------------------------------------------
create or replace function public.my_links_overview()
returns table (link_id uuid, org_name text, responsible_name text, since timestamptz, shares public.share_category[])
language sql stable security definer set search_path = '' as $$
  select l.id, o.name, rp.full_name, coalesce(l.started_at, l.created_at),
    coalesce(array(select s.category from public.link_shares s where s.link_id = l.id and s.revoked_at is null order by s.category), '{}')
  from public.links l
  join public.organizations o on o.id = l.org_id
  left join public.memberships m on m.id = l.responsible_membership_id
  left join public.persons rp on rp.id = m.person_id
  where l.person_id = public.my_person_id() and l.status in ('active','paused') and l.archived_at is null
  order by o.name;
$$;

-- Liga ou desliga categorias: efeito imediato, consentimento e auditoria registados
create or replace function public.set_my_shares(_link uuid, _shares public.share_category[])
returns void language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; c public.share_category;
begin
  select * into l from public.links where id = _link;
  if not found or not public.is_self_or_guardian(l.person_id) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.link_shares set revoked_at = now()
    where link_id = l.id and revoked_at is null and not (category = any (coalesce(_shares, '{}')));
  foreach c in array coalesce(_shares, '{}'::public.share_category[]) loop
    insert into public.link_shares (org_id, link_id, person_id, category)
      values (l.org_id, l.id, l.person_id, c) on conflict do nothing;
  end loop;
  insert into public.consents (person_id, kind, version, granted, org_id, link_id, actor_user)
    values (l.person_id, 'partilha_org', array_to_string(coalesce(_shares, '{}'), ','), true, l.org_id, l.id, auth.uid());
  insert into public.audit_log (org_id, person_id, actor_user, action, entity, entity_id)
    values (l.org_id, l.person_id, auth.uid(), 'partilha.alterar', 'links', l.id);
end $$;

-- ---------------------------------------------------------------------------
-- Apagar conta: pedido com 30 dias para voltar atrás
-- ---------------------------------------------------------------------------
create table public.account_deletion_requests (
  id            uuid primary key default gen_random_uuid(),
  person_id     uuid not null references public.persons(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  requested_at  timestamptz not null default now(),
  scheduled_for timestamptz not null default now() + interval '30 days',
  cancelled_at  timestamptz,
  done_at       timestamptz
);
create unique index account_deletion_uma_ativa on public.account_deletion_requests (person_id)
  where cancelled_at is null and done_at is null;
alter table public.account_deletion_requests enable row level security;
create policy account_deletion_select on public.account_deletion_requests for select to authenticated
  using (person_id = public.my_person_id());
grant select on public.account_deletion_requests to authenticated;
revoke all on public.account_deletion_requests from anon;

create or replace function public.request_account_deletion()
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person(); v timestamptz;
begin
  select scheduled_for into v from public.account_deletion_requests
    where person_id = me and cancelled_at is null and done_at is null;
  if v is not null then return v; end if;
  insert into public.account_deletion_requests (person_id, user_id) values (me, auth.uid()) returning scheduled_for into v;
  insert into public.consents (person_id, kind, version, granted, actor_user) values (me, 'privacidade', 'apagar_conta', false, auth.uid());
  return v;
end $$;

create or replace function public.cancel_account_deletion()
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.account_deletion_requests set cancelled_at = now()
    where person_id = public._require_person() and cancelled_at is null and done_at is null;
end $$;

revoke execute on function public.my_today(timestamptz), public.my_links_overview(), public.set_my_shares(uuid, public.share_category[]),
  public.request_account_deletion(), public.cancel_account_deletion() from public, anon;
grant execute on function public.my_today(timestamptz), public.my_links_overview(), public.set_my_shares(uuid, public.share_category[]),
  public.request_account_deletion(), public.cancel_account_deletion() to authenticated;
