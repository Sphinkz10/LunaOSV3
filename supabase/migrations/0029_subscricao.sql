-- ============================================================
-- LUNA.OS v3 · 0029 · Treinadores: conta, plano e subscrição por lugar
-- (tarefa 11; F1b passo 26; W-02, X-04, G-47; jornadas J32, J33 e J34).
--   · Planos Treinador e Ginásio: ligam e desligam módulos só pelos direitos
--     (entitlements). Descer de plano deixa os módulos que saem só de leitura;
--     nunca apaga.
--   · Fornecedor de pagamentos falso (nunca cobra): o real espera pela decisão
--     N8. Estados: experimental, ativa, em graça, só leitura e cancelada.
--   · Só leitura: a equipa lê e exporta, não escreve; os clientes continuam a
--     entrar na app e a treinar (regra 3 do modelo de negócio).
--   · Lugares contados pelos papéis com occupies_seat (_seats_used, 0004).
-- ============================================================

alter table public.subscriptions
  add column grace_ends_at  timestamptz,
  add column payment_method text check (payment_method is null or payment_method in ('falso')),
  add constraint subscriptions_plano check (plan in ('treinador','ginasio'));

-- Módulos que deixaram de estar no plano ficam só de leitura (nunca se apagam)
alter table public.entitlements add column read_only boolean not null default false;

-- Plano Ginásio: tudo o que o Treinador tem, mais entradas, cobranças e unidades
insert into public.plan_modules (plan, module)
  select 'ginasio', pm.module from public.plan_modules pm where pm.plan = 'treinador'
  on conflict do nothing;
insert into public.plan_modules (plan, module) values
  ('ginasio','entries'), ('ginasio','billing'), ('ginasio','units')
  on conflict do nothing;

-- Histórico da subscrição (só de acrescentar)
create table public.subscription_events (
  id         bigserial primary key,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  kind       text not null check (kind in ('plano','lugares','estado','metodo','pagamento_ok','pagamento_falhou','perdeu_lugar')),
  from_value text,
  to_value   text,
  reason     text,
  actor_user uuid,
  created_at timestamptz not null default now()
);
create index on public.subscription_events (org_id, created_at desc);
alter table public.subscription_events enable row level security;
create policy subscription_events_select on public.subscription_events for select to authenticated
  using (public.has_perm(org_id, 'org.manage') or public.has_perm(org_id, 'team.manage'));
grant select on public.subscription_events to authenticated;
revoke insert, update, delete on public.subscription_events from authenticated;
revoke all on public.subscription_events from anon;

-- Modalidades ainda não suportadas: lista de espera, sem bloquear o registo (J35)
create table public.sport_waitlist (
  person_id  uuid not null references public.persons(id) on delete cascade,
  sport      text not null check (length(trim(sport)) > 0),
  org_id     uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (person_id, sport)
);
alter table public.sport_waitlist enable row level security;
create policy sport_waitlist_own on public.sport_waitlist for select to authenticated
  using (person_id = public.my_person_id());
grant select on public.sport_waitlist to authenticated;
revoke insert, update, delete on public.sport_waitlist from authenticated;
revoke all on public.sport_waitlist from anon;

-- ---------------------------------------------------------------------------
-- Só leitura: as permissões de escrita deixam de valer; as de leitura ficam.
-- Quem gere a subscrição continua a poder pagar e retomar (_gere_subscricao).
-- ---------------------------------------------------------------------------
create or replace function public.has_perm(_org uuid, _perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.persons p          on p.id = m.person_id
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r            on r.id = mr.role_id
    where m.org_id = _org and m.status = 'active' and p.user_id = auth.uid()
      and _perm = any (r.permissions)
  ) and (
    _perm in ('clients.read_all','clients.read_own','schedule.read_all','health.read')
    or not exists (select 1 from public.subscriptions s
                   where s.org_id = _org and s.status in ('read_only','cancelled'))
  );
$$;

-- Uma subscrição cancelada não esconde nada: fica só de leitura
create or replace function public.has_module(_org uuid, _module text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_member(_org)
     and exists (select 1 from public.entitlements e
                 where e.org_id = _org and e.module = _module);
$$;

create or replace function public._gere_subscricao(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.persons p          on p.id = m.person_id
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r            on r.id = mr.role_id
    where m.org_id = _org and m.status = 'active' and p.user_id = auth.uid()
      and 'org.manage' = any (r.permissions));
$$;

-- Direitos do plano: os módulos do plano ligam; os que saem ficam só de leitura
create or replace function public._aplicar_plano(_org uuid, _plan text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entitlements (org_id, module, limit_value, source, read_only)
    select _org, pm.module, pm.limit_value, 'plan', false from public.plan_modules pm where pm.plan = _plan
  on conflict (org_id, module) where org_id is not null
    do update set read_only = false, limit_value = excluded.limit_value;
  update public.entitlements e set read_only = true
    where e.org_id = _org and e.source = 'plan'
      and not exists (select 1 from public.plan_modules pm where pm.plan = _plan and pm.module = e.module);
end $$;

create or replace function public._avisar_donos(_org uuid, _titulo text, _texto text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, org_id, type, title, body, action_url)
  select distinct p.user_id, _org, 'subscricao', _titulo, _texto, '/settings/subscricao'
  from public.memberships m
  join public.persons p on p.id = m.person_id
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where m.org_id = _org and m.status = 'active' and r.key = 'owner' and p.user_id is not null;
$$;

create or replace function public._mudar_estado(_org uuid, _novo public.subscription_status, _motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_antes public.subscription_status;
begin
  select status into v_antes from public.subscriptions where org_id = _org for update;
  if v_antes is null or v_antes = _novo then return; end if;
  update public.subscriptions
     set status = _novo, updated_at = now(),
         grace_ends_at = case when _novo = 'grace' then now() + interval '7 days' else null end
   where org_id = _org;
  insert into public.subscription_events (org_id, kind, from_value, to_value, reason, actor_user)
    values (_org, 'estado', v_antes::text, _novo::text, _motivo, auth.uid());
  if _novo = 'grace' then
    perform public._avisar_donos(_org, 'O pagamento do LunaOS falhou',
      'Tens 7 dias para atualizar o pagamento. Depois a organização fica só de leitura; nada se apaga.');
  elsif _novo = 'read_only' then
    perform public._avisar_donos(_org, 'A organização ficou só de leitura',
      'Continuas a ver e a exportar tudo e os clientes continuam na app. Retoma a subscrição para voltar a escrever.');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Criar organização (X-04): como trabalhas decide o plano e os lugares
-- ---------------------------------------------------------------------------
drop function if exists public.create_organization(text, public.org_type, text, text);
create function public.create_organization(
  _name text, _type public.org_type, _sport text default 'fitness', _timezone text default 'Europe/Lisbon',
  _unit text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  v_org uuid;
  v_membership uuid;
  v_version int;
  v_plan text := case when _type in ('gym','club') then 'ginasio' else 'treinador' end;
begin
  if coalesce(trim(_name), '') = '' then
    raise exception 'nome obrigatório' using errcode = 'check_violation';
  end if;

  insert into public.organizations (type, name, timezone, created_by)
    values (_type, trim(_name), _timezone, me) returning id into v_org;
  insert into public.units (org_id, name, timezone) values (v_org, coalesce(nullif(trim(_unit), ''), 'Principal'), _timezone);
  insert into public.memberships (org_id, person_id, status, joined_at)
    values (v_org, me, 'active', now()) returning id into v_membership;
  insert into public.membership_roles (org_id, membership_id, role_id)
    select v_org, v_membership, r.id from public.roles r where r.org_id is null and r.key = 'owner';

  insert into public.subscriptions (org_id, plan, seats, status, trial_ends_at)
    values (v_org, v_plan, case when _type = 'solo_coach' then 1 else 3 end,
            'trial', now() + interval '30 days');
  perform public._aplicar_plano(v_org, v_plan);

  select max(s.version) into v_version from public.sports s where s.id = _sport;
  if v_version is not null then
    insert into public.org_sports (org_id, sport_id, sport_version) values (v_org, _sport, v_version);
  else
    -- modalidade por suportar: fica em lista de espera e usa a genérica
    insert into public.sport_waitlist (person_id, sport, org_id) values (me, _sport, v_org) on conflict do nothing;
    select max(s.version) into v_version from public.sports s where s.id = 'fitness';
    if v_version is not null then
      insert into public.org_sports (org_id, sport_id, sport_version) values (v_org, 'fitness', v_version);
    end if;
  end if;

  update public.user_settings set last_org_id = v_org where user_id = auth.uid();
  return v_org;
end $$;

create or replace function public.join_sport_waitlist(_sports text[], _org uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person(); n int;
begin
  if _org is not null and not public.is_member(_org) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  insert into public.sport_waitlist (person_id, sport, org_id)
    select me, trim(s), _org from unnest(_sports) s
    where length(trim(s)) > 0 and not exists (select 1 from public.sports x where x.id = trim(s))
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- G-47 · Subscrição e lugares
-- ---------------------------------------------------------------------------
create or replace function public.subscription_overview(_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.subscriptions%rowtype;
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.subscriptions where org_id = _org;
  return jsonb_build_object(
    'plano', s.plan, 'estado', s.status, 'lugares', s.seats, 'ocupados', public._seats_used(_org),
    'experimental_ate', s.trial_ends_at, 'graca_ate', s.grace_ends_at, 'metodo', s.payment_method,
    'gere', public._gere_subscricao(_org),
    'clientes', (select count(*) from public.links l where l.org_id = _org and l.status = 'active'),
    'pessoas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'membership_id', m.id, 'nome', p.full_name, 'titulo', m.title,
        'papeis', (select array_agg(r.name order by r.name) from public.membership_roles mr join public.roles r on r.id = mr.role_id where mr.membership_id = m.id),
        'ocupa', exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id where mr.membership_id = m.id and r.occupies_seat),
        'dono', exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id where mr.membership_id = m.id and r.key = 'owner'))
        order by p.full_name)
      from public.memberships m join public.persons p on p.id = m.person_id
      where m.org_id = _org and m.status = 'active'), '[]'::jsonb),
    'convites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'papel', r.name, 'ocupa', r.occupies_seat, 'criado', i.created_at) order by i.created_at)
      from public.invites i join public.roles r on r.id = i.role_id
      where i.org_id = _org and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()), '[]'::jsonb),
    'modulos', coalesce((
      select jsonb_agg(jsonb_build_object('modulo', e.module, 'so_leitura', e.read_only) order by e.module)
      from public.entitlements e where e.org_id = _org), '[]'::jsonb),
    'historico', case when public._gere_subscricao(_org) then coalesce((
      select jsonb_agg(jsonb_build_object('tipo', x.kind, 'de', x.from_value, 'para', x.to_value, 'motivo', x.reason, 'em', x.created_at) order by x.created_at desc)
      from (select * from public.subscription_events e where e.org_id = _org order by e.created_at desc limit 30) x), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- O efeito antes de confirmar: módulos que entram e que ficam só de leitura, lugares
create or replace function public.preview_subscription_change(_org uuid, _plan text, _seats int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.subscriptions%rowtype; v_usados int;
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _plan not in ('treinador','ginasio') then raise exception 'plano desconhecido' using errcode = 'invalid_parameter_value'; end if;
  select * into s from public.subscriptions where org_id = _org;
  v_usados := public._seats_used(_org);
  return jsonb_build_object(
    'plano_de', s.plan, 'plano_para', _plan,
    'lugares_de', s.seats, 'lugares_para', _seats, 'ocupados', v_usados,
    'liberta', greatest(v_usados - _seats, 0),
    'entram', coalesce((select jsonb_agg(pm.module order by pm.module) from public.plan_modules pm
                        where pm.plan = _plan and not exists (select 1 from public.entitlements e where e.org_id = _org and e.module = pm.module and not e.read_only)), '[]'::jsonb),
    'so_leitura', coalesce((select jsonb_agg(e.module order by e.module) from public.entitlements e
                            where e.org_id = _org and e.source = 'plan' and not e.read_only
                              and not exists (select 1 from public.plan_modules pm where pm.plan = _plan and pm.module = e.module)), '[]'::jsonb));
end $$;

-- Mudar plano e lugares. Descer abaixo dos lugares ocupados pede quem perde o lugar.
create or replace function public.change_subscription(
  _org uuid, _plan text, _seats int, _free uuid[] default '{}', _reason text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions%rowtype; v_m uuid;
begin
  if not public._gere_subscricao(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _plan not in ('treinador','ginasio') then raise exception 'plano desconhecido' using errcode = 'invalid_parameter_value'; end if;
  if _seats is null or _seats < 1 then raise exception 'pelo menos um lugar' using errcode = 'check_violation'; end if;
  select * into s from public.subscriptions where org_id = _org for update;
  if s.status = 'cancelled' then raise exception 'retoma a subscrição primeiro' using errcode = 'check_violation'; end if;

  foreach v_m in array coalesce(_free, '{}') loop
    if not exists (select 1 from public.memberships m
                   join public.membership_roles mr on mr.membership_id = m.id
                   join public.roles r on r.id = mr.role_id
                   where m.id = v_m and m.org_id = _org and m.status = 'active' and r.occupies_seat)
       or exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id
                  where mr.membership_id = v_m and r.key = 'owner') then
      raise exception 'essa pessoa não pode perder o lugar' using errcode = 'check_violation';
    end if;
    update public.memberships set status = 'left', left_at = now() where id = v_m;
    insert into public.membership_events (org_id, membership_id, action, reason, actor_user)
      values (_org, v_m, 'desativado', coalesce(nullif(trim(_reason), ''), 'Perdeu o lugar na mudança de plano'), auth.uid());
    insert into public.subscription_events (org_id, kind, to_value, reason, actor_user)
      values (_org, 'perdeu_lugar', v_m::text, nullif(trim(_reason), ''), auth.uid());
  end loop;

  if public._seats_used(_org) > _seats then
    raise exception 'escolhe quem perde o lugar' using errcode = 'check_violation',
      hint = 'Há mais lugares ocupados do que os pedidos (convites à espera também contam).';
  end if;

  if s.plan <> _plan then
    update public.subscriptions set plan = _plan, updated_at = now() where org_id = _org;
    perform public._aplicar_plano(_org, _plan);
    insert into public.subscription_events (org_id, kind, from_value, to_value, reason, actor_user)
      values (_org, 'plano', s.plan, _plan, nullif(trim(_reason), ''), auth.uid());
  end if;
  if s.seats <> _seats then
    update public.subscriptions set seats = _seats, updated_at = now() where org_id = _org;
    insert into public.subscription_events (org_id, kind, from_value, to_value, reason, actor_user)
      values (_org, 'lugares', s.seats::text, _seats::text, nullif(trim(_reason), ''), auth.uid());
  end if;
  return public.subscription_overview(_org);
end $$;

-- Fornecedor falso: guarda um "método de pagamento" de teste. Nunca cobra.
create or replace function public.add_payment_method(_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions%rowtype;
begin
  if not public._gere_subscricao(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.subscriptions where org_id = _org for update;
  update public.subscriptions set payment_method = 'falso', provider_ref = coalesce(provider_ref, 'falso:' || _org::text), updated_at = now()
    where org_id = _org;
  insert into public.subscription_events (org_id, kind, to_value, actor_user) values (_org, 'metodo', 'falso', auth.uid());
  -- Com método válido, uma organização em graça ou só de leitura volta a ativa
  if s.status in ('grace','read_only') then
    insert into public.subscription_events (org_id, kind, actor_user) values (_org, 'pagamento_ok', auth.uid());
    perform public._mudar_estado(_org, 'active', 'Pagamento atualizado');
  end if;
end $$;

create or replace function public.cancel_subscription(_org uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public._gere_subscricao(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'motivo obrigatório' using errcode = 'check_violation'; end if;
  perform public._mudar_estado(_org, 'cancelled', trim(_reason));
end $$;

create or replace function public.resume_subscription(_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions%rowtype;
begin
  if not public._gere_subscricao(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into s from public.subscriptions where org_id = _org for update;
  if s.status not in ('cancelled','read_only') then return; end if;
  if s.payment_method is null then
    raise exception 'falta o método de pagamento' using errcode = 'check_violation';
  end if;
  perform public._mudar_estado(_org, 'active', 'Retomada');
end $$;

-- O que um fornecedor real chamaria (webhook): só o serviço
create or replace function public._evento_fornecedor(_org uuid, _evento text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.subscriptions%rowtype;
begin
  select * into s from public.subscriptions where org_id = _org for update;
  if not found then return; end if;
  if _evento = 'pagamento_ok' then
    insert into public.subscription_events (org_id, kind) values (_org, 'pagamento_ok');
    perform public._mudar_estado(_org, 'active', 'Pagamento recebido');
  elsif _evento = 'pagamento_falhou' then
    insert into public.subscription_events (org_id, kind) values (_org, 'pagamento_falhou');
    if s.status in ('active','trial') then perform public._mudar_estado(_org, 'grace', 'Pagamento falhou'); end if;
  else
    raise exception 'evento desconhecido' using errcode = 'invalid_parameter_value';
  end if;
end $$;

-- Relógio da subscrição: fim do experimental e fim da graça
create or replace function public._avancar_subscricoes(_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select * from public.subscriptions
           where (status = 'trial' and trial_ends_at <= _now) or (status = 'grace' and grace_ends_at <= _now) loop
    if r.status = 'trial' and r.payment_method is not null then
      insert into public.subscription_events (org_id, kind) values (r.org_id, 'pagamento_ok');
      perform public._mudar_estado(r.org_id, 'active', 'Fim do período experimental');
    elsif r.status = 'trial' then
      perform public._mudar_estado(r.org_id, 'read_only', 'Fim do período experimental sem pagamento');
    else
      perform public._mudar_estado(r.org_id, 'read_only', 'Fim do período de graça');
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public._enviar_lembretes_e_expirar(_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
begin
  perform public._expirar_por_confirmar(null);
  perform public._avancar_subscricoes(_now);
  return public._enviar_lembretes(_now);
end $$;

revoke execute on function public._gere_subscricao(uuid), public._aplicar_plano(uuid, text), public._avisar_donos(uuid, text, text),
  public._mudar_estado(uuid, public.subscription_status, text), public._evento_fornecedor(uuid, text),
  public._avancar_subscricoes(timestamptz), public._enviar_lembretes_e_expirar(timestamptz) from public, anon, authenticated;
grant execute on function public._evento_fornecedor(uuid, text), public._avancar_subscricoes(timestamptz),
  public._enviar_lembretes_e_expirar(timestamptz) to service_role;
revoke execute on function public.create_organization(text, public.org_type, text, text, text), public.join_sport_waitlist(text[], uuid),
  public.subscription_overview(uuid), public.preview_subscription_change(uuid, text, int),
  public.change_subscription(uuid, text, int, uuid[], text), public.add_payment_method(uuid),
  public.cancel_subscription(uuid, text), public.resume_subscription(uuid) from public, anon;
grant execute on function public.create_organization(text, public.org_type, text, text, text), public.join_sport_waitlist(text[], uuid),
  public.subscription_overview(uuid), public.preview_subscription_change(uuid, text, int),
  public.change_subscription(uuid, text, int, uuid[], text), public.add_payment_method(uuid),
  public.cancel_subscription(uuid, text), public.resume_subscription(uuid) to authenticated;
