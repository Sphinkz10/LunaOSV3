-- ============================================================================
-- LUNA.OS v3 · Dados de demonstração para o servidor local (scripts/supabase-local.mjs)
-- Nunca em produção. Enche a carteira do Rui (PT independente) com o que os
-- ecrãs do Figma mostram: clientes, agenda de hoje, treinos, packs, pagamentos,
-- mensagens e pendências. A Joana tem conta na app do cliente.
-- Palavra-passe de todas as contas: luna-dev-123
-- ============================================================================
do $$
declare
  u_rui   uuid := '10000000-0000-4000-8000-000000000001';
  u_joana uuid := '10000000-0000-4000-8000-000000000010';
  o_rui   uuid := '20000000-0000-4000-8000-000000000001';
  m_rui uuid;
  v_nomes text[] := array['Joana Reis','Miguel Faria','Sofia Antunes','Pedro Lopes','Rita Gomes','Hugo Matos','Beatriz Sousa','Nuno Alves'];
  v_links uuid[] := '{}'; v_link uuid; v_ex uuid[]; v_wk uuid; v_wk2 uuid; v_plan uuid;
  v_bloco uuid; v_pack uuid; v_mensal uuid; v_vendido uuid; v_conv uuid; i int;
begin
  if current_setting('app.environment', true) = 'production' then raise exception 'só para desenvolvimento'; end if;
  if exists (select 1 from auth.users where id = u_joana) then return; end if;
  select id into m_rui from public.memberships where org_id = o_rui;

  -- A Joana tem conta (para a app do cliente)
  insert into auth.users (id, email, raw_user_meta_data) values (u_joana, 'joana@cliente.dev', '{"full_name":"Joana Reis"}');

  perform set_config('app.uid', u_rui::text, true);

  -- ---------- Clientes ----------
  for i in 1..array_length(v_nomes, 1) loop
    v_link := public.add_client(o_rui, v_nomes[i], lower(split_part(v_nomes[i], ' ', 1)) || '@cliente.dev', '91' || lpad((2000000 + i * 1371)::text, 7, '0'),
                                date '1990-01-01' + (i * 900), m_rui);
    v_links := v_links || v_link;
  end loop;
  delete from public.persons where user_id = u_joana and managed_by_org is null;
  update public.persons set user_id = u_joana, managed_by_org = null where id = (select person_id from public.links where id = v_links[1]);
  update public.links set client_status = 'injured' where id = v_links[4];
  update public.links set created_at = now() - interval '40 days' where id = any(v_links[2:8]);

  -- ---------- Biblioteca: exercícios, treinos e um plano ----------
  insert into public.exercises (org_id, name, category, muscles) values
    (o_rui, 'Agachamento com barra', 'forca', '{quadricipites,gluteos}'),
    (o_rui, 'Supino plano', 'forca', '{peitoral,triceps}'),
    (o_rui, 'Peso morto romeno', 'forca', '{isquiotibiais,gluteos}'),
    (o_rui, 'Remada com haltere', 'forca', '{dorsais}'),
    (o_rui, 'Press militar', 'forca', '{ombros}'),
    (o_rui, 'Prancha', 'mobilidade', '{core}');
  select array_agg(id order by name) into v_ex from public.exercises where org_id = o_rui;
  -- Treinos por blocos, como no Figma (C-09): aquecimento em circuito e força em superset
  -- v_ex por nome: 1 Agachamento, 2 Peso morto, 3 Prancha, 4 Press militar, 5 Remada, 6 Supino
  insert into public.workouts (org_id, name, est_duration_min) values (o_rui, 'Força · Dia A', 55) returning id into v_wk;
  insert into public.workout_blocks (org_id, workout_id, position, label, mode, rounds) values (o_rui, v_wk, 0, 'Aquecimento', 'circuito', 2) returning id into v_bloco;
  insert into public.workout_exercises (org_id, workout_id, block_id, exercise_id, position, target_sets, target_reps, rest_seconds)
    values (o_rui, v_wk, v_bloco, v_ex[3], 0, 2, '30 s', 30);
  insert into public.workout_blocks (org_id, workout_id, position, label, mode, rounds) values (o_rui, v_wk, 1, 'Força', 'superset', 4) returning id into v_bloco;
  insert into public.workout_exercises (org_id, workout_id, block_id, exercise_id, position, target_sets, target_reps, target_load, rest_seconds)
    values (o_rui, v_wk, v_bloco, v_ex[1], 1, 4, '6', '75% 1RM', 90), (o_rui, v_wk, v_bloco, v_ex[5], 2, 4, '8', 'RPE 8', 90),
           (o_rui, v_wk, v_bloco, v_ex[4], 3, 3, '10', '', 60);
  insert into public.workouts (org_id, name, est_duration_min) values (o_rui, 'Força · Dia B', 50) returning id into v_wk2;
  insert into public.workout_blocks (org_id, workout_id, position, label, mode, rounds) values (o_rui, v_wk2, 0, 'Aquecimento', 'circuito', 2) returning id into v_bloco;
  insert into public.workout_exercises (org_id, workout_id, block_id, exercise_id, position, target_sets, target_reps, rest_seconds)
    values (o_rui, v_wk2, v_bloco, v_ex[3], 0, 2, '30 s', 30);
  insert into public.workout_blocks (org_id, workout_id, position, label, mode) values (o_rui, v_wk2, 1, 'Força', 'normal') returning id into v_bloco;
  insert into public.workout_exercises (org_id, workout_id, block_id, exercise_id, position, target_sets, target_reps, target_load, rest_seconds)
    values (o_rui, v_wk2, v_bloco, v_ex[2], 1, 4, '8', '70% 1RM', 90), (o_rui, v_wk2, v_bloco, v_ex[6], 2, 4, '8', 'RPE 8', 90);
  insert into public.plans (org_id, name, duration_weeks, goals) values (o_rui, 'Força base · 8 semanas', 8, 'Ganhar força e técnica')
    returning id into v_plan;
  -- As 8 semanas do plano, com treino 3 vezes por semana (seg, qua, sex)
  insert into public.plan_workouts (org_id, plan_id, workout_id, week, weekday)
    select o_rui, v_plan, case when d = 3 then v_wk2 else v_wk end, w, d
    from generate_series(1, 8) w cross join unnest(array[1, 3, 5]) d;
  -- Publicar e atribuir como na Gestão (G-19): o cliente vê a versão publicada
  perform public.publish_workout(v_wk);
  perform public.publish_workout(v_wk2);
  perform public.assign_version(o_rui, v_links[1:5], null, public.publish_plan(v_plan), current_date - 14);
  update public.links set current_plan_id = v_plan where id = any(v_links[1:5]);

  -- ---------- Agenda de hoje e da semana ----------
  insert into public.availability (org_id, membership_id, weekday, start_time, end_time)
    select o_rui, m_rui, d, '07:00', '21:00' from generate_series(1, 6) d;
  insert into public.bookings (org_id, membership_id, link_id, type, session_type, status, title, starts_at, ends_at)
  select o_rui, m_rui, v_links[x.c], 'training', 'pt_individual', x.st::public.booking_status, x.t,
         (current_date + x.dia + x.h) at time zone 'Europe/Lisbon', (current_date + x.dia + x.h + interval '1 hour') at time zone 'Europe/Lisbon'
  from (values (1, 'confirmed', 'Força · Dia A', 0, time '07:30'), (2, 'confirmed', 'Força · Dia B', 0, time '09:00'),
               (3, 'confirmed', 'Avaliação', 0, time '12:30'), (5, 'pending', 'Treino', 0, time '18:30'),
               (6, 'confirmed', 'Força · Dia A', 0, time '19:30'), (1, 'confirmed', 'Força · Dia B', 2, time '07:30'),
               (2, 'confirmed', 'Treino', 1, time '09:00'), (7, 'pending', 'Primeira sessão', 1, time '18:00')) as x(c, st, t, dia, h);

  -- Sessões feitas nas últimas semanas (histórico e recordes)
  insert into public.sessions (person_id, org_id, link_id, membership_id, workout_id, phase, started_at, ended_at, elapsed_seconds)
    select l.person_id, o_rui, l.id, m_rui, case when k % 2 = 0 then v_wk else v_wk2 end, 'done',
           now() - (k * 3 || ' days')::interval, now() - (k * 3 || ' days')::interval + interval '52 minutes', 3120
    from public.links l cross join generate_series(1, 4) k where l.id = any(v_links[1:3]);

  -- Cargas registadas pela Joana (o Progresso mostra a força a subir)
  insert into public.session_exercises (session_id, exercise_id, position, target_sets)
    select s.id, (select id from public.exercises where org_id = o_rui and name = 'Agachamento com barra'), 0, 3
    from public.sessions s where s.link_id = v_links[1];
  insert into public.session_sets (session_id, session_exercise_id, set_index, reps, load_kg, rpe)
    select se.session_id, se.id, k, 6, 70 + 2.5 * row_number() over (order by s.started_at), 7
    from public.session_exercises se join public.sessions s on s.id = se.session_id
    cross join generate_series(1, 3) k where s.link_id = v_links[1];

  -- ---------- Packs, mensalidade e pagamentos ----------
  insert into public.pack_products (org_id, name, sessions, validity_days, price_cents) values
    (o_rui, 'Pack 10 sessões', 10, 90, 35000) returning id into v_pack;
  insert into public.pack_products (org_id, name, sessions, validity_days, price_cents, kind) values
    (o_rui, 'Sessão avulsa', 1, 1, 4000, 'avulsa');
  insert into public.monthly_products (org_id, name, price_cents, sessions_per_week, billing_day) values
    (o_rui, '2x por semana', 16000, 2, 1) returning id into v_mensal;
  for i in 1..3 loop
    v_vendido := public.sell_pack(v_links[i], v_pack, current_date - 20);
    perform public.record_payment(v_links[i], 'pack', v_vendido, null, case when i = 2 then 15000 else 35000 end,
                                  current_date - 20 + i, case i when 1 then 'mbway' when 2 then 'dinheiro' else 'transferencia' end);
  end loop;
  v_vendido := public.sell_monthly(v_links[5], v_mensal, (date_trunc('month', current_date) - interval '1 month')::date);
  perform public.record_payment(v_links[5], 'mensalidade', v_vendido, to_char(current_date - interval '1 month', 'YYYY-MM'), 16000, current_date - 25, 'mbway');
  v_vendido := public.sell_monthly(v_links[6], v_mensal, date_trunc('month', current_date)::date);

  -- ---------- Mensagens ----------
  v_conv := public.open_client_conversation(v_links[1]);
  perform public.send_message(gen_random_uuid(), v_conv, 'Olá Joana! Deixei o treino de amanhã na app. Começa pelo aquecimento de 10 minutos.');
  v_conv := public.open_client_conversation(v_links[2]);
  perform public.send_message(gen_random_uuid(), v_conv, 'Miguel, consegues passar a sessão de quinta para as 9h?');

  -- ---------- Inbox (G-02): o que espera pelo Rui ----------
  insert into public.pendencias (org_id, link_id, membership_id, kind, title, created_at) values
    (o_rui, v_links[1], m_rui, 'parq_atestado', 'Joana Reis precisa de atestado médico antes de treinar', now() - interval '1 day'),
    (o_rui, v_links[4], m_rui, 'restricao_a_rever', 'Pedro Lopes · rever a restrição do joelho', now() - interval '3 days'),
    (o_rui, v_links[7], m_rui, 'encarregado_em_falta', 'Beatriz Sousa · falta o consentimento do encarregado', now() - interval '40 minutes');

  -- ---------- Grupos (G-08) ----------
  insert into public.groups (org_id, type, sport_id, name, description, responsible_membership_id) values
    (o_rui, 'program', 'fitness', 'Online · Força em 8 semanas', 'check-in ao domingo', m_rui),
    (o_rui, 'squad', 'fitness', 'Pequeno grupo · manhã', 'seg, qua e sex 7:30', m_rui);
  insert into public.group_members (org_id, group_id, link_id)
    select o_rui, g.id, l from public.groups g cross join unnest(v_links[1:4]) l where g.org_id = o_rui and g.type = 'program';
  insert into public.group_members (org_id, group_id, link_id)
    select o_rui, g.id, l from public.groups g cross join unnest(v_links[5:7]) l where g.org_id = o_rui and g.type = 'squad';

  -- ---------- Objetivo da Joana (C-21, C-16) ----------
  insert into public.goals (org_id, link_id, title, criterion, owner_membership_id, status_note)
    values (o_rui, v_links[1], 'Força', '3 treinos por semana', m_rui, '1RM do agachamento a subir');

  -- ---------- Medidas para o progresso ----------
  insert into public.measurements (person_id, org_id, metric_key, value, unit, recorded_at)
    select l.person_id, o_rui, 'peso', 72 - k * 0.6, 'kg', now() - ((6 - k) * 7 || ' days')::interval
    from public.links l cross join generate_series(0, 5) k where l.id = v_links[1];
end $$;
