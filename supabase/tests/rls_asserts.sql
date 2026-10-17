-- ============================================================
-- LUNA.OS v3 · Provas SQL do modelo de dados (PostgreSQL 16)
-- Cada bloco lança EXCEPTION se a garantia falhar. Inclui casos negativos:
-- outra organização, papel sem permissão, partilha revogada.
-- Corre depois das migrações, numa base vazia (sem seeds).
-- auth.uid() lê app.uid (shim de scripts/db-setup.sh e do CI).
-- ============================================================
\set ON_ERROR_STOP on

-- ---------- Contas (o trigger cria a pessoa, sem papel) ----------
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a501', 'rui@solo.test'),     -- PT independente
  ('00000000-0000-0000-0000-00000000b001', 'dona@estudio.test'), -- dona do estúdio
  ('00000000-0000-0000-0000-00000000b002', 'pt1@estudio.test'),
  ('00000000-0000-0000-0000-00000000b003', 'pt2@estudio.test'),
  ('00000000-0000-0000-0000-00000000b004', 'pt3@estudio.test'),
  ('00000000-0000-0000-0000-00000000c001', 'cliente@app.test'),  -- cliente com conta
  ('00000000-0000-0000-0000-00000000d001', 'novo@registo.test'); -- registo sem convite

do $$ begin
  if (select count(*) from public.persons where user_id is not null) <> 7 then
    raise exception 'PROVA 0 FALHOU: o registo não criou as pessoas';
  end if;
  if exists (select 1 from public.memberships) then
    raise exception 'PROVA 0 FALHOU: conta nova já tem papel (AUD-71)';
  end if;
end $$;

-- ---------- PROVA 1: criar organização (PT independente) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000a501', false);
select set_config('t.solo', public.create_organization('Rui Treino', 'solo_coach')::text, false);
do $$
declare o uuid := current_setting('t.solo')::uuid;
begin
  if not public.has_perm(o, 'org.manage') then raise exception 'PROVA 1 FALHOU: dono sem permissões'; end if;
  if (select seats from public.subscriptions where org_id = o) <> 1 then raise exception 'PROVA 1 FALHOU: lugares'; end if;
  if (select status from public.subscriptions where org_id = o) <> 'trial' then raise exception 'PROVA 1 FALHOU: experimental'; end if;
  if not public.has_module(o, 'clients') or public.has_module(o, 'business') then
    raise exception 'PROVA 1 FALHOU: direitos do plano Treinador';
  end if;
  if (select count(*) from public.org_sports where org_id = o and sport_id = 'fitness') <> 1 then
    raise exception 'PROVA 1 FALHOU: modalidade fitness';
  end if;
  if (select count(*) from public.my_orgs()) <> 1 then raise exception 'PROVA 1 FALHOU: my_orgs'; end if;
end $$;
-- cliente do PT independente + biblioteca
select set_config('t.solo_link', public.add_client(current_setting('t.solo')::uuid, 'Cliente do Rui', 'x@solo.test')::text, false);
insert into public.exercises (org_id, name) values (current_setting('t.solo')::uuid, 'Agachamento do Rui');
reset role;

-- ---------- PROVA 2: estúdio com 3 PT, lugares e convites ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);
select set_config('t.studio', public.create_organization('Estúdio Lua', 'studio')::text, false);
select set_config('t.inv1', public.create_invite(current_setting('t.studio')::uuid, 'pt1@estudio.test', 'coach'), false);
select set_config('t.inv2', public.create_invite(current_setting('t.studio')::uuid, 'pt2@estudio.test', 'coach'), false);
do $$ begin
  -- 3 lugares: dona + 2 PT. O terceiro PT pede confirmação.
  begin
    perform public.create_invite(current_setting('t.studio')::uuid, 'pt3@estudio.test', 'coach');
    raise exception 'PROVA 2 FALHOU: convite acima dos lugares sem confirmação';
  exception when raise_exception then
    if sqlerrm <> 'seats_exceeded' then raise; end if;
  end;
end $$;
select set_config('t.inv3', public.create_invite(current_setting('t.studio')::uuid, 'pt3@estudio.test', 'coach', null, true), false);
do $$ begin
  if (select seats from public.subscriptions where org_id = current_setting('t.studio')::uuid) <> 4 then
    raise exception 'PROVA 2 FALHOU: lugar extra confirmado não foi somado';
  end if;
  if exists (select 1 from public.invites where token_hash = current_setting('t.inv1')) then
    raise exception 'PROVA 2 FALHOU: código do convite guardado em claro';
  end if;
end $$;
-- o PT2 não pode aceitar o convite do PT1
select set_config('app.uid', '00000000-0000-0000-0000-00000000b003', false);
do $$ begin
  begin
    perform public.accept_invite(current_setting('t.inv1'));
    raise exception 'PROVA 2 FALHOU: convite aceite por outro email';
  exception when insufficient_privilege then null;
  end;
end $$;
select public.accept_invite(current_setting('t.inv2'));
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);
select public.accept_invite(current_setting('t.inv1'));
select set_config('app.uid', '00000000-0000-0000-0000-00000000b004', false);
select public.accept_invite(current_setting('t.inv3'));
do $$ begin
  begin
    perform public.accept_invite(current_setting('t.inv3'));
    raise exception 'PROVA 2 FALHOU: convite reutilizado';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- a dona acrescenta um cliente a cada PT
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);
select set_config('t.m_pt1', (select m.id from public.staff m where m.email = 'pt1@estudio.test')::text, false);
select set_config('t.m_pt2', (select m.id from public.staff m where m.email = 'pt2@estudio.test')::text, false);
select set_config('t.m_dona', public.my_membership_id(current_setting('t.studio')::uuid)::text, false);
select set_config('t.link_a', public.add_client(current_setting('t.studio')::uuid, 'Ana', 'ana@x.test', null, null,
                                                current_setting('t.m_pt1')::uuid)::text, false);
select set_config('t.link_b', public.add_client(current_setting('t.studio')::uuid, 'Bruno', 'bruno@x.test', null, null,
                                                current_setting('t.m_pt2')::uuid)::text, false);
do $$ begin
  begin
    perform public.add_client(current_setting('t.studio')::uuid, 'Ana outra vez', 'ANA@x.test');
    raise exception 'PROVA 2 FALHOU: cliente duplicado aceite';
  exception when unique_violation then null;
  end;
end $$;
reset role;

-- ---------- PROVA 3: dois PT da mesma organização veem os clientes que lhes cabem ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1
do $$ begin
  if (select count(*) from public.clients) <> 1
     or not exists (select 1 from public.clients where full_name = 'Ana') then
    raise exception 'PROVA 3 FALHOU: PT1 devia ver só a Ana (vê %)', (select count(*) from public.clients);
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b003', false);   -- PT2
do $$ begin
  if (select count(*) from public.clients) <> 1
     or not exists (select 1 from public.clients where full_name = 'Bruno') then
    raise exception 'PROVA 3 FALHOU: PT2 devia ver só o Bruno';
  end if;
  -- PT2 não reatribui o cliente do PT1 (não o vê)
  update public.links set client_status = 'blocked' where id = current_setting('t.link_a')::uuid;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);   -- dona
do $$ begin
  if (select count(*) from public.clients) <> 2 then raise exception 'PROVA 3 FALHOU: a dona devia ver os 2'; end if;
  if (select client_status from public.links where id = current_setting('t.link_a')::uuid) <> 'active' then
    raise exception 'PROVA 3 FALHOU: PT2 alterou um cliente que não é seu';
  end if;
end $$;
reset role;

-- ---------- PROVA 4: uma organização não lê nem escreve dados de outra ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000a501', false);   -- Rui (solo)
do $$ begin
  if exists (select 1 from public.organizations where id = current_setting('t.studio')::uuid)
     or exists (select 1 from public.clients where org_id = current_setting('t.studio')::uuid)
     or exists (select 1 from public.memberships where org_id = current_setting('t.studio')::uuid)
     or exists (select 1 from public.subscriptions where org_id = current_setting('t.studio')::uuid) then
    raise exception 'PROVA 4 FALHOU: o PT independente vê dados do estúdio';
  end if;
  begin
    insert into public.exercises (org_id, name) values (current_setting('t.studio')::uuid, 'Intruso');
    raise exception 'PROVA 4 FALHOU: escreveu na biblioteca de outra organização';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_client(current_setting('t.studio')::uuid, 'Intruso');
    raise exception 'PROVA 4 FALHOU: criou cliente noutra organização';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.has_booking_conflict(current_setting('t.studio')::uuid, current_setting('t.m_pt1')::uuid,
                                        now(), now() + interval '1 hour');
    raise exception 'PROVA 4 FALHOU: espreitou a agenda de outra organização';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);   -- dona do estúdio
do $$ begin
  if exists (select 1 from public.exercises where org_id = current_setting('t.solo')::uuid)
     or exists (select 1 from public.clients where org_id = current_setting('t.solo')::uuid) then
    raise exception 'PROVA 4 FALHOU: o estúdio vê dados do PT independente';
  end if;
end $$;
reset role;
-- chaves compostas: nem o servidor liga dados de organizações diferentes
do $$ begin
  begin
    insert into public.bookings (org_id, link_id, type, starts_at, ends_at)
      values (current_setting('t.studio')::uuid, current_setting('t.solo_link')::uuid, 'training',
              '2026-07-01 09:00+00', '2026-07-01 10:00+00');
    raise exception 'PROVA 4 FALHOU: marcação ligada a cliente de outra organização';
  exception when foreign_key_violation then null;
  end;
end $$;

-- ---------- PROVA 5: dado da pessoa só com ligação e partilha; revogar corta ----------
-- O cliente com conta liga-se ao estúdio (PT1 responsável) e partilha treino e medidas.
do $$
declare
  v_person uuid := (select id from public.persons where user_id = '00000000-0000-0000-0000-00000000c001');
  v_link uuid;
begin
  insert into public.links (org_id, person_id, type, origin, responsible_membership_id)
    values (current_setting('t.studio')::uuid, v_person, 'pt_client', 'athlete_code', current_setting('t.m_pt1')::uuid)
    returning id into v_link;
  insert into public.link_shares (org_id, link_id, person_id, category) values
    (current_setting('t.studio')::uuid, v_link, v_person, 'training'),
    (current_setting('t.studio')::uuid, v_link, v_person, 'measurements');
  perform set_config('t.link_c', v_link::text, false);
  perform set_config('t.person_c', v_person::text, false);
end $$;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000c001', false);   -- o próprio cliente
insert into public.measurements (person_id, metric_key, value, unit)
  values (current_setting('t.person_c')::uuid, 'peso', 70, 'kg');
insert into public.allergies (person_id, allergen, severity)
  values (current_setting('t.person_c')::uuid, 'Amendoim', 'severe');
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1 (responsável)
do $$ begin
  if (select count(*) from public.measurements) <> 1 then raise exception 'PROVA 5 FALHOU: PT1 devia ler a medida partilhada'; end if;
  if exists (select 1 from public.allergies) then raise exception 'PROVA 5 FALHOU: alergias lidas sem a função de saúde'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b003', false);   -- PT2 (não é responsável)
do $$ begin
  if exists (select 1 from public.measurements) then raise exception 'PROVA 5 FALHOU: PT2 lê dados de cliente que não é seu'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000a501', false);   -- Rui (outra org)
do $$ begin
  if exists (select 1 from public.measurements) then raise exception 'PROVA 5 FALHOU: outra organização lê o dado'; end if;
end $$;
-- a pessoa revoga a partilha das medidas
select set_config('app.uid', '00000000-0000-0000-0000-00000000c001', false);
update public.link_shares set revoked_at = now()
  where link_id = current_setting('t.link_c')::uuid and category = 'measurements' and revoked_at is null;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1, leitura seguinte
do $$ begin
  if exists (select 1 from public.measurements) then raise exception 'PROVA 5 FALHOU: revogação não cortou a leitura seguinte'; end if;
end $$;
-- a organização não pode reativar a partilha de quem tem conta
do $$ begin
  begin
    insert into public.link_shares (org_id, link_id, person_id, category)
      values (current_setting('t.studio')::uuid, current_setting('t.link_c')::uuid,
              current_setting('t.person_c')::uuid, 'measurements');
    raise exception 'PROVA 5 FALHOU: a organização reativou a partilha da pessoa';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- PROVA 6: saúde só com papel clínico e partilha; cada leitura fica registada ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);   -- dona (tem health.read)
do $$ begin
  begin
    perform public.get_person_health(current_setting('t.link_c')::uuid);
    raise exception 'PROVA 6 FALHOU: saúde lida sem partilha';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000c001', false);
insert into public.link_shares (org_id, link_id, person_id, category)
  values (current_setting('t.studio')::uuid, current_setting('t.link_c')::uuid, current_setting('t.person_c')::uuid, 'health');
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1 (sem papel clínico)
do $$ begin
  begin
    perform public.get_person_health(current_setting('t.link_c')::uuid);
    raise exception 'PROVA 6 FALHOU: PT sem papel clínico leu saúde';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);
-- sem dois fatores (aal1) a saúde não abre, mesmo com papel clínico e partilha (D18)
do $$ begin
  begin
    perform public.get_person_health(current_setting('t.link_c')::uuid);
    raise exception 'PROVA 6 FALHOU: saúde lida sem dois fatores';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.aal', 'aal2', false);
do $$ declare j jsonb;
begin
  -- fora da carteira, abrir a saúde pede motivo (G-45)
  begin
    perform public.get_person_health(current_setting('t.link_c')::uuid);
    raise exception 'PROVA 6 FALHOU: saúde fora da carteira sem motivo';
  exception when check_violation then null;
  end;
  j := public.get_person_health(current_setting('t.link_c')::uuid, 'Vai treinar comigo hoje');
  if jsonb_array_length(j->'allergies') <> 1 then raise exception 'PROVA 6 FALHOU: alergia em falta'; end if;
  -- nem com dois fatores a tabela se lê diretamente (sem registo da leitura)
  if exists (select 1 from public.allergies) then raise exception 'PROVA 6 FALHOU: alergias lidas sem registo'; end if;
end $$;
select set_config('app.aal', '', false);
reset role;
do $$ begin
  if (select count(*) from public.health_access_log where person_id = current_setting('t.person_c')::uuid) <> 1 then
    raise exception 'PROVA 6 FALHOU: leitura de saúde não registada';
  end if;
end $$;

-- ---------- PROVA 7: ninguém muda o próprio papel (AUD-69) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1
do $$ begin
  begin
    insert into public.membership_roles (org_id, membership_id, role_id)
      select current_setting('t.studio')::uuid, current_setting('t.m_pt1')::uuid, r.id
      from public.roles r where r.key = 'owner' and r.org_id is null;
    raise exception 'PROVA 7 FALHOU: PT1 deu a si próprio o papel de dono';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.persons set user_id = null where user_id = '00000000-0000-0000-0000-00000000b002';
    raise exception 'PROVA 7 FALHOU: mudou a ligação da própria conta';
  exception when insufficient_privilege then null;
  end;
  -- o perfil continua editável nas colunas do perfil
  update public.persons set full_name = 'PT Um' where user_id = '00000000-0000-0000-0000-00000000b002';
  if (select full_name from public.persons where user_id = '00000000-0000-0000-0000-00000000b002') <> 'PT Um' then
    raise exception 'PROVA 7 FALHOU: edição normal do perfil bloqueada';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);   -- a dona também não se mexe a si
do $$ begin
  begin
    insert into public.membership_roles (org_id, membership_id, role_id)
      select current_setting('t.studio')::uuid, current_setting('t.m_dona')::uuid, r.id
      from public.roles r where r.key = 'clinician' and r.org_id is null;
    raise exception 'PROVA 7 FALHOU: a dona alterou os próprios papéis';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- PROVA 8: exportar só o que é seu (AUD-70) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1
do $$ declare j jsonb;
begin
  begin
    perform public.export_org_data(current_setting('t.studio')::uuid);
    raise exception 'PROVA 8 FALHOU: PT sem gestão exportou a organização';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.export_org_data(current_setting('t.solo')::uuid);
    raise exception 'PROVA 8 FALHOU: exportou outra organização';
  exception when insufficient_privilege then null;
  end;
  j := public.export_my_data();
  if j->'person'->>'email' <> 'pt1@estudio.test' then raise exception 'PROVA 8 FALHOU: exportou outra pessoa'; end if;
  if jsonb_array_length(j->'measurements') <> 0 then raise exception 'PROVA 8 FALHOU: exportou medidas de outra pessoa'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);   -- dona
do $$ declare j jsonb;
begin
  j := public.export_org_data(current_setting('t.studio')::uuid);
  if jsonb_array_length(j->'clients') <> 3 then raise exception 'PROVA 8 FALHOU: export da organização incompleto'; end if;
  if j ? 'measurements' or j ? 'allergies' then raise exception 'PROVA 8 FALHOU: export da organização leva dados da pessoa'; end if;
end $$;
reset role;

-- ---------- PROVA 9: um registo novo sem convite não vê nada ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000d001', false);
do $$ begin
  if exists (select 1 from public.organizations) or exists (select 1 from public.clients)
     or exists (select 1 from public.memberships) or exists (select 1 from public.exercises)
     or exists (select 1 from public.bookings) or exists (select 1 from public.measurements)
     or exists (select 1 from public.audit_log) then
    raise exception 'PROVA 9 FALHOU: conta sem convite vê dados';
  end if;
  if (select count(*) from public.persons) <> 1 then raise exception 'PROVA 9 FALHOU: vê outras pessoas'; end if;
  if exists (select 1 from public.my_orgs()) then raise exception 'PROVA 9 FALHOU: tem organizações'; end if;
  if public.has_module(current_setting('t.studio')::uuid, 'clients') then raise exception 'PROVA 9 FALHOU: tem módulos'; end if;
end $$;
reset role;

-- ---------- PROVA 10: anon não lê tabelas nem executa funções ----------
do $$ declare n int;
begin
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
  if n > 0 then raise exception 'PROVA 10 FALHOU: anon executa % funções', n; end if;
  select count(*) into n
  from pg_tables t where t.schemaname = 'public' and has_table_privilege('anon', format('public.%I', t.tablename), 'select');
  if n > 0 then raise exception 'PROVA 10 FALHOU: anon lê % tabelas', n; end if;
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname like '\_%' and has_function_privilege('authenticated', p.oid, 'execute');
  if n > 0 then raise exception 'PROVA 10 FALHOU: % funções internas executáveis pelo cliente', n; end if;
end $$;

-- ---------- PROVA 11: auditoria só de acrescentar ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);
do $$ begin
  if not exists (select 1 from public.audit_log where entity = 'links') then
    raise exception 'PROVA 11 FALHOU: auditoria vazia';
  end if;
  begin
    delete from public.audit_log;
    raise exception 'PROVA 11 FALHOU: auditoria apagada';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.audit_log set action = 'x';
    raise exception 'PROVA 11 FALHOU: auditoria alterada';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- PROVA 12: agenda sem sobreposição e lista de espera com lotação ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1
insert into public.bookings (org_id, membership_id, link_id, type, status, starts_at, ends_at)
  values (current_setting('t.studio')::uuid, current_setting('t.m_pt1')::uuid, current_setting('t.link_a')::uuid,
          'training', 'confirmed', '2026-07-01 09:00+00', '2026-07-01 10:00+00');
do $$ begin
  begin
    insert into public.bookings (org_id, membership_id, link_id, type, status, starts_at, ends_at)
      values (current_setting('t.studio')::uuid, current_setting('t.m_pt1')::uuid, current_setting('t.link_a')::uuid,
              'training', 'pending', '2026-07-01 09:30+00', '2026-07-01 10:30+00');
    raise exception 'PROVA 12 FALHOU: sobreposição aceite';
  exception when exclusion_violation then null;
  end;
  if not public.has_booking_conflict(current_setting('t.studio')::uuid, current_setting('t.m_pt1')::uuid,
                                     '2026-07-01 09:30+00', '2026-07-01 09:45+00') then
    raise exception 'PROVA 12 FALHOU: conflito não detetado';
  end if;
  -- PT1 não marca na agenda do PT2
  begin
    insert into public.bookings (org_id, membership_id, type, status, starts_at, ends_at)
      values (current_setting('t.studio')::uuid, current_setting('t.m_pt2')::uuid,
              'training', 'pending', '2026-07-02 09:00+00', '2026-07-02 10:00+00');
    raise exception 'PROVA 12 FALHOU: PT1 marcou na agenda do PT2';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b001', false);   -- dona
-- aula com 1 lugar: Ana inscrita, Bruno em espera no mesmo horário, Cliente noutro horário
insert into public.classes (id, org_id, name, capacity)
  values ('00000000-0000-0000-0000-0000000c1a55', current_setting('t.studio')::uuid, 'Aula 1 lugar', 1);
insert into public.bookings (id, org_id, class_id, membership_id, link_id, type, status, starts_at, ends_at)
  values ('00000000-0000-0000-0000-00000000b0c1', current_setting('t.studio')::uuid, '00000000-0000-0000-0000-0000000c1a55',
          current_setting('t.m_dona')::uuid, current_setting('t.link_a')::uuid, 'class', 'confirmed',
          '2026-07-03 18:00+00', '2026-07-03 19:00+00');
insert into public.waitlist (org_id, link_id, class_id, requested_starts_at, priority) values
  (current_setting('t.studio')::uuid, current_setting('t.link_c')::uuid, '00000000-0000-0000-0000-0000000c1a55', '2026-07-10 18:00+00', 1),
  (current_setting('t.studio')::uuid, current_setting('t.link_b')::uuid, '00000000-0000-0000-0000-0000000c1a55', '2026-07-03 18:00+00', 2);
update public.bookings set status = 'cancelled' where id = '00000000-0000-0000-0000-00000000b0c1';
do $$ begin
  if not exists (select 1 from public.bookings
                 where link_id = current_setting('t.link_b')::uuid and source = 'waitlist'
                   and starts_at = '2026-07-03 18:00+00' and status = 'confirmed') then
    raise exception 'PROVA 12 FALHOU: o Bruno não foi promovido';
  end if;
  if (select status from public.waitlist where link_id = current_setting('t.link_c')::uuid) <> 'waiting' then
    raise exception 'PROVA 12 FALHOU: promovido de outro horário';
  end if;
end $$;
reset role;

-- ---------- PROVA 13: séries sem duplicados e sessão herdada ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1, sessão da cliente com conta
do $$
declare s uuid; se uuid;
begin
  insert into public.sessions (person_id, org_id, link_id, membership_id, phase, started_at)
    values (current_setting('t.person_c')::uuid, current_setting('t.studio')::uuid, current_setting('t.link_c')::uuid,
            current_setting('t.m_pt1')::uuid, 'live', now())
    returning id into s;
  insert into public.session_exercises (session_id, position) values (s, 0) returning id into se;
  insert into public.session_sets (session_id, session_exercise_id, set_index, reps) values (s, se, 1, 10);
  if (select org_id from public.session_sets where session_exercise_id = se) <> current_setting('t.studio')::uuid then
    raise exception 'PROVA 13 FALHOU: série não herdou a organização';
  end if;
  begin
    insert into public.session_sets (session_id, session_exercise_id, set_index, reps) values (s, se, 1, 8);
    raise exception 'PROVA 13 FALHOU: série duplicada aceite';
  exception when unique_violation then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000b003', false);   -- PT2 não escreve treino de quem não é seu
do $$ begin
  begin
    insert into public.sessions (person_id, org_id, phase)
      values (current_setting('t.person_c')::uuid, current_setting('t.studio')::uuid, 'live');
    raise exception 'PROVA 13 FALHOU: PT2 escreveu treino de cliente que não é seu';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- ---------- PROVA 14: nenhum token em texto simples ----------
do $$ declare n int;
begin
  select count(*) into n from information_schema.columns
  where table_schema = 'public' and column_name ilike '%token%'
    and column_name not like '%secret_id' and column_name <> 'token_hash';
  if n > 0 then raise exception 'PROVA 14 FALHOU: % colunas com tokens em texto simples', n; end if;
end $$;

-- ---------- PROVA 15: desligar corta o acesso na leitura seguinte (J37) ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000c001', false);
select public.end_link(current_setting('t.link_c')::uuid);
select set_config('app.uid', '00000000-0000-0000-0000-00000000b002', false);   -- PT1
do $$ begin
  if exists (select 1 from public.sessions where person_id = current_setting('t.person_c')::uuid) then
    raise exception 'PROVA 15 FALHOU: depois de desligar, o PT ainda lê o treino';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000c001', false);
do $$ begin
  if not exists (select 1 from public.sessions) then
    raise exception 'PROVA 15 FALHOU: o que a pessoa registou devia ficar com ela';
  end if;
end $$;
reset role;

select '✅ RLS v3: TODAS AS PROVAS PASSARAM' as resultado;
