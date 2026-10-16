-- ============================================================================
-- LUNA.OS v3 · Seeds de DESENVOLVIMENTO (nunca em produção)
-- ----------------------------------------------------------------------------
-- O Supabase só corre este ficheiro em `supabase db reset` local. Não há seeds
-- em migrações: nada de demonstração chega a uma base com dados reais.
-- Cria: um PT independente e um estúdio com 3 PT, com clientes, biblioteca,
-- plano, agenda e uma sessão. Palavra-passe de todas as contas: luna-dev-123
-- ============================================================================
do $$
declare
  -- contas
  u_rui   uuid := '10000000-0000-4000-8000-000000000001';
  u_marta uuid := '10000000-0000-4000-8000-000000000002';
  u_joao  uuid := '10000000-0000-4000-8000-000000000003';
  u_ines  uuid := '10000000-0000-4000-8000-000000000004';
  u_tiago uuid := '10000000-0000-4000-8000-000000000005';
  -- organizações
  o_rui    uuid := '20000000-0000-4000-8000-000000000001';
  o_studio uuid := '20000000-0000-4000-8000-000000000002';
  v_unit uuid; v_room uuid;
  m_rui uuid; m_marta uuid; m_joao uuid; m_ines uuid; m_tiago uuid;
  v_person uuid; v_link uuid; v_links uuid[] := '{}';
  v_ex uuid[] := '{}'; v_wk uuid; v_plan uuid; v_group uuid; v_session uuid; v_se uuid;
  i int;
  v_names text[] := array['Ana Costa','Bruno Silva','Carla Mendes','Diogo Rocha','Eva Santos','Filipe Nunes'];
begin
  if current_setting('app.environment', true) = 'production' then
    raise exception 'seed.sql é só para desenvolvimento';
  end if;
  if exists (select 1 from public.organizations where id = o_rui) then
    raise notice 'Seeds já aplicadas';
    return;
  end if;

  insert into auth.users (id, email, raw_user_meta_data) values
    (u_rui,   'rui@luna.dev',   '{"full_name":"Rui Dantas"}'),
    (u_marta, 'marta@luna.dev', '{"full_name":"Marta Lopes"}'),
    (u_joao,  'joao@luna.dev',  '{"full_name":"João Pires"}'),
    (u_ines,  'ines@luna.dev',  '{"full_name":"Inês Faria"}'),
    (u_tiago, 'tiago@luna.dev', '{"full_name":"Tiago Reis"}');

  -- No Supabase local as contas precisam de palavra-passe e email confirmado
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    execute $q$
      update auth.users
         set encrypted_password = extensions.crypt('luna-dev-123', extensions.gen_salt('bf')),
             email_confirmed_at = now(), aud = 'authenticated', role = 'authenticated',
             instance_id = '00000000-0000-0000-0000-000000000000'
       where email like '%@luna.dev'
    $q$;
  end if;

  -- ---------- PT independente ----------
  insert into public.organizations (id, type, name, created_by)
    values (o_rui, 'solo_coach', 'Rui Dantas PT', (select id from public.persons where user_id = u_rui));
  insert into public.units (org_id, name) values (o_rui, 'Principal');
  insert into public.memberships (org_id, person_id, status, joined_at, title)
    values (o_rui, (select id from public.persons where user_id = u_rui), 'active', now(), 'Personal trainer')
    returning id into m_rui;
  insert into public.membership_roles (org_id, membership_id, role_id)
    select o_rui, m_rui, id from public.roles where org_id is null and key = 'owner';
  insert into public.subscriptions (org_id, plan, seats, status, trial_ends_at)
    values (o_rui, 'treinador', 1, 'trial', now() + interval '30 days');
  insert into public.org_sports (org_id, sport_id, sport_version) values (o_rui, 'fitness', 1);

  -- ---------- Estúdio com 3 PT ----------
  insert into public.organizations (id, type, name, theme, created_by)
    values (o_studio, 'studio', 'Estúdio Luna', 'ouro', (select id from public.persons where user_id = u_marta));
  insert into public.units (org_id, name, address) values (o_studio, 'Lisboa · Alvalade', 'Av. da Igreja 10')
    returning id into v_unit;
  insert into public.rooms (org_id, unit_id, name, capacity) values (o_studio, v_unit, 'Sala 1', 8)
    returning id into v_room;
  insert into public.memberships (org_id, person_id, status, joined_at, title)
    values (o_studio, (select id from public.persons where user_id = u_marta), 'active', now(), 'Diretora técnica')
    returning id into m_marta;
  insert into public.memberships (org_id, person_id, status, joined_at, title)
    values (o_studio, (select id from public.persons where user_id = u_joao), 'active', now(), 'Personal trainer')
    returning id into m_joao;
  insert into public.memberships (org_id, person_id, status, joined_at, title)
    values (o_studio, (select id from public.persons where user_id = u_ines), 'active', now(), 'Personal trainer')
    returning id into m_ines;
  insert into public.memberships (org_id, person_id, status, joined_at, title)
    values (o_studio, (select id from public.persons where user_id = u_tiago), 'active', now(), 'Personal trainer')
    returning id into m_tiago;
  insert into public.membership_roles (org_id, membership_id, role_id)
    select o_studio, m_marta, id from public.roles where org_id is null and key = 'owner';
  insert into public.membership_roles (org_id, membership_id, role_id)
    select o_studio, m, r.id from unnest(array[m_joao, m_ines, m_tiago]) m
    cross join public.roles r where r.org_id is null and r.key = 'coach';
  update public.units set technical_director = m_marta where id = v_unit;
  insert into public.subscriptions (org_id, plan, seats, status, trial_ends_at)
    values (o_studio, 'treinador', 4, 'trial', now() + interval '30 days');
  insert into public.org_sports (org_id, sport_id, sport_version) values (o_studio, 'fitness', 1);

  insert into public.entitlements (org_id, module, source)
    select o, pm.module, 'plan' from unnest(array[o_rui, o_studio]) o
    cross join public.plan_modules pm where pm.plan = 'treinador';

  -- ---------- Clientes (pessoas geridas pela organização, sem conta) ----------
  for i in 1..array_length(v_names, 1) loop
    insert into public.persons (managed_by_org, full_name, email)
      values (case when i <= 2 then o_rui else o_studio end, v_names[i],
              lower(replace(split_part(v_names[i], ' ', 1), ' ', '')) || '@cliente.dev')
      returning id into v_person;
    insert into public.links (org_id, person_id, type, origin, responsible_membership_id, client_status)
      values (case when i <= 2 then o_rui else o_studio end, v_person, 'pt_client', 'manual',
              case i when 1 then m_rui when 2 then m_rui when 3 then m_joao when 4 then m_joao
                     when 5 then m_ines else m_tiago end,
              case i when 2 then 'return_to_play'::public.client_status when 4 then 'blocked' else 'active' end)
      returning id into v_link;
    insert into public.link_shares (org_id, link_id, person_id, category)
      select case when i <= 2 then o_rui else o_studio end, v_link, v_person, c
      from unnest(enum_range(null::public.share_category)) c;
    v_links := v_links || v_link;
  end loop;

  -- ---------- Biblioteca e plano (estúdio) ----------
  insert into public.exercises (org_id, name, category, muscles) values
    (o_studio, 'Agachamento', 'forca', '{quadricipites,gluteos}'),
    (o_studio, 'Supino', 'forca', '{peitoral,triceps}'),
    (o_studio, 'Remo com barra', 'forca', '{dorsais}'),
    (o_studio, 'Prancha', 'mobilidade', '{core}');
  select array_agg(id order by name) into v_ex from public.exercises where org_id = o_studio;
  insert into public.workouts (org_id, name, est_duration_min) values (o_studio, 'Força A', 50) returning id into v_wk;
  insert into public.workout_exercises (org_id, workout_id, exercise_id, position, target_sets, target_reps, rest_seconds)
    select o_studio, v_wk, v_ex[k], k, 4, '8-10', 90 from generate_series(1, 3) k;
  insert into public.plans (org_id, name, duration_weeks, goals) values (o_studio, 'Base 8 semanas', 8, 'Força geral')
    returning id into v_plan;
  insert into public.plan_workouts (org_id, plan_id, workout_id, week, weekday) values (o_studio, v_plan, v_wk, 1, 1);
  insert into public.assignments (org_id, target, link_id, plan_id, status, starts_on, assigned_by)
    values (o_studio, 'client', v_links[3], v_plan, 'active', current_date, m_joao);
  update public.links set current_plan_id = v_plan where id = v_links[3];

  insert into public.groups (org_id, type, sport_id, name, color) values (o_studio, 'program', 'fitness', 'Reentrada', 'dado-2')
    returning id into v_group;
  insert into public.group_members (org_id, group_id, link_id) values (o_studio, v_group, v_links[3]), (o_studio, v_group, v_links[4]);

  -- ---------- Agenda (hoje e amanhã, fuso de Lisboa) ----------
  insert into public.availability (org_id, membership_id, unit_id, weekday, start_time, end_time)
    select o_studio, m, v_unit, d, '07:00', '13:00'
    from unnest(array[m_joao, m_ines, m_tiago]) m cross join generate_series(1, 5) d;
  insert into public.bookings (org_id, unit_id, room_id, membership_id, link_id, type, session_type, status, title, starts_at, ends_at)
  values
    (o_studio, v_unit, v_room, m_joao, v_links[3], 'training', 'pt_individual', 'confirmed', 'Força A',
     (current_date + time '09:00') at time zone 'Europe/Lisbon', (current_date + time '10:00') at time zone 'Europe/Lisbon'),
    (o_studio, v_unit, v_room, m_ines, v_links[5], 'training', 'pt_individual', 'pending', 'Avaliação inicial',
     (current_date + time '11:00') at time zone 'Europe/Lisbon', (current_date + time '12:00') at time zone 'Europe/Lisbon'),
    (o_rui, null, null, m_rui, v_links[1], 'training', 'pt_individual', 'confirmed', 'Treino',
     (current_date + 1 + time '08:00') at time zone 'Europe/Lisbon', (current_date + 1 + time '09:00') at time zone 'Europe/Lisbon');

  -- ---------- Uma sessão feita (dados da pessoa) ----------
  insert into public.sessions (person_id, org_id, link_id, membership_id, workout_id, phase, started_at, ended_at, elapsed_seconds)
    select l.person_id, o_studio, l.id, m_joao, v_wk, 'done', now() - interval '2 days',
           now() - interval '2 days' + interval '55 minutes', 3300
    from public.links l where l.id = v_links[3]
    returning id into v_session;
  insert into public.session_exercises (session_id, exercise_id, position, target_sets)
    values (v_session, v_ex[1], 0, 3) returning id into v_se;
  insert into public.session_sets (session_id, session_exercise_id, set_index, reps, load_kg, rpe)
    select v_session, v_se, k, 10, 40 + k * 5, 6 + k from generate_series(1, 3) k;
  insert into public.measurements (person_id, org_id, metric_key, value, unit)
    select l.person_id, o_studio, 'peso', 68.5, 'kg' from public.links l where l.id = v_links[3];
  insert into public.allergies (person_id, org_id, allergen, severity, reaction)
    select l.person_id, o_studio, 'Penicilina', 'severe', 'Urticária' from public.links l where l.id = v_links[5];
end $$;
