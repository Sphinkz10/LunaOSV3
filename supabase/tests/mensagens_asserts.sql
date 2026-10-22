-- ============================================================
-- LUNA.OS v3 · Provas SQL do passo 23 (mensagens). Corre depois de grupos_asserts.sql.
-- PT = e0002, Carla (cliente do PT) = e0003, dona do estúdio = e0001.
-- ============================================================
\set ON_ERROR_STOP on
reset role;
update public.links set responsible_membership_id = current_setting('c.m_pt')::uuid where id = current_setting('c.link')::uuid;

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
select set_config('m.c', public.open_client_conversation(current_setting('c.link')::uuid)::text, false);

-- ---------- PROVA C1: PT e cliente falam; reenviar não duplica ----------
select public.send_message('00000000-0000-0000-0000-0000000c0001', current_setting('m.c')::uuid, 'Excelente semana!');
select public.send_message('00000000-0000-0000-0000-0000000c0001', current_setting('m.c')::uuid, 'Excelente semana!');
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ begin
  if (select count(*) from public.messages where conversation_id = current_setting('m.c')::uuid) <> 1 then raise exception 'PROVA C1 FALHOU: duplicou'; end if;
  if public.open_my_pt_conversation(current_setting('c.link')::uuid) <> current_setting('m.c')::uuid then raise exception 'PROVA C1 FALHOU: conversa diferente'; end if;
  if (select por_ler from public.my_conversations() where id = current_setting('m.c')::uuid) <> 1 then raise exception 'PROVA C1 FALHOU: por ler'; end if;
  perform public.mark_conversation_read(current_setting('m.c')::uuid);
  if (select por_ler from public.my_conversations() where id = current_setting('m.c')::uuid) <> 0 then raise exception 'PROVA C1 FALHOU: lida'; end if;
end $$;

-- ---------- PROVA C2: a conversa do PT com o cliente não é da dona nem da receção ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
do $$ begin
  if public.has_perm(current_setting('c.org')::uuid, 'clients.read_all') is not true and not public.is_member(current_setting('c.org')::uuid) then
    raise exception 'PROVA C2: a dona devia ser membro';
  end if;
  if exists (select 1 from public.messages where conversation_id = current_setting('m.c')::uuid) then raise exception 'PROVA C2 FALHOU: a dona lê a conversa do PT'; end if;
  begin
    perform public.send_message('00000000-0000-0000-0000-0000000c0002', current_setting('m.c')::uuid, 'olá');
    raise exception 'PROVA C2 FALHOU: a dona escreveu';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA C3: fora do horário o PT não é notificado e o cliente vê quando responde ----------
reset role;
insert into public.reply_hours (membership_id, start_time, end_time, days) values (current_setting('c.m_pt')::uuid, '08:00', '08:01', '{}');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
select set_config('m.n', (select count(*)::text from public.notifications), false);
select public.send_message('00000000-0000-0000-0000-0000000c0003', current_setting('m.c')::uuid, 'Posso trocar para terça?');
do $$ begin
  if (public.reply_window(current_setting('m.c')::uuid)->>'dentro')::boolean then raise exception 'PROVA C3 FALHOU: devia estar fora'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.notifications n join public.persons p on p.user_id = n.user_id
             where p.user_id = '00000000-0000-0000-0000-0000000e0002' and n.type = 'mensagem' and n.body like 'Posso trocar%') then
    raise exception 'PROVA C3 FALHOU: o PT foi notificado fora do horário';
  end if;
end $$;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if not (select por_responder from public.my_conversations(current_setting('c.org')::uuid) where id = current_setting('m.c')::uuid) then
    raise exception 'PROVA C3 FALHOU: devia estar por responder';
  end if;
  if (public.conversation_context(current_setting('m.c')::uuid)->>'nome') is null then raise exception 'PROVA C3 FALHOU: contexto'; end if;
end $$;

-- ---------- PROVA C4: avisos só se leem; grupo chega aos membros ativos ----------
reset role;
insert into public.conversations (id, org_id, kind, title) values ('00000000-0000-0000-0000-0000000c1001', current_setting('c.org')::uuid, 'aviso', 'Avisos');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select public.send_message('00000000-0000-0000-0000-0000000c0010', '00000000-0000-0000-0000-0000000c1001', 'Feriado: 8:00 às 14:00');
select set_config('m.g', public.open_group_conversation('00000000-0000-0000-0000-0000000b1001')::text, false);
select public.send_message('00000000-0000-0000-0000-0000000c0011', current_setting('m.g')::uuid, 'Há aula no feriado');
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
do $$ begin
  begin
    perform public.send_message('00000000-0000-0000-0000-0000000c0012', '00000000-0000-0000-0000-0000000c1001', 'ok');
    raise exception 'PROVA C4 FALHOU: respondeu a um aviso';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.messages where conversation_id = current_setting('m.g')::uuid) then raise exception 'PROVA C4 FALHOU: membro não vê o grupo'; end if;
end $$;
reset role;

select '✅ Mensagens: TODAS AS PROVAS PASSARAM' as resultado;
