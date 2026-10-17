-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 25: equipa e recuperação assistida.
-- Corre depois de conta_asserts.sql (usa o Estúdio Conta de lá).
-- ============================================================
\set ON_ERROR_STOP on

-- ---------- PROVA E1: desativar corta o acesso já e não apaga nada ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);   -- dona
do $$ begin
  begin
    perform public.deactivate_member(current_setting('c.m_pt')::uuid, '');
    raise exception 'PROVA E1 FALHOU: desativou sem motivo';
  exception when check_violation then null;
  end;
end $$;
select public.deactivate_member(current_setting('c.m_pt')::uuid, 'Saiu do estúdio');
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- o PT desativado
do $$ begin
  if exists (select 1 from public.clients) or public.is_member(current_setting('c.org')::uuid) then
    raise exception 'PROVA E1 FALHOU: membro desativado ainda vê a organização';
  end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select public.reactivate_member(current_setting('c.m_pt')::uuid, 'Voltou');
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if not public.has_perm(current_setting('c.org')::uuid, 'clients.read_own') then
    raise exception 'PROVA E1 FALHOU: reativar devia devolver o mesmo papel';
  end if;
  if (select count(*) from public.membership_events) <> 2 then
    raise exception 'PROVA E1 FALHOU: histórico devia ter desativar e reativar (o próprio vê o seu)';
  end if;
end $$;

-- ---------- PROVA E2: a dona não se desativa a si própria; último dono fica ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
do $$ begin
  begin
    perform public.deactivate_member(public.my_membership_id(current_setting('c.org')::uuid), 'teste');
    raise exception 'PROVA E2 FALHOU: desativou-se a si própria';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA E3: convite cancelado não abre ----------
select set_config('c.inv2', public.create_invite(current_setting('c.org')::uuid, 'novo@conta.test', 'reception'), false);
select public.cancel_invite((select id from public.invites where email = 'novo@conta.test'));
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000e0006', 'novo@conta.test');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0006', false);
do $$ begin
  begin
    perform public.accept_invite(current_setting('c.inv2'));
    raise exception 'PROVA E3 FALHOU: convite cancelado abriu';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------- PROVA E4: código de recuperação de uso único; 5 erros bloqueiam ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select set_config('c.rec', public.create_recovery_code(current_setting('c.m_pt')::uuid), false);
do $$ begin
  if exists (select 1 from public.recovery_codes where id is not null and current_setting('c.rec') = '') then null; end if;
  begin
    perform code_hash from public.recovery_codes;
    raise exception 'PROVA E4 FALHOU: a gerência lê o hash do código';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ declare u uuid;
begin
  -- só o servidor resgata
  u := public._redeem_recovery_code('pt@conta.test', current_setting('c.rec'));
  if u <> '00000000-0000-0000-0000-0000000e0002' then raise exception 'PROVA E4 FALHOU: código válido recusado'; end if;
  begin
    perform public._redeem_recovery_code('pt@conta.test', current_setting('c.rec'));
    raise exception 'PROVA E4 FALHOU: código usado duas vezes';
  exception when invalid_parameter_value then null;
  end;
end $$;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0001', false);
select set_config('c.rec2', public.create_recovery_code(current_setting('c.m_pt')::uuid), false);
reset role;
do $$ declare i int;
begin
  for i in 1..5 loop
    if public._redeem_recovery_code('pt@conta.test', 'ERRADO' || i) is not null then
      raise exception 'PROVA E4 FALHOU: código errado aceite';
    end if;
  end loop;
  begin
    perform public._redeem_recovery_code('pt@conta.test', current_setting('c.rec2'));
    raise exception 'PROVA E4 FALHOU: código bloqueado ainda serve';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.notifications where title = 'Código de recuperação bloqueado') then
    raise exception 'PROVA E4 FALHOU: a gerência não foi avisada';
  end if;
  if has_function_privilege('authenticated', 'public._redeem_recovery_code(text, text)', 'execute') then
    raise exception 'PROVA E4 FALHOU: o cliente consegue resgatar códigos';
  end if;
end $$;

select '✅ Equipa e recuperação: TODAS AS PROVAS PASSARAM' as resultado;
