-- ============================================================
-- LUNA.OS v3 · 0016 · Treino na app do cliente (tarefa 12): o treino feito
-- sem rede chega numa só chamada, idempotente pelo id gerado no telemóvel;
-- o resumo (esforço e nota) vai para o PT; recordes, histórico e
-- assiduidade para o Progresso (C-16, F1a).
-- ============================================================

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
  -- Já chegou (repetição da fila sem rede): devolve a mesma
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
            jsonb_build_object('rpe', _p->'rpe', 'trocas', coalesce(_p->'trocas', '[]'::jsonb), 'origem', 'app'),
            nullif(trim(_p->>'nota'), ''));
  for ex in select * from jsonb_array_elements(coalesce(_p->'exercicios', '[]')) loop
    insert into public.session_exercises (session_id, person_id, org_id, exercise_id, position, target_sets)
      values (v_id, me, v_org,
              case when v_org is not null and exists (select 1 from public.exercises e where e.id = nullif(ex->>'exercise_id', '')::uuid and e.org_id = v_org)
                   then (ex->>'exercise_id')::uuid end,
              i, nullif(ex->>'series', '')::int)
      returning id into v_se;
    i := i + 1;
    for st in select * from jsonb_array_elements(coalesce(ex->'sets', '[]')) loop
      insert into public.session_sets (session_id, session_exercise_id, person_id, org_id, set_index, reps, load_kg, rpe, completed, recorded_at)
        values (v_id, v_se, me, v_org, (st->>'n')::int, nullif(st->>'reps', '')::int, nullif(st->>'carga', '')::numeric,
                nullif(st->>'rpe', '')::numeric, coalesce((st->>'feito')::boolean, true), coalesce((st->>'em')::timestamptz, now()));
    end loop;
  end loop;
  -- O resumo vai para o PT responsável
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

-- Recordes: a melhor série por exercício (e quando)
create or replace function public.my_records()
returns table (exercicio text, carga numeric, reps int, em timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (coalesce(e.name, 'Exercício')) coalesce(e.name, 'Exercício'), ss.load_kg, ss.reps, s.started_at
  from public.session_sets ss
  join public.sessions s on s.id = ss.session_id
  join public.session_exercises se on se.id = ss.session_exercise_id
  left join public.exercises e on e.id = se.exercise_id
  where s.person_id = public.my_person_id() and ss.load_kg is not null and ss.completed
  order by coalesce(e.name, 'Exercício'), ss.load_kg desc, ss.reps desc nulls last, s.started_at desc;
$$;

-- Histórico de treinos e assiduidade (8 semanas)
create or replace function public.my_history(_limit int default 30)
returns table (id uuid, em timestamptz, nome text, minutos int, series int, rpe text)
language sql stable security definer set search_path = '' as $$
  select s.id, coalesce(s.ended_at, s.started_at), coalesce(w.name, 'Treino'), round(s.elapsed_seconds / 60.0)::int,
    (select count(*)::int from public.session_sets x where x.session_id = s.id and x.completed), s.summary->>'rpe'
  from public.sessions s left join public.workouts w on w.id = s.workout_id
  where s.person_id = public.my_person_id() and s.phase = 'done'
  order by 2 desc limit least(_limit, 200);
$$;

revoke execute on function public.sync_my_session(jsonb), public.my_records(), public.my_history(int) from public, anon;
grant execute on function public.sync_my_session(jsonb), public.my_records(), public.my_history(int) to authenticated;
