-- ============================================================
-- LUNA.OS v3 · Provas SQL do passo 24 (começar sozinho e ligar a um treinador).
-- Corre depois de mensagens_asserts.sql. PT = e0002 (c.org), nova atleta = e0909.
-- ============================================================
\set ON_ERROR_STOP on
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-00000000e909', 'marta@solo.test', '{"full_name":"Marta Solo"}');

-- ---------- PROVA S1: começar sozinho dá um plano com os dias pedidos, sem organização ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000e909', false);
select public.start_solo('forca', 'iniciante', 3, 'casa');
do $$ declare w jsonb;
begin
  if (select count(*) from public.my_solo_week(date_trunc('week', current_date)::date)) <> 3 then raise exception 'PROVA S1 FALHOU: dias'; end if;
  w := public.my_solo_workout(null, date_trunc('week', current_date)::date);   -- segunda
  if w is null or jsonb_array_length(w->'blocos'->0->'exercicios') < 4 or not (w->>'solo')::boolean then raise exception 'PROVA S1 FALHOU: treino %', w; end if;
  -- Treino solo feito guarda o nome do exercício e entra nos recordes
  perform public.sync_my_session(jsonb_build_object('id', '00000000-0000-0000-0000-00000000f909', 'started_at', now() - interval '40 minutes', 'nome', 'Corpo inteiro A',
    'exercicios', jsonb_build_array(jsonb_build_object('nome', 'Agachamento goblet', 'series', 2, 'sets', jsonb_build_array(jsonb_build_object('n', 1, 'reps', 10, 'carga', 12))))));
  if not exists (select 1 from public.my_records() where exercicio = 'Agachamento goblet' and carga = 12) then raise exception 'PROVA S1 FALHOU: recorde sem nome'; end if;
end $$;

-- ---------- PROVA S2: ligar pelo código; o treinador só vê depois de aceitar e só o partilhado ----------
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
select set_config('s.code', public.my_trainer_code(current_setting('c.org')::uuid), false);
do $$ begin
  if current_setting('s.code') !~ '^[A-Z]{2}-[0-9]{4}$' then raise exception 'PROVA S2 FALHOU: código %', current_setting('s.code'); end if;
  if public.my_trainer_code(current_setting('c.org')::uuid) <> current_setting('s.code') then raise exception 'PROVA S2 FALHOU: código mudou sozinho'; end if;
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-00000000e909', false);
do $$ begin
  if (public.lookup_trainer_code(lower(current_setting('s.code')))->>'org') is null then raise exception 'PROVA S2 FALHOU: código não encontrado'; end if;
end $$;
select set_config('s.l', public.request_link(current_setting('s.code'), array['training']::public.share_category[])::text, false);
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ declare p uuid := (select person_id from public.links where id = current_setting('s.l')::uuid);
begin
  if public.can_read_person_data(p, 'training') then raise exception 'PROVA S2 FALHOU: vê antes de aceitar'; end if;
  perform public.answer_link_request(current_setting('s.l')::uuid, true);
  if not public.can_read_person_data(p, 'training') then raise exception 'PROVA S2 FALHOU: não vê o histórico solo partilhado'; end if;
  if public.can_read_person_data(p, 'measurements') then raise exception 'PROVA S2 FALHOU: vê o que não foi partilhado'; end if;
  if exists (select 1 from public.pendencias where link_id = current_setting('s.l')::uuid and status = 'aberta') then raise exception 'PROVA S2 FALHOU: pendência aberta'; end if;
end $$;

-- ---------- PROVA S3: com plano do treinador, o solo sai da frente; desligar corta e deixa cópia ----------
reset role;
insert into public.assignments (org_id, link_id, target, plan_id, plan_version_id, status, starts_on)
  select l.org_id, l.id, 'client', pv.plan_id, pv.id, 'active', current_date - 1
  from public.links l, public.plan_versions pv where l.id = current_setting('s.l')::uuid and pv.org_id = l.org_id limit 1;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000e909', false);
do $$ begin
  if exists (select 1 from public.assignments a where a.link_id = current_setting('s.l')::uuid) then
    if exists (select 1 from public.my_solo_week(current_date)) then raise exception 'PROVA S3 FALHOU: o solo continua à frente'; end if;
  end if;
  perform public.end_link(current_setting('s.l')::uuid);
end $$;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ declare p uuid := (select person_id from public.links where id = current_setting('s.l')::uuid);
begin
  if public.can_read_person_data(p, 'training') then raise exception 'PROVA S3 FALHOU: o treinador ainda vê'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.assignments a where a.link_id = current_setting('s.l')::uuid and a.plan_version_id is not null)
     and not exists (select 1 from public.solo_plans where person_id = (select id from public.persons where user_id = '00000000-0000-0000-0000-00000000e909') and source = 'copia_treinador' and archived_at is null) then
    raise exception 'PROVA S3 FALHOU: sem cópia do plano';
  end if;
  if not exists (select 1 from public.sessions where id = '00000000-0000-0000-0000-00000000f909') then raise exception 'PROVA S3 FALHOU: perdeu o histórico'; end if;
end $$;

-- ---------- PROVA S4: convidar um treinador que não usa o LunaOS ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-00000000e909', false);
select public.invite_my_trainer('email', 'novo.pt@exemplo.test', array['training','measurements']::public.share_category[]);
reset role;
do $$ declare t text := (select payload->>'token' from public.outbox where template = 'convite_treinador' order by id desc limit 1);
begin
  if t is null then raise exception 'PROVA S4 FALHOU: sem email'; end if;
  perform set_config('s.t', t, false);
end $$;
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
do $$ declare v uuid;
begin
  v := public.claim_trainer_invite(current_setting('s.t'), current_setting('c.org')::uuid);
  if (select status from public.links where id = v) <> 'active' then raise exception 'PROVA S4 FALHOU: não ligou'; end if;
  begin
    perform public.claim_trainer_invite(current_setting('s.t'), current_setting('c.org')::uuid);
    raise exception 'PROVA S4 FALHOU: convite usado duas vezes';
  exception when check_violation then null;
  end;
end $$;
reset role;

select '✅ Solo e ligar a um treinador: TODAS AS PROVAS PASSARAM' as resultado;
