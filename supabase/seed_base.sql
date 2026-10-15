-- ============================================================================
-- LUNA.OS — SEED de demonstração (idempotente)
-- ----------------------------------------------------------------------------
-- COMO USAR:
--   1) Cria um utilizador no Supabase (Auth → Add user), ex.: coach@luna.os
--   2) Copia o UUID desse utilizador.
--   3) Substitui :coach_uuid abaixo (ou usa o bloco que apanha o 1º perfil).
--   4) Corre este ficheiro no SQL Editor.
-- Nota: como há RLS, corre como SERVICE ROLE (o SQL Editor do Supabase corre como
--       postgres, que ignora RLS) — o seed insere com coach_id explícito.
-- ============================================================================

do $$
declare
  v_coach uuid;
  v_grp_reentrada uuid;
  v_grp_rtp uuid;
  v_a1 uuid; v_a2 uuid; v_a3 uuid;
  v_ex_agachamento uuid; v_ex_supino uuid; v_ex_corrida uuid;
  v_wk uuid; v_plan uuid; v_class uuid;
  v_class_booking uuid;
  v_var_sono uuid;
begin
  -- Escolhe o treinador: o 1º perfil existente (ajusta se tiveres vários)
  select id into v_coach from public.profiles order by created_at limit 1;
  if v_coach is null then
    raise notice 'Sem perfis. Cria um utilizador em Auth primeiro.';
    return;
  end if;

  update public.profiles set full_name='Coach Pedro', title='Treinador principal' where id=v_coach;

  -- Organização (clube) + membership owner
  insert into public.organizations (id, name, slug, created_by)
    values (gen_random_uuid(), 'Sporting CP', 'sporting-cp', v_coach)
    on conflict (slug) do nothing;
  insert into public.organization_members (organization_id, user_id, role)
    select o.id, v_coach, 'owner' from public.organizations o where o.slug='sporting-cp'
    on conflict (organization_id, user_id) do nothing;

  -- Grupos
  insert into public.groups (coach_id, name, color, description)
    values (v_coach,'Reentrada','#FC8500','Atletas em reentrada') returning id into v_grp_reentrada;
  insert into public.groups (coach_id, name, color, description)
    values (v_coach,'Return to Play','#9B7CFF','Pós-lesão') returning id into v_grp_rtp;

  -- Atletas (estados reais: blocked / return_to_play / active)
  insert into public.athletes (coach_id, name, sport, status, status_note)
    values (v_coach,'Miguel Reis','Ginásio','blocked','Sem plano; documento expirado') returning id into v_a1;
  insert into public.athletes (coach_id, name, sport, status)
    values (v_coach,'Rafael Gomes','Futebol','return_to_play') returning id into v_a2;
  insert into public.athletes (coach_id, name, sport, status)
    values (v_coach,'Sofia Lima','Natação','active') returning id into v_a3;

  insert into public.group_members (group_id, athlete_id, coach_id) values
    (v_grp_reentrada, v_a1, v_coach),
    (v_grp_rtp,       v_a2, v_coach);

  -- Alergia (banner de segurança) + documento expirado
  insert into public.athlete_allergies (athlete_id, coach_id, allergen, severity, reaction)
    values (v_a3, v_coach, 'Amendoim', 'severe', 'Anafilaxia');
  insert into public.athlete_documents (athlete_id, coach_id, name, doc_type, status, expires_on)
    values (v_a1, v_coach, 'Exame médico', 'medical', 'expired', current_date - 10);

  -- Métricas (com proveniência)
  insert into public.athlete_metrics (athlete_id, coach_id, metric_key, value, unit, source) values
    (v_a2, v_coach, 'sleep_hours', 6.5, 'h', 'wearable'),
    (v_a2, v_coach, 'rpe', 8, NULL, 'session'),
    (v_a3, v_coach, 'hrv', 72, 'ms', 'wearable');

  -- Studio: exercícios, treino, plano, aula
  insert into public.exercises (coach_id, name, category) values
    (v_coach,'Agachamento','strength') returning id into v_ex_agachamento;
  insert into public.exercises (coach_id, name, category) values
    (v_coach,'Supino','strength') returning id into v_ex_supino;
  insert into public.exercises (coach_id, name, category) values
    (v_coach,'Corrida contínua','cardio') returning id into v_ex_corrida;

  insert into public.workouts (coach_id, name, type, est_duration_min)
    values (v_coach,'Full Body A','standard',60) returning id into v_wk;
  insert into public.workout_exercises (workout_id, exercise_id, coach_id, position, target_sets, target_reps, target_load, rest_seconds) values
    (v_wk, v_ex_agachamento, v_coach, 0, 4, '8-10', '75% 1RM', 120),
    (v_wk, v_ex_supino,      v_coach, 1, 4, '8-10', 'RPE 8',   120);

  insert into public.plans (coach_id, name, duration_weeks, goals)
    values (v_coach,'Base de Força',8,'Hipertrofia + força') returning id into v_plan;
  insert into public.plan_workouts (plan_id, workout_id, coach_id, week, weekday, position)
    values (v_plan, v_wk, v_coach, 1, 1, 0);
  update public.athletes set current_plan_id = v_plan where id = v_a2;

  insert into public.classes (coach_id, name, capacity, default_duration_min)
    values (v_coach,'HIIT Manhã',8,45) returning id into v_class;

  -- Calendário: marcações (treino confirmado, consulta pendente, aula)
  insert into public.bookings (coach_id, athlete_id, type, status, title, starts_at, ends_at) values
    (v_coach, v_a2, 'training','confirmed','Treino — Rafael', now()+interval '2 hour', now()+interval '3 hour'),
    (v_coach, v_a3, 'consultation','pending','Consulta — Sofia', now()+interval '1 day', now()+interval '1 day 30 minute');

  insert into public.bookings (coach_id, class_id, type, status, title, starts_at, ends_at, capacity)
    values (v_coach, v_class, 'class','confirmed','HIIT Manhã', now()+interval '1 day 2 hour', now()+interval '1 day 2 hour 45 minute', 8)
    returning id into v_class_booking;

  -- Lista de espera para a aula (testa a auto-promoção ao cancelar)
  insert into public.waitlist (coach_id, athlete_id, class_id, class_booking_id, requested_starts_at, priority)
    values (v_coach, v_a1, v_class, v_class_booking, now()+interval '1 day 2 hour', 10);

  -- Data.OS: variável + fórmula (SE sono < 7 ENTÃO reduzir carga 10%)
  insert into public.variables (coach_id, name, key, type, source, unit)
    values (v_coach,'Horas de sono','sleep_hours','number','wearable','h') returning id into v_var_sono;
  insert into public.formulas (coach_id, name, description, condition, action, priority, applies_to, group_id)
    values (v_coach,'Reduzir carga se dormiu pouco','Proteção de carga',
            jsonb_build_object('op','<','var','sleep_hours','value',7),
            jsonb_build_object('type','adjust_load','pct',-10),
            10,'group',v_grp_rtp);

  -- Forms.OS: formulário de bem-estar + atribuição
  insert into public.forms (coach_id, name, status) values (v_coach,'Bem-estar diário','published');

  -- Preferências e segurança já criadas pelo trigger handle_new_user; reforço:
  insert into public.user_settings (user_id) values (v_coach) on conflict do nothing;
  insert into public.security_settings (user_id, two_factor_enabled, backup_codes_generated)
    values (v_coach, true, true)
    on conflict (user_id) do update set two_factor_enabled=true, backup_codes_generated=true;

  -- Notificação de exemplo
  insert into public.notifications (user_id, type, title, body)
    values (v_coach,'system','Bem-vindo à LUNA.OS','A tua base de dados está pronta.');

  raise notice 'Seed concluído para o treinador %', v_coach;
end $$;
