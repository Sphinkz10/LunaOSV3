-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 24 (horário, funções antigas).
-- Corre depois de ao_vivo_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at)
  values ('00000000-0000-0000-0000-0000000e2002', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, 'confirmed',
          date_trunc('day', now() + interval '9 days') + interval '7 hours', date_trunc('day', now() + interval '9 days') + interval '8 hours');
select set_config('x.b', '00000000-0000-0000-0000-0000000e2002', false);

-- ---------- PROVA X1: cancelar pede sempre motivo ----------
do $$ begin
  begin
    update public.bookings set status = 'cancelled' where id = current_setting('x.b')::uuid;
    raise exception 'PROVA X1 FALHOU: cancelou sem motivo';
  exception when check_violation then null;
  end;
end $$;

-- ---------- PROVA X2: o histórico guarda antes, depois e quem ----------
update public.bookings set starts_at = starts_at + interval '1 hour', ends_at = ends_at + interval '1 hour' where id = current_setting('x.b')::uuid;
update public.bookings set status = 'cancelled', cancel_reason = 'PT doente' where id = current_setting('x.b')::uuid;
do $$ begin
  if (select count(*) from public.booking_events where booking_id = current_setting('x.b')::uuid) <> 3 then
    raise exception 'PROVA X2 FALHOU: % registos', (select count(*) from public.booking_events where booking_id = current_setting('x.b')::uuid);
  end if;
  if not exists (select 1 from public.booking_events where booking_id = current_setting('x.b')::uuid and what = 'Hora mudada' and before is not null and after is not null and before <> after
                   and actor_user = '00000000-0000-0000-0000-0000000e0002') then
    raise exception 'PROVA X2 FALHOU: hora mudada';
  end if;
  if not exists (select 1 from public.booking_events where booking_id = current_setting('x.b')::uuid and what = 'Cancelada' and reason = 'PT doente') then
    raise exception 'PROVA X2 FALHOU: motivo';
  end if;
end $$;
reset role;
-- ... e a Carla foi avisada
do $$ begin
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000e0003' and type = 'marcacao_cancelada' and body like '%PT doente') then
    raise exception 'PROVA X2 FALHOU: cliente não avisado';
  end if;
end $$;

-- ---------- PROVA X3: por confirmar fora do prazo liberta a hora sozinha ----------
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at, source)
  values ('00000000-0000-0000-0000-0000000e2001', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('c.link')::uuid, 'pending',
          date_trunc('day', now() + interval '10 days') + interval '7 hours', date_trunc('day', now() + interval '10 days') + interval '8 hours', 'client');
do $$ begin
  if (select confirm_by from public.bookings where id = '00000000-0000-0000-0000-0000000e2001') is null then raise exception 'PROVA X3 FALHOU: sem prazo'; end if;
end $$;
update public.bookings set confirm_by = now() - interval '1 minute' where id = '00000000-0000-0000-0000-0000000e2001';
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select public.expire_pending(current_setting('c.org')::uuid);
reset role;
do $$ begin
  if (select status from public.bookings where id = '00000000-0000-0000-0000-0000000e2001') <> 'cancelled' then raise exception 'PROVA X3 FALHOU: não libertou'; end if;
  if not exists (select 1 from public.notifications where user_id = '00000000-0000-0000-0000-0000000e0003' and type = 'marcacao_cancelada' and body like '%Não confirmada a tempo') then
    raise exception 'PROVA X3 FALHOU: quem marcou não foi avisado';
  end if;
  if has_function_privilege('authenticated', 'public._expirar_por_confirmar(uuid)', 'execute') then raise exception 'PROVA X3 FALHOU: função interna aberta'; end if;
end $$;

select '✅ Horário (funções antigas): TODAS AS PROVAS PASSARAM' as resultado;
