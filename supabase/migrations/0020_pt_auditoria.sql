-- ============================================================
-- LUNA.OS v3 · 0020 · Peças do PT pedidas pela auditoria (tarefa 29 parte A).
--   · Regras de marcação completas: falta conta, máximo por semana, o cliente
--     marca na app ou não, lembretes 24 h e 2 h (horas de silêncio) e avisos
--     ao PT. Lembretes saem por uma função chamada de 5 em 5 minutos.
--   · Locais do PT (estúdio, casa do cliente, parque, online) nas sessões.
--   · Calendário iCal só de leitura, sem o nome do cliente por omissão;
--     gerar nova invalida a antiga.
--   · Resumo da sessão partilhado com o cliente (nota pública).
--   · Passar os clientes de um PT que sai para outro, com registo.
--   · Importar com saldo de sessões do pack.
-- ============================================================

alter table public.booking_rules
  add column no_show_counts    boolean not null default true,
  add column max_per_week      int check (max_per_week is null or max_per_week between 1 and 14),
  add column client_can_book   boolean not null default true,
  add column remind_24h        boolean not null default true,
  add column remind_2h         boolean not null default true,
  add column remind_sms        boolean not null default false,
  add column notify_pt         boolean not null default true;
-- a predefinição pedida pela auditoria: 12 h de antecedência, 24 h para cancelar sem custo
alter table public.booking_rules alter column min_notice_hours set default 12, alter column cancel_hours set default 24;

create or replace function public._regras(_org uuid) returns public.booking_rules
language sql stable security definer set search_path = '' as $$
  select coalesce((select r from public.booking_rules r where r.org_id = _org),
    row(_org, 60, 12, 24, false, 21, now(), true, null, true, true, true, false, true)::public.booking_rules);
$$;

-- Falta sem aviso só conta se a regra disser (desconto do pack)
create or replace function public._tg_pack_marcacao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare conta text;
begin
  if new.link_id is null or new.type not in ('training') then return new; end if;
  conta := case when new.status = 'completed' then 'sessao'
                when new.status = 'no_show' and (public._regras(new.org_id)).no_show_counts then 'falta'
                when new.status = 'cancelled' and new.late_cancel then 'fora_do_prazo' end;
  if conta is not null and (tg_op = 'INSERT' or old.status is distinct from new.status or old.late_cancel is distinct from new.late_cancel) then
    perform public._descontar(new.org_id, new.link_id, new.id, null, conta, (new.starts_at at time zone 'UTC')::date);
  elsif conta is null and tg_op = 'UPDATE' and old.status in ('completed','no_show','cancelled') then
    perform public._devolver(new.id, null);
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Locais do PT
-- ---------------------------------------------------------------------------
create table public.pt_locations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  kind          text not null check (kind in ('estudio','casa_cliente','parque','online')),
  label         text not null,
  address       text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade
);
alter table public.pt_locations enable row level security;
create policy pt_locations_select on public.pt_locations for select to authenticated using (public.is_member(org_id));
create policy pt_locations_write on public.pt_locations for all to authenticated
  using (public.has_perm(org_id, 'schedule.write') and (membership_id = public.my_membership_id(org_id) or public.has_perm(org_id, 'schedule.read_all')))
  with check (public.has_perm(org_id, 'schedule.write') and (membership_id = public.my_membership_id(org_id) or public.has_perm(org_id, 'schedule.read_all')));
grant select, insert, update, delete on public.pt_locations to authenticated;
revoke all on public.pt_locations from anon;
alter table public.bookings add column location_kind text check (location_kind is null or location_kind in ('estudio','casa_cliente','parque','online'));

-- Marcar na app: só se a regra deixar e sem passar o máximo por semana
create or replace function public.book_my_pt(_link uuid, _starts timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; r public.booking_rules; v uuid; n int;
begin
  select * into l from public.links where id = _link;
  if not found or not public.is_my_link(_link) or l.status <> 'active' then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  r := public._regras(l.org_id);
  if not r.client_can_book then raise exception 'o teu treinador marca as sessões por ti' using errcode = 'check_violation'; end if;
  if r.max_per_week is not null then
    select count(*) into n from public.bookings b
      where b.link_id = _link and b.status in ('pending','confirmed','completed')
        and date_trunc('week', b.starts_at) = date_trunc('week', _starts);
    if n >= r.max_per_week then raise exception 'máximo de % sessões por semana', r.max_per_week using errcode = 'check_violation'; end if;
  end if;
  if not exists (select 1 from public.my_pt_slots(_link, (_starts at time zone 'UTC')::date - 1, 3) s where s.inicio = _starts) then
    raise exception 'esta hora já não está livre' using errcode = 'exclusion_violation';
  end if;
  insert into public.bookings (org_id, membership_id, link_id, type, status, title, starts_at, ends_at, source)
    values (l.org_id, l.responsible_membership_id, l.id, 'training', case when r.auto_confirm then 'confirmed' else 'pending' end::public.booking_status,
            'Sessão de PT', _starts, _starts + make_interval(mins => r.slot_minutes), 'client')
    returning id into v;
  if r.notify_pt then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      select p.user_id, l.org_id, 'marcacao_cliente', (select full_name from public.persons where id = l.person_id) || ' marcou uma sessão',
        to_char(_starts at time zone coalesce((select timezone from public.organizations where id = l.org_id), 'Europe/Lisbon'), 'DD/MM HH24:MI'), '/schedule'
      from public.memberships m join public.persons p on p.id = m.person_id where m.id = l.responsible_membership_id and p.user_id is not null;
  end if;
  return v;
end $$;

-- Desmarcar avisa o PT
create or replace function public.cancel_my_booking(_booking uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; r public.booking_rules; fora boolean;
begin
  select * into b from public.bookings where id = _booking;
  if not found or b.link_id is null or not public.is_my_link(b.link_id) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if b.status not in ('pending','confirmed') or b.starts_at <= now() then raise exception 'esta sessão já não se pode desmarcar' using errcode = 'check_violation'; end if;
  r := public._regras(b.org_id);
  fora := b.starts_at < now() + make_interval(hours => r.cancel_hours);
  update public.bookings set status = 'cancelled', late_cancel = fora,
    cancel_reason = case when fora then 'Desmarcada pelo cliente fora do prazo' else 'Desmarcada pelo cliente' end where id = _booking;
  if r.notify_pt then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      select p.user_id, b.org_id, 'desmarcacao_cliente',
        (select pc.full_name from public.links l join public.persons pc on pc.id = l.person_id where l.id = b.link_id) || ' desmarcou' || case when fora then ' fora do prazo (conta)' else '' end,
        to_char(b.starts_at at time zone coalesce((select timezone from public.organizations where id = b.org_id), 'Europe/Lisbon'), 'DD/MM HH24:MI'), '/schedule'
      from public.memberships m join public.persons p on p.id = m.person_id where m.id = b.membership_id and p.user_id is not null;
  end if;
  return case when fora then 'conta' else 'dentro_prazo' end;
end $$;

-- ---------------------------------------------------------------------------
-- Lembretes 24 h e 2 h antes, com horas de silêncio (22:00 a 08:00)
-- ---------------------------------------------------------------------------
create table public.booking_reminders (
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind       text not null check (kind in ('24h','2h')),
  sent_at    timestamptz not null default now(),
  primary key (booking_id, kind)
);
alter table public.booking_reminders enable row level security;
revoke all on public.booking_reminders from anon, authenticated;

-- Corre de 5 em 5 minutos (cron da Edge Function, só com a chave de serviço)
-- Preferências de avisos do cliente na app: lembretes ligados ou não; as horas
-- de silêncio já existem (user_settings.quiet_hours_start/end)
alter table public.user_settings add column reminders_on boolean not null default true;

create or replace function public._enviar_lembretes(_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
declare b record; n int := 0; tz text; hora int;
begin
  for b in
    select x.id, x.org_id, x.starts_at, x.link_id, k.kind, p.user_id, p.phone,
           coalesce(o.timezone, 'Europe/Lisbon') as tz, public._regras(x.org_id) as r,
           coalesce(us.reminders_on, true) as quer, extract(hour from coalesce(us.quiet_hours_start, '22:00'))::int as qde, extract(hour from coalesce(us.quiet_hours_end, '08:00'))::int as qate
    from public.bookings x
    join public.links l on l.id = x.link_id join public.persons p on p.id = l.person_id
    join public.organizations o on o.id = x.org_id
    left join public.user_settings us on us.user_id = p.user_id
    cross join (values ('24h', interval '24 hours'), ('2h', interval '2 hours')) k(kind, antes)
    where x.status in ('pending','confirmed') and x.starts_at > _now
      and x.starts_at - k.antes <= _now and x.starts_at - k.antes > _now - interval '12 hours'
      and not exists (select 1 from public.booking_reminders br where br.booking_id = x.id and br.kind = k.kind)
  loop
    if (b.kind = '24h' and not (b.r).remind_24h) or (b.kind = '2h' and not (b.r).remind_2h) then continue; end if;
    if not b.quer then
      insert into public.booking_reminders (booking_id, kind) values (b.id, b.kind);
      continue;
    end if;
    hora := extract(hour from _now at time zone b.tz)::int;
    -- Horas de silêncio (por omissão 22h–8h, cada cliente muda na app): o de 24 h espera;
    -- o de 2 h sai na mesma se a sessão for cedo (antes das 10:00)
    if (case when b.qde > b.qate then hora >= b.qde or hora < b.qate else hora >= b.qde and hora < b.qate end)
       and not (b.kind = '2h' and extract(hour from b.starts_at at time zone b.tz) < 10) then continue; end if;
    insert into public.booking_reminders (booking_id, kind) values (b.id, b.kind);
    if b.user_id is not null then
      insert into public.notifications (user_id, org_id, type, title, body, action_url)
        values (b.user_id, b.org_id, 'lembrete', case b.kind when '24h' then 'Amanhã tens sessão' else 'Daqui a 2 horas tens sessão' end,
                to_char(b.starts_at at time zone b.tz, 'DD/MM HH24:MI'), '/aulas');
    end if;
    if (b.r).remind_sms and b.phone is not null then
      insert into public.outbox (channel, recipient, template, payload)
        values ('sms', public._tel(b.phone), 'lembrete_sessao', jsonb_build_object('quando', to_char(b.starts_at at time zone b.tz, 'DD/MM HH24:MI')));
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._enviar_lembretes(timestamptz) from public, anon, authenticated;
grant execute on function public._enviar_lembretes(timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- Calendário iCal só de leitura (a ligação traz um código; gerar nova invalida a antiga)
-- ---------------------------------------------------------------------------
create table public.calendar_feeds (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  token_hash    text not null unique,
  show_names    boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
create policy calendar_feeds_select on public.calendar_feeds for select to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id and m.person_id = public.my_person_id()));
grant select on public.calendar_feeds to authenticated;
revoke all on public.calendar_feeds from anon;

create or replace function public.new_calendar_feed(_org uuid, _show_names boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare m uuid := public.my_membership_id(_org); v text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if m is null then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  insert into public.calendar_feeds (membership_id, token_hash, show_names) values (m, encode(sha256(convert_to(v, 'UTF8')), 'hex'), _show_names)
    on conflict (membership_id) do update set token_hash = excluded.token_hash, show_names = excluded.show_names, created_at = now();
  return v;
end $$;

-- Só o servidor (Edge Function ical) lê o calendário a partir do código
create or replace function public._calendar_events(_token text)
returns table (uid uuid, inicio timestamptz, fim timestamptz, titulo text, local text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.starts_at, b.ends_at,
    -- Sem "mostrar o nome", nem o título vai (pode ter o nome escrito à mão)
    case when f.show_names then coalesce(c.full_name, nullif(b.title, ''), 'Sessão')
         else case b.type when 'consultation' then 'Consulta' when 'assessment' then 'Avaliação' when 'training' then 'Sessão de PT' else 'Ocupado' end end,
    coalesce(b.location, '')
  from public.calendar_feeds f
  join public.bookings b on b.membership_id = f.membership_id
  left join public.links l on l.id = b.link_id left join public.persons c on c.id = l.person_id
  where f.token_hash = encode(sha256(convert_to(_token, 'UTF8')), 'hex')
    and b.status in ('pending','confirmed') and b.starts_at > now() - interval '30 days' and b.starts_at < now() + interval '180 days';
$$;
revoke execute on function public._calendar_events(text) from public, anon, authenticated;
grant execute on function public._calendar_events(text) to service_role;

-- ---------------------------------------------------------------------------
-- Resumo partilhado com o cliente (G-14 "Partilhar com o cliente?")
-- ---------------------------------------------------------------------------
alter table public.sessions add column shared_note text, add column shared_at timestamptz;
create or replace function public.share_session_summary(_session uuid, _note text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.sessions%rowtype;
begin
  select * into s from public.sessions where id = _session;
  if not found or s.link_id is null or not public.can_see_link(s.link_id) or not public.has_perm(s.org_id, 'training.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  update public.sessions set shared_note = nullif(trim(_note), ''), shared_at = now() where id = _session;
  insert into public.notifications (user_id, org_id, type, title, body, action_url)
    select p.user_id, s.org_id, 'resumo_sessao', 'O resumo da tua sessão', left(coalesce(nullif(trim(_note), ''), 'Vê como correu.'), 140), '/progresso'
    from public.persons p where p.id = s.person_id and p.user_id is not null;
end $$;

create or replace function public.my_history(_limit int default 30)
returns table (id uuid, em timestamptz, nome text, minutos int, series int, rpe text)
language sql stable security definer set search_path = '' as $$
  select s.id, coalesce(s.ended_at, s.started_at), coalesce(w.name, 'Treino') || coalesce(' · ' || s.shared_note, ''), round(s.elapsed_seconds / 60.0)::int,
    (select count(*)::int from public.session_sets x where x.session_id = s.id and x.completed), s.summary->>'rpe'
  from public.sessions s left join public.workouts w on w.id = s.workout_id
  where s.person_id = public.my_person_id() and s.phase = 'done'
  order by 2 desc limit least(_limit, 200);
$$;

-- ---------------------------------------------------------------------------
-- Passar os clientes de um PT que sai para outro (com registo)
-- ---------------------------------------------------------------------------
create or replace function public.transfer_clients(_org uuid, _from uuid, _to uuid, _links uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.has_perm(_org, 'clients.read_all') or not public.has_perm(_org, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.memberships where id = _to and org_id = _org and status = 'active') then
    raise exception 'o PT de destino não está ativo' using errcode = 'invalid_parameter_value';
  end if;
  with m as (
    update public.links set responsible_membership_id = _to
    where org_id = _org and responsible_membership_id = _from and (_links is null or id = any (_links))
    returning id, org_id)
  insert into public.link_events (org_id, link_id, kind, title, actor_user)
    select org_id, id, 'dados', 'Passou para ' || (select p.full_name from public.memberships mm join public.persons p on p.id = mm.person_id where mm.id = _to), auth.uid() from m;
  get diagnostics n = row_count;
  -- As sessões futuras do PT que sai passam também
  update public.bookings set membership_id = _to
    where org_id = _org and membership_id = _from and starts_at > now() and status in ('pending','confirmed')
      and (_links is null or link_id = any (_links)) and link_id is not null;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Importar com saldo de sessões do pack
-- ---------------------------------------------------------------------------
create or replace function public.import_clients(_org uuid, _file text, _rows jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; i int := 0; v_ok int := 0; v_falhas jsonb := '[]'::jsonb; v_id uuid; v_nasc date; v_link uuid; v_saldo int;
begin
  if not public.has_perm(_org, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 5000 then
    raise exception 'ficheiro inválido ou com mais de 5000 linhas' using errcode = 'invalid_parameter_value';
  end if;
  for r in select * from jsonb_array_elements(_rows) loop
    i := i + 1;
    begin
      v_nasc := nullif(r->>'nascimento', '')::date;
      v_link := public.add_client(_org, r->>'nome', nullif(r->>'email', ''), nullif(r->>'telefone', ''), v_nasc,
        nullif(r->>'responsavel', '')::uuid, 'pt_client', nullif(r->>'nif', ''));
      v_saldo := nullif(regexp_replace(coalesce(r->>'saldo', ''), '\D', '', 'g'), '')::int;
      if v_saldo is not null and v_saldo > 0 then
        insert into public.client_packs (org_id, link_id, name, sessions_total, sessions_used, starts_on, valid_until, sold_by)
          values (_org, v_link, 'Saldo importado', v_saldo, 0, current_date,
                  coalesce(nullif(r->>'validade', '')::date, current_date + 180), public.my_membership_id(_org));
      end if;
      v_ok := v_ok + 1;
    exception
      when unique_violation then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Já existe (telemóvel, email ou NIF)');
      when check_violation then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Falta o nome');
      when invalid_datetime_format or datetime_field_overflow then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Data inválida');
      when others then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Linha inválida');
    end;
  end loop;
  insert into public.import_runs (org_id, file_name, total, ok, failed, report, created_by)
    values (_org, coalesce(nullif(trim(_file), ''), 'ficheiro'), i, v_ok, i - v_ok, v_falhas, auth.uid()) returning id into v_id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id, diff)
    values (_org, auth.uid(), 'clientes.importar', 'import_runs', v_id, jsonb_build_object('total', i, 'ok', v_ok));
  return v_id;
end $$;

revoke execute on function public.new_calendar_feed(uuid, boolean), public.share_session_summary(uuid, text), public.transfer_clients(uuid, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.new_calendar_feed(uuid, boolean), public.share_session_summary(uuid, text), public.transfer_clients(uuid, uuid, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- App: "Sessão marcada" mostra até quando desmarca sem contar e onde é
-- ---------------------------------------------------------------------------
drop function public.my_bookings();
create function public.my_bookings()
returns table (id uuid, inicio timestamptz, fim timestamptz, titulo text, estado text, com text, pode_desmarcar_sem_contar boolean,
               desmarcar_ate timestamptz, local text)
language sql stable security definer set search_path = '' as $$
  select b.id, b.starts_at, b.ends_at, coalesce(nullif(b.title, ''), 'Sessão'), b.status::text, mp.full_name,
    b.starts_at >= now() + make_interval(hours => (public._regras(b.org_id)).cancel_hours),
    b.starts_at - make_interval(hours => (public._regras(b.org_id)).cancel_hours),
    b.location
  from public.bookings b join public.links l on l.id = b.link_id
  left join public.memberships m on m.id = b.membership_id left join public.persons mp on mp.id = m.person_id
  where l.person_id = public.my_person_id() and b.starts_at >= now() - interval '1 hour' and b.status in ('pending','confirmed')
  order by b.starts_at;
$$;
revoke execute on function public.my_bookings() from public, anon;
grant execute on function public.my_bookings() to authenticated;
