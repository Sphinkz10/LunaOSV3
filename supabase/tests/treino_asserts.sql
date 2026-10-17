-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 12: versões, restrições e conflitos.
-- Corre depois de biblioteca_asserts.sql (usa o Estúdio Conta e a Carla).
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
insert into public.exercises (org_id, name, category, muscles, pattern) values
  (current_setting('c.org')::uuid, 'Agachamento', 'forca', array['quadríceps'], 'agachar'),
  (current_setting('c.org')::uuid, 'Hip thrust', 'forca', array['glúteos'], 'dobrar a anca'),
  (current_setting('c.org')::uuid, 'Afundo', 'forca', array['quadríceps'], 'unilateral'),
  (current_setting('c.org')::uuid, 'Supino', 'forca', array['peito'], 'empurrar horizontal');
select set_config('t.ag', (select id::text from public.exercises where org_id = current_setting('c.org')::uuid and name = 'Agachamento'), false);
select set_config('t.ht', (select id::text from public.exercises where org_id = current_setting('c.org')::uuid and name = 'Hip thrust'), false);
insert into public.exercise_alternatives (org_id, exercise_id, alternative_id, similarity)
  values (current_setting('c.org')::uuid, current_setting('t.ag')::uuid, current_setting('t.ht')::uuid, 'parecido');
insert into public.workouts (org_id, name) values (current_setting('c.org')::uuid, 'Força A');
select set_config('t.w', (select id::text from public.workouts where org_id = current_setting('c.org')::uuid and name = 'Força A'), false);
insert into public.workout_blocks (org_id, workout_id, position, label, mode) values (current_setting('c.org')::uuid, current_setting('t.w')::uuid, 0, 'Força', 'superset');
select set_config('t.b', (select id::text from public.workout_blocks where workout_id = current_setting('t.w')::uuid), false);
insert into public.workout_exercises (org_id, workout_id, block_id, exercise_id, position, target_sets, target_reps)
  select current_setting('c.org')::uuid, current_setting('t.w')::uuid, current_setting('t.b')::uuid, e.id, x.pos, 4, '8'
  from (values ('Agachamento', 0), ('Afundo', 1), ('Supino', 2)) x(nome, pos)
  join public.exercises e on e.name = x.nome and e.org_id = current_setting('c.org')::uuid;

-- ---------- PROVA T1: publicar cria versão; mudar o treino não muda a versão publicada ----------
select set_config('t.v1', public.publish_workout(current_setting('t.w')::uuid)::text, false);
update public.workout_exercises set target_reps = '20' where workout_id = current_setting('t.w')::uuid;
do $$ begin
  if (select snapshot->'blocos'->0->'exercicios'->0->>'reps' from public.workout_versions where id = current_setting('t.v1')::uuid) <> '8' then
    raise exception 'PROVA T1 FALHOU: a versão publicada mudou';
  end if;
  if (select version from public.workouts where id = current_setting('t.w')::uuid) <> 1 then raise exception 'PROVA T1 FALHOU: versão'; end if;
end $$;

-- ---------- PROVA T2: um cliente com restrição nunca recebe o exercício proibido ----------
reset role;
insert into public.restrictions (org_id, link_id, person_id, kind, zone, notes)
  select current_setting('c.org')::uuid, l.id, l.person_id, 'bloquear', 'Joelho esquerdo', 'rotura do LCA'
  from public.links l where l.id = current_setting('c.link')::uuid;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ declare t jsonb;
begin
  select trocas into t from public.assign_preview(current_setting('c.org')::uuid, array[current_setting('c.link')::uuid], current_setting('t.v1')::uuid);
  if not exists (select 1 from jsonb_array_elements(t) x where x->>'de' = 'Agachamento' and x->>'para' = 'Hip thrust') then
    raise exception 'PROVA T2 FALHOU: a troca pela alternativa não apareceu antes de confirmar: %', t;
  end if;
  if not exists (select 1 from jsonb_array_elements(t) x where x->>'de' = 'Afundo' and x->>'para' is null) then
    raise exception 'PROVA T2 FALHOU: o exercício sem alternativa não foi assinalado';
  end if;
  if t::text ilike '%LCA%' then raise exception 'PROVA T2 FALHOU: o diagnóstico apareceu'; end if;
  if public.assign_version(current_setting('c.org')::uuid, array[current_setting('c.link')::uuid], current_setting('t.v1')::uuid) <> 1 then
    raise exception 'PROVA T2 FALHOU: não atribuiu';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ declare w jsonb := public.my_workout(current_setting('t.w')::uuid);
begin
  if w is null then raise exception 'PROVA T2 FALHOU: a Carla não vê o treino'; end if;
  if w::text like '%"Agachamento"%' and not w::text like '%trocado_de%' or w::text like '%"nome": "Afundo"%' then
    raise exception 'PROVA T2 FALHOU: a Carla recebeu um exercício proibido: %', w;
  end if;
  if not w::text like '%Hip thrust%' or not w::text like '%Supino%' then raise exception 'PROVA T2 FALHOU: faltam exercícios permitidos'; end if;
end $$;

-- ---------- PROVA T3: conflitos de plano nunca se sobrepõem em silêncio ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
insert into public.plans (org_id, name, duration_weeks) values (current_setting('c.org')::uuid, 'Força em 6 semanas', 6);
select set_config('t.p', (select id::text from public.plans where org_id = current_setting('c.org')::uuid and name = 'Força em 6 semanas'), false);
insert into public.plan_workouts (org_id, plan_id, workout_id, weekday) values (current_setting('c.org')::uuid, current_setting('t.p')::uuid, current_setting('t.w')::uuid, 1);
select set_config('t.pv', public.publish_plan(current_setting('t.p')::uuid)::text, false);
do $$ begin
  if (select conflito from public.assign_preview(current_setting('c.org')::uuid, array[current_setting('c.link')::uuid], null, current_setting('t.pv')::uuid)) is null then
    raise exception 'PROVA T3 FALHOU: o plano atual não apareceu como conflito';
  end if;
  if public.assign_version(current_setting('c.org')::uuid, array[current_setting('c.link')::uuid], null, current_setting('t.pv')::uuid) <> 0 then
    raise exception 'PROVA T3 FALHOU: sobrepôs em silêncio';
  end if;
  if public.assign_version(current_setting('c.org')::uuid, array[current_setting('c.link')::uuid], null, current_setting('t.pv')::uuid, current_date, null, 'substituir') <> 1 then
    raise exception 'PROVA T3 FALHOU: substituir não atribuiu';
  end if;
  if exists (select 1 from public.assignments where link_id = current_setting('c.link')::uuid and plan_id <> current_setting('t.p')::uuid and status = 'active' and plan_id is not null) then
    raise exception 'PROVA T3 FALHOU: o plano antigo ficou ativo';
  end if;
end $$;

-- ---------- PROVA T4: treino feito sem rede chega uma só vez e vai para o PT ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ declare p jsonb := jsonb_build_object(
    'id', '00000000-0000-0000-0000-00000000f001', 'link_id', current_setting('c.link'), 'workout_id', current_setting('t.w'),
    'nome', 'Força A', 'started_at', now() - interval '50 minutes', 'ended_at', now(), 'rpe', 7, 'nota', 'Joelho bem hoje.',
    'exercicios', jsonb_build_array(jsonb_build_object('exercise_id', current_setting('t.ht'), 'series', 3,
      'sets', jsonb_build_array(jsonb_build_object('n', 1, 'reps', 8, 'carga', 60), jsonb_build_object('n', 2, 'reps', 8, 'carga', 62.5)))));
begin
  perform public.sync_my_session(p);
  perform public.sync_my_session(p);   -- a fila repetiu
  if (select count(*) from public.sessions where id = '00000000-0000-0000-0000-00000000f001') <> 1
     or (select count(*) from public.session_sets where session_id = '00000000-0000-0000-0000-00000000f001') <> 2 then
    raise exception 'PROVA T4 FALHOU: treino duplicado ou incompleto';
  end if;
  if not exists (select 1 from public.my_records() where exercicio = 'Hip thrust' and carga = 62.5) then raise exception 'PROVA T4 FALHOU: recorde'; end if;
  if not exists (select 1 from public.my_history() where nome = 'Força A' and series = 2) then raise exception 'PROVA T4 FALHOU: histórico'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.notifications where type = 'treino_feito' and user_id = '00000000-0000-0000-0000-0000000e0002') then
    raise exception 'PROVA T4 FALHOU: o PT não recebeu o resumo';
  end if;
end $$;

select '✅ Treino: TODAS AS PROVAS PASSARAM' as resultado;
