-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 22: objetivos, marcos, revisões,
-- atividade, progresso, editar com conflito, arquivar e reativar.
-- Corre depois de clientes_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
insert into public.goals (org_id, link_id, title, criterion, category, priority)
  values (current_setting('c.org')::uuid, current_setting('c.link')::uuid, 'Agachar 100 kg × 5', '5 repetições com RPE até 8', 'fisico', 1);
select set_config('f.g', (select id::text from public.goals where title = 'Agachar 100 kg × 5'), false);
insert into public.milestones (org_id, goal_id, title, due_on)
  values (current_setting('c.org')::uuid, current_setting('f.g')::uuid, 'Agachamento 90 kg × 5', current_date - 3);
select set_config('f.m', (select id::text from public.milestones where title = 'Agachamento 90 kg × 5'), false);
insert into public.reviews (org_id, link_id, scheduled_on, every_weeks, owner_membership_id, goal_ids)
  values (current_setting('c.org')::uuid, current_setting('c.link')::uuid, current_date - 1, 4, current_setting('c.m_pt')::uuid, array[current_setting('f.g')::uuid]);
select set_config('f.r', (select id::text from public.reviews where link_id = current_setting('c.link')::uuid and done_at is null), false);

-- ---------- PROVA F1: revisões e marcos em atraso entram na Inbox do PT ----------
select public.sync_overdue(current_setting('c.org')::uuid);
select public.sync_overdue(current_setting('c.org')::uuid);   -- idempotente
do $$ begin
  if (select count(*) from public.pendencias where link_id = current_setting('c.link')::uuid and kind in ('revisao_em_atraso','marco_em_atraso') and status = 'aberta') <> 2 then
    raise exception 'PROVA F1 FALHOU: atrasos não chegaram à Inbox (ou repetiram)';
  end if;
end $$;

-- ---------- PROVA F2: um marco sem evidência não se conclui ----------
do $$ begin
  begin
    perform public.complete_milestone(current_setting('f.m')::uuid, 'sessao', null, '  ');
    raise exception 'PROVA F2 FALHOU: concluiu sem evidência';
  exception when check_violation then null;
  end;
  begin
    update public.milestones set done_at = now() where id = current_setting('f.m')::uuid;
    raise exception 'PROVA F2 FALHOU: concluiu por fora da função';
  exception when insufficient_privilege then null;
  end;
  perform public.complete_milestone(current_setting('f.m')::uuid, 'nota', null, 'Vídeo do treino de 2 out');
  if (select done_at from public.milestones where id = current_setting('f.m')::uuid) is null then raise exception 'PROVA F2 FALHOU: não concluiu'; end if;
  if exists (select 1 from public.pendencias where link_id = current_setting('c.link')::uuid and kind = 'marco_em_atraso' and status = 'aberta') then
    raise exception 'PROVA F2 FALHOU: a pendência do marco ficou aberta';
  end if;
end $$;

-- ---------- PROVA F3: uma revisão concluída tem sempre decisão; marca a seguinte ----------
do $$ declare nxt uuid;
begin
  begin
    perform public.conclude_review(current_setting('f.r')::uuid, '');
    raise exception 'PROVA F3 FALHOU: concluiu sem decisão';
  exception when check_violation then null;
  end;
  nxt := public.conclude_review(current_setting('f.r')::uuid, 'Manter o plano e subir 2,5 kg no agachamento.');
  if nxt is null or (select scheduled_on from public.reviews where id = nxt) <> current_date + 28 then raise exception 'PROVA F3 FALHOU: sem revisão seguinte'; end if;
  if exists (select 1 from public.pendencias where link_id = current_setting('c.link')::uuid and kind = 'revisao_em_atraso' and status = 'aberta') then
    raise exception 'PROVA F3 FALHOU: a pendência da revisão ficou aberta';
  end if;
  if not exists (select 1 from public.client_activity(current_setting('c.link')::uuid, now() - interval '1 day') where origem = 'objetivos' and detalhe like 'Manter o plano%') then
    raise exception 'PROVA F3 FALHOU: decisão fora da atividade';
  end if;
end $$;

-- ---------- PROVA F4: o cliente vê objetivos e marcos só para leitura ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0003', false);   -- Carla
do $$ begin
  if not exists (select 1 from public.goals where id = current_setting('f.g')::uuid) then raise exception 'PROVA F4 FALHOU: o cliente não vê o objetivo'; end if;
  if exists (select 1 from public.reviews) then raise exception 'PROVA F4 FALHOU: o cliente vê as revisões internas'; end if;
  begin
    insert into public.goals (org_id, link_id, title) values (current_setting('c.org')::uuid, current_setting('c.link')::uuid, 'Meu');
    raise exception 'PROVA F4 FALHOU: o cliente criou um objetivo';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA F5: arquivar e reativar pedem motivo e ficam registados ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  begin
    perform public.archive_client(current_setting('d.a')::uuid, ' ');
    raise exception 'PROVA F5 FALHOU: arquivou sem motivo';
  exception when check_violation then null;
  end;
  perform public.archive_client(current_setting('d.a')::uuid, 'Mudou de cidade');
  perform public.reactivate_client(current_setting('d.a')::uuid, 'Voltou');
  if (select count(*) from public.link_events where link_id = current_setting('d.a')::uuid and kind in ('arquivado','reativado') and actor_user is not null and reason is not null) <> 2 then
    raise exception 'PROVA F5 FALHOU: arquivar e reativar sem registo de motivo e autor';
  end if;
end $$;

-- ---------- PROVA F6: editar com conflito e sem duplicados ----------
do $$ declare antes timestamptz := (select p.updated_at from public.persons p join public.links l on l.person_id = p.id where l.id = current_setting('d.c')::uuid);
begin
  perform public.update_client_data(current_setting('d.c')::uuid, antes, 'Clara Faltou', '919999999', null, null, null);
  begin
    perform public.update_client_data(current_setting('d.c')::uuid, antes, 'Clara F.', '919999999', null, null, null);
    raise exception 'PROVA F6 FALHOU: gravou por cima de outra pessoa';
  exception when serialization_failure then null;
  end;
  begin
    perform public.update_client_data(current_setting('d.c')::uuid, now() + interval '1 hour', 'Clara', '912 345 678', null, null, null);
    raise exception 'PROVA F6 FALHOU: duplicado pelo telemóvel na edição';
  exception when unique_violation then null;
  end;
end $$;

-- ---------- PROVA F7: cada valor do progresso tem origem ----------
reset role;
insert into public.measurements (person_id, org_id, metric_key, value, unit, source)
  select person_id, current_setting('c.org')::uuid, 'peso', 70, 'kg', 'manual' from public.links where id = current_setting('d.a')::uuid;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ begin
  if exists (select 1 from public.client_progress(current_setting('d.a')::uuid, 'peso', now() - interval '1 day') where ref_id is null or ref_kind is null)
     or not exists (select 1 from public.client_progress(current_setting('d.a')::uuid, 'peso', now() - interval '1 day')) then
    raise exception 'PROVA F7 FALHOU: valor sem origem';
  end if;
end $$;
reset role;

select '✅ Ficha do cliente: TODAS AS PROVAS PASSARAM' as resultado;
