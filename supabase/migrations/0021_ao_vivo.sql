-- ============================================================
-- LUNA.OS v3 · 0021 · Preparar, dar e fechar a sessão de PT (tarefa 08,
-- G-12, G-13, G-14), 1:1 e em pequeno grupo.
--   · Pequeno grupo: marcações com o mesmo group_id (uma por cliente, cada
--     uma desconta do seu pack). Entrada sem reserva junta-se ao grupo.
--   · Reserva (bookings), presença (attendance) e sessão (sessions) são
--     registos diferentes.
--   · O Live grava primeiro no aparelho e envia por sync_live, idempotente
--     pelos ids gerados no aparelho (reenviar nunca duplica, AUD-66).
--   · Fechar (submit_live) só uma vez: aplica presenças, faltas e packs.
--     Depois, corrigir pede motivo e fica no histórico (antes, depois, quem).
-- ============================================================

alter table public.bookings
  add column group_id uuid,
  add column submitted_at timestamptz,
  add column submitted_by uuid;
create index on public.bookings (group_id) where group_id is not null;
-- O PT não tem duas sessões ao mesmo tempo, exceto as do mesmo pequeno grupo
alter table public.bookings drop constraint bookings_no_overlap;
alter table public.bookings add constraint bookings_no_overlap
  exclude using gist (
    membership_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&,
    (coalesce(group_id, id)) with <>
  ) where (status in ('pending','confirmed') and type <> 'class' and membership_id is not null);

alter table public.link_events drop constraint link_events_kind_check;
alter table public.link_events add constraint link_events_kind_check
  check (kind in ('arquivado','reativado','objetivo','marco','revisao','dados','sessao'));

create table public.attendance (
  booking_id uuid primary key,
  org_id     uuid not null,
  link_id    uuid not null,
  status     text not null check (status in ('presente','atrasado','saiu_cedo','faltou','nao_treina')),
  walk_in    boolean not null default false,
  marked_at  timestamptz not null default now(),
  marked_by  uuid,
  foreign key (booking_id, org_id) references public.bookings(id, org_id) on delete cascade,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
alter table public.attendance enable row level security;
create policy attendance_select on public.attendance for select to authenticated
  using (public.can_see_link(link_id) or public.is_my_link(link_id));
grant select on public.attendance to authenticated;
revoke all on public.attendance from anon;

create table public.attendance_corrections (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  booking_id uuid not null,
  link_id    uuid not null,
  before     text,
  after      text not null,
  reason     text not null check (length(trim(reason)) > 0),
  actor_user uuid,
  created_at timestamptz not null default now(),
  foreign key (booking_id, org_id) references public.bookings(id, org_id) on delete cascade
);
create index on public.attendance_corrections (booking_id, created_at);
alter table public.attendance_corrections enable row level security;
create policy attendance_corrections_select on public.attendance_corrections for select to authenticated
  using (public.can_see_link(link_id));
grant select on public.attendance_corrections to authenticated;
revoke all on public.attendance_corrections from anon;

-- Correções de séries depois de fechar: o motivo segue para o registo
alter table public.session_set_edits add column reason text;
create or replace function public._tg_correcao_serie() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (old.reps, old.load_kg, old.rpe, old.completed) is distinct from (new.reps, new.load_kg, new.rpe, new.completed) then
    insert into public.session_set_edits (set_id, session_id, person_id, before, after, actor_user, reason)
      values (old.id, old.session_id, old.person_id,
              jsonb_build_object('reps', old.reps, 'carga', old.load_kg, 'rpe', old.rpe, 'feita', old.completed),
              jsonb_build_object('reps', new.reps, 'carga', new.load_kg, 'rpe', new.rpe, 'feita', new.completed), auth.uid(),
              nullif(current_setting('luna.motivo', true), ''));
  end if;
  return new;
end $$;

-- Quem dá a sessão (ou gere o horário) pode prepará-la, dá-la e fechá-la
create or replace function public._pode_dar(_booking uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.bookings b
    where b.id = _booking and public.has_perm(b.org_id, 'training.write')
      and (b.membership_id = public.my_membership_id(b.org_id) or public.has_perm(b.org_id, 'schedule.read_all')));
$$;

-- As marcações da mesma sessão (1:1 = só ela; pequeno grupo = todas do group_id)
create or replace function public._do_grupo(_booking uuid) returns setof public.bookings
language sql stable security definer set search_path = '' as $$
  select x.* from public.bookings b join public.bookings x
    on x.id = b.id or (b.group_id is not null and x.group_id = b.group_id)
  where b.id = _booking;
$$;

-- O treino do dia de um cliente (o mesmo que a app mostra, com restrições e progressão)
create or replace function public._treino_do_dia(_link uuid, _on date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a record; v_snap jsonb; v_wv public.workout_versions%rowtype;
begin
  for a in
    select x.* from public.assignments x
    where x.link_id = _link and x.status = 'active'
      and (x.starts_on is null or x.starts_on <= _on) and (x.ends_on is null or x.ends_on >= _on)
    order by x.created_at desc
  loop
    v_wv := null;
    if a.workout_version_id is not null then
      select * into v_wv from public.workout_versions where id = a.workout_version_id;
    elsif a.plan_version_id is not null then
      select wv.* into v_wv from public.plan_versions pv
        cross join lateral jsonb_array_elements(pv.snapshot->'dias') d
        join public.workout_versions wv on wv.workout_id = (d->>'workout_id')::uuid and wv.version = (d->>'versao')::int
        where pv.id = a.plan_version_id and (d->>'dia')::int = extract(dow from _on)::int
          and ((d->>'semana') is null or (d->>'semana')::int = ((_on - coalesce(a.starts_on, _on)) / 7) + 1)
        limit 1;
    end if;
    if v_wv.id is not null then
      v_snap := public._aplicar_restricoes(v_wv.snapshot, public._zonas_bloqueadas(_link));
      if a.plan_version_id is not null then
        v_snap := jsonb_set(v_snap, '{snapshot}', public._aplicar_progressao(v_snap->'snapshot', a.plan_version_id, ((_on - coalesce(a.starts_on, _on)) / 7) + 1));
      end if;
      return (v_snap->'snapshot') || jsonb_build_object('workout_id', v_wv.workout_id, 'versao', v_wv.version, 'assignment_id', a.id, 'trocas', v_snap->'trocas');
    end if;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- G-12 · Preparar: quem vem, o que adaptar (nunca o diagnóstico), pack e treino
-- ---------------------------------------------------------------------------
create or replace function public.prepare_session(_booking uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare b public.bookings%rowtype; tz text; v jsonb;
begin
  select * into b from public.bookings where id = _booking;
  if not found or not public._pode_dar(_booking) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  tz := coalesce((select timezone from public.organizations where id = b.org_id), 'Europe/Lisbon');
  select jsonb_build_object(
    'booking_id', b.id, 'group_id', b.group_id, 'inicio', b.starts_at, 'fim', b.ends_at, 'titulo', b.title, 'local', b.location,
    'submetida_em', b.submitted_at,
    'participantes', coalesce(jsonb_agg(p order by p->>'nome'), '[]'::jsonb))
  into v
  from (
    select jsonb_build_object(
      'booking_id', x.id, 'link_id', x.link_id, 'nome', c.full_name, 'avatar', c.avatar_url, 'estado_marcacao', x.status,
      'presenca', at.status, 'entrada_sem_reserva', coalesce(at.walk_in, false),
      'aptidao', case
        when exists (select 1 from public.restrictions r where r.link_id = x.link_id and r.revoked_at is null and r.kind = 'bloquear' and r.zone is null
                       and (r.valid_until is null or r.valid_until >= current_date)) then 'nao_pode'
        when exists (select 1 from public.restrictions r where r.link_id = x.link_id and r.revoked_at is null and r.kind = 'atestado'
                       and (r.valid_until is null or r.valid_until >= current_date))
             and not exists (select 1 from public.client_documents d where d.link_id = x.link_id and d.doc_type = 'atestado'
                       and (d.expires_on is null or d.expires_on >= current_date)) then 'atestado'
        when coalesce(array_length(public._zonas_bloqueadas(x.link_id), 1), 0) > 0 then 'adaptar'
        else 'ok' end,
      'zonas', to_jsonb(public._zonas_bloqueadas(x.link_id)),
      'pack', (select jsonb_build_object('nome', k.name, 'restam', k.sessions_total - k.sessions_used, 'total', k.sessions_total)
               from public.client_packs k where k.link_id = x.link_id and k.sessions_used < k.sessions_total
                 and k.starts_on <= (x.starts_at at time zone tz)::date and k.valid_until >= (x.starts_at at time zone tz)::date
               order by k.valid_until, k.created_at limit 1),
      'sessoes_semana', (select count(*) from public.bookings y where y.link_id = x.link_id and y.status = 'completed'
                           and y.starts_at >= date_trunc('week', x.starts_at) and y.starts_at < x.starts_at),
      'treino', public._treino_do_dia(x.link_id, (x.starts_at at time zone tz)::date),
      'sessao_id', (select s.id from public.sessions s where s.booking_id = x.id and s.phase <> 'cancelled' order by s.created_at desc limit 1)
    ) p
    from public._do_grupo(_booking) x
    join public.clients c on c.id = x.link_id
    left join public.attendance at on at.booking_id = x.id
    where x.link_id is not null and x.status in ('pending','confirmed','completed','no_show')
  ) q;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- G-13 · Dar: a fila do aparelho chega aqui. Pode chegar várias vezes, por
-- qualquer ordem: tudo é upsert pelos ids do aparelho.
-- ---------------------------------------------------------------------------
create or replace function public.sync_live(_p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  b public.bookings%rowtype; me uuid; v_group uuid;
  pt jsonb; ex jsonb; st jsonb;
  v_book uuid; v_link uuid; v_person uuid; v_sess uuid; v_se uuid; v_sub boolean := false;
begin
  select * into b from public.bookings where id = (_p->>'booking_id')::uuid;
  if not found or not public._pode_dar(b.id) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if b.submitted_at is not null then return jsonb_build_object('submetida', true); end if;
  me := public.my_membership_id(b.org_id);
  v_group := coalesce(b.group_id, b.id);

  for pt in select * from jsonb_array_elements(coalesce(_p->'participantes', '[]')) loop
    v_book := (pt->>'booking_id')::uuid;
    v_link := (pt->>'link_id')::uuid;
    select person_id into v_person from public.links where id = v_link and org_id = b.org_id and public.can_see_link(id);
    if v_person is null then raise exception 'cliente inválido' using errcode = 'insufficient_privilege'; end if;
    -- Entrada sem reserva: cria a marcação no grupo (com o id do aparelho)
    if not exists (select 1 from public.bookings where id = v_book) then
      if b.group_id is null then update public.bookings set group_id = b.id where id = b.id; b.group_id := b.id; end if;
      insert into public.bookings (id, org_id, membership_id, link_id, room_id, type, status, title, starts_at, ends_at, location, location_kind, source, group_id)
        values (v_book, b.org_id, b.membership_id, v_link, b.room_id, 'training', 'confirmed', b.title, b.starts_at, b.ends_at, b.location, b.location_kind, 'manual', v_group);
      insert into public.attendance (booking_id, org_id, link_id, status, walk_in, marked_by)
        values (v_book, b.org_id, v_link, 'presente', true, me) on conflict (booking_id) do nothing;
    elsif not exists (select 1 from public.bookings x where x.id = v_book and x.link_id = v_link and (x.id = b.id or x.group_id = v_group)) then
      raise exception 'marcação de outra sessão' using errcode = 'insufficient_privilege';
    end if;
    if nullif(pt->>'presenca', '') is not null then
      insert into public.attendance (booking_id, org_id, link_id, status, marked_by, marked_at)
        values (v_book, b.org_id, v_link, pt->>'presenca', me, coalesce((pt->>'presenca_em')::timestamptz, now()))
        on conflict (booking_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = excluded.marked_at;
    end if;
    -- Sessão do cliente (uma por marcação)
    v_sess := nullif(pt->>'sessao_id', '')::uuid;
    if v_sess is null then continue; end if;
    if exists (select 1 from public.sessions where id = v_sess and (booking_id is distinct from v_book or person_id <> v_person)) then
      raise exception 'sessão de outra marcação' using errcode = 'insufficient_privilege';
    end if;
    -- Uma sessão aberta por cliente: a que ficou esquecida fecha sem descontar (os registos ficam)
    update public.sessions set phase = 'cancelled', ended_at = now(), notes = coalesce(notes, 'Fechada ao começar outra sessão')
      where person_id = v_person and org_id = b.org_id and id <> v_sess and phase in ('setup','live','paused');
    insert into public.sessions (id, person_id, org_id, link_id, membership_id, booking_id, workout_id, phase, started_at, elapsed_seconds, paused_seconds, notes)
      values (v_sess, v_person, b.org_id, v_link, me, v_book,
              case when exists (select 1 from public.workouts w where w.id = nullif(pt->>'workout_id', '')::uuid and w.org_id = b.org_id) then (pt->>'workout_id')::uuid end,
              case when _p->>'fase' = 'paused' then 'paused'::public.session_phase else 'live'::public.session_phase end,
              coalesce((_p->>'iniciada_em')::timestamptz, now()), greatest(0, coalesce((_p->>'segundos')::int, 0)),
              greatest(0, coalesce((_p->>'pausa_segundos')::int, 0)), nullif(trim(pt->>'nota'), ''))
      on conflict (id) do update set
        phase = case when public.sessions.phase in ('done','cancelled') then public.sessions.phase else excluded.phase end,
        elapsed_seconds = greatest(public.sessions.elapsed_seconds, excluded.elapsed_seconds),
        paused_seconds = greatest(public.sessions.paused_seconds, excluded.paused_seconds),
        notes = coalesce(excluded.notes, public.sessions.notes), updated_at = now();
    for ex in select * from jsonb_array_elements(coalesce(pt->'exercicios', '[]')) loop
      v_se := (ex->>'id')::uuid;
      insert into public.session_exercises (id, session_id, person_id, org_id, exercise_id, position, target_sets, notes)
        values (v_se, v_sess, v_person, b.org_id,
                case when exists (select 1 from public.exercises e where e.id = nullif(ex->>'exercise_id', '')::uuid and e.org_id = b.org_id) then (ex->>'exercise_id')::uuid end,
                coalesce((ex->>'posicao')::int, 0), nullif(ex->>'series', '')::int, nullif(trim(ex->>'nota'), ''))
        on conflict (id) do update set target_sets = excluded.target_sets, notes = excluded.notes;
      for st in select * from jsonb_array_elements(coalesce(ex->'sets', '[]')) loop
        insert into public.session_sets (id, session_id, session_exercise_id, person_id, org_id, set_index, reps, load_kg, rpe, completed, recorded_at)
          values ((st->>'id')::uuid, v_sess, v_se, v_person, b.org_id, (st->>'n')::int, nullif(st->>'reps', '')::int,
                  nullif(st->>'carga', '')::numeric, nullif(st->>'rpe', '')::numeric, coalesce((st->>'feito')::boolean, true),
                  coalesce((st->>'em')::timestamptz, now()))
          on conflict (session_exercise_id, set_index) do update set reps = excluded.reps, load_kg = excluded.load_kg, rpe = excluded.rpe,
            completed = excluded.completed, recorded_at = excluded.recorded_at
          where (public.session_sets.reps, public.session_sets.load_kg, public.session_sets.rpe, public.session_sets.completed)
                is distinct from (excluded.reps, excluded.load_kg, excluded.rpe, excluded.completed);
      end loop;
    end loop;
  end loop;

  -- Sessões minhas esquecidas há mais de 12 h e sem nada registado fecham sozinhas
  update public.sessions s set phase = 'cancelled', ended_at = now(), notes = coalesce(s.notes, 'Fechada sozinha: sem registos')
    where s.membership_id = me and s.phase in ('setup','live','paused') and s.started_at < now() - interval '12 hours'
      and not exists (select 1 from public.session_sets x where x.session_id = s.id);
  return jsonb_build_object('submetida', v_sub);
end $$;

-- Sessões esquecidas com registos: aparecem para fechar ou descartar
create or replace function public.stale_sessions(_org uuid)
returns table (id uuid, booking_id uuid, cliente text, inicio timestamptz, series int)
language sql stable security definer set search_path = '' as $$
  select s.id, s.booking_id, c.full_name, s.started_at, (select count(*)::int from public.session_sets x where x.session_id = s.id)
  from public.sessions s join public.clients c on c.id = s.link_id
  where s.org_id = _org and s.membership_id = public.my_membership_id(_org)
    and s.phase in ('setup','live','paused') and s.started_at < now() - interval '12 hours'
  order by s.started_at;
$$;

-- ---------------------------------------------------------------------------
-- G-14 · Fechar uma só vez: presenças, faltas, packs e comprovativo
-- ---------------------------------------------------------------------------
create or replace function public.submit_live(_booking uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; x record; a text; n_pres int := 0; n_falta int := 0; n_nao int := 0;
begin
  select * into b from public.bookings where id = _booking for update;
  if not found or not public._pode_dar(_booking) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if b.submitted_at is not null then return jsonb_build_object('ja_submetida', true, 'em', b.submitted_at); end if;
  for x in select g.*, c.full_name from public._do_grupo(_booking) g join public.clients c on c.id = g.link_id
           where g.link_id is not null and g.status in ('pending','confirmed','completed','no_show') loop
    a := (select status from public.attendance where booking_id = x.id);
    if a is null and exists (select 1 from public.sessions s join public.session_sets ss on ss.session_id = s.id where s.booking_id = x.id) then a := 'presente'; end if;
    if a is null then raise exception 'Falta marcar a presença de %', x.full_name using errcode = 'check_violation'; end if;
    insert into public.attendance (booking_id, org_id, link_id, status, marked_by)
      values (x.id, x.org_id, x.link_id, a, public.my_membership_id(x.org_id)) on conflict (booking_id) do nothing;
    if a in ('presente','atrasado','saiu_cedo') then
      update public.sessions set phase = 'done', ended_at = coalesce(ended_at, now()) where booking_id = x.id and phase in ('setup','live','paused');
      update public.bookings set status = 'completed' where id = x.id and status <> 'completed';
      n_pres := n_pres + 1;
    elsif a = 'faltou' then
      update public.sessions set phase = 'cancelled', ended_at = now() where booking_id = x.id and phase in ('setup','live','paused');
      update public.bookings set status = 'no_show' where id = x.id;
      n_falta := n_falta + 1;
    else
      update public.sessions set phase = 'cancelled', ended_at = now() where booking_id = x.id and phase in ('setup','live','paused');
      update public.bookings set status = 'cancelled', late_cancel = false, cancel_reason = 'Não pôde treinar' where id = x.id;
      n_nao := n_nao + 1;
    end if;
    insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user)
      values (x.org_id, x.link_id, 'sessao',
              case a when 'faltou' then 'Faltou à sessão' when 'nao_treina' then 'Não treinou (sem falta)' else 'Sessão dada' end, x.id, auth.uid());
  end loop;
  update public.bookings set submitted_at = now(), submitted_by = auth.uid() where id in (select id from public._do_grupo(_booking));
  return jsonb_build_object('presentes', n_pres, 'faltas', n_falta, 'sem_falta', n_nao);
end $$;

-- Depois de fechar: corrigir a presença pede motivo; o pack acerta sozinho e o cliente é avisado
create or replace function public.correct_attendance(_booking uuid, _status text, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; antes text; tz text;
begin
  select * into b from public.bookings where id = _booking for update;
  if not found or not public._pode_dar(_booking) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if b.submitted_at is null then raise exception 'ainda não foi fechada' using errcode = 'check_violation'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'falta o motivo' using errcode = 'check_violation'; end if;
  if _status not in ('presente','atrasado','saiu_cedo','faltou','nao_treina') then raise exception 'presença inválida' using errcode = 'invalid_parameter_value'; end if;
  select status into antes from public.attendance where booking_id = _booking;
  if antes = _status then return; end if;
  insert into public.attendance (booking_id, org_id, link_id, status, marked_by)
    values (_booking, b.org_id, b.link_id, _status, public.my_membership_id(b.org_id))
    on conflict (booking_id) do update set status = excluded.status, marked_by = excluded.marked_by, marked_at = now();
  if _status in ('presente','atrasado','saiu_cedo') then
    update public.bookings set status = 'completed', late_cancel = false, cancel_reason = null where id = _booking;
  elsif _status = 'faltou' then
    update public.bookings set status = 'no_show', late_cancel = false where id = _booking;
  else
    update public.bookings set status = 'cancelled', late_cancel = false, cancel_reason = 'Não pôde treinar' where id = _booking;
  end if;
  insert into public.attendance_corrections (org_id, booking_id, link_id, before, after, reason, actor_user)
    values (b.org_id, _booking, b.link_id, antes, _status, trim(_reason), auth.uid());
  insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user)
    values (b.org_id, b.link_id, 'sessao', 'Presença corrigida: ' || coalesce(antes, '—') || ' → ' || _status, _booking, auth.uid());
  tz := coalesce((select timezone from public.organizations where id = b.org_id), 'Europe/Lisbon');
  insert into public.notifications (user_id, org_id, type, title, body, action_url)
    select p.user_id, b.org_id, 'presenca_corrigida', 'A tua sessão foi corrigida',
      to_char(b.starts_at at time zone tz, 'DD/MM HH24:MI') || ' · ' ||
      case _status when 'faltou' then 'conta como falta' when 'nao_treina' then 'não conta' else 'conta como feita' end, '/aulas'
    from public.links l join public.persons p on p.id = l.person_id where l.id = b.link_id and p.user_id is not null;
end $$;

-- Corrigir uma série depois de fechar: com motivo, no registo de correções
create or replace function public.correct_set(_set uuid, _reps int, _carga numeric, _rpe numeric, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  select ss.id, x.booking_id, x.org_id, x.link_id into s
    from public.session_sets ss join public.sessions x on x.id = ss.session_id where ss.id = _set;
  if s.id is null or s.booking_id is null or not public._pode_dar(s.booking_id) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'falta o motivo' using errcode = 'check_violation'; end if;
  perform set_config('luna.motivo', trim(_reason), true);
  update public.session_sets set reps = _reps, load_kg = _carga, rpe = _rpe where id = _set;
  perform set_config('luna.motivo', '', true);
end $$;

-- Histórico da sessão fechada (G-14): correções de presença e de séries
create or replace function public.session_history(_booking uuid)
returns table (em timestamptz, quem text, texto text, motivo text)
language sql stable security definer set search_path = '' as $$
  select * from (
    select c.created_at, p.full_name, cl.full_name || ': ' || coalesce(c.before, '—') || ' → ' || c.after, c.reason
    from public.attendance_corrections c join public.clients cl on cl.id = c.link_id
    left join public.persons p on p.user_id = c.actor_user
    where c.booking_id in (select id from public._do_grupo(_booking)) and public._pode_dar(_booking)
    union all
    select e.created_at, p.full_name,
      cl.full_name || ': série ' || coalesce((e.before->>'reps'), '—') || '×' || coalesce((e.before->>'carga'), '—') || ' → '
        || coalesce((e.after->>'reps'), '—') || '×' || coalesce((e.after->>'carga'), '—'), e.reason
    from public.session_set_edits e join public.sessions s on s.id = e.session_id join public.clients cl on cl.id = s.link_id
    left join public.persons p on p.user_id = e.actor_user
    where s.booking_id in (select id from public._do_grupo(_booking)) and e.reason is not null and public._pode_dar(_booking)
    union all
    select b.submitted_at, p.full_name, 'Sessão fechada', null
    from public.bookings b left join public.persons p on p.user_id = b.submitted_by
    where b.id = _booking and b.submitted_at is not null and public._pode_dar(_booking)
  ) h order by 1 desc;
$$;

-- Pequeno grupo: marcar vários clientes na mesma hora (uma marcação cada, o mesmo grupo)
create or replace function public.create_group_booking(_org uuid, _membership uuid, _links uuid[], _starts timestamptz, _minutes int, _title text default null, _room uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_group uuid := gen_random_uuid(); l uuid; n int := 0;
begin
  if not public.has_perm(_org, 'schedule.write') or (_membership <> public.my_membership_id(_org) and not public.has_perm(_org, 'schedule.read_all')) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(_links, 1), 0) < 2 then raise exception 'um grupo tem pelo menos 2 clientes' using errcode = 'check_violation'; end if;
  foreach l in array _links loop
    if not exists (select 1 from public.links where id = l and org_id = _org and public.can_see_link(id)) then
      raise exception 'cliente inválido' using errcode = 'insufficient_privilege';
    end if;
    insert into public.bookings (id, org_id, membership_id, link_id, room_id, type, status, title, starts_at, ends_at, source, group_id)
      values (case when n = 0 then v_group else gen_random_uuid() end, _org, _membership, l, case when n = 0 then _room end, 'training', 'confirmed',
              coalesce(nullif(trim(_title), ''), 'Pequeno grupo'), _starts, _starts + make_interval(mins => _minutes), 'manual', v_group);
    n := n + 1;
  end loop;
  return v_group;
end $$;

revoke execute on function public._pode_dar(uuid), public._do_grupo(uuid), public._treino_do_dia(uuid, date) from public, anon, authenticated;
revoke execute on function public.prepare_session(uuid), public.sync_live(jsonb), public.stale_sessions(uuid), public.submit_live(uuid),
  public.correct_attendance(uuid, text, text), public.correct_set(uuid, int, numeric, numeric, text), public.session_history(uuid),
  public.create_group_booking(uuid, uuid, uuid[], timestamptz, int, text, uuid) from public, anon;
grant execute on function public.prepare_session(uuid), public.sync_live(jsonb), public.stale_sessions(uuid), public.submit_live(uuid),
  public.correct_attendance(uuid, text, text), public.correct_set(uuid, int, numeric, numeric, text), public.session_history(uuid),
  public.create_group_booking(uuid, uuid, uuid[], timestamptz, int, text, uuid) to authenticated;
