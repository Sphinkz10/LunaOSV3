-- ============================================================
-- LUNA.OS v3 · 0015 · Treino (tarefa 12): blocos com modos e escalas,
-- alternativas autorizadas, articulações para as restrições, versões
-- publicadas, plano em semanas com progressão e descarga, e atribuir com
-- restrições e conflitos vistos antes de confirmar.
-- ============================================================

-- ---------------------------------------------------------------------------
-- Exercícios: articulações que carregam (para as restrições por zona) e
-- alternativas autorizadas (máquina ocupada ou restrição)
-- ---------------------------------------------------------------------------
alter table public.exercises add column joints text[] not null default '{}';
alter table public.library_exercises add column joints text[] not null default '{}';

-- Articulações por padrão de movimento (preenche a biblioteca e as cópias)
create or replace function public._articulacoes(_padrao text, _musculos text[]) returns text[]
language sql immutable set search_path = '' as $$
  select array(select distinct j from unnest(
    case
      when _padrao in ('agachar','unilateral','saltar') then array['joelho','anca']
      when _padrao = 'dobrar a anca' then array['lombar','anca']
      when _padrao = 'empurrar vertical' then array['ombro']
      when _padrao in ('empurrar horizontal','puxar horizontal','puxar vertical') then array['ombro','cotovelo']
      when _padrao = 'cíclico' then array['joelho']
      else array[]::text[]
    end
    || case when 'gémeos' = any (_musculos) or 'tornozelo' = any (_musculos) then array['tornozelo'] else array[]::text[] end
    || case when 'lombar' = any (_musculos) then array['lombar'] else array[]::text[] end
  ) j);
$$;
update public.library_exercises set joints = public._articulacoes(pattern, muscles);
update public.exercises set joints = public._articulacoes(pattern, muscles) where joints = '{}';

-- Exercícios novos (do ginásio, copiados ou da biblioteca) ficam com as articulações do padrão
create or replace function public._tg_articulacoes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(array_length(new.joints, 1), 0) = 0 then new.joints := public._articulacoes(new.pattern, new.muscles); end if;
  return new;
end $$;
create trigger exercises_articulacoes before insert or update of pattern, muscles on public.exercises
  for each row execute function public._tg_articulacoes();
create trigger library_articulacoes before insert on public.library_exercises
  for each row execute function public._tg_articulacoes();

create table public.exercise_alternatives (
  org_id         uuid not null references public.organizations(id) on delete cascade,
  exercise_id    uuid not null,
  alternative_id uuid not null,
  similarity     text not null default 'parecido' check (similarity in ('igual','parecido')),
  primary key (exercise_id, alternative_id),
  check (exercise_id <> alternative_id),
  foreign key (exercise_id, org_id) references public.exercises(id, org_id) on delete cascade,
  foreign key (alternative_id, org_id) references public.exercises(id, org_id) on delete cascade
);
alter table public.exercise_alternatives enable row level security;
create policy exercise_alternatives_select on public.exercise_alternatives for select to authenticated using (public.is_member(org_id));
create policy exercise_alternatives_write on public.exercise_alternatives for all to authenticated
  using (public.has_perm(org_id, 'training.write')) with check (public.has_perm(org_id, 'training.write'));
grant select, insert, update, delete on public.exercise_alternatives to authenticated;
revoke all on public.exercise_alternatives from anon;

-- ---------------------------------------------------------------------------
-- Treino por blocos: modo, voltas ou tempo; prescrição com escalas por nível
-- ---------------------------------------------------------------------------
create table public.workout_blocks (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  workout_id  uuid not null,
  position    int not null default 0,
  label       text not null default 'Bloco',
  mode        text not null default 'normal' check (mode in ('normal','superset','circuito','emom','amrap','for_time')),
  rounds      int check (rounds is null or rounds > 0),
  minutes     int check (minutes is null or minutes > 0),
  notes       text,
  unique (id, org_id),
  foreign key (workout_id, org_id) references public.workouts(id, org_id) on delete cascade
);
create index on public.workout_blocks (workout_id, position);
alter table public.workout_exercises
  add column block_id   uuid,
  add column target_rpe numeric(3,1) check (target_rpe is null or target_rpe between 0 and 10),
  add column scales     jsonb not null default '{}'::jsonb,       -- {iniciante:{reps,carga}, intermedio:{…}, rx:{…}}
  add constraint workout_exercises_block_fk foreign key (block_id, org_id) references public.workout_blocks(id, org_id) on delete cascade;

alter table public.workouts
  add column version      int not null default 0,                -- última versão publicada (0 = rascunho)
  add column published_at timestamptz,
  add column session_kind text not null default 'individual' check (session_kind in ('individual','aula','wod'));

-- Versões publicadas: o que foi atribuído nunca muda sem publicar outra vez
create table public.workout_versions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  workout_id  uuid not null,
  version     int not null,
  snapshot    jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (workout_id, version),
  unique (id, org_id),
  foreign key (workout_id, org_id) references public.workouts(id, org_id) on delete cascade
);

-- Plano em semanas: progressão por regra e semana de descarga
alter table public.plans
  add column progression  jsonb not null default '{}'::jsonb,     -- {subir_kg:2.5, quando_rpe_max:8}
  add column deload_week  int check (deload_week is null or deload_week > 0),
  add column deload_pct   int check (deload_pct is null or deload_pct between 1 and 90),
  add column version      int not null default 0,
  add column published_at timestamptz,
  add column template_id  uuid;                                   -- personalização: cópia ligada ao modelo
create table public.plan_versions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  plan_id     uuid not null,
  version     int not null,
  snapshot    jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (plan_id, version),
  unique (id, org_id),
  foreign key (plan_id, org_id) references public.plans(id, org_id) on delete cascade
);
alter table public.assignments
  add column workout_version_id uuid,
  add column plan_version_id    uuid,
  add column substitutions      jsonb not null default '[]'::jsonb,   -- trocas por restrição feitas ao atribuir
  add constraint assignments_wv_fk foreign key (workout_version_id, org_id) references public.workout_versions(id, org_id) on delete set null (workout_version_id),
  add constraint assignments_pv_fk foreign key (plan_version_id, org_id) references public.plan_versions(id, org_id) on delete set null (plan_version_id);

do $$
declare t text;
begin
  foreach t in array array['workout_blocks','workout_versions','plan_versions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated using (public.is_member(org_id))', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
create policy workout_blocks_write on public.workout_blocks for all to authenticated
  using (public.has_perm(org_id, 'training.write')) with check (public.has_perm(org_id, 'training.write'));
grant insert, update, delete on public.workout_blocks to authenticated;

-- ---------------------------------------------------------------------------
-- Publicar: fotografa o treino (blocos e exercícios) numa nova versão
-- ---------------------------------------------------------------------------
create or replace function public._workout_snapshot(_workout uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', w.name, 'descricao', w.description, 'duracao_min', w.est_duration_min, 'tipo', w.session_kind,
    'blocos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'rotulo', b.label, 'modo', b.mode, 'voltas', b.rounds, 'minutos', b.minutes, 'notas', b.notes,
        'exercicios', coalesce((select jsonb_agg(jsonb_build_object(
            'exercise_id', e.id, 'nome', e.name, 'series', we.target_sets, 'reps', we.target_reps, 'carga', we.target_load,
            'rpe', we.target_rpe, 'descanso', we.rest_seconds, 'notas', we.notes, 'escalas', we.scales,
            'articulacoes', e.joints, 'video', e.video_url,
            'alternativas', coalesce((select jsonb_agg(jsonb_build_object('exercise_id', a.alternative_id, 'nome', ax.name, 'semelhanca', a.similarity, 'articulacoes', ax.joints))
                                      from public.exercise_alternatives a join public.exercises ax on ax.id = a.alternative_id
                                      where a.exercise_id = e.id), '[]'::jsonb))
            order by we.position)
          from public.workout_exercises we join public.exercises e on e.id = we.exercise_id
          where we.block_id = b.id), '[]'::jsonb))
        order by b.position)
      from public.workout_blocks b where b.workout_id = w.id), '[]'::jsonb))
  from public.workouts w where w.id = _workout;
$$;

create or replace function public.publish_workout(_workout uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare w public.workouts%rowtype; v uuid; snap jsonb;
begin
  select * into w from public.workouts where id = _workout for update;
  if not found or not public.has_perm(w.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  snap := public._workout_snapshot(_workout);
  if jsonb_array_length(snap->'blocos') = 0 or not exists (select 1 from jsonb_array_elements(snap->'blocos') b where jsonb_array_length(b->'exercicios') > 0) then
    raise exception 'um treino publicado precisa de pelo menos um exercício' using errcode = 'check_violation';
  end if;
  update public.workouts set version = version + 1, published_at = now() where id = _workout returning version into w.version;
  insert into public.workout_versions (org_id, workout_id, version, snapshot, published_by)
    values (w.org_id, w.id, w.version, snap, auth.uid()) returning id into v;
  return v;
end $$;

create or replace function public.publish_plan(_plan uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.plans%rowtype; v uuid; snap jsonb; r record;
begin
  select * into p from public.plans where id = _plan for update;
  if not found or not public.has_perm(p.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  -- Cada treino do plano fica publicado na versão atual (publica os que estão em rascunho)
  for r in select distinct pw.workout_id from public.plan_workouts pw join public.workouts w on w.id = pw.workout_id
           where pw.plan_id = _plan and w.version = 0 loop
    perform public.publish_workout(r.workout_id);
  end loop;
  snap := jsonb_build_object('nome', p.name, 'semanas', p.duration_weeks, 'progressao', p.progression,
    'descarga', jsonb_build_object('semana', p.deload_week, 'pct', p.deload_pct),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('semana', pw.week, 'dia', pw.weekday, 'workout_id', pw.workout_id,
        'versao', w.version, 'nome', w.name) order by pw.week nulls first, pw.weekday, pw.position)
      from public.plan_workouts pw join public.workouts w on w.id = pw.workout_id where pw.plan_id = _plan), '[]'::jsonb));
  if jsonb_array_length(snap->'dias') = 0 then raise exception 'o plano não tem treinos' using errcode = 'check_violation'; end if;
  update public.plans set version = version + 1, published_at = now() where id = _plan returning version into p.version;
  insert into public.plan_versions (org_id, plan_id, version, snapshot, published_by)
    values (p.org_id, p.id, p.version, snap, auth.uid()) returning id into v;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Restrições: troca pela alternativa autorizada sem mostrar o diagnóstico
-- (o efeito por zona vem de client_restricoes_efeito; a causa nunca sai)
-- ---------------------------------------------------------------------------
create or replace function public._zonas_bloqueadas(_link uuid) returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct j), '{}') from public.restrictions r
  cross join lateral unnest(array['joelho','anca','lombar','ombro','cotovelo','punho','tornozelo','cervical']) j
  where r.link_id = _link and r.revoked_at is null and r.kind in ('bloquear','adaptar')
    and (r.valid_until is null or r.valid_until >= current_date)
    and (r.zone is null or lower(r.zone) like '%' || j || '%');
$$;

-- Aplica as trocas a uma fotografia de treino para um cliente
create or replace function public._aplicar_restricoes(_snap jsonb, _zonas text[])
returns jsonb language plpgsql immutable set search_path = '' as $$
declare b jsonb; e jsonb; alt jsonb; novos_b jsonb := '[]'; novos_e jsonb; trocas jsonb := '[]';
begin
  if coalesce(array_length(_zonas, 1), 0) = 0 then return jsonb_build_object('snapshot', _snap, 'trocas', '[]'::jsonb); end if;
  for b in select * from jsonb_array_elements(_snap->'blocos') loop
    novos_e := '[]';
    for e in select * from jsonb_array_elements(b->'exercicios') loop
      if exists (select 1 from jsonb_array_elements_text(e->'articulacoes') j where j = any (_zonas)) then
        select a into alt from jsonb_array_elements(e->'alternativas') a
          where not exists (select 1 from jsonb_array_elements_text(a->'articulacoes') j where j = any (_zonas))
          order by (a->>'semelhanca') = 'igual' desc limit 1;
        if alt is not null then
          trocas := trocas || jsonb_build_object('de', e->>'nome', 'para', alt->>'nome', 'motivo', 'restrição ativa');
          e := e || jsonb_build_object('exercise_id', alt->'exercise_id', 'nome', alt->'nome', 'articulacoes', alt->'articulacoes', 'trocado_de', e->'nome');
        else
          trocas := trocas || jsonb_build_object('de', e->>'nome', 'para', null, 'motivo', 'sem alternativa autorizada');
          continue;   -- nunca recebe o exercício proibido: fica fora
        end if;
      end if;
      novos_e := novos_e || e;
    end loop;
    novos_b := novos_b || (b || jsonb_build_object('exercicios', novos_e));
  end loop;
  return jsonb_build_object('snapshot', _snap || jsonb_build_object('blocos', novos_b), 'trocas', trocas);
end $$;

-- Antes de confirmar: o que muda para cada cliente (trocas e conflitos)
create or replace function public.assign_preview(_org uuid, _links uuid[], _workout_version uuid default null, _plan_version uuid default null, _starts_on date default current_date)
returns table (link_id uuid, nome text, trocas jsonb, conflito text)
language plpgsql stable security definer set search_path = '' as $$
declare v_snap jsonb; l uuid; v_ws jsonb[] := '{}';
begin
  if not public.has_perm(_org, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _workout_version is not null then
    select array[snapshot] into v_ws from public.workout_versions where id = _workout_version and org_id = _org;
  else
    select array_agg(wv.snapshot) into v_ws
    from public.plan_versions pv
    cross join lateral jsonb_array_elements(pv.snapshot->'dias') d
    join public.workout_versions wv on wv.workout_id = (d->>'workout_id')::uuid and wv.version = (d->>'versao')::int
    where pv.id = _plan_version and pv.org_id = _org;
  end if;
  foreach l in array _links loop
    if not public.can_see_link(l) then continue; end if;
    link_id := l;
    nome := (select c.full_name from public.clients c where c.id = l);
    trocas := '[]'::jsonb;
    foreach v_snap in array coalesce(v_ws, '{}') loop
      trocas := trocas || (public._aplicar_restricoes(v_snap, public._zonas_bloqueadas(l))->'trocas');
    end loop;
    conflito := (
      select case when a.ends_on is null or a.ends_on >= _starts_on then 'Já tem ' || coalesce(p.name, 'um plano') || ' ativo' ||
                  coalesce(' até ' || to_char(a.ends_on, 'DD/MM'), '') end
      from public.assignments a left join public.plans p on p.id = a.plan_id
      where a.link_id = l and a.status in ('active','scheduled') and (_plan_version is null or a.plan_id is not null)
      order by a.created_at desc limit 1);
    return next;
  end loop;
end $$;

-- Atribuir com comprovativo: as trocas ficam guardadas; o conflito pede escolha
create or replace function public.assign_version(
  _org uuid, _links uuid[], _workout_version uuid default null, _plan_version uuid default null,
  _starts_on date default current_date, _ends_on date default null, _conflito text default 'manter'   -- manter | substituir | depois
) returns int language plpgsql security definer set search_path = '' as $$
declare l uuid; n int := 0; v_wv public.workout_versions%rowtype; v_pv public.plan_versions%rowtype; v_trocas jsonb; v_start date; v_fim date;
begin
  if not public.has_perm(_org, 'training.write') or not public.has_perm(_org, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if (_workout_version is null) = (_plan_version is null) then raise exception 'escolhe um treino ou um plano' using errcode = 'invalid_parameter_value'; end if;
  select * into v_wv from public.workout_versions where id = _workout_version and org_id = _org;
  select * into v_pv from public.plan_versions where id = _plan_version and org_id = _org;
  foreach l in array _links loop
    if not public.can_see_link(l) then continue; end if;
    if exists (select 1 from public.links where id = l and (client_status = 'blocked' or archived_at is not null)) then continue; end if;
    v_start := _starts_on;
    if _plan_version is not null then
      select coalesce(max(a.ends_on) + 1, _starts_on) into v_fim from public.assignments a
        where a.link_id = l and a.status in ('active','scheduled') and a.plan_id is not null and a.ends_on is not null;
      if _conflito = 'substituir' then
        update public.assignments set status = 'cancelled' where link_id = l and status in ('active','scheduled') and plan_id is not null;
      elsif _conflito = 'depois' then
        v_start := greatest(_starts_on, v_fim);
      elsif exists (select 1 from public.assignments a where a.link_id = l and a.status in ('active','scheduled') and a.plan_id is not null
                    and (a.ends_on is null or a.ends_on >= _starts_on)) then
        continue;   -- nunca sobrepõe em silêncio
      end if;
    end if;
    -- Atribuir duas vezes não cria duas atribuições
    if _workout_version is not null and exists (select 1 from public.assignments x where x.link_id = l and x.workout_id = v_wv.workout_id and x.status in ('active','scheduled')) then
      continue;
    end if;
    v_trocas := '[]';
    if _workout_version is not null then
      v_trocas := public._aplicar_restricoes(v_wv.snapshot, public._zonas_bloqueadas(l))->'trocas';
    end if;
    insert into public.assignments (org_id, target, link_id, workout_id, plan_id, workout_version_id, plan_version_id, status, starts_on, ends_on, assigned_by, substitutions)
      values (_org, 'client', l, v_wv.workout_id, v_pv.plan_id, _workout_version, _plan_version,
              (case when v_start > current_date then 'scheduled' else 'active' end)::public.assignment_status, v_start,
              coalesce(_ends_on, case when _plan_version is not null then v_start + coalesce((v_pv.snapshot->>'semanas')::int, 4) * 7 - 1 end),
              public.my_membership_id(_org), v_trocas);
    if v_pv.plan_id is not null then update public.links set current_plan_id = v_pv.plan_id where id = l; end if;
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      select p.user_id, _org, 'treino_atribuido', 'Tens treino novo', coalesce(v_pv.snapshot->>'nome', v_wv.snapshot->>'nome'), '/treino'
      from public.links k join public.persons p on p.id = k.person_id where k.id = l and p.user_id is not null;
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Treino do cliente: a versão atribuída, já com as trocas da restrição
-- ---------------------------------------------------------------------------
create or replace function public.my_workout(_workout uuid default null, _on date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public._require_person(); a record; v_snap jsonb; v_wv public.workout_versions%rowtype;
begin
  for a in
    select x.*, k.id as link from public.assignments x join public.links k on k.id = x.link_id
    where k.person_id = me and k.status = 'active' and x.status = 'active'
      and (x.starts_on is null or x.starts_on <= _on) and (x.ends_on is null or x.ends_on >= _on)
    order by x.created_at desc
  loop
    if a.workout_version_id is not null and (_workout is null or a.workout_id = _workout) then
      select * into v_wv from public.workout_versions where id = a.workout_version_id;
    elsif a.plan_version_id is not null then
      select wv.* into v_wv from public.plan_versions pv
        cross join lateral jsonb_array_elements(pv.snapshot->'dias') d
        join public.workout_versions wv on wv.workout_id = (d->>'workout_id')::uuid and wv.version = (d->>'versao')::int
        where pv.id = a.plan_version_id
          and (_workout is not null and wv.workout_id = _workout
               or _workout is null and (d->>'dia')::int = extract(dow from _on)::int
                  and ((d->>'semana') is null or (d->>'semana')::int = ((_on - coalesce(a.starts_on, _on)) / 7) + 1))
        limit 1;
    end if;
    if v_wv.id is not null then
      v_snap := public._aplicar_restricoes(v_wv.snapshot, public._zonas_bloqueadas(a.link))->'snapshot';
      return v_snap || jsonb_build_object('workout_id', v_wv.workout_id, 'versao', v_wv.version, 'assignment_id', a.id, 'link_id', a.link);
    end if;
  end loop;
  return null;
end $$;

-- Semana do cliente (C-12): o que vem nos próximos 7 dias
create or replace function public.my_week(_from date default current_date)
returns table (dia date, workout_id uuid, nome text, plano text)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := public._require_person(); d date;
begin
  for d in select generate_series(_from, _from + 6, interval '1 day')::date loop
    return query
      select d, wv.workout_id, wv.snapshot->>'nome', pv.snapshot->>'nome'
      from public.assignments x join public.links k on k.id = x.link_id
      join public.plan_versions pv on pv.id = x.plan_version_id
      cross join lateral jsonb_array_elements(pv.snapshot->'dias') dd
      join public.workout_versions wv on wv.workout_id = (dd->>'workout_id')::uuid and wv.version = (dd->>'versao')::int
      where k.person_id = me and x.status in ('active','scheduled') and (x.starts_on is null or x.starts_on <= d) and (x.ends_on is null or x.ends_on >= d)
        and (dd->>'dia')::int = extract(dow from d)::int
        and ((dd->>'semana') is null or (dd->>'semana')::int = ((d - coalesce(x.starts_on, d)) / 7) + 1);
  end loop;
end $$;

revoke execute on function public._articulacoes(text, text[]), public._tg_articulacoes(), public._workout_snapshot(uuid), public._zonas_bloqueadas(uuid),
  public._aplicar_restricoes(jsonb, text[]) from public, anon, authenticated;
revoke execute on function public.publish_workout(uuid), public.publish_plan(uuid), public.assign_preview(uuid, uuid[], uuid, uuid, date),
  public.assign_version(uuid, uuid[], uuid, uuid, date, date, text), public.my_workout(uuid, date), public.my_week(date) from public, anon;
grant execute on function public.publish_workout(uuid), public.publish_plan(uuid), public.assign_preview(uuid, uuid[], uuid, uuid, date),
  public.assign_version(uuid, uuid[], uuid, uuid, date, date, text), public.my_workout(uuid, date), public.my_week(date) to authenticated;
