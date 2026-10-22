-- ============================================================
-- LUNA.OS v3 · Provas SQL do passo 26 (treinadores, plano e subscrição por lugar).
-- Corre depois de pagamentos_asserts.sql. Estúdio Conta: dona = e0001, PT = e0002,
-- Carla = e0003 (c.link). Estúdio Lugares: dona = f0001, PT = f0002.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f0001', 'dona@lugares.test'),
  ('00000000-0000-0000-0000-0000000f0002', 'pt@lugares.test'),
  ('00000000-0000-0000-0000-0000000f0003', 'ginasio@lugares.test');

-- ---------- PROVA T1: fim do experimental sem pagamento → só leitura; nada se apaga; o cliente continua ----------
update public.subscriptions set trial_ends_at = now() - interval '1 minute' where org_id = current_setting('c.org')::uuid;
select set_config('t.links', (select count(*) from public.links where org_id = current_setting('c.org')::uuid)::text, false);
select public._avancar_subscricoes();
do $$ begin
  if (select status from public.subscriptions where org_id = current_setting('c.org')::uuid) <> 'read_only' then raise exception 'PROVA T1 FALHOU: não ficou só de leitura'; end if;
  if (select count(*) from public.links where org_id = current_setting('c.org')::uuid) <> current_setting('t.links')::int then raise exception 'PROVA T1 FALHOU: apagou ligações'; end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000e0001' and type = 'subscricao') then raise exception 'PROVA T1 FALHOU: a dona não foi avisada'; end if;
end $$;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
do $$ begin
  if public.has_perm(current_setting('c.org')::uuid, 'clients.write') then raise exception 'PROVA T1 FALHOU: escreve em só leitura'; end if;
  if not public.has_perm(current_setting('c.org')::uuid, 'clients.read_own') then raise exception 'PROVA T1 FALHOU: deixou de ler'; end if;
  if not public.has_module(current_setting('c.org')::uuid, 'clients') then raise exception 'PROVA T1 FALHOU: escondeu os clientes'; end if;
  begin
    perform public.add_client(current_setting('c.org')::uuid, 'Novo em só leitura', null, null, null, current_setting('c.m_pt')::uuid);
    raise exception 'PROVA T1 FALHOU: criou cliente em só leitura';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
select public.submit_daily_checkin(gen_random_uuid(), current_date, 4, 4, false);
do $$ begin
  if not exists (select 1 from public.my_plans()) then raise exception 'PROVA T1 FALHOU: o cliente deixou de ver o que tem'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
do $$ begin
  begin
    perform public.resume_subscription(current_setting('c.org')::uuid);
    raise exception 'PROVA T1 FALHOU: retomou sem método de pagamento';
  exception when check_violation then null;
  end;
  perform public.add_payment_method(current_setting('c.org')::uuid);
  if (select estado from (select public.subscription_overview(current_setting('c.org')::uuid)->>'estado' as estado) x) <> 'active' then raise exception 'PROVA T1 FALHOU: não voltou a ativa'; end if;
  if not public.has_perm(current_setting('c.org')::uuid, 'clients.write') then raise exception 'PROVA T1 FALHOU: não voltou a escrever'; end if;
end $$;
reset role;

-- ---------- PROVA T2: pagamento falha → em graça (escreve, com aviso) → só leitura; nunca pelo cliente ----------
select public._evento_fornecedor(current_setting('c.org')::uuid, 'pagamento_falhou');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
do $$ begin
  if (select public.subscription_overview(current_setting('c.org')::uuid)->>'estado') <> 'grace' then raise exception 'PROVA T2 FALHOU: não entrou em graça'; end if;
  if not public.has_perm(current_setting('c.org')::uuid, 'clients.write') then raise exception 'PROVA T2 FALHOU: em graça devia escrever'; end if;
  begin
    perform public._evento_fornecedor(current_setting('c.org')::uuid, 'pagamento_ok');
    raise exception 'PROVA T2 FALHOU: o cliente da API chamou o webhook';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from public.subscription_events) = 0 then raise exception 'PROVA T2 FALHOU: a dona não vê o histórico'; end if;
  begin
    delete from public.subscription_events;
    raise exception 'PROVA T2 FALHOU: apagou o histórico';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.subscriptions set grace_ends_at = now() - interval '1 minute' where org_id = current_setting('c.org')::uuid;
select public._avancar_subscricoes();
do $$ begin
  if (select status from public.subscriptions where org_id = current_setting('c.org')::uuid) <> 'read_only' then raise exception 'PROVA T2 FALHOU: graça não acabou em só leitura'; end if;
end $$;
select public._evento_fornecedor(current_setting('c.org')::uuid, 'pagamento_ok');
do $$ begin
  if (select status from public.subscriptions where org_id = current_setting('c.org')::uuid) <> 'active' then raise exception 'PROVA T2 FALHOU: pagamento não reativou'; end if;
end $$;

-- ---------- PROVA T3: lugares (J33) e descer de lugares escolhendo quem perde ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000f0001', false);
select set_config('t.org', public.create_organization('Estúdio Lugares', 'studio', 'fitness', 'Europe/Lisbon', 'Alvalade')::text, false);
select set_config('t.inv', public.create_invite(current_setting('t.org')::uuid, 'pt@lugares.test', 'coach'), false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000f0002', false);
select public.accept_invite(current_setting('t.inv'));
select set_config('t.m_pt', public.my_membership_id(current_setting('t.org')::uuid)::text, false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000f0001', false);
select public.create_invite(current_setting('t.org')::uuid, 'outro@lugares.test', 'coach');
select public.create_invite(current_setting('t.org')::uuid, 'rececao@lugares.test', 'reception');
do $$ declare o jsonb;
begin
  if (select name from public.units where org_id = current_setting('t.org')::uuid) <> 'Alvalade' then raise exception 'PROVA T3 FALHOU: unidade'; end if;
  o := public.subscription_overview(current_setting('t.org')::uuid);
  if (o->>'ocupados')::int <> 3 or (o->>'lugares')::int <> 3 then raise exception 'PROVA T3 FALHOU: receção não ocupa lugar (%)', o->>'ocupados'; end if;
  begin
    perform public.create_invite(current_setting('t.org')::uuid, 'mais@lugares.test', 'coach');
    raise exception 'PROVA T3 FALHOU: convidou acima dos lugares sem confirmar';
  exception when raise_exception then
    if sqlerrm <> 'seats_exceeded' then raise; end if;
  end;
  perform public.create_invite(current_setting('t.org')::uuid, 'mais@lugares.test', 'coach', null, true);
  if (public.subscription_overview(current_setting('t.org')::uuid)->>'lugares')::int <> 4 then raise exception 'PROVA T3 FALHOU: lugar extra'; end if;
  o := public.preview_subscription_change(current_setting('t.org')::uuid, 'treinador', 2);
  if (o->>'liberta')::int <> 2 then raise exception 'PROVA T3 FALHOU: efeito antes de confirmar (%)', o; end if;
  begin
    perform public.change_subscription(current_setting('t.org')::uuid, 'treinador', 2);
    raise exception 'PROVA T3 FALHOU: desceu de lugares sem escolher quem perde';
  exception when check_violation then null;
  end;
  begin
    perform public.change_subscription(current_setting('t.org')::uuid, 'treinador', 3, array[public.my_membership_id(current_setting('t.org')::uuid)]);
    raise exception 'PROVA T3 FALHOU: o dono perdeu o lugar';
  exception when check_violation then null;
  end;
  perform public.change_subscription(current_setting('t.org')::uuid, 'treinador', 3, array[current_setting('t.m_pt')::uuid], 'Saiu no fim do mês');
  if (select status from public.memberships where id = current_setting('t.m_pt')::uuid) <> 'left' then raise exception 'PROVA T3 FALHOU: o PT não saiu'; end if;
  if not exists (select 1 from public.membership_events where membership_id = current_setting('t.m_pt')::uuid and reason = 'Saiu no fim do mês') then raise exception 'PROVA T3 FALHOU: registo da saída'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000f0002', false);   -- o PT que saiu não muda nada
do $$ begin
  begin
    perform public.change_subscription(current_setting('t.org')::uuid, 'ginasio', 9);
    raise exception 'PROVA T3 FALHOU: quem não gere mudou o plano';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA T4: planos ligam e desligam módulos só pelos direitos; descer deixa só de leitura ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000f0001', false);
do $$ declare o jsonb;
begin
  if public.has_module(current_setting('t.org')::uuid, 'entries') then raise exception 'PROVA T4 FALHOU: Treinador com entradas'; end if;
  perform public.change_subscription(current_setting('t.org')::uuid, 'ginasio', 3);
  if not public.has_module(current_setting('t.org')::uuid, 'entries') or not public.has_module(current_setting('t.org')::uuid, 'billing') then raise exception 'PROVA T4 FALHOU: Ginásio sem módulos'; end if;
  o := public.preview_subscription_change(current_setting('t.org')::uuid, 'treinador', 3);
  if not (o->'so_leitura') ? 'entries' or jsonb_array_length(o->'entram') <> 0 then raise exception 'PROVA T4 FALHOU: efeito de descer (%)', o; end if;
  perform public.change_subscription(current_setting('t.org')::uuid, 'treinador', 3);
  if not exists (select 1 from public.entitlements where org_id = current_setting('t.org')::uuid and module = 'entries' and read_only) then raise exception 'PROVA T4 FALHOU: entradas deviam ficar só de leitura'; end if;
  if not exists (select 1 from public.entitlements where org_id = current_setting('t.org')::uuid and module = 'clients' and not read_only) then raise exception 'PROVA T4 FALHOU: clientes'; end if;
end $$;

-- ---------- PROVA T5: ginásio começa no plano Ginásio; modalidade por suportar fica em lista de espera ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000f0003', false);
select set_config('t.gym', public.create_organization('Ginásio Prova', 'gym', 'natacao')::text, false);
do $$ begin
  if (select plan from public.subscriptions where org_id = current_setting('t.gym')::uuid) <> 'ginasio' then raise exception 'PROVA T5 FALHOU: plano do ginásio'; end if;
  if not public.has_module(current_setting('t.gym')::uuid, 'entries') then raise exception 'PROVA T5 FALHOU: módulos do ginásio'; end if;
  if not exists (select 1 from public.sport_waitlist where sport = 'natacao') then raise exception 'PROVA T5 FALHOU: lista de espera'; end if;
  if not exists (select 1 from public.org_sports where org_id = current_setting('t.gym')::uuid and sport_id = 'fitness') then raise exception 'PROVA T5 FALHOU: configuração genérica'; end if;
  if public.join_sport_waitlist(array['corrida','fitness']) <> 1 then raise exception 'PROVA T5 FALHOU: fitness já é suportado'; end if;
end $$;
reset role;

select '✅ Treinadores e subscrição por lugar: TODAS AS PROVAS PASSARAM' as resultado;
