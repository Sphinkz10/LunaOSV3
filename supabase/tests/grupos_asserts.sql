-- ============================================================
-- LUNA.OS v3 · Provas SQL de G-08 (grupos). Corre depois de avaliacao_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
insert into public.groups (id, org_id, type, name) values ('00000000-0000-0000-0000-0000000b1001', current_setting('c.org')::uuid, 'program', 'Pilates manhã');

-- ---------- PROVA G1: sair nunca apaga; pede motivo; voltar repõe ----------
select public.add_group_member('00000000-0000-0000-0000-0000000b1001', current_setting('c.link')::uuid, current_date - 30);
do $$ begin
  begin
    perform public.remove_group_member('00000000-0000-0000-0000-0000000b1001', current_setting('c.link')::uuid, ' ');
    raise exception 'PROVA G1 FALHOU: saiu sem motivo';
  exception when check_violation then null;
  end;
  perform public.remove_group_member('00000000-0000-0000-0000-0000000b1001', current_setting('c.link')::uuid, 'Mudou de horário');
  if not exists (select 1 from public.client_groups(current_setting('c.link')::uuid) where nome = 'Pilates manhã' and saiu is not null and motivo = 'Mudou de horário') then
    raise exception 'PROVA G1 FALHOU: o histórico do cliente perdeu o grupo';
  end if;
  begin
    delete from public.group_members where group_id = '00000000-0000-0000-0000-0000000b1001';
    if exists (select 1 from public.group_members where group_id = '00000000-0000-0000-0000-0000000b1001') then null; else raise exception 'PROVA G1 FALHOU: apagou'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA G2: arquivar pede motivo, pára envios e fica no histórico ----------
do $$ declare n int;
begin
  perform public.add_group_member('00000000-0000-0000-0000-0000000b1001', current_setting('c.link')::uuid);
  perform public.schedule_requests(current_setting('c.org')::uuid, '00000000-0000-0000-0000-0000000a1001', '{}', '00000000-0000-0000-0000-0000000b1001', 1, 9, 2);
  begin
    perform public.archive_group('00000000-0000-0000-0000-0000000b1001', '');
    raise exception 'PROVA G2 FALHOU: arquivou sem motivo';
  exception when check_violation then null;
  end;
  n := public.archive_group('00000000-0000-0000-0000-0000000b1001', 'Fim da época');
  if n <> 1 then raise exception 'PROVA G2 FALHOU: envios não pararam (%)', n; end if;
  perform public.restore_group('00000000-0000-0000-0000-0000000b1001', 'Época nova');
  perform public.set_group_responsible('00000000-0000-0000-0000-0000000b1001', current_setting('c.m_pt')::uuid);
  if (select count(*) from public.group_events where group_id = '00000000-0000-0000-0000-0000000b1001') < 6 then raise exception 'PROVA G2 FALHOU: histórico'; end if;
end $$;
reset role;

select '✅ Grupos: TODAS AS PROVAS PASSARAM' as resultado;
