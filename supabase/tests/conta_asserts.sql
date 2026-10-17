-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 05: consentimentos, PAR-Q, G-29,
-- encarregado (J31) e convite de cliente. Corre depois de rls_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0001', 'dona@conta.test'),
  ('00000000-0000-0000-0000-0000000e0002', 'pt@conta.test'),
  ('00000000-0000-0000-0000-0000000e0003', 'cliente@conta.test'),
  ('00000000-0000-0000-0000-0000000e0004', 'menor@conta.test'),
  ('00000000-0000-0000-0000-0000000e0005', 'mae@conta.test');

-- Organização: dona + 1 PT
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select set_config('c.org', public.create_organization('Estúdio Conta', 'studio')::text, false);
select set_config('c.inv', public.create_invite(current_setting('c.org')::uuid, 'pt@conta.test', 'coach'), false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select public.accept_invite(current_setting('c.inv'));
select set_config('c.m_pt', public.my_membership_id(current_setting('c.org')::uuid)::text, false);

-- ---------- PROVA C1: convite de cliente funde a pessoa gerida com a conta ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select set_config('c.link', public.add_client(current_setting('c.org')::uuid, 'Carla Cliente', 'cliente@conta.test',
                                              null, null, current_setting('c.m_pt')::uuid)::text, false);
-- a equipa regista uma medida antes de a pessoa ter conta
insert into public.measurements (person_id, org_id, metric_key, value, unit)
  select person_id, current_setting('c.org')::uuid, 'peso', 61, 'kg' from public.clients where id = current_setting('c.link')::uuid;
select set_config('c.tok', public.create_link_invite(current_setting('c.link')::uuid, 'cliente@conta.test'), false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
select public.accept_link_invite(current_setting('c.tok'), array['training']::public.share_category[]);
do $$ begin
  if (select count(*) from public.measurements) <> 1 then
    raise exception 'PROVA C1 FALHOU: a medida registada pela equipa devia passar para a conta';
  end if;
  if not exists (select 1 from public.links where id = current_setting('c.link')::uuid and person_id = public.my_person_id()) then
    raise exception 'PROVA C1 FALHOU: a ligação não passou para a conta';
  end if;
  if not exists (select 1 from public.consents where kind = 'partilha_org' and person_id = public.my_person_id()) then
    raise exception 'PROVA C1 FALHOU: consentimento da partilha não registado';
  end if;
  begin
    perform public.accept_link_invite(current_setting('c.tok'), array['training']::public.share_category[]);
    raise exception 'PROVA C1 FALHOU: convite reutilizado';
  exception when invalid_parameter_value then null;
  end;
end $$;
-- só partilhou treino: o PT deixa de ver as medidas
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if exists (select 1 from public.measurements) then raise exception 'PROVA C1 FALHOU: medidas visíveis sem partilha'; end if;
end $$;

-- ---------- PROVA C2: consentimentos só de acrescentar ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);
select public.record_consent('comunicacoes', '1', true);
select public.record_consent('comunicacoes', '1', false);
do $$ begin
  if (select count(*) from public.consents where kind = 'comunicacoes') <> 2 then
    raise exception 'PROVA C2 FALHOU: os dois consentimentos deviam ficar';
  end if;
  if (select granted from public.consents_current where kind = 'comunicacoes') then
    raise exception 'PROVA C2 FALHOU: o consentimento atual devia ser o último (retirado)';
  end if;
  begin
    delete from public.consents;
    raise exception 'PROVA C2 FALHOU: consentimento apagado';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA C3: PAR-Q com risco cria pendência e bloqueia a 1.ª sessão ----------
do $$ begin
  if not public.submit_parq('{"coracao": false, "dor_peito": true, "tonturas": false}'::jsonb) then
    raise exception 'PROVA C3 FALHOU: um Sim devia contar como risco';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT responsável
do $$ begin
  if not exists (select 1 from public.pendencias where link_id = current_setting('c.link')::uuid
                 and kind = 'parq_atestado' and status = 'aberta' and membership_id = current_setting('c.m_pt')::uuid) then
    raise exception 'PROVA C3 FALHOU: pendência do atestado não chegou ao responsável';
  end if;
  if exists (select 1 from public.parq_responses) then
    raise exception 'PROVA C3 FALHOU: a equipa vê as respostas do PAR-Q';
  end if;
  if public.client_aptidao(current_setting('c.link')::uuid) <> 'atestado_em_falta' then
    raise exception 'PROVA C3 FALHOU: estado devia ser atestado_em_falta';
  end if;
  begin
    insert into public.sessions (person_id, org_id, link_id, membership_id, phase)
      select person_id, current_setting('c.org')::uuid, id, current_setting('c.m_pt')::uuid, 'live'
      from public.clients where id = current_setting('c.link')::uuid;
    raise exception 'PROVA C3 FALHOU: primeira sessão permitida sem atestado';
  exception when check_violation then null;
  end;
  -- o PT (sem papel clínico) não regista o atestado
  begin
    perform public.record_restriction(current_setting('c.link')::uuid, 'atestado');
    raise exception 'PROVA C3 FALHOU: PT sem papel clínico registou atestado';
  exception when insufficient_privilege then null;
  end;
end $$;
-- a dona (clínica) sem dois fatores não regista; com dois fatores sim
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
do $$ begin
  begin
    perform public.record_restriction(current_setting('c.link')::uuid, 'atestado');
    raise exception 'PROVA C3 FALHOU: atestado registado sem dois fatores';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.aal', 'aal2', false);
select public.record_restriction(current_setting('c.link')::uuid, 'atestado', 'Atestado de 17/10', current_date + 365);
select set_config('app.aal', '', false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if public.client_aptidao(current_setting('c.link')::uuid) <> 'livre' then
    raise exception 'PROVA C3 FALHOU: com atestado devia ficar livre';
  end if;
  if exists (select 1 from public.pendencias where link_id = current_setting('c.link')::uuid and status = 'aberta') then
    raise exception 'PROVA C3 FALHOU: pendência não resolvida';
  end if;
  if exists (select 1 from public.restrictions) then
    raise exception 'PROVA C3 FALHOU: PT sem papel clínico vê o detalhe da restrição';
  end if;
  insert into public.sessions (person_id, org_id, link_id, membership_id, phase)
    select person_id, current_setting('c.org')::uuid, id, current_setting('c.m_pt')::uuid, 'live'
    from public.clients where id = current_setting('c.link')::uuid;
end $$;

-- ---------- PROVA C4: menor fica à espera do encarregado (J31) ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0004', false);   -- menor
update public.persons set birth_date = current_date - interval '15 years' where user_id = '00000000-0000-0000-0000-0000000e0004';
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select set_config('c.link_m', public.add_client(current_setting('c.org')::uuid, 'Miguel Menor', 'menor@conta.test',
                                                null, null, current_setting('c.m_pt')::uuid)::text, false);
select set_config('c.tok_m', public.create_link_invite(current_setting('c.link_m')::uuid), false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0004', false);
do $$ begin
  if public.accept_link_invite(current_setting('c.tok_m'), array['training','measurements']::public.share_category[]) <> 'a_espera_encarregado' then
    raise exception 'PROVA C4 FALHOU: menor ligou-se sem encarregado';
  end if;
  if exists (select 1 from public.links where id = current_setting('c.link_m')::uuid and person_id = public.my_person_id()) then
    raise exception 'PROVA C4 FALHOU: a ligação passou para o menor sem encarregado';
  end if;
end $$;
-- a equipa é avisada (pendência), e o pedido ao encarregado sai por email e SMS
reset role;
do $$ begin
  if not exists (select 1 from public.pendencias where link_id = current_setting('c.link_m')::uuid and kind = 'encarregado_em_falta') then
    raise exception 'PROVA C4 FALHOU: a equipa não foi avisada do encarregado em falta';
  end if;
end $$;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0004', false);
select set_config('c.tok_g', public.request_guardian('mae@conta.test', '+351910000000'), false);
reset role;
do $$ begin
  if (select count(*) from public.outbox where template = 'pedido_encarregado') <> 2 then
    raise exception 'PROVA C4 FALHOU: pedido não saiu por email e SMS';
  end if;
end $$;
set role authenticated;
-- o encarregado autoriza com conta própria e assina como pagador
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0005', false);
select public.accept_guardianship(current_setting('c.tok_g'), true);
-- agora o menor liga-se e partilha treino e medidas com o ginásio
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0004', false);
select public.accept_link_invite(current_setting('c.tok_m'), array['training','measurements']::public.share_category[]);
insert into public.measurements (person_id, metric_key, value, unit) values (public.my_person_id(), 'altura', 160, 'cm');
-- com o encarregado partilha só o treino
select public.set_guardian_shares(array['training']::public.share_category[]);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0005', false);
do $$ begin
  if exists (select 1 from public.measurements) then
    raise exception 'PROVA C4 FALHOU: o encarregado vê o que o menor não partilhou com ele';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0004', false);
select public.set_guardian_shares(array['training','measurements']::public.share_category[]);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0005', false);
do $$ begin
  if (select count(*) from public.measurements) <> 1 then
    raise exception 'PROVA C4 FALHOU: o encarregado devia ver as medidas partilhadas';
  end if;
end $$;
-- o menor revoga: o encarregado deixa de ver
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0004', false);
select public.set_guardian_shares(array[]::public.share_category[]);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0005', false);
do $$ begin
  if exists (select 1 from public.measurements) then
    raise exception 'PROVA C4 FALHOU: revogação não cortou o encarregado';
  end if;
end $$;
reset role;

-- ---------- PROVA C5: aos 18 anos a conta passa só para o menor ----------
update public.persons set birth_date = current_date - interval '18 years' where user_id = '00000000-0000-0000-0000-0000000e0004';
do $$ begin
  if public._fim_tutela_maiores() < 1 then raise exception 'PROVA C5 FALHOU: a tutela não acabou aos 18'; end if;
  if exists (select 1 from public.guardianships g join public.persons p on p.id = g.minor_person_id
             where p.user_id = '00000000-0000-0000-0000-0000000e0004' and g.status = 'active') then
    raise exception 'PROVA C5 FALHOU: tutela ainda ativa';
  end if;
end $$;

-- ---------- PROVA C6: G-29 por zona; a equipa vê o efeito, não a causa ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select set_config('app.aal', 'aal2', false);
select public.record_restriction(current_setting('c.link')::uuid, 'adaptar', 'Rotura do LCA (2024)', null, 'Joelho esquerdo', current_date + 20);
select set_config('app.aal', '', false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT sem papel clínico
do $$ declare r record;
begin
  if public.client_aptidao(current_setting('c.link')::uuid) <> 'restricao' then
    raise exception 'PROVA C6 FALHOU: adaptar uma zona devia dar restricao';
  end if;
  select * into r from public.client_restricoes_efeito(current_setting('c.link')::uuid);
  if r.zone <> 'Joelho esquerdo' or r.kind <> 'adaptar' then
    raise exception 'PROVA C6 FALHOU: o PT devia ver o efeito por zona';
  end if;
  if exists (select 1 from public.restrictions) then
    raise exception 'PROVA C6 FALHOU: o PT vê a causa (diagnóstico)';
  end if;
end $$;
reset role;

select '✅ Conta, PAR-Q, G-29 e encarregado: TODAS AS PROVAS PASSARAM' as resultado;
