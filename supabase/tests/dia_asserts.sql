-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 09: clientes em atenção (D18) e Inbox.
-- Corre depois de equipa_asserts.sql (usa o Estúdio Conta de lá).
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
select set_config('d.a', public.add_client(current_setting('c.org')::uuid, 'Ana Parada', null, null, null, current_setting('c.m_pt')::uuid)::text, false);
select set_config('d.b', public.add_client(current_setting('c.org')::uuid, 'Bruno Treina', null, null, null, current_setting('c.m_pt')::uuid)::text, false);
select set_config('d.c', public.add_client(current_setting('c.org')::uuid, 'Clara Faltou', null, null, null, current_setting('c.m_pt')::uuid)::text, false);
select set_config('d.x', public.add_client(current_setting('c.org')::uuid, 'Xavier Outro', null, null, null, null)::text, false);
reset role;
-- daqui a 10 dias: Bruno treinou há 2, Clara faltou à última e Ana nunca treinou
insert into public.bookings (org_id, membership_id, link_id, status, starts_at, ends_at) values
  (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.b')::uuid, 'completed', now() + interval '8 days', now() + interval '8 days 1 hour'),
  (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.c')::uuid, 'completed', now() + interval '7 days', now() + interval '7 days 1 hour'),
  (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.c')::uuid, 'no_show', now() + interval '9 days', now() + interval '9 days 1 hour');

-- ---------- PROVA D1: as regras dão o motivo certo e o PT vê só a sua carteira ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
do $$
declare r record; n int := 0;
begin
  for r in select * from public.clients_attention(current_setting('c.org')::uuid, now() + interval '10 days') loop
    n := n + 1;
    if r.full_name = 'Ana Parada' and r.reasons <> array['sem_treinar_7d'] then raise exception 'PROVA D1 FALHOU: Ana %', r.reasons; end if;
    if r.full_name = 'Clara Faltou' and r.reasons <> array['falta_sem_aviso'] then raise exception 'PROVA D1 FALHOU: Clara %', r.reasons; end if;
    if r.full_name = 'Bruno Treina' then raise exception 'PROVA D1 FALHOU: Bruno treinou há 2 dias'; end if;
    if r.full_name = 'Xavier Outro' then raise exception 'PROVA D1 FALHOU: o PT vê um cliente que não é seu'; end if;
  end loop;
  if not exists (select 1 from public.clients_attention(current_setting('c.org')::uuid, now() + interval '10 days') where full_name = 'Ana Parada')
     or not exists (select 1 from public.clients_attention(current_setting('c.org')::uuid, now() + interval '10 days') where full_name = 'Clara Faltou') then
    raise exception 'PROVA D1 FALHOU: faltam clientes em atenção';
  end if;
  -- hoje ninguém está parado há 7 dias (acabaram de entrar)
  if exists (select 1 from public.clients_attention(current_setting('c.org')::uuid) where 'sem_treinar_7d' = any (reasons) and full_name = 'Ana Parada') then
    raise exception 'PROVA D1 FALHOU: cliente novo marcado como parado';
  end if;
end $$;

-- ---------- PROVA D2: adiar pede data, resolver regista quem e quando ----------
reset role;
insert into public.pendencias (org_id, link_id, membership_id, kind, title)
  values (current_setting('c.org')::uuid, current_setting('d.a')::uuid, current_setting('c.m_pt')::uuid, 'restricao_a_rever', 'Rever restrição da Ana');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$
declare pid uuid := (select id from public.pendencias where title = 'Rever restrição da Ana');
begin
  begin
    perform public.adiar_pendencia(pid, now() - interval '1 day');
    raise exception 'PROVA D2 FALHOU: adiou para o passado';
  exception when check_violation then null;
  end;
  perform public.adiar_pendencia(pid, now() + interval '2 days');
  if (select snoozed_until from public.pendencias where id = pid) is null then raise exception 'PROVA D2 FALHOU: não adiou'; end if;
  update public.pendencias set status = 'resolvida' where id = pid;
  if (select resolved_by from public.pendencias where id = pid) <> '00000000-0000-0000-0000-0000000e0002'
     or (select resolved_at from public.pendencias where id = pid) is null then
    raise exception 'PROVA D2 FALHOU: resolvida sem quem e quando';
  end if;
  begin
    perform public.atribuir_pendencia(pid, current_setting('c.m_pt')::uuid);
    raise exception 'PROVA D2 FALHOU: o PT atribuiu sem ver a carteira toda';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select '✅ Dia a dia: TODAS AS PROVAS PASSARAM' as resultado;
