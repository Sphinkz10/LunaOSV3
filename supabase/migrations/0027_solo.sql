-- ============================================================
-- LUNA.OS v3 · 0027 · Começar sozinho e ligar a um treinador
-- (C-26, C-27, J36 e J37; F1b passo 24).
--   · Modo solo: a pessoa escolhe objetivo, nível, dias e onde treina e recebe
--     um plano feito a partir de modelos. O plano é da pessoa (sem org).
--   · Com um treinador, o plano dele passa para a frente; o solo fica guardado.
--   · Ligar: pelo código do treinador (TR-4821) ou convite por email/SMS a um
--     treinador que ainda não usa o LunaOS (entra pelo experimental, J32).
--     A pessoa escolhe o que partilha; o treinador aceita na Inbox.
--   · Desligar: o treinador deixa de ver na leitura seguinte; a pessoa fica com
--     o histórico e com uma cópia do plano do treinador.
-- ============================================================

-- Os exercícios do treino feito na app guardam o nome (para o solo, que não usa a biblioteca da org)
alter table public.session_exercises add column name text;

create table public.solo_profiles (
  person_id   uuid primary key references public.persons(id) on delete cascade,
  goal        text not null check (goal in ('forca','peso','mexer','prova')),
  level       text not null check (level in ('iniciante','intermedio','avancado')),
  days        int not null check (days between 2 and 6),
  place       text not null check (place in ('casa','ginasio')),
  updated_at  timestamptz not null default now()
);
create table public.solo_plans (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons(id) on delete cascade,
  name        text not null,
  source      text not null default 'modelo' check (source in ('modelo','copia_treinador')),
  snapshot    jsonb not null,             -- {nome, dias:[{id, dia, nome, duracao_min, blocos:[...]}]}
  started_on  date not null default current_date,
  archived_at timestamptz,
  created_at  timestamptz not null default now()
);
create unique index solo_plans_um_ativo on public.solo_plans (person_id) where archived_at is null;
alter table public.solo_profiles enable row level security;
alter table public.solo_plans enable row level security;
create policy solo_profiles_own on public.solo_profiles for select to authenticated using (public.is_self_or_guardian(person_id));
create policy solo_plans_own on public.solo_plans for select to authenticated
  using (public.is_self_or_guardian(person_id) or public.can_read_person_data(person_id, 'training'));
grant select on public.solo_profiles, public.solo_plans to authenticated;
revoke all on public.solo_profiles, public.solo_plans from anon;

-- Modelos (servidor): 3 treinos por objetivo e local, séries e repetições pelo nível
create or replace function public._modelo_solo(_goal text, _level text, _days int, _place text) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  series int := case _level when 'iniciante' then 2 when 'intermedio' then 3 else 4 end;
  reps text := case _goal when 'forca' then (case _level when 'iniciante' then '10' else '6-8' end) when 'peso' then '12-15' else '10-12' end;
  descanso int := case _goal when 'forca' then 120 else 60 end;
  dias_semana int[] := case _days when 2 then '{1,4}' when 3 then '{1,3,5}' when 4 then '{1,2,4,5}' when 5 then '{1,2,3,4,5}' else '{1,2,3,4,5,6}' end;
  treinos jsonb; nomes text[] := array['A','B','C']; d int; i int := 0; dias jsonb := '[]';
  ex jsonb;
begin
  treinos := case when _place = 'casa' then jsonb_build_array(
      jsonb_build_array('Agachamento com peso do corpo','Flexões (inclinadas se for preciso)','Ponte de glúteos','Prancha','Remada com elástico'),
      jsonb_build_array('Lunge alternado','Flexões de tríceps no banco','Super-homem','Prancha lateral','Escalador'),
      jsonb_build_array('Agachamento búlgaro','Flexões','Elevação de anca a uma perna','Dead bug','Burpee sem salto'))
    else jsonb_build_array(
      jsonb_build_array('Agachamento com barra','Supino com halteres','Remada com halter','Prancha','Elevação de anca'),
      jsonb_build_array('Peso morto romeno','Press de ombros com halteres','Puxada na polia','Lunge com halteres','Dead bug'),
      jsonb_build_array('Leg press','Flexões','Remada sentada','Farmer walk','Prancha lateral'))
  end;
  foreach d in array dias_semana loop
    select jsonb_agg(jsonb_build_object('exercise_id', null, 'nome', e, 'series', series, 'reps', case when e like 'Prancha%' or e = 'Farmer walk' then '30 s' else reps end,
                                        'carga', null, 'rpe', null, 'descanso', descanso, 'notas', null, 'video', null, 'escalas', '{}'::jsonb, 'alternativas', '[]'::jsonb))
      into ex from jsonb_array_elements_text(treinos->(i % 3)) e;
    dias := dias || jsonb_build_object('id', gen_random_uuid(), 'dia', d, 'nome', 'Corpo inteiro ' || nomes[(i % 3) + 1],
      'duracao_min', 20 + series * 5,
      'blocos', jsonb_build_array(jsonb_build_object('rotulo', 'Principal', 'modo', 'series', 'voltas', null, 'minutos', null, 'exercicios', ex))
        || case when _goal in ('peso','mexer') then jsonb_build_array(jsonb_build_object('rotulo', 'Cardio', 'modo', 'tempo', 'voltas', null, 'minutos', 10,
             'exercicios', jsonb_build_array(jsonb_build_object('exercise_id', null, 'nome', case when _place = 'casa' then 'Caminhada rápida ou polichinelos' else 'Bicicleta ou passadeira' end,
               'series', 1, 'reps', '10 min', 'carga', null, 'rpe', 6, 'descanso', 0, 'notas', null, 'video', null, 'escalas', '{}'::jsonb, 'alternativas', '[]'::jsonb))))
           else '[]'::jsonb end);
    i := i + 1;
  end loop;
  return jsonb_build_object('nome', case _goal when 'forca' then 'Ganhar força' when 'peso' then 'Perder peso' when 'mexer' then 'Mexer-me mais' else 'Preparar uma prova' end
    || ' · ' || _days || 'x por semana', 'dias', dias);
end $$;

create or replace function public.start_solo(_goal text, _level text, _days int, _place text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person(); v uuid; snap jsonb;
begin
  insert into public.solo_profiles (person_id, goal, level, days, place) values (me, _goal, _level, _days, _place)
    on conflict (person_id) do update set goal = excluded.goal, level = excluded.level, days = excluded.days, place = excluded.place, updated_at = now();
  snap := public._modelo_solo(_goal, _level, _days, _place);
  update public.solo_plans set archived_at = now() where person_id = me and archived_at is null;
  insert into public.solo_plans (person_id, name, snapshot) values (me, snap->>'nome', snap) returning id into v;
  perform public._evento('atleta_solo_criado', null, me, '{}'::jsonb);
  return v;
end $$;

-- Há plano do treinador? (então passa para a frente do solo)
create or replace function public._tem_plano_treinador(_person uuid, _on date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignments x join public.links k on k.id = x.link_id
                 where k.person_id = _person and k.status = 'active' and x.status in ('active','scheduled')
                   and (x.starts_on is null or x.starts_on <= _on) and (x.ends_on is null or x.ends_on >= _on));
$$;

-- O treino solo de um dia (ou pelo id do dia), na mesma forma do treino do treinador
create or replace function public.my_solo_workout(_day uuid default null, _on date default current_date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (d - 'id' - 'dia') || jsonb_build_object('workout_id', d->>'id', 'versao', 1, 'link_id', null, 'solo', true)
  from public.solo_plans p cross join lateral jsonb_array_elements(p.snapshot->'dias') d
  where p.person_id = public.my_person_id() and p.archived_at is null
    and (case when _day is not null then (d->>'id')::uuid = _day else (d->>'dia')::int = extract(dow from _on)::int end)
  limit 1;
$$;

create or replace function public.my_solo_week(_from date default current_date)
returns table (dia date, workout_id uuid, nome text, plano text)
language sql stable security definer set search_path = '' as $$
  select g::date, (d->>'id')::uuid, d->>'nome', p.name
  from generate_series(_from, _from + 6, interval '1 day') g
  join public.solo_plans p on p.person_id = public.my_person_id() and p.archived_at is null
  cross join lateral jsonb_array_elements(p.snapshot->'dias') d
  where (d->>'dia')::int = extract(dow from g)::int and not public._tem_plano_treinador(public.my_person_id(), g::date)
  order by 1;
$$;

-- O treino feito guarda o nome do exercício (solo e trocas sem ficha)
create or replace function public.sync_my_session(_p jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  me uuid := public._require_person();
  v_id uuid := (_p->>'id')::uuid;
  v_link uuid := nullif(_p->>'link_id', '')::uuid;
  v_org uuid;
  ex jsonb; st jsonb; v_se uuid; i int := 0;
begin
  if v_id is null then raise exception 'falta o id da sessão' using errcode = 'invalid_parameter_value'; end if;
  if exists (select 1 from public.sessions where id = v_id) then
    if not exists (select 1 from public.sessions where id = v_id and person_id = me) then
      raise exception 'sem permissão' using errcode = 'insufficient_privilege';
    end if;
    return v_id;
  end if;
  if v_link is not null then
    select org_id into v_org from public.links where id = v_link and person_id = me and status = 'active';
    if v_org is null then raise exception 'ligação inválida' using errcode = 'insufficient_privilege'; end if;
  end if;
  insert into public.sessions (id, person_id, org_id, link_id, workout_id, phase, started_at, ended_at, elapsed_seconds, summary, notes)
    values (v_id, me, v_org, v_link,
            case when v_org is not null and exists (select 1 from public.workouts w where w.id = nullif(_p->>'workout_id', '')::uuid and w.org_id = v_org)
                 then (_p->>'workout_id')::uuid end,
            'done', (_p->>'started_at')::timestamptz, coalesce((_p->>'ended_at')::timestamptz, now()),
            greatest(0, coalesce(extract(epoch from (coalesce((_p->>'ended_at')::timestamptz, now()) - (_p->>'started_at')::timestamptz))::int, 0)),
            jsonb_build_object('rpe', _p->'rpe', 'trocas', coalesce(_p->'trocas', '[]'::jsonb), 'origem', case when v_link is null then 'solo' else 'app' end,
                               'nome', _p->>'nome'),
            nullif(trim(_p->>'nota'), ''));
  for ex in select * from jsonb_array_elements(coalesce(_p->'exercicios', '[]')) loop
    insert into public.session_exercises (session_id, person_id, org_id, exercise_id, position, target_sets, name)
      values (v_id, me, v_org,
              case when v_org is not null and exists (select 1 from public.exercises e where e.id = nullif(ex->>'exercise_id', '')::uuid and e.org_id = v_org)
                   then (ex->>'exercise_id')::uuid end,
              i, nullif(ex->>'series', '')::int, nullif(trim(ex->>'nome'), ''))
      returning id into v_se;
    i := i + 1;
    for st in select * from jsonb_array_elements(coalesce(ex->'sets', '[]')) loop
      insert into public.session_sets (session_id, session_exercise_id, person_id, org_id, set_index, reps, load_kg, rpe, completed, recorded_at)
        values (v_id, v_se, me, v_org, (st->>'n')::int, nullif(st->>'reps', '')::int, nullif(st->>'carga', '')::numeric,
                nullif(st->>'rpe', '')::numeric, coalesce((st->>'feito')::boolean, true), coalesce((st->>'em')::timestamptz, now()));
    end loop;
  end loop;
  if v_link is not null then
    insert into public.notifications (user_id, org_id, type, title, body, data, action_url)
      select p.user_id, v_org, 'treino_feito',
        (select full_name from public.persons where id = me) || ' fez ' || coalesce(_p->>'nome', 'o treino'),
        concat_ws(' · ', case when _p->>'rpe' is not null then 'esforço ' || (_p->>'rpe') || '/10' end, nullif(trim(_p->>'nota'), '')),
        jsonb_build_object('session_id', v_id), '/clients/' || v_link || '?sep=atividade'
      from public.links l join public.memberships m on m.id = l.responsible_membership_id join public.persons p on p.id = m.person_id
      where l.id = v_link and p.user_id is not null;
  end if;
  return v_id;
end $$;

create or replace function public.my_records()
returns table (exercicio text, carga numeric, reps int, em timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (coalesce(e.name, se.name, 'Exercício')) coalesce(e.name, se.name, 'Exercício'), ss.load_kg, ss.reps, s.started_at
  from public.session_sets ss
  join public.sessions s on s.id = ss.session_id
  join public.session_exercises se on se.id = ss.session_exercise_id
  left join public.exercises e on e.id = se.exercise_id
  where s.person_id = public.my_person_id() and ss.load_kg is not null and ss.completed
  order by coalesce(e.name, se.name, 'Exercício'), ss.load_kg desc, ss.reps desc nulls last, s.started_at desc;
$$;

-- ---------------------------------------------------------------------------
-- C-27 · Ligar a um treinador
-- ---------------------------------------------------------------------------
create table public.trainer_codes (
  code          text primary key check (code ~ '^[A-Z]{2}-[0-9]{4}$'),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  created_at    timestamptz not null default now(),
  revoked_at    timestamptz,
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade
);
create unique index trainer_codes_um_ativo on public.trainer_codes (membership_id) where revoked_at is null;
alter table public.trainer_codes enable row level security;
create policy trainer_codes_own on public.trainer_codes for select to authenticated using (membership_id = public.my_membership_id(org_id));
grant select on public.trainer_codes to authenticated;
revoke all on public.trainer_codes from anon;

-- O meu código (cria um se não houver): iniciais + 4 dígitos
create or replace function public.my_trainer_code(_org uuid, _novo boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_membership_id(_org); v text; ini text; tent int := 0;
begin
  if me is null or not public.has_perm(_org, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _novo then update public.trainer_codes set revoked_at = now() where membership_id = me and revoked_at is null; end if;
  select code into v from public.trainer_codes where membership_id = me and revoked_at is null;
  if v is not null then return v; end if;
  select upper(left(regexp_replace(translate(p.full_name, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'), '[^A-Za-z ]', '', 'g'), 1)
               || coalesce(left(split_part(translate(p.full_name, 'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç', 'AAAAEEIOOOUCaaaaeeiooouc'), ' ', 2), 1), 'X'))
    into ini from public.memberships m join public.persons p on p.id = m.person_id where m.id = me;
  ini := rpad(coalesce(nullif(regexp_replace(ini, '[^A-Z]', '', 'g'), ''), 'TR'), 2, 'X');
  loop
    v := ini || '-' || lpad((floor(random() * 10000))::int::text, 4, '0');
    begin
      insert into public.trainer_codes (code, org_id, membership_id) values (v, _org, me);
      return v;
    exception when unique_violation then
      tent := tent + 1;
      if tent > 20 then raise; end if;
    end;
  end loop;
end $$;

-- O atleta vê de quem é o código (só nome e organização)
create or replace function public.lookup_trainer_code(_code text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('nome', p.full_name, 'org', o.name, 'papel', 'Treinador')
  from public.trainer_codes c join public.memberships m on m.id = c.membership_id join public.persons p on p.id = m.person_id
  join public.organizations o on o.id = c.org_id
  where c.code = upper(trim(_code)) and c.revoked_at is null and m.status = 'active' and public.my_person_id() is not null;
$$;

alter table public.pendencias drop constraint pendencias_kind_check;
alter table public.pendencias add constraint pendencias_kind_check
  check (kind in ('parq_atestado','encarregado_em_falta','restricao_a_rever','revisao_em_atraso','marco_em_atraso','pedido_ligacao'));

-- Pedir para ligar: fica pendente até o treinador aceitar; partilha só o que a pessoa escolheu
create or replace function public.request_link(_code text, _shares public.share_category[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person(); c public.trainer_codes%rowtype; v uuid; s public.share_category; u uuid;
begin
  select * into c from public.trainer_codes where code = upper(trim(_code)) and revoked_at is null;
  if not found then raise exception 'Código não encontrado. Confirma com o teu treinador.' using errcode = 'check_violation'; end if;
  select id into v from public.links where org_id = c.org_id and person_id = me and status in ('pending','active');
  if v is not null then return v; end if;
  -- Já esteve ligado a esta organização: o pedido reabre a mesma ligação (o histórico continua)
  select id into v from public.links where org_id = c.org_id and person_id = me;
  if v is not null then
    update public.links set status = 'pending', ended_at = null, responsible_membership_id = c.membership_id where id = v;
  else
    insert into public.links (org_id, person_id, origin, status, responsible_membership_id)
      values (c.org_id, me, 'athlete_code', 'pending', c.membership_id) returning id into v;
  end if;
  foreach s in array coalesce(_shares, '{}') loop
    insert into public.link_shares (org_id, link_id, person_id, category) values (c.org_id, v, me, s);
  end loop;
  insert into public.pendencias (org_id, link_id, membership_id, kind, title)
    values (c.org_id, v, c.membership_id, 'pedido_ligacao', (select full_name from public.persons where id = me) || ' quer treinar contigo');
  select p.user_id into u from public.memberships m join public.persons p on p.id = m.person_id where m.id = c.membership_id;
  if u is not null then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      values (u, c.org_id, 'pedido_ligacao', 'Pedido para treinar contigo', (select full_name from public.persons where id = me), '/inbox');
  end if;
  return v;
end $$;

create or replace function public.answer_link_request(_link uuid, _accept boolean, _reason text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; u uuid;
begin
  select * into l from public.links where id = _link for update;
  if not found or l.status <> 'pending' or not public.has_perm(l.org_id, 'clients.write')
     or not (l.responsible_membership_id = public.my_membership_id(l.org_id) or public.has_perm(l.org_id, 'clients.read_all')) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if _accept then
    update public.links set status = 'active', started_at = coalesce(started_at, now()) where id = _link;
  else
    if coalesce(trim(_reason), '') = '' then raise exception 'Recusar pede um motivo.' using errcode = 'check_violation'; end if;
    update public.links set status = 'ended', ended_at = now() where id = _link;
    update public.link_shares set revoked_at = now() where link_id = _link and revoked_at is null;
  end if;
  update public.pendencias set status = 'resolvida', resolution = case when _accept then 'Aceite' else 'Recusado: ' || trim(_reason) end
    where link_id = _link and kind = 'pedido_ligacao' and status = 'aberta';
  select user_id into u from public.persons where id = l.person_id;
  if u is not null then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      values (u, l.org_id, 'ligacao', case when _accept then 'O teu treinador aceitou' else 'O pedido não foi aceite' end,
              case when _accept then 'O plano dele aparece no Treino quando o atribuir.' else trim(_reason) end, '/hoje');
  end if;
end $$;

-- Convidar um treinador que ainda não usa o LunaOS (vai pelo experimental, J32)
create table public.trainer_invites (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.persons(id) on delete cascade,
  token_hash  text not null unique,
  channel     text not null check (channel in ('email','sms')),
  destination text not null,
  shares      public.share_category[] not null default '{}',
  accepted_org uuid references public.organizations(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days'
);
alter table public.trainer_invites enable row level security;
create policy trainer_invites_own on public.trainer_invites for select to authenticated using (person_id = public.my_person_id());
grant select on public.trainer_invites to authenticated;
revoke all on public.trainer_invites from anon;

create or replace function public.invite_my_trainer(_channel text, _destination text, _shares public.share_category[])
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person(); t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); dest text := trim(_destination);
begin
  if _channel = 'email' and dest !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Email inválido.' using errcode = 'check_violation'; end if;
  if _channel = 'sms' then dest := public._tel(dest); if dest is null then raise exception 'Telemóvel inválido.' using errcode = 'check_violation'; end if; end if;
  if _channel not in ('email','sms') then raise exception 'canal inválido' using errcode = 'invalid_parameter_value'; end if;
  if (select count(*) from public.trainer_invites where person_id = me and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Já enviaste muitos convites hoje.' using errcode = 'check_violation';
  end if;
  insert into public.trainer_invites (person_id, token_hash, channel, destination, shares)
    values (me, encode(sha256(convert_to(t, 'UTF8')), 'hex'), _channel, dest, coalesce(_shares, '{}'));
  insert into public.outbox (channel, recipient, template, payload)
    values (_channel, dest, 'convite_treinador', jsonb_build_object('token', t, 'de', (select full_name from public.persons where id = me)));
end $$;

-- O treinador convidado cria a organização e reclama o convite: o atleta fica ligado logo
create or replace function public.claim_trainer_invite(_token text, _org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i public.trainer_invites%rowtype; v uuid; s public.share_category;
begin
  if not public.has_perm(_org, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into i from public.trainer_invites where token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex') for update;
  if not found or i.accepted_org is not null or i.expires_at < now() then raise exception 'Convite inválido ou expirado.' using errcode = 'check_violation'; end if;
  select id into v from public.links where org_id = _org and person_id = i.person_id;
  if v is null then
    insert into public.links (org_id, person_id, origin, status, responsible_membership_id, started_at)
      values (_org, i.person_id, 'invite', 'active', public.my_membership_id(_org), now()) returning id into v;
  else
    update public.links set status = 'active', ended_at = null where id = v;
  end if;
  foreach s in array i.shares loop
    insert into public.link_shares (org_id, link_id, person_id, category) values (_org, v, i.person_id, s) on conflict do nothing;
  end loop;
  update public.trainer_invites set accepted_org = _org where id = i.id;
  insert into public.notifications (user_id, org_id, type, title, body, action_url)
    select p.user_id, _org, 'ligacao', 'O teu treinador entrou no LunaOS', 'Já estão ligados.', '/hoje' from public.persons p where p.id = i.person_id and p.user_id is not null;
  return v;
end $$;

-- Desligar (J37): o treinador perde o acesso já; a pessoa fica com uma cópia do plano dele
create or replace function public.end_link(_link uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; snap jsonb; nome text;
begin
  if not public.is_my_link(_link) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into l from public.links where id = _link;
  select pv.snapshot->>'nome',
    jsonb_build_object('nome', 'Cópia: ' || (pv.snapshot->>'nome'), 'dias', coalesce((
      select jsonb_agg((wv.snapshot - 'blocos') || jsonb_build_object('id', gen_random_uuid(), 'dia', (d->>'dia')::int,
        'nome', wv.snapshot->>'nome', 'duracao_min', (wv.snapshot->>'duracao_min')::int, 'blocos', wv.snapshot->'blocos'))
      from jsonb_array_elements(pv.snapshot->'dias') d
      join public.workout_versions wv on wv.workout_id = (d->>'workout_id')::uuid and wv.version = (d->>'versao')::int
      where (d->>'semana') is null or (d->>'semana')::int = 1), '[]'::jsonb))
    into nome, snap
  from public.assignments a join public.plan_versions pv on pv.id = a.plan_version_id
  where a.link_id = _link and a.status = 'active' order by a.created_at desc limit 1;
  update public.links set status = 'ended', ended_at = now() where id = _link;
  update public.link_shares set revoked_at = now() where link_id = _link and revoked_at is null;
  if snap is not null and jsonb_array_length(snap->'dias') > 0 then
    update public.solo_plans set archived_at = now() where person_id = l.person_id and archived_at is null;
    insert into public.solo_plans (person_id, name, source, snapshot) values (l.person_id, snap->>'nome', 'copia_treinador', snap);
  end if;
end $$;

-- Os meus treinadores e ginásios, com o estado do pedido
create or replace function public.my_trainers()
returns table (link_id uuid, org text, treinador text, estado text, desde timestamptz, partilhas text[])
language sql stable security definer set search_path = '' as $$
  select l.id, o.name, (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = l.responsible_membership_id),
    l.status::text, l.created_at,
    coalesce((select array_agg(s.category::text) from public.link_shares s where s.link_id = l.id and s.revoked_at is null), '{}')
  from public.links l join public.organizations o on o.id = l.org_id
  where l.person_id = public.my_person_id() and l.status in ('pending','active')
  order by l.created_at desc;
$$;

revoke execute on function public._modelo_solo(text, text, int, text), public._tem_plano_treinador(uuid, date) from public, anon, authenticated;
revoke execute on function public.start_solo(text, text, int, text), public.my_solo_workout(uuid, date), public.my_solo_week(date),
  public.my_trainer_code(uuid, boolean), public.lookup_trainer_code(text), public.request_link(text, public.share_category[]),
  public.answer_link_request(uuid, boolean, text), public.invite_my_trainer(text, text, public.share_category[]),
  public.claim_trainer_invite(text, uuid), public.my_trainers() from public, anon;
grant execute on function public.start_solo(text, text, int, text), public.my_solo_workout(uuid, date), public.my_solo_week(date),
  public.my_trainer_code(uuid, boolean), public.lookup_trainer_code(text), public.request_link(text, public.share_category[]),
  public.answer_link_request(uuid, boolean, text), public.invite_my_trainer(text, text, public.share_category[]),
  public.claim_trainer_invite(text, uuid), public.my_trainers() to authenticated;
