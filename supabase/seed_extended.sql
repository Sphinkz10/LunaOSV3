-- ============================================================
-- LUNA.OS · seed_extended.sql (C5 do Guia) — cobre as tabelas sem demo
-- Corre DEPOIS do seed base. Idempotente onde possível. Colunas = schema real.
-- ============================================================
do $$
declare
  v_coach uuid; v_ath uuid; v_workout uuid; v_exA uuid; v_exB uuid;
  v_form uuid; v_formula uuid; v_booking uuid;
  v_session uuid; v_se1 uuid; v_se2 uuid; v_pkg uuid; v_query uuid; v_tpl uuid;
begin
  select id into v_coach from public.profiles order by created_at limit 1;
  if v_coach is null then raise exception 'corre o seed base primeiro'; end if;
  select id into v_ath     from public.athletes  where coach_id = v_coach order by created_at limit 1;
  select id into v_workout from public.workouts  where coach_id = v_coach order by created_at limit 1;
  select id into v_form    from public.forms     where coach_id = v_coach order by created_at limit 1;
  select id into v_formula from public.formulas  where coach_id = v_coach order by created_at limit 1;
  select id into v_booking from public.bookings  where coach_id = v_coach order by starts_at limit 1;
  select exercise_id into v_exA from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id where w.coach_id = v_coach limit 1;
  select id into v_exB from public.exercises where coach_id = v_coach and id <> coalesce(v_exA,'00000000-0000-0000-0000-000000000000') limit 1;

  -- ===== Live: sessão concluída com sets reais =====
  insert into public.sessions (coach_id, athlete_id, booking_id, workout_id, phase, started_at, ended_at, elapsed_seconds, summary)
  values (v_coach, v_ath, v_booking, v_workout, 'done', now() - interval '2 days 1 hour', now() - interval '2 days', 3600,
          '{"volume_kg": 4250, "sets": 9, "avg_rpe": 7.2}'::jsonb)
  returning id into v_session;

  insert into public.session_exercises (session_id, exercise_id, coach_id, position, target_sets, rest_seconds)
  values (v_session, v_exA, v_coach, 1, 3, 90) returning id into v_se1;
  insert into public.session_exercises (session_id, exercise_id, coach_id, position, target_sets, rest_seconds)
  values (v_session, coalesce(v_exB, v_exA), v_coach, 2, 3, 120) returning id into v_se2;

  insert into public.session_sets (session_id, session_exercise_id, coach_id, set_index, reps, load_kg, rpe, completed, rest_taken_seconds, recorded_at)
  values
    (v_session, v_se1, v_coach, 1, 10, 60, 6, true, 88,  now() - interval '2 days 55 minutes'),
    (v_session, v_se1, v_coach, 2,  8, 65, 7, true, 92,  now() - interval '2 days 50 minutes'),
    (v_session, v_se1, v_coach, 3,  6, 70, 8, true, 95,  now() - interval '2 days 45 minutes'),
    (v_session, v_se2, v_coach, 1, 12, 40, 6, true, 118, now() - interval '2 days 35 minutes'),
    (v_session, v_se2, v_coach, 2, 10, 45, 7, true, 121, now() - interval '2 days 30 minutes'),
    (v_session, v_se2, v_coach, 3,  8, 50, 8, true, 0,   now() - interval '2 days 25 minutes');

  -- sessão ao vivo (para testar retomar)
  insert into public.sessions (coach_id, athlete_id, workout_id, phase, started_at, elapsed_seconds)
  values (v_coach, v_ath, v_workout, 'live', now() - interval '12 minutes', 720);

  -- ===== Forms: campos + respostas =====
  insert into public.form_fields (form_id, coach_id, type, label, required, position, options, validation) values
    (v_form, v_coach, 'scale',  'Qualidade do sono (1-10)', true, 1, '{"min":1,"max":10}'::jsonb, '{}'::jsonb),
    (v_form, v_coach, 'scale',  'Dor muscular (1-10)',      true, 2, '{"min":1,"max":10}'::jsonb, '{}'::jsonb),
    (v_form, v_coach, 'select', 'Humor',                    false,3, '{"choices":["😀","🙂","😐","🙁"]}'::jsonb, '{}'::jsonb),
    (v_form, v_coach, 'text',   'Notas',                    false,4, '{}'::jsonb, '{"maxLength":280}'::jsonb);

  insert into public.form_responses (coach_id, form_id, athlete_id, status, answers, submitted_at) values
    (v_coach, v_form, v_ath, 'submitted', '{"sono":6,"dor":3,"humor":"🙂","notas":"Tudo bem"}'::jsonb, now() - interval '1 day'),
    (v_coach, v_form, v_ath, 'submitted', '{"sono":5,"dor":5,"humor":"😐","notas":"Dormi mal"}'::jsonb, now() - interval '12 hours'),
    (v_coach, v_form, v_ath, 'pending',   '{}'::jsonb, null);

  insert into public.form_packages (coach_id, name, description)
  values (v_coach, 'Check-in semanal', 'Sono + dor + humor') returning id into v_pkg;
  insert into public.package_forms (package_id, form_id, coach_id, position) values (v_pkg, v_form, v_coach, 1);

  -- ===== Analytics: query + template + relatório =====
  insert into public.queries (coach_id, name, chart_type, config, filters)
  values (v_coach, 'Volume semanal', 'line',
          '{"x":"week","y":"volume_kg","source":"sessions"}'::jsonb,
          '{"period":"90d"}'::jsonb) returning id into v_query;
  insert into public.report_templates (coach_id, name, description, chart_type, query_config)
  values (v_coach, 'Relatório mensal', 'Volume + RPE + presença', 'bar',
          '{"sections":["volume","rpe","attendance"]}'::jsonb) returning id into v_tpl;
  insert into public.reports (coach_id, name, query_id, template_id, data, format, generated_at)
  values (v_coach, 'Maio 2026', v_query, v_tpl, '{"volume_kg":18400}'::jsonb, 'pdf', now() - interval '5 days');

  -- ===== Calendário: marcadores de dia + disponibilidade + integrações =====
  insert into public.day_markers (coach_id, date, marker, title) values
    (v_coach, current_date + 7,  'holiday',     'Feriado municipal'),
    (v_coach, current_date + 14, 'vacation',    'Férias'),
    (v_coach, current_date + 21, 'competition', 'Campeonato regional'),
    (v_coach, current_date + 30, 'travel',      'Estágio fora');

  insert into public.availability (coach_id, weekday, start_time, end_time, is_available)
  select v_coach, d, '08:00', '19:00', true from generate_series(1,5) d
  on conflict do nothing;
  insert into public.availability (coach_id, weekday, start_time, end_time, is_available)
  values (v_coach, 6, '09:00', '13:00', true) on conflict do nothing;

  insert into public.integrations (coach_id, provider, status, config) values
    (v_coach, 'google_calendar', 'disconnected', '{}'::jsonb),
    (v_coach, 'apple_health',    'disconnected', '{}'::jsonb);

  -- ===== Data.OS: logs de execução =====
  insert into public.formula_logs (coach_id, formula_id, athlete_id, status, input, result, message, executed_at) values
    (v_coach, v_formula, v_ath, 'success', '{"sono":5}'::jsonb, '{"carga":"-10%"}'::jsonb, 'Sono <7 → carga reduzida', now() - interval '12 hours'),
    (v_coach, v_formula, v_ath, 'skipped', '{"sono":8}'::jsonb, '{}'::jsonb, 'Condição não disparou', now() - interval '36 hours');

  -- ===== Studio→Calendário: atribuição =====
  insert into public.assignments (coach_id, target, athlete_id, workout_id, status, starts_on, schedule)
  values (v_coach, 'athlete', v_ath, v_workout, 'active', current_date,
          '{"days":["MO","WE","FR"],"weeks":4}'::jsonb);

  -- ===== Segurança: histórico de login =====
  insert into public.login_history (user_id, ip, device, location, user_agent, success) values
    (v_coach, '188.81.0.10', 'iPhone 15', 'Lisboa, PT', 'LunaOS/1.0 iOS', true),
    (v_coach, '188.81.0.10', 'MacBook',   'Lisboa, PT', 'Chrome 126',     true),
    (v_coach, '102.13.4.99', 'Desconhecido', 'Lagos, NG', 'curl/8',       false);

  raise notice 'seed_extended OK';
end $$;
