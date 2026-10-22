-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 28 (medir a ativação).
-- Corre depois de horario2_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on
reset role;

-- ---------- PROVA M1: os eventos chegam sozinhos e nunca levam dados pessoais ----------
do $$ begin
  if not exists (select 1 from public.product_events where kind = 'org_criada' and org_id = current_setting('c.org')::uuid) then raise exception 'PROVA M1 FALHOU: org_criada'; end if;
  if not exists (select 1 from public.product_events where kind = 'cliente_adicionado' and org_id = current_setting('c.org')::uuid) then raise exception 'PROVA M1 FALHOU: cliente_adicionado'; end if;
  if not exists (select 1 from public.product_events where kind = 'plano_atribuido' and org_id = current_setting('c.org')::uuid) then raise exception 'PROVA M1 FALHOU: plano_atribuido'; end if;
  if not exists (select 1 from public.product_events where kind = 'sessao_ao_vivo_concluida' and org_id = current_setting('c.org')::uuid) then raise exception 'PROVA M1 FALHOU: sessão ao vivo'; end if;
  if exists (select 1 from public.product_events e join public.persons p on e.props::text ilike '%' || p.full_name || '%') then raise exception 'PROVA M1 FALHOU: nome num evento'; end if;
  begin
    insert into public.product_events (kind, org_id, props) values ('cliente_adicionado', current_setting('c.org')::uuid, '{"nome":"Carla Cliente"}');
    raise exception 'PROVA M1 FALHOU: aceitou um nome';
  exception when check_violation then null;
  end;
  begin
    insert into public.product_events (kind, org_id, props) values ('cliente_adicionado', current_setting('c.org')::uuid, '{"origem":"Carla Cliente 912345678"}');
    raise exception 'PROVA M1 FALHOU: aceitou texto livre';
  exception when check_violation then null;
  end;
end $$;

-- ---------- PROVA M2: recusar a análise tira a pessoa de qualquer métrica individual ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
select public.set_analytics_consent(false);
do $$ begin
  if public.my_analytics_consent() then raise exception 'PROVA M2 FALHOU: consentimento'; end if;
  begin
    perform 1 from public.product_events limit 1;
    raise exception 'PROVA M2 FALHOU: cliente lê os eventos';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('m.p', (select id::text from public.persons where user_id = '00000000-0000-0000-0000-0000000e0003'), false);
reset role;
do $$ begin
  if exists (select 1 from public.product_events where person_id = current_setting('m.p')::uuid or actor_user = '00000000-0000-0000-0000-0000000e0003') then
    raise exception 'PROVA M2 FALHOU: ficou nas métricas individuais';
  end if;
end $$;
-- Um treino feito depois de recusar conta só no agregado
insert into public.sessions (person_id, org_id, link_id, phase, started_at, ended_at)
  values (current_setting('m.p')::uuid, current_setting('c.org')::uuid, current_setting('c.link')::uuid, 'done', now() - interval '1 hour', now());
do $$ begin
  if not exists (select 1 from public.product_events where kind = 'treino_app_feito' and person_id is null and created_at > now() - interval '1 minute') then
    raise exception 'PROVA M2 FALHOU: o agregado perdeu o treino';
  end if;
end $$;

-- ---------- PROVA M3: o painel é só da equipa da LunaOS ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona de um estúdio
do $$ begin
  perform public.activation_metrics(8);
  raise exception 'PROVA M3 FALHOU: a dona vê o painel interno';
exception when insufficient_privilege then null;
end $$;
reset role;
insert into public.platform_staff (user_id) values ('00000000-0000-0000-0000-0000000e0002');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ declare m jsonb := public.activation_metrics(8);
begin
  if jsonb_array_length(m->'semanas') <> 8 or (m->>'organizacoes')::int < 1 then raise exception 'PROVA M3 FALHOU: %', m; end if;
end $$;
reset role;
delete from public.platform_staff;

select '✅ Métricas: TODAS AS PROVAS PASSARAM' as resultado;
