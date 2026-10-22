-- ============================================================
-- LUNA.OS v3 · Provas SQL dos passos 25 e 25b (pagamentos registados e dinheiro do PT).
-- Corre depois de solo_asserts.sql. PT = e0002, Carla = e0003 (c.link), Ana = d.a.
-- ============================================================
\set ON_ERROR_STOP on
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
insert into public.pack_products (id, org_id, name, sessions, validity_days, price_cents) values ('00000000-0000-0000-0000-0000000d0001', current_setting('c.org')::uuid, 'Pack 10', 10, 90, 30000);
insert into public.pack_products (id, org_id, name, sessions, validity_days, price_cents, kind) values ('00000000-0000-0000-0000-0000000d0002', current_setting('c.org')::uuid, 'Sessão avulsa', 1, 1, 3500, 'avulsa');
insert into public.monthly_products (id, org_id, name, price_cents, sessions_per_week, billing_day) values ('00000000-0000-0000-0000-0000000d0003', current_setting('c.org')::uuid, '2x por semana', 12000, 2, 1);
select set_config('p.pack', public.sell_pack(current_setting('c.link')::uuid, '00000000-0000-0000-0000-0000000d0001', current_date - 1)::text, false);

-- ---------- PROVA P1: registar, nunca apagar, corrigir com motivo; o cliente não vê a nota ----------
select set_config('p.r1', public.record_payment(current_setting('c.link')::uuid, 'pack', current_setting('p.pack')::uuid, null, 15000, current_date, 'mbway', 'FT 2026/118', 'Pagou depois da sessão de quinta')::text, false);
do $$ declare c uuid;
begin
  begin
    perform public.correct_payment(current_setting('p.r1')::uuid, 12000, ' ');
    raise exception 'PROVA P1 FALHOU: corrigiu sem motivo';
  exception when check_violation then null;
  end;
  c := public.correct_payment(current_setting('p.r1')::uuid, 12000, 'Engano no valor');
  begin
    perform public.correct_payment(current_setting('p.r1')::uuid, 11000, 'Outra vez');
    raise exception 'PROVA P1 FALHOU: corrigiu um registo já corrigido';
  exception when check_violation then null;
  end;
  if (select count(*) from public.client_payments(current_setting('c.link')::uuid)) <> 2 then raise exception 'PROVA P1 FALHOU: o original desapareceu'; end if;
  begin
    delete from public.payments where id = current_setting('p.r1')::uuid;
    raise exception 'PROVA P1 FALHOU: deixou apagar';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ begin
  if (select count(*) from public.my_payments()) <> 1 or (select valor from public.my_payments() limit 1) <> 12000 or not (select corrigido from public.my_payments() limit 1) then
    raise exception 'PROVA P1 FALHOU: o cliente devia ver só o valor corrigido';
  end if;
  if exists (select 1 from public.payments) then raise exception 'PROVA P1 FALHOU: o cliente lê a tabela com notas'; end if;
  if (select pago from public.my_plans() where tipo = 'pack' and nome = 'Pack 10') <> 12000 then raise exception 'PROVA P1 FALHOU: pago no pack'; end if;
end $$;

-- ---------- PROVA P2: mensalidade, "quem me deve" bate certo com os registos ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select set_config('p.m', public.sell_monthly(current_setting('c.link')::uuid, '00000000-0000-0000-0000-0000000d0003', (date_trunc('month', current_date) - interval '1 month')::date)::text, false);
do $$ declare o jsonb; meses int;
begin
  o := public.money_overview(current_setting('c.org')::uuid);
  meses := (select count(*) from jsonb_array_elements(o->'quem_deve') x where x->>'tipo' = 'mensalidade' and x->>'alvo' = current_setting('p.m'));
  if meses <> 2 then raise exception 'PROVA P2 FALHOU: devia dever 2 meses (%).', meses; end if;
  if not exists (select 1 from jsonb_array_elements(o->'quem_deve') x where x->>'tipo' = 'pack' and (x->>'valor')::int = 18000) then raise exception 'PROVA P2 FALHOU: resto do pack'; end if;
  perform public.record_payment(current_setting('c.link')::uuid, 'mensalidade', current_setting('p.m')::uuid, to_char(current_date, 'YYYY-MM'), 12000, current_date, 'dinheiro');
  begin
    perform public.record_payment(current_setting('c.link')::uuid, 'mensalidade', current_setting('p.m')::uuid, to_char(current_date, 'YYYY-MM'), 12000, current_date, 'dinheiro');
    raise exception 'PROVA P2 FALHOU: registou o mesmo mês duas vezes';
  exception when check_violation then null;
  end;
  o := public.money_overview(current_setting('c.org')::uuid);
  if (select count(*) from jsonb_array_elements(o->'quem_deve') x where x->>'tipo' = 'mensalidade' and x->>'alvo' = current_setting('p.m')) <> 1 then raise exception 'PROVA P2 FALHOU: quem deve'; end if;
  if (o->>'recebido')::int < 24000 then raise exception 'PROVA P2 FALHOU: recebido %', o->>'recebido'; end if;
end $$;

-- ---------- PROVA P3: pack partilhado desconta de quem treinar e as duas pessoas o veem ----------
do $$ declare antes int;
begin
  perform public.share_pack(current_setting('p.pack')::uuid, current_setting('d.a')::uuid);
  antes := (select sessions_used from public.client_packs where id = current_setting('p.pack')::uuid);
  if not exists (select 1 from public.pack_balance(current_setting('d.a')::uuid) where pack_id = current_setting('p.pack')::uuid) then raise exception 'PROVA P3 FALHOU: a Ana não vê'; end if;
end $$;
reset role;
-- A Ana gasta o pack dela primeiro; esgota-o para testar o partilhado
update public.client_packs set sessions_used = sessions_total where link_id = current_setting('d.a')::uuid;
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000d1001', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.a')::uuid, 'confirmed',
   date_trunc('hour', now()) - interval '30 hours', date_trunc('hour', now()) - interval '29 hours');
update public.bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000d1001';
do $$ begin
  if not exists (select 1 from public.pack_usages where booking_id = '00000000-0000-0000-0000-0000000d1001' and pack_id = current_setting('p.pack')::uuid) then
    raise exception 'PROVA P3 FALHOU: não descontou do pack partilhado';
  end if;
end $$;

-- ---------- PROVA P4: exportar tudo ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
do $$ declare e jsonb := public.export_business(current_setting('c.org')::uuid);
begin
  if jsonb_array_length(e->'clientes') = 0 or jsonb_array_length(e->'pagamentos') < 3 then raise exception 'PROVA P4 FALHOU'; end if;
  if e::text like '%Pagou depois da sessão%' then raise exception 'PROVA P4 FALHOU: notas internas na exportação'; end if;
end $$;
reset role;

select '✅ Pagamentos e dinheiro do PT: TODAS AS PROVAS PASSARAM' as resultado;
