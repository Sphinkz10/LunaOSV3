-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 17 (P-07): duplicados, juntar com
-- desfazer, convidar para a app e rascunhos. Corre depois de app_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
select set_config('k.a', public.add_client(current_setting('c.org')::uuid, 'Joana Reis', 'joana@conta.test', '+351 912 345 678')::text, false);

-- ---------- PROVA K1: nenhum cliente duplicado pelo mesmo telemóvel, email ou NIF ----------
do $$ begin
  begin
    perform public.add_client(current_setting('c.org')::uuid, 'Joana R.', null, '912345678');
    raise exception 'PROVA K1 FALHOU: criou duplicado pelo telemóvel';
  exception when unique_violation then null;
  end;
  begin
    perform public.add_client(current_setting('c.org')::uuid, 'Joana', 'JOANA@conta.test');
    raise exception 'PROVA K1 FALHOU: criou duplicado pelo email';
  exception when unique_violation then null;
  end;
  if not exists (select 1 from public.find_client_duplicates(current_setting('c.org')::uuid, '00351 912 345 678')
                 where motivo = 'telefone' and visible and full_name = 'Joana Reis') then
    raise exception 'PROVA K1 FALHOU: duplicado não encontrado ao escrever';
  end if;
end $$;
-- quem não vê o cliente sabe que existe, mas não vê o nome
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
select set_config('k.x', public.add_client(current_setting('c.org')::uuid, 'Xana Outra', null, '913000000', null, null, 'pt_client', '123456789')::text, false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if not exists (select 1 from public.find_client_duplicates(current_setting('c.org')::uuid, null, null, '123456789')
                 where not visible and link_id is null and full_name <> 'Xana Outra') then
    raise exception 'PROVA K1 FALHOU: duplicado de outro responsável mostrou dados';
  end if;
end $$;

-- ---------- PROVA K2: juntar mantém o histórico dos dois e desfaz-se ----------
reset role;
-- a segunda Joana foi criada no balcão antes da regra (sem telemóvel), com uma marcação feita e uma medida
insert into public.persons (id, managed_by_org, full_name) values ('00000000-0000-0000-0000-0000000b0001', current_setting('c.org')::uuid, 'Joana (balcão)');
insert into public.links (id, org_id, person_id, type, origin, status, responsible_membership_id)
  values ('00000000-0000-0000-0000-0000000b0002', current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000b0001', 'pt_client', 'manual', 'active', current_setting('c.m_pt')::uuid);
insert into public.link_shares (org_id, link_id, person_id, category)
  select current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000b0001', c from unnest(enum_range(null::public.share_category)) c;
insert into public.bookings (org_id, membership_id, link_id, status, starts_at, ends_at) values
  (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('k.a')::uuid, 'completed', now() - interval '3 days', now() - interval '3 days' + interval '1 hour'),
  (current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, '00000000-0000-0000-0000-0000000b0002', 'completed', now() - interval '2 days', now() - interval '2 days' + interval '1 hour');
insert into public.measurements (person_id, org_id, metric_key, value, unit)
  values ('00000000-0000-0000-0000-0000000b0001', current_setting('c.org')::uuid, 'peso', 60, 'kg');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select set_config('k.m', public.merge_clients(current_setting('k.a')::uuid, '00000000-0000-0000-0000-0000000b0002')::text, false);
do $$ begin
  if (select count(*) from public.bookings where link_id = current_setting('k.a')::uuid) <> 2 then raise exception 'PROVA K2 FALHOU: histórico não juntou'; end if;
  if not exists (select 1 from public.measurements where person_id = (select person_id from public.links where id = current_setting('k.a')::uuid)) then
    raise exception 'PROVA K2 FALHOU: a medida não passou';
  end if;
  if (select archived_at from public.links where id = '00000000-0000-0000-0000-0000000b0002') is null then raise exception 'PROVA K2 FALHOU: o outro não ficou arquivado'; end if;
  perform public.undo_merge(current_setting('k.m')::uuid);
  if (select count(*) from public.bookings where link_id = current_setting('k.a')::uuid) <> 1
     or (select archived_at from public.links where id = '00000000-0000-0000-0000-0000000b0002') is not null then
    raise exception 'PROVA K2 FALHOU: desfazer não repôs';
  end if;
end $$;

-- ---------- PROVA K3: convidar para a app ----------
do $$ declare tok text;
begin
  tok := public.send_link_invite(current_setting('k.a')::uuid, 'sms');
  if tok is null or not exists (select 1 from public.link_invites where link_id = current_setting('k.a')::uuid) then
    raise exception 'PROVA K3 FALHOU: convite não criado';
  end if;
  begin
    perform public.send_link_invite('00000000-0000-0000-0000-0000000b0002', 'sms');
    raise exception 'PROVA K3 FALHOU: SMS sem telemóvel';
  exception when check_violation then null;
  end;
  if public.send_link_invite('00000000-0000-0000-0000-0000000b0002', 'codigo') is null then raise exception 'PROVA K3 FALHOU: código'; end if;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.outbox where channel = 'sms' and recipient = '912345678' and template = 'convite_cliente') then
    raise exception 'PROVA K3 FALHOU: o SMS não ficou na fila';
  end if;
end $$;

-- ---------- PROVA K4: rascunhos são só de quem os escreveu ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
insert into public.drafts (user_id, key, payload) values ('00000000-0000-0000-0000-0000000e0002', 'novo-cliente', '{"nome":"Rui"}');
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
do $$ begin
  if exists (select 1 from public.drafts) then raise exception 'PROVA K4 FALHOU: rascunho de outra pessoa visível'; end if;
end $$;
reset role;

select '✅ Clientes: TODAS AS PROVAS PASSARAM' as resultado;
