-- ============================================================
-- LUNA.OS v3 · 0017 · Treino e ao vivo, funções antigas (tarefa 23).
--   · Descanso entre voltas e depois do bloco; alvo vazio = registar na sessão.
--   · Exercício com versão e até 12 campos próprios; o treino guarda a versão
--     de cada exercício e avisa quando a biblioteca muda (manter ou atualizar).
--   · Publicar verifica o que falta e só avança sem problemas.
--   · Progressão por valor somado, % por semana ou fixo, com limites,
--     arredondamento e descarga; Testar plano usa o mesmo cálculo das sessões.
--   · Atribuir cria as marcações Por confirmar, sem conflitos; retirar com
--     motivo só cancela o que ainda não começou; substituir liga a antiga à nova.
--   · Correções ao vivo ficam no registo (antes, depois, quem, quando).
-- ============================================================

alter table public.workout_blocks
  add column rest_between_rounds int check (rest_between_rounds is null or rest_between_rounds >= 0),
  add column rest_after          int check (rest_after is null or rest_after >= 0);

-- ---------------------------------------------------------------------------
-- Exercício com versão, estado e campos próprios
-- ---------------------------------------------------------------------------
alter table public.exercises
  add column version  int not null default 1,
  add column inactive boolean not null default false;
create or replace function public._tg_exercicio_versao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.name, new.description, new.video_url, new.record_fields, new.pattern, new.muscles, new.equipment)
     is distinct from (old.name, old.description, old.video_url, old.record_fields, old.pattern, old.muscles, old.equipment) then
    new.version := old.version + 1;
  end if;
  return new;
end $$;
create trigger exercises_versao before update on public.exercises for each row execute function public._tg_exercicio_versao();

create table public.exercise_fields (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  exercise_id uuid not null,
  position    int not null default 0,
  label       text not null check (length(trim(label)) > 0),
  kind        text not null check (kind in ('numero','sim_nao','texto','pct')),
  unit        text,
  min_value   numeric,
  max_value   numeric,
  required    boolean not null default false,
  foreign key (exercise_id, org_id) references public.exercises(id, org_id) on delete cascade,
  check (min_value is null or max_value is null or min_value <= max_value)
);
create or replace function public._tg_max_campos() returns trigger language plpgsql set search_path = '' as $$
begin
  if (select count(*) from public.exercise_fields where exercise_id = new.exercise_id) >= 12 then
    raise exception 'um exercício tem no máximo 12 campos próprios' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger exercise_fields_max before insert on public.exercise_fields for each row execute function public._tg_max_campos();
alter table public.exercise_fields enable row level security;
create policy exercise_fields_select on public.exercise_fields for select to authenticated using (public.is_member(org_id));
create policy exercise_fields_write on public.exercise_fields for all to authenticated
  using (public.has_perm(org_id, 'training.write')) with check (public.has_perm(org_id, 'training.write'));
grant select, insert, update, delete on public.exercise_fields to authenticated;
revoke all on public.exercise_fields from anon;

-- O treino guarda a versão de cada exercício
alter table public.workout_exercises add column exercise_version int;
create or replace function public._tg_versao_do_exercicio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.exercise_version is null then
    select version into new.exercise_version from public.exercises where id = new.exercise_id;
  end if;
  return new;
end $$;
create trigger workout_exercises_versao before insert on public.workout_exercises for each row execute function public._tg_versao_do_exercicio();

-- O que mudou na biblioteca desde que o exercício entrou no treino
create or replace function public.workout_library_changes(_workout uuid)
returns table (exercise_id uuid, nome text, versao_no_treino int, versao_atual int)
language sql stable security invoker set search_path = '' as $$
  select distinct e.id, e.name, we.exercise_version, e.version
  from public.workout_exercises we join public.exercises e on e.id = we.exercise_id
  where we.workout_id = _workout and we.exercise_version is not null and e.version > we.exercise_version;
$$;

create or replace function public.accept_exercise_update(_workout uuid, _exercise uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid := (select org_id from public.workouts where id = _workout);
begin
  if not public.has_perm(v_org, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  update public.workout_exercises set exercise_version = (select version from public.exercises where id = _exercise)
    where workout_id = _workout and exercise_id = _exercise;
end $$;

-- ---------------------------------------------------------------------------
-- Publicar só sem problemas
-- ---------------------------------------------------------------------------
create or replace function public.workout_problems(_workout uuid)
returns table (problema text) language sql stable security invoker set search_path = '' as $$
  select 'O treino não tem blocos' where not exists (select 1 from public.workout_blocks b where b.workout_id = _workout)
  union all
  select 'O bloco ' || b.label || ' está vazio' from public.workout_blocks b
    where b.workout_id = _workout and not exists (select 1 from public.workout_exercises we where we.block_id = b.id)
  union all
  select e.name || ' está inativo ou arquivado' from public.workout_exercises we join public.exercises e on e.id = we.exercise_id
    where we.workout_id = _workout and (e.inactive or e.archived_at is not null)
  union all
  select 'O bloco ' || b.label || ' (' || b.mode || ') precisa de ' || case when b.mode in ('emom','amrap') then 'minutos' else 'voltas' end
    from public.workout_blocks b where b.workout_id = _workout
      and ((b.mode in ('emom','amrap') and b.minutes is null) or (b.mode = 'circuito' and b.rounds is null))
  union all
  select e.name || ': mudou na biblioteca; escolhe manter ou atualizar' from public.workout_library_changes(_workout) c join public.exercises e on e.id = c.exercise_id;
$$;

create or replace function public.publish_workout(_workout uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare w public.workouts%rowtype; v uuid; snap jsonb; p text;
begin
  select * into w from public.workouts where id = _workout for update;
  if not found or not public.has_perm(w.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select string_agg(problema, '; ') into p from public.workout_problems(_workout);
  if p is not null then raise exception 'problemas: %', p using errcode = 'check_violation'; end if;
  snap := public._workout_snapshot(_workout);
  if not exists (select 1 from jsonb_array_elements(snap->'blocos') b where jsonb_array_length(b->'exercicios') > 0) then
    raise exception 'um treino publicado precisa de pelo menos um exercício' using errcode = 'check_violation';
  end if;
  update public.workouts set version = version + 1, published_at = now() where id = _workout returning version into w.version;
  insert into public.workout_versions (org_id, workout_id, version, snapshot, published_by)
    values (w.org_id, w.id, w.version, snap, auth.uid()) returning id into v;
  return v;
end $$;

-- Fotografia com descansos e alvos vazios (registar na sessão)
create or replace function public._workout_snapshot(_workout uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', w.name, 'descricao', w.description, 'duracao_min', w.est_duration_min, 'tipo', w.session_kind,
    'blocos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', b.id, 'rotulo', b.label, 'modo', b.mode, 'voltas', b.rounds, 'minutos', b.minutes, 'notas', b.notes,
        'descanso_voltas', b.rest_between_rounds, 'descanso_depois', b.rest_after,
        'exercicios', coalesce((select jsonb_agg(jsonb_build_object(
            'exercise_id', e.id, 'versao_exercicio', coalesce(we.exercise_version, e.version), 'nome', e.name,
            'series', we.target_sets, 'reps', we.target_reps, 'carga', we.target_load,
            'rpe', we.target_rpe, 'descanso', we.rest_seconds, 'notas', we.notes, 'escalas', we.scales,
            'registar_na_sessao', we.target_reps is null and we.target_load is null,
            'articulacoes', e.joints, 'video', e.video_url,
            'campos', coalesce((select jsonb_agg(jsonb_build_object('rotulo', f.label, 'tipo', f.kind, 'unidade', f.unit, 'min', f.min_value, 'max', f.max_value, 'obrigatorio', f.required) order by f.position)
                                from public.exercise_fields f where f.exercise_id = e.id), '[]'::jsonb),
            'alternativas', coalesce((select jsonb_agg(jsonb_build_object('exercise_id', a.alternative_id, 'nome', ax.name, 'semelhanca', a.similarity, 'articulacoes', ax.joints))
                                      from public.exercise_alternatives a join public.exercises ax on ax.id = a.alternative_id
                                      where a.exercise_id = e.id and not ax.inactive), '[]'::jsonb))
            order by we.position)
          from public.workout_exercises we join public.exercises e on e.id = we.exercise_id
          where we.block_id = b.id), '[]'::jsonb))
        order by b.position)
      from public.workout_blocks b where b.workout_id = w.id), '[]'::jsonb))
  from public.workouts w where w.id = _workout;
$$;

-- ---------------------------------------------------------------------------
-- Progressão: o mesmo cálculo para Testar plano e para as sessões
--   {tipo: somar|pct|fixo, valor, a_cada: semanas, max, arredondar: 0.5|1|2.5}
-- ---------------------------------------------------------------------------
create or replace function public.progressao_carga(_prog jsonb, _semana int, _base numeric, _descarga_semana int default null, _descarga_pct int default null)
returns numeric language plpgsql immutable set search_path = '' as $$
declare passos int; v numeric; arr numeric := coalesce((_prog->>'arredondar')::numeric, 0.5);
begin
  if _base is null then return null; end if;
  passos := greatest(0, (_semana - 1) / greatest(1, coalesce((_prog->>'a_cada')::int, 1)));
  v := case coalesce(_prog->>'tipo', 'somar')
         when 'pct' then _base * power(1 + coalesce((_prog->>'valor')::numeric, 0) / 100, passos)
         when 'fixo' then case when _semana = 1 then _base else coalesce((_prog->>'valor')::numeric, _base) end
         else _base + passos * coalesce((_prog->>'valor')::numeric, (_prog->>'subir_kg')::numeric, 0)
       end;
  if (_prog->>'max') is not null then v := least(v, (_prog->>'max')::numeric); end if;
  if _descarga_semana is not null and _semana = _descarga_semana then v := v * (1 - coalesce(_descarga_pct, 40) / 100.0); end if;
  if arr > 0 then v := round(v / arr) * arr; end if;
  return v;
end $$;

-- Testar plano: o previsto semana a semana para uma carga base
create or replace function public.plan_preview(_plan uuid, _base numeric default 50)
returns table (semana int, carga numeric, descarga boolean)
language sql stable security invoker set search_path = '' as $$
  select s, public.progressao_carga(p.progression, s, _base, p.deload_week, p.deload_pct), s = p.deload_week
  from public.plans p cross join generate_series(1, coalesce(p.duration_weeks, 4)) s
  where p.id = _plan order by s;
$$;

-- ---------------------------------------------------------------------------
-- Atribuições: marcações Por confirmar sem conflitos, retirar e substituir
-- ---------------------------------------------------------------------------
alter table public.assignments
  add column replaced_by    uuid references public.assignments(id) on delete set null,
  add column withdrawn_reason text,
  add column withdrawn_at   timestamptz,
  add column responsible_membership_id uuid,
  add column session_time   time,
  add column session_minutes int check (session_minutes is null or session_minutes between 10 and 240);

-- As datas das sessões de um plano a partir do início (no fuso da unidade/organização)
create or replace function public._datas_do_plano(_pv uuid, _start date) returns table (dia date, workout_id uuid, nome text)
language sql stable security definer set search_path = '' as $$
  select d::date, (x->>'workout_id')::uuid, x->>'nome'
  from public.plan_versions pv
  cross join generate_series(_start, _start + (coalesce((pv.snapshot->>'semanas')::int, 4) * 7 - 1), interval '1 day') d
  cross join lateral jsonb_array_elements(pv.snapshot->'dias') x
  where pv.id = _pv and (x->>'dia')::int = extract(dow from d)::int
    and ((x->>'semana') is null or (x->>'semana')::int = ((d::date - _start) / 7) + 1);
$$;

create or replace function public.assign_bookings_preview(
  _org uuid, _membership uuid, _plan_version uuid, _start date, _hora time, _minutos int default 60
) returns table (dia date, inicio timestamptz, nome text, conflito boolean)
language plpgsql stable security definer set search_path = '' as $$
declare tz text := coalesce((select timezone from public.organizations where id = _org), 'Europe/Lisbon');
begin
  if not public.has_perm(_org, 'schedule.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
    select d.dia, (d.dia + _hora) at time zone tz, d.nome,
      public._booking_conflict(_membership, (d.dia + _hora) at time zone tz, (d.dia + _hora) at time zone tz + make_interval(mins => _minutos))
    from public._datas_do_plano(_plan_version, _start) d order by 1;
end $$;

-- Cria as marcações Por confirmar de uma atribuição; recusa se houver conflito
create or replace function public.create_assignment_bookings(_assignment uuid, _membership uuid, _hora time, _minutos int default 60)
returns int language plpgsql security definer set search_path = '' as $$
declare a public.assignments%rowtype; n int := 0; tz text; r record;
begin
  select * into a from public.assignments where id = _assignment;
  if not found or not public.has_perm(a.org_id, 'schedule.write') or not public.can_see_link(a.link_id) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  tz := coalesce((select timezone from public.organizations where id = a.org_id), 'Europe/Lisbon');
  if exists (select 1 from public.assign_bookings_preview(a.org_id, _membership, a.plan_version_id, a.starts_on, _hora, _minutos) p where p.conflito) then
    raise exception 'há marcações em conflito: resolve antes de criar' using errcode = 'exclusion_violation';
  end if;
  for r in select * from public._datas_do_plano(a.plan_version_id, a.starts_on) loop
    insert into public.bookings (org_id, membership_id, link_id, assignment_id, type, status, title, starts_at, ends_at, source)
      values (a.org_id, _membership, a.link_id, a.id, 'training', 'pending', r.nome,
              (r.dia + _hora) at time zone tz, (r.dia + _hora) at time zone tz + make_interval(mins => _minutos), 'assignment');
    n := n + 1;
  end loop;
  update public.assignments set responsible_membership_id = _membership, session_time = _hora, session_minutes = _minutos where id = a.id;
  return n;
end $$;

-- Retirar com motivo: só cancela as sessões que ainda não começaram
create or replace function public.withdraw_assignment(_id uuid, _reason text)
returns int language plpgsql security definer set search_path = '' as $$
declare a public.assignments%rowtype; n int;
begin
  select * into a from public.assignments where id = _id;
  if not found or not public.has_perm(a.org_id, 'training.write') or not public.can_see_link(a.link_id) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if length(trim(coalesce(_reason, ''))) = 0 then raise exception 'retirar pede motivo' using errcode = 'check_violation'; end if;
  update public.assignments set status = 'cancelled', withdrawn_reason = trim(_reason), withdrawn_at = now() where id = _id;
  update public.bookings b set status = 'cancelled', cancel_reason = 'Atribuição retirada: ' || trim(_reason)
    where b.assignment_id = _id and b.status in ('pending','confirmed')
      and not exists (select 1 from public.sessions s where s.booking_id = b.id);
  get diagnostics n = row_count;
  if a.plan_id is not null then
    update public.links set current_plan_id = null where id = a.link_id and current_plan_id = a.plan_id;
  end if;
  insert into public.link_events (org_id, link_id, kind, title, reason, ref_id, actor_user)
    values (a.org_id, a.link_id, 'dados', 'Atribuição retirada', trim(_reason), a.id, auth.uid());
  return n;
end $$;

-- Substituir por outra versão ou plano: a antiga fica ligada à nova
create or replace function public.replace_assignment(_old uuid, _workout_version uuid default null, _plan_version uuid default null, _reason text default 'Substituída')
returns uuid language plpgsql security definer set search_path = '' as $$
declare a public.assignments%rowtype; v uuid;
begin
  select * into a from public.assignments where id = _old;
  if not found or not public.has_perm(a.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  perform public.withdraw_assignment(_old, coalesce(nullif(trim(_reason), ''), 'Substituída'));
  perform public.assign_version(a.org_id, array[a.link_id], _workout_version, _plan_version, greatest(current_date, coalesce(a.starts_on, current_date)), null, 'substituir');
  select id into v from public.assignments where link_id = a.link_id and status in ('active','scheduled') order by created_at desc limit 1;
  update public.assignments set replaced_by = v where id = _old;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Ao vivo: cada correção de uma série gravada fica no registo
-- ---------------------------------------------------------------------------
create table public.session_set_edits (
  id         bigint generated always as identity primary key,
  set_id     uuid not null,
  session_id uuid not null,
  person_id  uuid not null,
  before     jsonb not null,
  after      jsonb not null,
  actor_user uuid,
  created_at timestamptz not null default now()
);
create index on public.session_set_edits (session_id, created_at);
create or replace function public._tg_correcao_serie() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.reps, old.load_kg, old.rpe, old.completed) is distinct from (new.reps, new.load_kg, new.rpe, new.completed) then
    insert into public.session_set_edits (set_id, session_id, person_id, before, after, actor_user)
      values (old.id, old.session_id, old.person_id,
              jsonb_build_object('reps', old.reps, 'carga', old.load_kg, 'rpe', old.rpe, 'feita', old.completed),
              jsonb_build_object('reps', new.reps, 'carga', new.load_kg, 'rpe', new.rpe, 'feita', new.completed), auth.uid());
  end if;
  return new;
end $$;
create trigger session_sets_correcao after update on public.session_sets for each row execute function public._tg_correcao_serie();
alter table public.session_set_edits enable row level security;
create policy session_set_edits_select on public.session_set_edits for select to authenticated
  using (exists (select 1 from public.sessions s where s.id = session_id and (public.can_read_person_data(s.person_id, 'training') or s.person_id = public.my_person_id())));
grant select on public.session_set_edits to authenticated;
revoke all on public.session_set_edits from anon;

-- Sessões da equipa: em curso (Retomar) e concluídas
create or replace function public.team_sessions(_org uuid, _days int default 7)
returns table (id uuid, cliente text, quem text, fase text, inicio timestamptz, fim timestamptz, treino text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
    select s.id, c.full_name, mp.full_name, s.phase::text, s.started_at, s.ended_at, w.name
    from public.sessions s
    left join public.clients c on c.id = s.link_id
    left join public.memberships m on m.id = s.membership_id left join public.persons mp on mp.id = m.person_id
    left join public.workouts w on w.id = s.workout_id
    where s.org_id = _org and s.link_id is not null and public.can_see_link(s.link_id)
      and (s.phase in ('setup','live','paused') or s.started_at > now() - make_interval(days => _days))
    order by (s.phase in ('setup','live','paused')) desc, s.started_at desc nulls last limit 100;
end $$;

revoke execute on function public._tg_exercicio_versao(), public._tg_max_campos(), public._tg_versao_do_exercicio(), public._datas_do_plano(uuid, date),
  public._tg_correcao_serie() from public, anon, authenticated;
revoke execute on function public.workout_library_changes(uuid), public.accept_exercise_update(uuid, uuid), public.workout_problems(uuid),
  public.progressao_carga(jsonb, int, numeric, int, int), public.plan_preview(uuid, numeric), public.assign_bookings_preview(uuid, uuid, uuid, date, time, int),
  public.create_assignment_bookings(uuid, uuid, time, int), public.withdraw_assignment(uuid, text), public.replace_assignment(uuid, uuid, uuid, text),
  public.team_sessions(uuid, int) from public, anon;
grant execute on function public.workout_library_changes(uuid), public.accept_exercise_update(uuid, uuid), public.workout_problems(uuid),
  public.progressao_carga(jsonb, int, numeric, int, int), public.plan_preview(uuid, numeric), public.assign_bookings_preview(uuid, uuid, uuid, date, time, int),
  public.create_assignment_bookings(uuid, uuid, time, int), public.withdraw_assignment(uuid, text), public.replace_assignment(uuid, uuid, uuid, text),
  public.team_sessions(uuid, int) to authenticated;

-- Progressão aplicada à carga numérica de cada exercício (mesmo cálculo do Testar plano)
create or replace function public._aplicar_progressao(_snap jsonb, _pv uuid, _semana int)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p jsonb; b jsonb; e jsonb; nb jsonb := '[]'; ne jsonb; base numeric;
begin
  select snapshot into p from public.plan_versions where id = _pv;
  if p is null or coalesce(p->'progressao', '{}'::jsonb) = '{}'::jsonb then return _snap; end if;
  for b in select * from jsonb_array_elements(_snap->'blocos') loop
    ne := '[]';
    for e in select * from jsonb_array_elements(b->'exercicios') loop
      base := nullif(substring(e->>'carga' from '^\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:kg)?\s*$'), '')::text::numeric;
      if base is not null then
        e := e || jsonb_build_object('carga', public.progressao_carga(p->'progressao', _semana, base,
                    nullif(p->'descarga'->>'semana', '')::int, nullif(p->'descarga'->>'pct', '')::int)::text || ' kg', 'semana', _semana);
      end if;
      ne := ne || e;
    end loop;
    nb := nb || (b || jsonb_build_object('exercicios', ne));
  end loop;
  return _snap || jsonb_build_object('blocos', nb);
end $$;
revoke execute on function public._aplicar_progressao(jsonb, uuid, int) from public, anon, authenticated;

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
    v_wv := null;
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
      if a.plan_version_id is not null then
        v_snap := public._aplicar_progressao(v_snap, a.plan_version_id, ((_on - coalesce(a.starts_on, _on)) / 7) + 1);
      end if;
      return v_snap || jsonb_build_object('workout_id', v_wv.workout_id, 'versao', v_wv.version, 'assignment_id', a.id, 'link_id', a.link);
    end if;
  end loop;
  return null;
end $$;
