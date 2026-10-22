-- ============================================================
-- LUNA.OS v3 · 0023 · Medir a ativação e a retenção (tarefa 28).
--   · Eventos de produto gravados no servidor na mesma transação do que
--     aconteceu (padrão outbox), só com identificadores internos: nada de
--     nomes, emails, telefones, notas ou dados de saúde.
--   · Quem recusa a análise (C-24, consentimento 'analise') fica fora de
--     qualquer métrica individual: o evento conta só para o agregado.
--   · Painel interno da LunaOS (nunca aparece aos clientes): só a equipa da
--     LunaOS (platform_staff), e nenhum número abaixo de 3 sai por organização.
-- ============================================================

alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check
  check (kind in ('termos','privacidade','dados_saude','comunicacoes','partilha_org','encarregado','pagador','analise'));

create table public.platform_staff (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_staff enable row level security;
revoke all on public.platform_staff from anon, authenticated;

create or replace function public.is_lunaos_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff where user_id = auth.uid());
$$;

-- Propriedades: só chaves conhecidas e valores curtos de uma lista fechada (nunca texto livre)
create or replace function public._props_validas(_p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(_p) = 'object' and not exists (
    select 1 from jsonb_each(_p) e
    where e.key not in ('origem','quem_comecou','tipo','primeiro')
       or (jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') !~ '^[a-z_]{1,24}$')
       or jsonb_typeof(e.value) not in ('string','boolean'));
$$;

create table public.product_events (
  id         bigint generated always as identity primary key,
  kind       text not null check (kind in (
    'org_criada','cliente_adicionado','primeiro_treino_criado','plano_atribuido','cliente_entrou_app','treino_app_feito',
    'sessao_ao_vivo_concluida','checkin_enviado','checkin_revisto','atleta_solo_criado','ligacao_atleta_treinador',
    'trial_iniciado','trial_convertido','trial_expirado','org_so_leitura')),
  org_id     uuid,
  actor_user uuid,       -- quem fez (nulo se recusou a análise)
  person_id  uuid,       -- sobre quem (nulo se recusou a análise)
  props      jsonb not null default '{}'::jsonb check (public._props_validas(props)),
  created_at timestamptz not null default now()
);
create index on public.product_events (kind, created_at);
create index on public.product_events (org_id, created_at);
alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;

-- Recusou a análise? (a última decisão conta; sem decisão, entra)
create or replace function public._recusa_analise(_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select not c.granted from public.consents c where c.person_id = _person and c.kind = 'analise'
                   order by c.created_at desc, c.id desc limit 1), false);
$$;

create or replace function public._evento(_kind text, _org uuid, _person uuid default null, _props jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_actor_person uuid;
begin
  select id into v_actor_person from public.persons where user_id = v_actor;
  if v_actor_person is not null and public._recusa_analise(v_actor_person) then v_actor := null; end if;
  if _person is not null and public._recusa_analise(_person) then _person := null; end if;
  insert into public.product_events (kind, org_id, actor_user, person_id, props) values (_kind, _org, v_actor, _person, coalesce(_props, '{}'::jsonb));
exception when others then
  -- Medir nunca pode impedir o trabalho de alguém
  null;
end $$;

-- ---------------------------------------------------------------------------
-- De onde vêm os eventos
-- ---------------------------------------------------------------------------
create or replace function public._tg_ev_org() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._evento('org_criada', new.id, null, jsonb_build_object('tipo', new.type::text));
  return new;
end $$;
create trigger ev_org after insert on public.organizations for each row execute function public._tg_ev_org();

create or replace function public._tg_ev_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tem_app boolean;
begin
  select user_id is not null into tem_app from public.persons where id = new.person_id;
  if tg_op = 'INSERT' then
    perform public._evento('cliente_adicionado', new.org_id, new.person_id, jsonb_build_object('origem', new.origin::text));
    if new.origin in ('athlete_code','signup') then
      perform public._evento('ligacao_atleta_treinador', new.org_id, new.person_id, jsonb_build_object('quem_comecou', 'atleta'));
    end if;
    if tem_app then perform public._evento('cliente_entrou_app', new.org_id, new.person_id, '{}'::jsonb); end if;
  elsif old.person_id is distinct from new.person_id and tem_app then
    -- Aceitou o convite: a ligação passa para a pessoa com conta
    perform public._evento('cliente_entrou_app', new.org_id, new.person_id, '{}'::jsonb);
    if new.origin = 'invite' then perform public._evento('ligacao_atleta_treinador', new.org_id, new.person_id, jsonb_build_object('quem_comecou', 'treinador')); end if;
  end if;
  return new;
end $$;
create trigger ev_link after insert or update of person_id on public.links for each row execute function public._tg_ev_link();

create or replace function public._tg_ev_treino() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workouts w where w.org_id = new.org_id and w.id <> new.id) then
    perform public._evento('primeiro_treino_criado', new.org_id, null, '{}'::jsonb);
  end if;
  return new;
end $$;
create trigger ev_treino after insert on public.workouts for each row execute function public._tg_ev_treino();

create or replace function public._tg_ev_atribuicao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._evento('plano_atribuido', new.org_id, (select person_id from public.links where id = new.link_id),
    jsonb_build_object('primeiro', not exists (select 1 from public.assignments a where a.org_id = new.org_id and a.id <> new.id)));
  return new;
end $$;
create trigger ev_atribuicao after insert on public.assignments for each row execute function public._tg_ev_atribuicao();

create or replace function public._tg_ev_sessao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phase = 'done' and (tg_op = 'INSERT' or old.phase is distinct from 'done') then
    if new.membership_id is null then perform public._evento('treino_app_feito', new.org_id, new.person_id, '{}'::jsonb);
    else perform public._evento('sessao_ao_vivo_concluida', new.org_id, new.person_id, '{}'::jsonb);
    end if;
  end if;
  return new;
end $$;
create trigger ev_sessao after insert or update of phase on public.sessions for each row execute function public._tg_ev_sessao();

create or replace function public._tg_ev_subscricao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status = 'trial' then perform public._evento('trial_iniciado', new.org_id, null, '{}'::jsonb);
  elsif tg_op = 'UPDATE' and old.status is distinct from new.status then
    if old.status = 'trial' and new.status = 'active' then perform public._evento('trial_convertido', new.org_id, null, '{}'::jsonb);
    elsif old.status = 'trial' then perform public._evento('trial_expirado', new.org_id, null, '{}'::jsonb);
    end if;
    if new.status = 'read_only' then perform public._evento('org_so_leitura', new.org_id, null, '{}'::jsonb); end if;
  end if;
  return new;
end $$;
create trigger ev_subscricao after insert or update of status on public.subscriptions for each row execute function public._tg_ev_subscricao();

-- ---------------------------------------------------------------------------
-- C-24 · a própria pessoa decide se entra na análise
-- ---------------------------------------------------------------------------
create or replace function public.set_analytics_consent(_granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person();
begin
  insert into public.consents (person_id, kind, version, granted, actor_user) values (me, 'analise', '2026-10', _granted, auth.uid());
  -- Recusar também tira a pessoa do que já foi medido (fica só no agregado)
  if not _granted then
    update public.product_events set person_id = null where person_id = me;
    update public.product_events set actor_user = null where actor_user = auth.uid();
  end if;
end $$;
create or replace function public.my_analytics_consent() returns boolean
language sql stable security definer set search_path = '' as $$
  select not public._recusa_analise(public.my_person_id());
$$;

-- ---------------------------------------------------------------------------
-- Painel interno: as métricas do portão da F1a e do modelo de negócio
-- ---------------------------------------------------------------------------
create or replace function public.activation_metrics(_weeks int default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; ini timestamptz := date_trunc('week', now()) - make_interval(weeks => greatest(1, least(_weeks, 52)) - 1);
begin
  if not public.is_lunaos_staff() then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  with semanas as (select generate_series(ini, date_trunc('week', now()), interval '1 week') as s),
  ativos as (
    select date_trunc('week', created_at) s, count(distinct actor_user) pt
    from public.product_events where actor_user is not null and created_at >= ini
      and kind in ('cliente_adicionado','plano_atribuido','sessao_ao_vivo_concluida','primeiro_treino_criado')
    group by 1),
  app as (
    select date_trunc('week', created_at) s, count(distinct person_id) cli
    from public.product_events where kind = 'treino_app_feito' and person_id is not null and created_at >= ini group by 1),
  primeiro as (
    select o.org_id, o.created_at criada, min(p.created_at) plano
    from public.product_events o left join public.product_events p on p.org_id = o.org_id and p.kind = 'plano_atribuido'
    where o.kind = 'org_criada' group by 1, 2),
  coorte as (
    select e.person_id, min(e.created_at) entrou from public.product_events e
    where e.kind = 'cliente_entrou_app' and e.person_id is not null and e.created_at < now() - interval '28 days' group by 1),
  retidos as (
    select count(*) filter (where exists (select 1 from public.product_events t where t.kind = 'treino_app_feito' and t.person_id = c.person_id
                                         and t.created_at >= c.entrou + interval '21 days' and t.created_at < c.entrou + interval '35 days')) r,
           count(*) n from coorte c)
  select jsonb_build_object(
    'semanas', (select jsonb_agg(jsonb_build_object('semana', to_char(s.s, 'YYYY-MM-DD'), 'pt_ativos', coalesce(a.pt, 0), 'clientes_app', coalesce(p.cli, 0),
                  'clientes_por_pt', case when coalesce(a.pt, 0) > 0 then round(coalesce(p.cli, 0)::numeric / a.pt, 1) end) order by s.s)
                from semanas s left join ativos a on a.s = s.s left join app p on p.s = s.s),
    'dias_ate_primeiro_plano', (select percentile_cont(0.5) within group (order by extract(epoch from (plano - criada)) / 86400) from primeiro where plano is not null),
    'organizacoes', (select count(*) from primeiro),
    'organizacoes_com_plano', (select count(*) from primeiro where plano is not null),
    'retencao_4_semanas', (select case when n >= 3 then round(100.0 * r / n) end from retidos),
    'coorte_retencao', (select case when n >= 3 then n end from retidos),
    'trial_convertidos', (select count(*) from public.product_events where kind = 'trial_convertido'),
    'trial_expirados', (select count(*) from public.product_events where kind = 'trial_expirado'),
    'ligacoes_vindas_do_atleta', (select count(*) from public.product_events where kind = 'ligacao_atleta_treinador' and props->>'quem_comecou' = 'atleta'),
    'ligacoes_total', (select count(*) from public.product_events where kind = 'ligacao_atleta_treinador'),
    'so_leitura', (select count(*) from public.product_events where kind = 'org_so_leitura'),
    'sessoes_ao_vivo', (select count(*) from public.product_events where kind = 'sessao_ao_vivo_concluida' and created_at >= ini)
  ) into v;
  return v;
end $$;

revoke execute on function public._evento(text, uuid, uuid, jsonb), public._recusa_analise(uuid), public._props_validas(jsonb), public._tg_ev_org(), public._tg_ev_link(),
  public._tg_ev_treino(), public._tg_ev_atribuicao(), public._tg_ev_sessao(), public._tg_ev_subscricao() from public, anon, authenticated;
revoke execute on function public.set_analytics_consent(boolean), public.my_analytics_consent(), public.activation_metrics(int), public.is_lunaos_staff() from public, anon;
grant execute on function public.set_analytics_consent(boolean), public.my_analytics_consent(), public.activation_metrics(int), public.is_lunaos_staff() to authenticated;
