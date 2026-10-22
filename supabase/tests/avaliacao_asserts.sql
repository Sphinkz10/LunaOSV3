-- ============================================================
-- LUNA.OS v3 · Provas SQL do passo 22 (avaliação, questionários, check-ins).
-- Corre depois de metricas_asserts.sql. Carla (e0003) é cliente do PT (e0002).
-- ============================================================
\set ON_ERROR_STOP on
reset role;
-- A Carla partilha medidas, check-ins e fotos com o estúdio
insert into public.link_shares (org_id, link_id, person_id, category)
  select l.org_id, l.id, l.person_id, c from public.links l, unnest(array['measurements','checkins','photos']::public.share_category[]) c
  where l.id = current_setting('c.link')::uuid
    and not exists (select 1 from public.link_shares s where s.link_id = l.id and s.category = c and s.revoked_at is null);

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT

-- ---------- PROVA Q1: publicar valida e cria versões; a resposta guarda a sua ----------
insert into public.forms (id, org_id, kind, name, questions) values ('00000000-0000-0000-0000-0000000a1001', current_setting('c.org')::uuid, 'checkin_semanal', 'Check-in semanal',
  '[{"id":"peso","tipo":"numero","texto":"Quanto pesas?","obrigatorio":true,"min":30,"max":250,"unidade":"kg"},
    {"id":"sono","tipo":"escala","texto":"Como dormiste?","min":1,"max":5,"pontua":{"dimensao":"bem_estar","peso":1}},
    {"id":"dor","tipo":"sim_nao","texto":"Alguma dor nova?","acao":"avisar_pt"},
    {"id":"onde","tipo":"texto","texto":"Onde?","obrigatorio":true,"se":{"pergunta":"dor","valores":[true]}}]');
do $$ begin
  update public.forms set questions = '[{"id":"a","tipo":"escolha","texto":"Só uma opção","opcoes":["x"]}]' where id = '00000000-0000-0000-0000-0000000a1002';
  begin
    insert into public.forms (id, org_id, name, questions) values ('00000000-0000-0000-0000-0000000a1002', current_setting('c.org')::uuid, 'Mau', '[{"id":"a","tipo":"escolha","texto":"Só uma","opcoes":["x"]}]');
    perform public.publish_form('00000000-0000-0000-0000-0000000a1002');
    raise exception 'PROVA Q1 FALHOU: publicou escolha com uma opção';
  exception when check_violation then null;
  end;
  if public.publish_form('00000000-0000-0000-0000-0000000a1001') <> 1 then raise exception 'PROVA Q1 FALHOU: versão'; end if;
  if public.send_requests(current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000a1001', array[current_setting('c.link')::uuid]) <> 1 then raise exception 'PROVA Q1 FALHOU: envio'; end if;
  -- Mudar e publicar outra vez não mexe no que já foi enviado
  update public.forms set name = 'Check-in semanal v2' where id = '00000000-0000-0000-0000-0000000a1001';
  perform public.publish_form('00000000-0000-0000-0000-0000000a1001');
end $$;

-- ---------- PROVA Q2: a Carla responde (obrigatórias por condição, limites, aviso ao PT, sem duplicar) ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
select set_config('q.r', (select id::text from public.my_requests() limit 1), false);
do $$ begin
  if (public.open_request(current_setting('q.r')::uuid)->>'nome') <> 'Check-in semanal' then raise exception 'PROVA Q2 FALHOU: versão errada'; end if;
  begin
    perform public.submit_response('00000000-0000-0000-0000-0000000a2001', current_setting('q.r')::uuid, '{"peso":63,"sono":4,"dor":true}');
    raise exception 'PROVA Q2 FALHOU: faltava "Onde?"';
  exception when check_violation then null;
  end;
  begin
    perform public.submit_response('00000000-0000-0000-0000-0000000a2001', current_setting('q.r')::uuid, '{"peso":900,"sono":4,"dor":false}');
    raise exception 'PROVA Q2 FALHOU: peso fora dos limites';
  exception when check_violation then null;
  end;
  perform public.submit_response('00000000-0000-0000-0000-0000000a2001', current_setting('q.r')::uuid, '{"peso":63.1,"sono":4,"dor":true,"onde":"ombro"}');
  perform public.submit_response('00000000-0000-0000-0000-0000000a2001', current_setting('q.r')::uuid, '{"peso":63.1,"sono":4,"dor":true,"onde":"ombro"}');
end $$;
reset role;
do $$ begin
  if (select count(*) from public.form_responses where id = '00000000-0000-0000-0000-0000000a2001') <> 1 then raise exception 'PROVA Q2 FALHOU'; end if;
  if (select (score->>'bem_estar')::numeric from public.form_responses where id = '00000000-0000-0000-0000-0000000a2001') <> 0.75 then raise exception 'PROVA Q2 FALHOU: pontuação'; end if;
  if (select v.version from public.form_responses r join public.form_versions v on v.id = r.form_version_id where r.id = '00000000-0000-0000-0000-0000000a2001') <> 1 then
    raise exception 'PROVA Q2 FALHOU: a resposta mudou de versão';
  end if;
  if not exists (select 1 from public.notifications where type = 'resposta_alerta' and body like '%dor nova%') then raise exception 'PROVA Q2 FALHOU: PT não avisado'; end if;
end $$;

-- ---------- PROVA Q3: check-in diário; uma dor nova avisa o PT uma vez ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
select public.submit_daily_checkin('00000000-0000-0000-0000-0000000a3001', current_date, 4, 3, true, 'joelho');
select public.submit_daily_checkin('00000000-0000-0000-0000-0000000a3002', current_date, 4, 2, true, 'joelho');
reset role;
do $$ begin
  if (select count(*) from public.daily_checkins where day = current_date and person_id = (select id from public.persons where user_id = '00000000-0000-0000-0000-0000000e0003')) <> 1 then raise exception 'PROVA Q3 FALHOU: duplicou o dia'; end if;
  if (select count(*) from public.notifications where type = 'dor_nova') < 1 then raise exception 'PROVA Q3 FALHOU: sem aviso'; end if;
end $$;

-- ---------- PROVA Q4: recorrente gera um pedido por semana e só a quem tem plano ativo ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select set_config('q.s', public.schedule_requests(current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000a1001',
  array[current_setting('c.link')::uuid, current_setting('d.a')::uuid], null, extract(dow from now())::int, 0, 2)::text, false);
reset role;
select public._gerar_pedidos(now(), null);
select public._gerar_pedidos(now(), null);
do $$ declare n int := (select count(*) from public.requests where schedule_id = current_setting('q.s')::uuid);
begin
  if n > (select count(distinct a.link_id) from public.assignments a where a.status = 'active' and a.link_id in (current_setting('c.link')::uuid, current_setting('d.a')::uuid)) then
    raise exception 'PROVA Q4 FALHOU: % pedidos', n;
  end if;
  if exists (select 1 from public.requests r where r.schedule_id = current_setting('q.s')::uuid
             and not exists (select 1 from public.assignments a where a.link_id = r.link_id and a.status = 'active')) then
    raise exception 'PROVA Q4 FALHOU: pediu a quem não tem plano';
  end if;
end $$;

-- ---------- PROVA A1: avaliação no terreno sem rede, fechar uma vez, comparar ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
insert into public.protocols (id, org_id, name, blocks) values ('00000000-0000-0000-0000-0000000a4001', current_setting('c.org')::uuid, 'Reavaliação',
  '[{"titulo":"Força","testes":[{"chave":"agacha_5rm","nome":"Agachamento 5RM","unidade":"kg","tentativas":3,"guarda":"melhor"},
                               {"chave":"prancha","nome":"Prancha","unidade":"s","tentativas":1}]},
    {"titulo":"Composição","testes":[{"chave":"cintura","nome":"Cintura","unidade":"cm","tentativas":1,"menor_melhor":true}]}]');
select public.publish_protocol('00000000-0000-0000-0000-0000000a4001');
select set_config('a.pv', (select id::text from public.protocol_versions where protocol_id = '00000000-0000-0000-0000-0000000a4001' and version = 1), false);
-- Primeira avaliação (há 8 semanas)
select public.sync_assessment(jsonb_build_object('id', '00000000-0000-0000-0000-0000000a5001', 'link_id', current_setting('c.link'), 'protocol_version_id', current_setting('a.pv'),
  'iniciada_em', now() - interval '56 days', 'valores', '[{"id":"00000000-0000-0000-0000-0000000a6001","chave":"agacha_5rm","tentativas":[45,50]},
    {"id":"00000000-0000-0000-0000-0000000a6002","chave":"prancha","tentativas":[55]},{"id":"00000000-0000-0000-0000-0000000a6003","chave":"cintura","tentativas":[78]}]'::jsonb));
select public.close_assessment('00000000-0000-0000-0000-0000000a5001');
-- Reavaliação, enviada duas vezes pela fila
select set_config('a.p2', jsonb_build_object('id', '00000000-0000-0000-0000-0000000a5002', 'link_id', current_setting('c.link'), 'protocol_version_id', current_setting('a.pv'),
  'valores', '[{"id":"00000000-0000-0000-0000-0000000a6011","chave":"agacha_5rm","tentativas":[55,60,""]},
    {"id":"00000000-0000-0000-0000-0000000a6012","chave":"prancha","tentativas":[52]},{"id":"00000000-0000-0000-0000-0000000a6013","chave":"cintura","tentativas":[75]}]'::jsonb)::text, false);
select public.sync_assessment(current_setting('a.p2')::jsonb);
select public.sync_assessment(current_setting('a.p2')::jsonb);
select public.close_assessment('00000000-0000-0000-0000-0000000a5002');
do $$ declare c record;
begin
  if (select count(*) from public.assessment_values where assessment_id = '00000000-0000-0000-0000-0000000a5002') <> 3 then raise exception 'PROVA A1 FALHOU: duplicou'; end if;
  select * into c from public.compare_assessment('00000000-0000-0000-0000-0000000a5002') where chave = 'agacha_5rm';
  if c.antes <> 50 or c.agora <> 60 or not c.melhor then raise exception 'PROVA A1 FALHOU: agachamento %', row_to_json(c); end if;
  select * into c from public.compare_assessment('00000000-0000-0000-0000-0000000a5002') where chave = 'cintura';
  if not c.melhor then raise exception 'PROVA A1 FALHOU: cintura menor é melhor'; end if;
  -- Depois de fechada, a fila não mexe
  perform public.sync_assessment(jsonb_set(current_setting('a.p2')::jsonb, '{valores,0,tentativas}', '[99]'));
  if (select value from public.assessment_values where id = '00000000-0000-0000-0000-0000000a6011') <> 60 then raise exception 'PROVA A1 FALHOU: mudou depois de fechar'; end if;
end $$;

-- ---------- PROVA A2: invalidar pede motivo, sai do gráfico e fica no histórico ----------
do $$ begin
  begin
    perform public.invalidate_value('00000000-0000-0000-0000-0000000a6012', ' ');
    raise exception 'PROVA A2 FALHOU: sem motivo';
  exception when check_violation then null;
  end;
  perform public.invalidate_value('00000000-0000-0000-0000-0000000a6012', 'Dor no ombro durante o teste');
  if exists (select 1 from public.test_trend((select person_id from public.links where id = current_setting('c.link')::uuid), 'prancha') where valor = 52) then
    raise exception 'PROVA A2 FALHOU: continua no gráfico';
  end if;
  if not exists (select 1 from public.compare_assessment('00000000-0000-0000-0000-0000000a5002') where chave = 'prancha' and estado = 'invalidado' and motivo like 'Dor%') then
    raise exception 'PROVA A2 FALHOU: saiu do histórico';
  end if;
end $$;

-- ---------- PROVA A3: o painel conta e a Carla vê a sua avaliação ----------
do $$ declare o jsonb := public.assessment_overview(current_setting('c.org')::uuid);
begin
  if (o->>'por_ler')::int < 2 then raise exception 'PROVA A3 FALHOU: %', o; end if;
  perform public.review_item('resposta', '00000000-0000-0000-0000-0000000a2001', 'Boa semana! Vamos ver o ombro na quinta.');
  if (public.assessment_overview(current_setting('c.org')::uuid)->>'por_ler')::int <> (o->>'por_ler')::int - 1 then raise exception 'PROVA A3 FALHOU: rever'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
do $$ begin
  if not exists (select 1 from public.compare_assessment('00000000-0000-0000-0000-0000000a5002')) then raise exception 'PROVA A3 FALHOU: a Carla não vê'; end if;
end $$;
-- ... e outro PT de outra organização não vê nada
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
do $$ begin
  if exists (select 1 from public.form_responses where id = '00000000-0000-0000-0000-0000000a2001')
     and not public.has_perm((select org_id from public.form_responses where id = '00000000-0000-0000-0000-0000000a2001'), 'clients.read_all') then
    raise exception 'PROVA A3 FALHOU: fuga de respostas';
  end if;
end $$;
reset role;

select '✅ Avaliação: TODAS AS PROVAS PASSARAM' as resultado;
