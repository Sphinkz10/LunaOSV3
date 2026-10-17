-- ============================================================
-- LUNA.OS v3 · Provas SQL da app do cliente (tarefa 09): Hoje, quem vê os
-- meus dados e apagar conta. Corre depois de dia_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

-- A Carla (cliente com conta) tem um plano com treino em todos os dias da semana
reset role;
insert into public.workouts (id, org_id, name, est_duration_min)
  values ('00000000-0000-0000-0000-0000000a0001', current_setting('c.org')::uuid, 'Força base · Dia A', 58);
insert into public.plans (id, org_id, name) values ('00000000-0000-0000-0000-0000000a0002', current_setting('c.org')::uuid, 'Força base');
insert into public.plan_workouts (org_id, plan_id, workout_id, weekday)
  select current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000a0001', d
  from generate_series(0, 6) d;
insert into public.assignments (org_id, target, link_id, plan_id, status)
  values (current_setting('c.org')::uuid, 'client', current_setting('c.link')::uuid, '00000000-0000-0000-0000-0000000a0002', 'active');
insert into public.bookings (org_id, membership_id, link_id, status, starts_at, ends_at, title) values
  (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, 'confirmed',
   now() + interval '2 days', now() + interval '2 days 1 hour', 'PT');

-- ---------- PROVA A1: Hoje mostra o treino do dia e a próxima sessão ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$
declare h jsonb := public.my_today();
begin
  if h->'treino'->>'nome' <> 'Força base · Dia A' then raise exception 'PROVA A1 FALHOU: treino %', h->'treino'; end if;
  if h->'proxima' is null or h->'proxima' = 'null'::jsonb then raise exception 'PROVA A1 FALHOU: sem próxima sessão'; end if;
  if (h->>'organizacoes')::int < 1 then raise exception 'PROVA A1 FALHOU: sem organizações'; end if;
end $$;

-- ---------- PROVA A2: quem vê os meus dados; desligar tem efeito imediato ----------
do $$
declare r record;
begin
  select * into r from public.my_links_overview() where link_id = current_setting('c.link')::uuid;
  if r.org_name <> 'Estúdio Conta' or r.shares <> array['training']::public.share_category[] then
    raise exception 'PROVA A2 FALHOU: %', r;
  end if;
  perform public.set_my_shares(current_setting('c.link')::uuid, array['training','measurements']::public.share_category[]);
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
do $$ begin
  if not exists (select 1 from public.measurements where person_id = (select person_id from public.links where id = current_setting('c.link')::uuid)) then raise exception 'PROVA A2 FALHOU: partilha das medidas não chegou ao PT'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
select public.set_my_shares(current_setting('c.link')::uuid, array['training']::public.share_category[]);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if exists (select 1 from public.measurements where person_id = (select person_id from public.links where id = current_setting('c.link')::uuid)) then raise exception 'PROVA A2 FALHOU: desligar não cortou o acesso'; end if;
  begin
    perform public.set_my_shares(current_setting('c.link')::uuid, array['training','health']::public.share_category[]);
    raise exception 'PROVA A2 FALHOU: o PT mudou as partilhas do cliente';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA A3: apagar conta é um pedido com 30 dias, que se cancela ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
do $$
declare d timestamptz := public.request_account_deletion();
begin
  if d < now() + interval '29 days' then raise exception 'PROVA A3 FALHOU: prazo curto'; end if;
  if public.request_account_deletion() <> d then raise exception 'PROVA A3 FALHOU: pedido duplicado'; end if;
  perform public.cancel_account_deletion();
  if exists (select 1 from public.account_deletion_requests where cancelled_at is null) then raise exception 'PROVA A3 FALHOU: não cancelou'; end if;
end $$;
reset role;

select '✅ App do cliente: TODAS AS PROVAS PASSARAM' as resultado;
