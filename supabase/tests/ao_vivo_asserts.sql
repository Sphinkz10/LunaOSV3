-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 08 (preparar, dar e fechar).
-- Corre depois de pt_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

-- Uma sessão em pequeno grupo: Carla (c.link) e Ana (d.a, com pack)
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
select set_config('v.g', public.create_group_booking(current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid,
  array[current_setting('c.link')::uuid, current_setting('d.a')::uuid], date_trunc('hour', now()) - interval '1 hour', 60)::text, false);
select set_config('v.bc', (select id::text from public.bookings where group_id = current_setting('v.g')::uuid and link_id = current_setting('c.link')::uuid), false);
select set_config('v.ba', (select id::text from public.bookings where group_id = current_setting('v.g')::uuid and link_id = current_setting('d.a')::uuid), false);

-- ---------- PROVA V1: preparar mostra quem vem, sem diagnóstico ----------
do $$ declare p jsonb := public.prepare_session(current_setting('v.g')::uuid);
begin
  if jsonb_array_length(p->'participantes') <> 2 then raise exception 'PROVA V1 FALHOU: % participantes', jsonb_array_length(p->'participantes'); end if;
  if p::text like '%"notes"%' then raise exception 'PROVA V1 FALHOU: saiu o diagnóstico'; end if;
end $$;

-- ---------- PROVA V2: a fila reenvia o mesmo e nada duplica ----------
select set_config('v.w', public.add_client(current_setting('c.org')::uuid, 'Entrou Sem Reserva', null, null, null, current_setting('c.m_pt')::uuid)::text, false);
select set_config('v.payload', jsonb_build_object(
  'booking_id', current_setting('v.g'), 'iniciada_em', now() - interval '50 minutes', 'segundos', 1800, 'pausa_segundos', 120, 'fase', 'live',
  'participantes', jsonb_build_array(
    jsonb_build_object('booking_id', current_setting('v.bc'), 'link_id', current_setting('c.link'), 'presenca', 'presente',
      'sessao_id', '00000000-0000-0000-0000-0000000f5001',
      'exercicios', jsonb_build_array(jsonb_build_object('id', '00000000-0000-0000-0000-0000000f5101', 'posicao', 0, 'series', 3,
        'sets', jsonb_build_array(
          jsonb_build_object('id', '00000000-0000-0000-0000-0000000f5201', 'n', 1, 'reps', 10, 'carga', 16, 'rpe', 6),
          jsonb_build_object('id', '00000000-0000-0000-0000-0000000f5202', 'n', 2, 'reps', 10, 'carga', 16, 'rpe', 7))))),
    jsonb_build_object('booking_id', current_setting('v.ba'), 'link_id', current_setting('d.a'), 'presenca', 'faltou'),
    -- entrada sem reserva
    jsonb_build_object('booking_id', '00000000-0000-0000-0000-0000000f5301', 'link_id', current_setting('v.w'), 'presenca', 'presente')
  ))::text, false);
select public.sync_live(current_setting('v.payload')::jsonb);
select public.sync_live(current_setting('v.payload')::jsonb);
do $$ begin
  if (select count(*) from public.session_sets where session_id = '00000000-0000-0000-0000-0000000f5001') <> 2 then raise exception 'PROVA V2 FALHOU: séries duplicadas'; end if;
  if (select count(*) from public.session_set_edits where session_id = '00000000-0000-0000-0000-0000000f5001') <> 0 then raise exception 'PROVA V2 FALHOU: reenvio contou como correção'; end if;
  if (select count(*) from public.bookings where group_id = current_setting('v.g')::uuid) <> 3 then raise exception 'PROVA V2 FALHOU: entrada sem reserva'; end if;
  if not (select walk_in from public.attendance where booking_id = '00000000-0000-0000-0000-0000000f5301') then raise exception 'PROVA V2 FALHOU: entrada sem marca'; end if;
end $$;

-- ---------- PROVA V3: o cliente não grava pelo PT ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ begin
  perform public.sync_live(current_setting('v.payload')::jsonb);
  raise exception 'PROVA V3 FALHOU';
exception when insufficient_privilege then null;
end $$;

-- ---------- PROVA V4: fechar uma vez; packs e faltas aplicados ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
select set_config('v.antes', (select coalesce(sum(sessions_used), 0)::text from public.client_packs where link_id = current_setting('d.a')::uuid), false);
do $$ declare r jsonb := public.submit_live(current_setting('v.g')::uuid);
begin
  if (r->>'presentes')::int <> 2 or (r->>'faltas')::int <> 1 then raise exception 'PROVA V4 FALHOU: %', r; end if;
  if (select status from public.bookings where id = current_setting('v.bc')::uuid) <> 'completed' then raise exception 'PROVA V4 FALHOU: marcação por concluir'; end if;
  if (select phase from public.sessions where id = '00000000-0000-0000-0000-0000000f5001') <> 'done' then raise exception 'PROVA V4 FALHOU: sessão aberta'; end if;
  if (select status from public.bookings where id = current_setting('v.ba')::uuid) <> 'no_show' then raise exception 'PROVA V4 FALHOU: falta'; end if;
  if not (public.submit_live(current_setting('v.g')::uuid) ? 'ja_submetida') then raise exception 'PROVA V4 FALHOU: fechou duas vezes'; end if;
  -- Depois de fechada, a fila já não mexe em nada
  perform public.sync_live(jsonb_set(current_setting('v.payload')::jsonb, '{participantes,0,exercicios,0,sets,0,reps}', '99'));
  if exists (select 1 from public.session_sets where id = '00000000-0000-0000-0000-0000000f5201' and reps = 99) then raise exception 'PROVA V4 FALHOU: mudou depois de fechar'; end if;
end $$;

-- ---------- PROVA V5: corrigir pede motivo, devolve o pack e fica no histórico ----------
do $$ declare antes int := current_setting('v.antes')::int; depois int;
begin
  begin
    perform public.correct_attendance(current_setting('v.ba')::uuid, 'nao_treina', '  ');
    raise exception 'PROVA V5 FALHOU: corrigiu sem motivo';
  exception when check_violation then null;
  end;
  perform public.correct_attendance(current_setting('v.ba')::uuid, 'nao_treina', 'Avisou por mensagem, doente');
  select coalesce(sum(sessions_used), 0) into depois from public.client_packs where link_id = current_setting('d.a')::uuid;
  if depois > antes then raise exception 'PROVA V5 FALHOU: o pack não voltou (% → %)', antes, depois; end if;
  if not exists (select 1 from public.session_history(current_setting('v.g')::uuid) where motivo = 'Avisou por mensagem, doente') then
    raise exception 'PROVA V5 FALHOU: sem histórico';
  end if;
  perform public.correct_set('00000000-0000-0000-0000-0000000f5202', 12, 16, 7, 'Contei mal as repetições');
  if not exists (select 1 from public.session_set_edits where set_id = '00000000-0000-0000-0000-0000000f5202' and reason = 'Contei mal as repetições') then
    raise exception 'PROVA V5 FALHOU: série sem motivo no registo';
  end if;
end $$;
reset role;

select '✅ Ao vivo: TODAS AS PROVAS PASSARAM' as resultado;
