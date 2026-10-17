-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 23 (funções antigas do treino e ao vivo).
-- Corre depois de treino_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT

-- ---------- PROVA U1: atribuir duas vezes não cria duas atribuições ----------
do $$ begin
  perform public.assign_version(current_setting('c.org')::uuid, array[current_setting('d.b')::uuid], current_setting('t.v1')::uuid);
  perform public.assign_version(current_setting('c.org')::uuid, array[current_setting('d.b')::uuid], current_setting('t.v1')::uuid);
  if (select count(*) from public.assignments where link_id = current_setting('d.b')::uuid and workout_id = current_setting('t.w')::uuid and status = 'active') <> 1 then
    raise exception 'PROVA U1 FALHOU: atribuição duplicada';
  end if;
end $$;

-- ---------- PROVA U2: não se publica um treino com problemas; mudar a biblioteca pede escolha ----------
insert into public.workouts (org_id, name) values (current_setting('c.org')::uuid, 'Com problemas');
select set_config('u.w', (select id::text from public.workouts where name = 'Com problemas' and org_id = current_setting('c.org')::uuid), false);
insert into public.workout_blocks (org_id, workout_id, label, mode) values (current_setting('c.org')::uuid, current_setting('u.w')::uuid, 'Vazio', 'amrap');
do $$ begin
  begin
    perform public.publish_workout(current_setting('u.w')::uuid);
    raise exception 'PROVA U2 FALHOU: publicou com bloco vazio';
  exception when check_violation then null;
  end;
end $$;
update public.exercises set description = 'Nova técnica' where id = current_setting('t.ht')::uuid;
do $$ begin
  if not exists (select 1 from public.workout_library_changes(current_setting('t.w')::uuid) where exercise_id = current_setting('t.ht')::uuid)
     and not exists (select 1 from public.workout_exercises where workout_id = current_setting('t.w')::uuid and exercise_id = current_setting('t.ht')::uuid) then
    null;   -- o hip thrust não está neste treino: a prova faz-se com o agachamento
  end if;
end $$;
update public.exercises set description = 'Desce mais' where id = current_setting('t.ag')::uuid;
do $$ begin
  if not exists (select 1 from public.workout_library_changes(current_setting('t.w')::uuid) where exercise_id = current_setting('t.ag')::uuid) then
    raise exception 'PROVA U2 FALHOU: a mudança da biblioteca não foi avisada';
  end if;
  begin
    perform public.publish_workout(current_setting('t.w')::uuid);
    raise exception 'PROVA U2 FALHOU: publicou sem escolher manter ou atualizar';
  exception when check_violation then null;
  end;
  perform public.accept_exercise_update(current_setting('t.w')::uuid, current_setting('t.ag')::uuid);
  if (select snapshot->'blocos'->0->'exercicios'->0->>'nome' from public.workout_versions where id = current_setting('t.v1')::uuid) <> 'Agachamento' then
    raise exception 'PROVA U2 FALHOU: a versão publicada mudou';
  end if;
end $$;

-- ---------- PROVA U3: Testar plano dá os mesmos valores que as sessões ----------
update public.workout_exercises set target_load = '60' where workout_id = current_setting('t.w')::uuid;
do $$ begin
  perform public.publish_workout(current_setting('t.w')::uuid);
end $$;
update public.plans set progression = '{"tipo":"somar","valor":2.5,"a_cada":1}'::jsonb, deload_week = 4, deload_pct = 40 where id = current_setting('t.p')::uuid;
select set_config('u.pv', public.publish_plan(current_setting('t.p')::uuid)::text, false);
-- semana 2 do plano para a Carla
reset role;
update public.assignments set status = 'cancelled' where link_id = current_setting('c.link')::uuid;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ declare inicio date := current_date - 7;
begin
  perform public.assign_version(current_setting('c.org')::uuid, array[current_setting('c.link')::uuid], null, current_setting('u.pv')::uuid, inicio);
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ declare w jsonb; prevista numeric;
begin
  w := public.my_workout(current_setting('t.w')::uuid, current_date);
  select carga into prevista from public.plan_preview(current_setting('t.p')::uuid, 60) where semana = 2;
  if prevista <> 62.5 then raise exception 'PROVA U3 FALHOU: testar plano deu %', prevista; end if;
  if not exists (select 1 from jsonb_array_elements(w->'blocos'->0->'exercicios') e where e->>'carga' = '62.5 kg') then
    raise exception 'PROVA U3 FALHOU: a sessão não tem o mesmo valor que o Testar plano: %', w->'blocos'->0->'exercicios';
  end if;
  if (select carga from public.plan_preview(current_setting('t.p')::uuid, 60) where semana = 4) <> 40 then raise exception 'PROVA U3 FALHOU: descarga'; end if;
end $$;

-- ---------- PROVA U4: nenhuma marcação é criada com conflito ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select set_config('u.a', (select id::text from public.assignments where link_id = current_setting('c.link')::uuid and status = 'active' order by created_at desc limit 1), false);
reset role;
-- o PT já tem uma sessão às 18:00 na primeira segunda-feira do plano
insert into public.bookings (org_id, membership_id, link_id, status, starts_at, ends_at)
  select current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.c')::uuid, 'confirmed',
         (d + time '18:00') at time zone 'Europe/Lisbon', (d + time '19:00') at time zone 'Europe/Lisbon'
  from (select dia as d from public._datas_do_plano(current_setting('u.pv')::uuid, current_date - 7) order by 1 desc limit 1) x;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  begin
    perform public.create_assignment_bookings(current_setting('u.a')::uuid, current_setting('c.m_pt')::uuid, time '18:00', 60);
    raise exception 'PROVA U4 FALHOU: criou marcações com conflito';
  exception when exclusion_violation then null;
  end;
  if public.create_assignment_bookings(current_setting('u.a')::uuid, current_setting('c.m_pt')::uuid, time '03:00', 30) < 1 then
    raise exception 'PROVA U4 FALHOU: não criou as marcações sem conflito';
  end if;
  if exists (select 1 from public.bookings where assignment_id = current_setting('u.a')::uuid and status <> 'pending') then
    raise exception 'PROVA U4 FALHOU: as marcações deviam ficar Por confirmar';
  end if;
end $$;

-- ---------- PROVA U5: retirar nunca mexe numa sessão já começada ----------
reset role;
update public.sessions set phase = 'done', ended_at = now() where link_id = current_setting('c.link')::uuid and phase in ('setup','live','paused');
insert into public.sessions (person_id, org_id, link_id, booking_id, phase, started_at)
  select l.person_id, l.org_id, l.id, b.id, 'live', now()
  from public.links l join public.bookings b on b.assignment_id = current_setting('u.a')::uuid and b.starts_at > now()
  where l.id = current_setting('c.link')::uuid order by b.starts_at limit 1;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  begin
    perform public.withdraw_assignment(current_setting('u.a')::uuid, '');
    raise exception 'PROVA U5 FALHOU: retirou sem motivo';
  exception when check_violation then null;
  end;
  perform public.withdraw_assignment(current_setting('u.a')::uuid, 'Mudou de objetivo');
  if exists (select 1 from public.bookings b join public.sessions s on s.booking_id = b.id where b.assignment_id = current_setting('u.a')::uuid and b.status = 'cancelled') then
    raise exception 'PROVA U5 FALHOU: cancelou uma sessão já começada';
  end if;
  if exists (select 1 from public.bookings b where b.assignment_id = current_setting('u.a')::uuid and b.status = 'pending'
             and not exists (select 1 from public.sessions s where s.booking_id = b.id)) then
    raise exception 'PROVA U5 FALHOU: ficaram marcações por começar';
  end if;
end $$;

-- ---------- PROVA U6: cada correção ao vivo fica no registo ----------
reset role;
update public.session_sets set load_kg = 65, reps = 6 where session_id = '00000000-0000-0000-0000-00000000f001' and set_index = 2;
do $$ begin
  if not exists (select 1 from public.session_set_edits where session_id = '00000000-0000-0000-0000-00000000f001'
                 and before->>'carga' = '62.50' and after->>'carga' = '65.00') then
    raise exception 'PROVA U6 FALHOU: correção sem registo: %', (select jsonb_agg(before || after) from public.session_set_edits);
  end if;
end $$;

select '✅ Treino (funções antigas): TODAS AS PROVAS PASSARAM' as resultado;
