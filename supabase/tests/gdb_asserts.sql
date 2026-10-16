-- ============================================================
-- LUNA.OS · Provas do Gate G-DB (plain SQL — corre local e em CI)
-- Cada bloco lança EXCEPTION se a garantia falhar.
-- (pgTAP equivalente em CI Supabase; isto é portátil a qualquer PG.)
-- ============================================================
\set ON_ERROR_STOP on

-- ---------- Setup: 2 treinadores + 1 atleta cada ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'coach.a@luna.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'coach.b@luna.test');
-- (trigger on_auth_user_created cria profiles/settings/security)

do $$ begin
  if (select count(*) from public.profiles where id in
      ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2')) <> 2 then
    raise exception 'PROVA 0 FALHOU: provisionamento dos 2 coaches de teste';
  end if;
end $$;

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.athletes (id, coach_id, name)
  values ('00000000-0000-0000-0000-00000000aaa1', '00000000-0000-0000-0000-0000000000a1', 'Atleta de A');
select set_config('app.uid', '00000000-0000-0000-0000-0000000000b2', false);
insert into public.athletes (id, coach_id, name)
  values ('00000000-0000-0000-0000-00000000bbb1', '00000000-0000-0000-0000-0000000000b2', 'Atleta de B');
reset role;

-- ---------- PROVA 1: RLS isola treinadores ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  if (select count(*) from public.athletes) <> 1 then
    raise exception 'PROVA 1 FALHOU: coach A vê % atletas (esperava 1 — só o seu)', (select count(*) from public.athletes);
  end if;
  if exists (select 1 from public.athletes where coach_id = '00000000-0000-0000-0000-0000000000b2') then
    raise exception 'PROVA 1 FALHOU: coach A vê dados do coach B';
  end if;
end $$;
reset role;

-- ---------- PROVA 2: anon não vê nada ----------
set role anon;
do $$ begin
  begin
    if (select count(*) from public.athletes) > 0 then
      raise exception 'PROVA 2 FALHOU: anon vê linhas';
    end if;
  exception when insufficient_privilege then null; -- sem grant = igualmente seguro
  end;
end $$;
reset role;

-- ---------- PROVA 3: EXCLUDE rejeita sobreposição (e permite aulas) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
insert into public.bookings (id, coach_id, athlete_id, type, title, starts_at, ends_at, status)
  values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-00000000aaa1', 'training', 'Treino 1',
          '2026-07-01 09:00+00', '2026-07-01 10:00+00', 'confirmed');
do $$ begin
  begin
    insert into public.bookings (coach_id, athlete_id, type, title, starts_at, ends_at, status)
      values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaa1',
              'training', 'Sobreposto', '2026-07-01 09:30+00', '2026-07-01 10:30+00', 'pending');
    raise exception 'PROVA 3 FALHOU: sobreposição aceite';
  exception when exclusion_violation then null; -- esperado
  end;
end $$;
-- aulas são isentas
insert into public.bookings (coach_id, type, title, starts_at, ends_at, status)
  values ('00000000-0000-0000-0000-0000000000a1', 'class', 'Aula simultânea',
          '2026-07-01 09:00+00', '2026-07-01 10:00+00', 'confirmed');
-- toca-nas-pontas é permitido ([) range)
insert into public.bookings (coach_id, athlete_id, type, title, starts_at, ends_at, status)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaa1',
          'training', 'Encosta', '2026-07-01 10:00+00', '2026-07-01 11:00+00', 'confirmed');

-- ---------- PROVA 4: has_booking_conflict espelha o EXCLUDE ----------
do $$ begin
  if not public.has_booking_conflict('00000000-0000-0000-0000-0000000000a1',
        '2026-07-01 09:30+00','2026-07-01 09:45+00', null) then
    raise exception 'PROVA 4 FALHOU: conflito não detetado';
  end if;
  if public.has_booking_conflict('00000000-0000-0000-0000-0000000000a1',
        '2026-07-01 11:00+00','2026-07-01 12:00+00', null) then
    raise exception 'PROVA 4 FALHOU: falso positivo';
  end if;
end $$;

-- ---------- PROVA 5: auto-promoção ao cancelar ----------
insert into public.waitlist (coach_id, athlete_id, status, priority, class_booking_id)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaa1', 'waiting', 1,
          '00000000-0000-0000-0000-00000000c001');
update public.bookings set status = 'cancelled' where id = '00000000-0000-0000-0000-00000000c001';
do $$ begin
  if not exists (select 1 from public.bookings
                 where source = 'waitlist' and status = 'confirmed'
                   and starts_at = '2026-07-01 09:00+00') then
    raise exception 'PROVA 5 FALHOU: candidato não foi promovido';
  end if;
  if exists (select 1 from public.waitlist where status = 'waiting') then
    raise exception 'PROVA 5 FALHOU: waitlist não atualizada';
  end if;
end $$;

-- ---------- PROVA 6: promoção por requested_starts_at + guarda de conflito ----------
-- NOTA DE ENGENHARIA (honesta): com o invariante EXCLUDE, marcações ativas nunca se
-- sobrepõem, logo o slot libertado por um cancelamento está sempre livre em execução
-- serial — a aresta só existe em corridas concorrentes ou caminhos futuros fora deste
-- trigger. A guarda do 0002 é defense-in-depth (Hardening §5.5): testamos (a) a promoção
-- normal por requested_starts_at e (b) a função de guarda sobre slot ocupado.
insert into public.bookings (id, coach_id, athlete_id, type, title, starts_at, ends_at, status)
  values ('00000000-0000-0000-0000-00000000c010', '00000000-0000-0000-0000-0000000000a1',
          '00000000-0000-0000-0000-00000000aaa1', 'training', 'A',
          '2026-07-03 09:00+00', '2026-07-03 10:30+00', 'confirmed');
insert into public.waitlist (coach_id, athlete_id, status, priority, requested_starts_at)
  values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000aaa1',
          'waiting', 1, '2026-07-03 09:00+00');
update public.bookings set status='cancelled' where id='00000000-0000-0000-0000-00000000c010';
do $$ begin
  if not exists (select 1 from public.bookings
                 where source='waitlist' and starts_at='2026-07-03 09:00+00' and status='confirmed') then
    raise exception 'PROVA 6a FALHOU: promoção por requested_starts_at não ocorreu';
  end if;
  if exists (select 1 from public.waitlist
             where requested_starts_at='2026-07-03 09:00+00' and status='waiting') then
    raise exception 'PROVA 6a FALHOU: waitlist não marcada como promoted';
  end if;
end $$;
do $$ begin
  if not public.has_booking_conflict('00000000-0000-0000-0000-0000000000a1',
         '2026-07-03 09:30+00','2026-07-03 10:00+00', null) then
    raise exception 'PROVA 6b FALHOU: a guarda não protege o slot promovido';
  end if;
end $$;

-- ---------- PROVA 7: get_security_score ----------
do $$ declare s int;
begin
  select public.get_security_score() into s;
  if s <> 70 then raise exception 'PROVA 7 FALHOU: base devia ser 70, é %', s; end if;
  update public.security_settings set two_factor_enabled = true
    where user_id = '00000000-0000-0000-0000-0000000000a1';
  select public.get_security_score() into s;
  if s <> 85 then raise exception 'PROVA 7 FALHOU: com 2FA devia ser 85, é %', s; end if;
end $$;

-- ---------- PROVA 8: export_my_data devolve só o próprio ----------
do $$ declare j jsonb;
begin
  select public.export_my_data() into j;
  if j->'profile'->>'id' <> '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'PROVA 8 FALHOU: perfil errado';
  end if;
  if jsonb_array_length(j->'athletes') <> 1 then
    raise exception 'PROVA 8 FALHOU: devia exportar 1 atleta, exporta %', jsonb_array_length(j->'athletes');
  end if;
  if j ? 'totp_secret' then raise exception 'PROVA 8 FALHOU: segredo exposto'; end if;
end $$;

-- ---------- PROVA 9: audit_log foi populado ----------
reset role;
do $$ begin
  if (select count(*) from public.audit_log where entity = 'athletes') < 2 then
    raise exception 'PROVA 9 FALHOU: audit_log sem registos de athletes';
  end if;
  if (select count(*) from public.audit_log where entity = 'bookings') < 4 then
    raise exception 'PROVA 9 FALHOU: audit_log sem registos de bookings';
  end if;
end $$;

-- ---------- PROVA 10: ninguém se promove a admin (0003) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  begin
    update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a1';
    raise exception 'PROVA 10 FALHOU: coach A promoveu-se a admin';
  exception when insufficient_privilege then null; -- esperado
  end;
  -- editar o resto do próprio perfil continua a funcionar
  update public.profiles set full_name = 'Coach A' where id = '00000000-0000-0000-0000-0000000000a1';
  if (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') <> 'Coach A' then
    raise exception 'PROVA 10 FALHOU: edição normal do perfil bloqueada';
  end if;
end $$;
reset role;
do $$ begin
  if (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') <> 'coach' then
    raise exception 'PROVA 10 FALHOU: papel alterado';
  end if;
end $$;

-- ---------- PROVA 11: _export_all não é chamável pelo cliente (0003) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000000a1', false);
do $$ begin
  begin
    perform public._export_all('00000000-0000-0000-0000-0000000000b2');
    raise exception 'PROVA 11 FALHOU: coach A exportou os dados do coach B';
  exception when insufficient_privilege then null; -- esperado
  end;
  -- o caminho legítimo continua aberto
  if (public.export_my_data())->'profile'->>'id' <> '00000000-0000-0000-0000-0000000000a1' then
    raise exception 'PROVA 11 FALHOU: export_my_data deixou de funcionar';
  end if;
end $$;
reset role;

select '✅ G-DB: TODAS AS PROVAS PASSARAM' as resultado;
