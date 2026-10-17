-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 07 (horário de PT e marcar na app).
-- Corre depois de treino2_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

reset role;
insert into public.units (id, org_id, name) values ('00000000-0000-0000-0000-0000000c0001', current_setting('c.org')::uuid, 'Estúdio Conta')
  on conflict do nothing;
insert into public.rooms (id, org_id, unit_id, name) values ('00000000-0000-0000-0000-0000000c0002', current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000c0001', 'Sala 2');
-- a dona é PT também nesta prova (outra pessoa da equipa)
select set_config('h.m_dona', (select m.id::text from public.memberships m join public.persons p on p.id = m.person_id
  where m.org_id = current_setting('c.org')::uuid and p.user_id = '00000000-0000-0000-0000-0000000e0001'), false);
select set_config('h.d', ((current_date + 30)::timestamp + time '10:00')::timestamptz::text, false);

-- ---------- PROVA H1: a mesma sala nunca tem duas sessões ao mesmo tempo ----------
insert into public.bookings (org_id, membership_id, room_id, status, starts_at, ends_at, title)
  values (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, '00000000-0000-0000-0000-0000000c0002', 'confirmed',
          current_setting('h.d')::timestamptz, current_setting('h.d')::timestamptz + interval '1 hour', 'PT Joana');
do $$ begin
  begin
    insert into public.bookings (org_id, membership_id, room_id, status, starts_at, ends_at)
      values (current_setting('c.org')::uuid, current_setting('h.m_dona')::uuid, '00000000-0000-0000-0000-0000000c0002', 'confirmed',
              current_setting('h.d')::timestamptz + interval '30 minutes', current_setting('h.d')::timestamptz + interval '90 minutes');
    raise exception 'PROVA H1 FALHOU: sala com duas sessões';
  exception when exclusion_violation then null;
  end;
end $$;

-- ---------- PROVA H2: conflitos ditos antes de guardar (PT, sala, férias) ----------
insert into public.day_markers (org_id, membership_id, date, marker) values (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_date + 40, 'vacation');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
do $$ begin
  if (select count(*) from public.schedule_conflicts(current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, '00000000-0000-0000-0000-0000000c0002',
        current_setting('h.d')::timestamptz, current_setting('h.d')::timestamptz + interval '1 hour')) < 2 then
    raise exception 'PROVA H2 FALHOU: faltam conflitos do PT e da sala';
  end if;
  if not exists (select 1 from public.schedule_conflicts(current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, null,
        ((current_date + 40)::timestamp + time '09:00')::timestamptz, ((current_date + 40)::timestamp + time '10:00')::timestamptz) where motivo like 'Está de férias%') then
    raise exception 'PROVA H2 FALHOU: as férias não bloquearam';
  end if;
end $$;

-- ---------- PROVA H3: série semanal só se cria sem conflitos ----------
do $$ begin
  begin
    perform public.create_booking_series(current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, null,
      'training', 'PT Carla', current_setting('h.d')::timestamptz - interval '14 days', 60, current_date + 50);
    raise exception 'PROVA H3 FALHOU: criou série por cima de outra sessão';
  exception when exclusion_violation then null;
  end;
  if public.create_booking_series(current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, null,
      'training', 'PT Carla', current_setting('h.d')::timestamptz + interval '3 hours', 60, current_date + 51) < 3 then
    raise exception 'PROVA H3 FALHOU: a série não foi criada';
  end if;
end $$;

-- ---------- PROVA H4: o cliente marca com o seu PT num horário livre ----------
reset role;
insert into public.availability (org_id, membership_id, weekday, start_time, end_time, kind)
  select current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, d, time '06:00', time '08:00', 'marcacoes' from generate_series(0, 6) d;
insert into public.booking_rules (org_id, slot_minutes, min_notice_hours, cancel_hours) values (current_setting('c.org')::uuid, 60, 0, 12);
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ declare s timestamptz; b uuid; r text;
begin
  select inicio into s from public.my_pt_slots(current_setting('c.link')::uuid, current_date + 2, 3) order by inicio limit 1;
  if s is null then raise exception 'PROVA H4 FALHOU: sem horários livres'; end if;
  b := public.book_my_pt(current_setting('c.link')::uuid, s);
  if exists (select 1 from public.my_pt_slots(current_setting('c.link')::uuid, current_date + 2, 3) where inicio = s) then
    raise exception 'PROVA H4 FALHOU: a hora marcada continua livre';
  end if;
  begin
    perform public.book_my_pt(current_setting('c.link')::uuid, s);
    raise exception 'PROVA H4 FALHOU: marcou duas vezes a mesma hora';
  exception when exclusion_violation then null;
  end;
  -- dentro do prazo (mais de 12 h antes) não conta
  r := public.cancel_my_booking(b);
  if r <> 'dentro_prazo' then raise exception 'PROVA H4 FALHOU: desmarcar dentro do prazo deu %', r; end if;
end $$;

-- ---------- PROVA H5: fora do prazo, desmarcar conta ----------
reset role;
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at)
  values ('00000000-0000-0000-0000-0000000c0009', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid,
          'confirmed', now() + interval '3 hours', now() + interval '4 hours');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
do $$ begin
  if public.cancel_my_booking('00000000-0000-0000-0000-0000000c0009') <> 'conta' then raise exception 'PROVA H5 FALHOU'; end if;
end $$;
reset role;
do $$ begin
  if not (select late_cancel from public.bookings where id = '00000000-0000-0000-0000-0000000c0009') then raise exception 'PROVA H5 FALHOU: não ficou marcada'; end if;
end $$;

select '✅ Horário: TODAS AS PROVAS PASSARAM' as resultado;
