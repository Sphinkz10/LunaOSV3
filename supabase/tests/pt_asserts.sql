-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 29 parte A (peças do PT).
-- Corre depois de packs_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

-- ---------- PROVA R1: máximo por semana e "o cliente marca na app" ----------
reset role;
update public.booking_rules set max_per_week = 1, min_notice_hours = 0 where org_id = current_setting('c.org')::uuid;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ declare s timestamptz; s2 timestamptz;
begin
  select inicio into s from public.my_pt_slots(current_setting('c.link')::uuid, current_date + 14, 1) order by inicio limit 1;
  select inicio into s2 from public.my_pt_slots(current_setting('c.link')::uuid, current_date + 14, 1) order by inicio offset 1 limit 1;
  perform public.book_my_pt(current_setting('c.link')::uuid, s);
  begin
    perform public.book_my_pt(current_setting('c.link')::uuid, s2);
    raise exception 'PROVA R1 FALHOU: passou o máximo por semana';
  exception when check_violation then null;
  end;
end $$;
reset role;
update public.booking_rules set client_can_book = false, max_per_week = null where org_id = current_setting('c.org')::uuid;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
do $$ declare s timestamptz;
begin
  select inicio into s from public.my_pt_slots(current_setting('c.link')::uuid, current_date + 20, 1) order by inicio limit 1;
  begin
    perform public.book_my_pt(current_setting('c.link')::uuid, s);
    raise exception 'PROVA R1 FALHOU: marcou com a marcação na app desligada';
  exception when check_violation then null;
  end;
end $$;
reset role;
update public.booking_rules set client_can_book = true where org_id = current_setting('c.org')::uuid;

-- ---------- PROVA R2: lembretes saem uma vez e respeitam as horas de silêncio ----------
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000e1001', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, 'confirmed',
   date_trunc('day', now() + interval '3 days') + interval '17 hours', date_trunc('day', now() + interval '3 days') + interval '18 hours');
do $$ declare antes int := (select count(*) from public.notifications where type = 'lembrete');
  meio_dia timestamptz := (date_trunc('day', now() + interval '2 days') + interval '12 hours') at time zone 'UTC' at time zone 'Europe/Lisbon';
  madrugada timestamptz := (date_trunc('day', now() + interval '2 days') + interval '23 hours 30 minutes') at time zone 'UTC' at time zone 'Europe/Lisbon';
begin
  -- 23:30 da véspera: horas de silêncio, ainda não sai
  perform public._enviar_lembretes(((date_trunc('day', now() + interval '3 days') + interval '17 hours') - interval '17 hours 30 minutes'));
  if (select count(*) from public.notifications where type = 'lembrete') <> antes then raise exception 'PROVA R2 FALHOU: saiu nas horas de silêncio'; end if;
  perform public._enviar_lembretes(((date_trunc('day', now() + interval '3 days') + interval '17 hours') - interval '23 hours'));
  perform public._enviar_lembretes(((date_trunc('day', now() + interval '3 days') + interval '17 hours') - interval '23 hours'));
  if (select count(*) from public.booking_reminders where booking_id = '00000000-0000-0000-0000-0000000e1001' and kind = '24h') <> 1 then
    raise exception 'PROVA R2 FALHOU: lembrete de 24 h em falta ou repetido';
  end if;
  if has_function_privilege('authenticated', 'public._enviar_lembretes(timestamptz)', 'execute') then raise exception 'PROVA R2 FALHOU: cliente dispara lembretes'; end if;
end $$;

-- ---------- PROVA R7: quem desliga os lembretes na app não os recebe ----------
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000e1002', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, 'confirmed',
   date_trunc('day', now() + interval '4 days') + interval '17 hours', date_trunc('day', now() + interval '4 days') + interval '18 hours');
update public.user_settings set reminders_on = false where user_id = '00000000-0000-0000-0000-0000000e0003';
do $$ declare antes int := (select count(*) from public.notifications where type = 'lembrete');
begin
  perform public._enviar_lembretes(((date_trunc('day', now() + interval '4 days') + interval '17 hours') - interval '23 hours'));
  if (select count(*) from public.notifications where type = 'lembrete') <> antes then raise exception 'PROVA R7 FALHOU: lembrete com os avisos desligados'; end if;
end $$;
update public.user_settings set reminders_on = true where user_id = '00000000-0000-0000-0000-0000000e0003';
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
do $$ begin
  if not exists (select 1 from public.my_bookings() where id = '00000000-0000-0000-0000-0000000e1002' and desmarcar_ate < inicio) then
    raise exception 'PROVA R7 FALHOU: sem prazo para desmarcar';
  end if;
end $$;
reset role;

-- ---------- PROVA R3: iCal sem o nome do cliente; gerar nova invalida a antiga ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
select set_config('r.t1', public.new_calendar_feed(current_setting('c.org')::uuid), false);
select set_config('r.t2', public.new_calendar_feed(current_setting('c.org')::uuid), false);
reset role;
do $$ begin
  if exists (select 1 from public._calendar_events(current_setting('r.t1'))) then raise exception 'PROVA R3 FALHOU: a ligação antiga ainda funciona'; end if;
  if not exists (select 1 from public._calendar_events(current_setting('r.t2'))) then raise exception 'PROVA R3 FALHOU: a ligação nova está vazia'; end if;
  if exists (select 1 from public._calendar_events(current_setting('r.t2')) where titulo like '%Carla%') then raise exception 'PROVA R3 FALHOU: mostrou o nome do cliente'; end if;
end $$;

-- ---------- PROVA R4: resumo partilhado chega à app; notas privadas nunca ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select public.share_session_summary('00000000-0000-0000-0000-00000000f001', 'Boa sessão, joelho estável.');
insert into public.client_notes (org_id, link_id, body) values (current_setting('c.org')::uuid, current_setting('c.link')::uuid, 'Nota privada do PT');
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ begin
  if not exists (select 1 from public.my_history() where nome like '%joelho estável%') then raise exception 'PROVA R4 FALHOU: o resumo não chegou'; end if;
  if exists (select 1 from public.client_notes) then raise exception 'PROVA R4 FALHOU: o cliente viu notas privadas'; end if;
end $$;

-- ---------- PROVA R5: passar os clientes de um PT que sai, com registo ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
do $$ declare n int;
begin
  n := public.transfer_clients(current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('h.m_dona')::uuid, array[current_setting('d.b')::uuid]);
  if n <> 1 or (select responsible_membership_id from public.links where id = current_setting('d.b')::uuid) <> current_setting('h.m_dona')::uuid then
    raise exception 'PROVA R5 FALHOU';
  end if;
  if not exists (select 1 from public.link_events where link_id = current_setting('d.b')::uuid and title like 'Passou para%') then raise exception 'PROVA R5 FALHOU: sem registo'; end if;
end $$;

-- ---------- PROVA R6: importar com saldo cria o pack com as sessões que restam ----------
do $$ declare run uuid;
begin
  run := public.import_clients(current_setting('c.org')::uuid, 'excel.csv', '[{"linha":2,"nome":"Saldo Sete","telefone":"917777777","saldo":"7"}]'::jsonb);
  if not exists (select 1 from public.client_packs p join public.clients c on c.id = p.link_id where c.full_name = 'Saldo Sete' and p.sessions_total = 7) then
    raise exception 'PROVA R6 FALHOU';
  end if;
end $$;
reset role;

select '✅ Peças do PT: TODAS AS PROVAS PASSARAM' as resultado;
