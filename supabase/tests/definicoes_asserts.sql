-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 10: importar clientes com relatório
-- de falhas, auditoria imutável e aviso de título a expirar.
-- Corre depois de ficha_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

-- ---------- PROVA S1: importar com comprovativo das linhas que falharam ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
do $$ begin
  if (select count(*) from public.import_check(current_setting('c.org')::uuid, '[
    {"linha": 2, "nome": "A", "telefone": "912345678"},
    {"linha": 3, "nome": "B", "email": "nova@x.test"},
    {"linha": 4, "nome": "C", "email": "NOVA@x.test"}]'::jsonb)) <> 2 then
    raise exception 'PROVA S1 FALHOU: a verificação prévia não apanhou os duplicados';
  end if;
end $$;
select set_config('s.run', public.import_clients(current_setting('c.org')::uuid, 'socios.csv', '[
  {"linha": 2, "nome": "Duarte Pinto", "telefone": "915 000 111", "email": "duarte@conta.test"},
  {"linha": 3, "nome": "Joana Repetida", "telefone": "912345678"},
  {"linha": 4, "nome": "", "email": "semnome@conta.test"},
  {"linha": 5, "nome": "Data Má", "nascimento": "31/02/1990"}
]'::jsonb)::text, false);
do $$ declare r public.import_runs%rowtype;
begin
  select * into r from public.import_runs where id = current_setting('s.run')::uuid;
  if r.total <> 4 or r.ok <> 1 or r.failed <> 3 then raise exception 'PROVA S1 FALHOU: % de % (falhas %)', r.ok, r.total, r.failed; end if;
  if not exists (select 1 from jsonb_array_elements(r.report) x where (x->>'linha')::int = 3 and x->>'motivo' like 'Já existe%') then
    raise exception 'PROVA S1 FALHOU: o duplicado não ficou no relatório';
  end if;
  if not exists (select 1 from public.clients where full_name = 'Duarte Pinto') then raise exception 'PROVA S1 FALHOU: a linha boa não entrou'; end if;
end $$;

-- ---------- PROVA S2: o registo de auditoria não se edita nem apaga, nem pela dona ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
do $$ begin
  if not exists (select 1 from public.org_audit(current_setting('c.org')::uuid) where acao = 'clientes.importar') then
    raise exception 'PROVA S2 FALHOU: a importação não ficou no registo';
  end if;
  begin
    update public.audit_log set action = 'apagado' where org_id = current_setting('c.org')::uuid;
    raise exception 'PROVA S2 FALHOU: editou o registo';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.audit_log where org_id = current_setting('c.org')::uuid;
    raise exception 'PROVA S2 FALHOU: apagou o registo';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  begin
    perform public.org_audit(current_setting('c.org')::uuid);
    raise exception 'PROVA S2 FALHOU: o PT leu a auditoria da organização';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA S3: título a expirar avisa a gerência 30 dias antes, uma vez ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
update public.memberships set title = 'Cédula TPTE', title_valid_until = current_date + 20 where id = current_setting('c.m_pt')::uuid;
select public.sync_title_alerts(current_setting('c.org')::uuid);
select public.sync_title_alerts(current_setting('c.org')::uuid);
do $$ begin
  if (select count(*) from public.notifications where type = 'titulo_a_expirar') <> 1 then
    raise exception 'PROVA S3 FALHOU: aviso em falta ou repetido';
  end if;
end $$;
reset role;

select '✅ Definições: TODAS AS PROVAS PASSARAM' as resultado;
