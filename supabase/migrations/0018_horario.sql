-- ============================================================
-- LUNA.OS v3 · 0018 · Horário (tarefa 07, F1a: sessões de PT, consultas e
-- disponibilidade; aulas de grupo e reservas na F2).
--   · Sem sobreposição de sala (P-11), como já não há para o PT.
--   · Conflitos ditos antes de guardar; séries semanais criadas sem conflitos.
--   · Disponibilidade: turno e janelas em que o PT aceita marcações; férias
--     e folgas bloqueiam e avisam.
--   · Regras de marcação da organização; o cliente marca com o seu PT em
--     2 toques e remarca dentro do prazo (fora do prazo a sessão conta).
-- ============================================================

-- Sala: nunca duas sessões ao mesmo tempo (aulas de grupo têm lotação própria, F2)
alter table public.bookings
  add constraint bookings_sala_sem_sobreposicao
  exclude using gist (room_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('pending','confirmed') and type <> 'class' and room_id is not null);
alter table public.bookings
  add column series_id uuid,
  add column late_cancel boolean not null default false;
create index on public.bookings (series_id);

-- Turno (está a trabalhar) ou janela em que aceita marcações de PT
alter table public.availability add column kind text not null default 'marcacoes' check (kind in ('turno','marcacoes'));

-- Regras de marcação da organização
create table public.booking_rules (
  org_id            uuid primary key references public.organizations(id) on delete cascade,
  slot_minutes      int not null default 60 check (slot_minutes between 15 and 240),
  min_notice_hours  int not null default 2 check (min_notice_hours between 0 and 168),
  cancel_hours      int not null default 12 check (cancel_hours between 0 and 168),
  auto_confirm      boolean not null default false,
  horizon_days      int not null default 21 check (horizon_days between 1 and 90),
  updated_at        timestamptz not null default now()
);
alter table public.booking_rules enable row level security;
create policy booking_rules_select on public.booking_rules for select to authenticated using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy booking_rules_write on public.booking_rules for all to authenticated
  using (public.has_perm(org_id, 'org.manage')) with check (public.has_perm(org_id, 'org.manage'));
grant select, insert, update on public.booking_rules to authenticated;
revoke all on public.booking_rules from anon;

create or replace function public._regras(_org uuid) returns public.booking_rules
language sql stable security definer set search_path = '' as $$
  select coalesce((select r from public.booking_rules r where r.org_id = _org), row(_org, 60, 2, 12, false, 21, now())::public.booking_rules);
$$;

-- ---------------------------------------------------------------------------
-- Conflitos antes de guardar: PT, sala, férias e folgas
-- ---------------------------------------------------------------------------
create or replace function public.schedule_conflicts(
  _org uuid, _membership uuid, _room uuid, _starts timestamptz, _ends timestamptz, _ignore uuid default null
) returns table (motivo text)
language plpgsql stable security definer set search_path = '' as $$
declare tz text := coalesce((select timezone from public.organizations where id = _org), 'Europe/Lisbon');
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
    select 'Já tem ' || coalesce(nullif(b.title, ''), 'uma sessão') || ' às ' || to_char(b.starts_at at time zone tz, 'HH24:MI')
    from public.bookings b
    where _membership is not null and b.membership_id = _membership and b.type <> 'class' and b.status in ('pending','confirmed')
      and (_ignore is null or b.id <> _ignore) and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(_starts, _ends, '[)')
    union all
    select 'A sala ' || r.name || ' está ocupada às ' || to_char(b.starts_at at time zone tz, 'HH24:MI')
    from public.bookings b join public.rooms r on r.id = b.room_id
    where _room is not null and b.room_id = _room and b.type <> 'class' and b.status in ('pending','confirmed')
      and (_ignore is null or b.id <> _ignore) and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(_starts, _ends, '[)')
    union all
    select case m.marker when 'vacation' then 'Está de férias' when 'off' then 'É dia de folga' when 'holiday' then 'É feriado' else 'Está indisponível' end
      || ' a ' || to_char(m.date, 'DD/MM')
    from public.day_markers m
    where m.org_id = _org and (m.membership_id = _membership or (m.membership_id is null and m.marker = 'holiday'))
      and m.date between (_starts at time zone tz)::date and (_ends at time zone tz)::date
      and m.marker in ('unavailable','holiday','off','vacation');
end $$;

-- Série semanal: só cria se nenhuma ocorrência tiver conflito
create or replace function public.create_booking_series(
  _org uuid, _membership uuid, _link uuid, _room uuid, _type public.booking_type, _title text,
  _first timestamptz, _minutes int, _until date
) returns int language plpgsql security definer set search_path = '' as $$
declare v_series uuid := gen_random_uuid(); d timestamptz := _first; n int := 0; tz text;
begin
  if not public.has_perm(_org, 'schedule.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _link is not null and not public.can_see_link(_link) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _until > (_first::date + 366) then raise exception 'repetição até um ano' using errcode = 'invalid_parameter_value'; end if;
  tz := coalesce((select timezone from public.organizations where id = _org), 'Europe/Lisbon');
  -- Repetir à mesma hora local (atravessa a mudança de hora)
  while (d at time zone tz)::date <= _until loop
    if exists (select 1 from public.schedule_conflicts(_org, _membership, _room, d, d + make_interval(mins => _minutes))) then
      raise exception 'conflito a %', to_char(d at time zone tz, 'DD/MM HH24:MI') using errcode = 'exclusion_violation';
    end if;
    d := ((d at time zone tz) + interval '7 days') at time zone tz;
  end loop;
  d := _first;
  while (d at time zone tz)::date <= _until loop
    insert into public.bookings (org_id, membership_id, link_id, room_id, type, status, title, starts_at, ends_at, series_id, source)
      values (_org, _membership, _link, _room, _type, 'confirmed', _title, d, d + make_interval(mins => _minutes), v_series, 'manual');
    n := n + 1;
    d := ((d at time zone tz) + interval '7 days') at time zone tz;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- App do cliente: marcar com o meu PT (C-06)
-- ---------------------------------------------------------------------------
create or replace function public.my_pt_slots(_link uuid, _from date default current_date, _days int default 7)
returns table (inicio timestamptz, fim timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare l public.links%rowtype; r public.booking_rules; tz text;
begin
  select * into l from public.links where id = _link;
  if not found or not public.is_my_link(_link) or l.status <> 'active' then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  r := public._regras(l.org_id);
  tz := coalesce((select timezone from public.organizations where id = l.org_id), 'Europe/Lisbon');
  return query
    with dias as (select generate_series(_from, _from + least(_days, r.horizon_days) - 1, interval '1 day')::date d),
    janelas as (
      select d.d, a.start_time, a.end_time from dias d
      join public.availability a on a.membership_id = l.responsible_membership_id and a.weekday = extract(dow from d.d)::int
        and a.is_available and a.kind = 'marcacoes'
      where not exists (select 1 from public.day_markers m where m.org_id = l.org_id and m.date = d.d
                        and (m.membership_id = l.responsible_membership_id or (m.membership_id is null and m.marker = 'holiday'))
                        and m.marker in ('unavailable','holiday','off','vacation'))
    ),
    slots as (
      select ((j.d + j.start_time) at time zone tz) + (k * make_interval(mins => r.slot_minutes)) as ini
      from janelas j cross join generate_series(0, 47) k
      where j.start_time + (k + 1) * make_interval(mins => r.slot_minutes) <= j.end_time
    )
    select s.ini, s.ini + make_interval(mins => r.slot_minutes) from slots s
    where s.ini >= now() + make_interval(hours => r.min_notice_hours)
      and not public._booking_conflict(l.responsible_membership_id, s.ini, s.ini + make_interval(mins => r.slot_minutes))
    order by 1;
end $$;

create or replace function public.book_my_pt(_link uuid, _starts timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; r public.booking_rules; v uuid;
begin
  select * into l from public.links where id = _link;
  if not found or not public.is_my_link(_link) or l.status <> 'active' then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  r := public._regras(l.org_id);
  if not exists (select 1 from public.my_pt_slots(_link, (_starts at time zone 'UTC')::date - 1, 3) s where s.inicio = _starts) then
    raise exception 'esta hora já não está livre' using errcode = 'exclusion_violation';
  end if;
  insert into public.bookings (org_id, membership_id, link_id, type, status, title, starts_at, ends_at, source)
    values (l.org_id, l.responsible_membership_id, l.id, 'training', case when r.auto_confirm then 'confirmed' else 'pending' end::public.booking_status,
            'Sessão de PT', _starts, _starts + make_interval(mins => r.slot_minutes), 'client')
    returning id into v;
  insert into public.notifications (user_id, org_id, type, title, body, action_url)
    select p.user_id, l.org_id, 'marcacao_cliente', (select full_name from public.persons where id = l.person_id) || ' marcou uma sessão',
      to_char(_starts at time zone coalesce((select timezone from public.organizations where id = l.org_id), 'Europe/Lisbon'), 'DD/MM HH24:MI'),
      '/schedule'
    from public.memberships m join public.persons p on p.id = m.person_id where m.id = l.responsible_membership_id and p.user_id is not null;
  return v;
end $$;

-- Desmarcar: dentro do prazo não conta; fora do prazo a sessão conta (late_cancel)
create or replace function public.cancel_my_booking(_booking uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare b public.bookings%rowtype; r public.booking_rules; fora boolean;
begin
  select * into b from public.bookings where id = _booking;
  if not found or b.link_id is null or not public.is_my_link(b.link_id) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if b.status not in ('pending','confirmed') or b.starts_at <= now() then raise exception 'esta sessão já não se pode desmarcar' using errcode = 'check_violation'; end if;
  r := public._regras(b.org_id);
  fora := b.starts_at < now() + make_interval(hours => r.cancel_hours);
  update public.bookings set status = 'cancelled', late_cancel = fora, cancel_reason = case when fora then 'Desmarcada pelo cliente fora do prazo' else 'Desmarcada pelo cliente' end
    where id = _booking;
  return case when fora then 'conta' else 'dentro_prazo' end;
end $$;

-- As minhas sessões marcadas (próximas)
create or replace function public.my_bookings()
returns table (id uuid, inicio timestamptz, fim timestamptz, titulo text, estado text, com text, pode_desmarcar_sem_contar boolean)
language sql stable security definer set search_path = '' as $$
  select b.id, b.starts_at, b.ends_at, coalesce(nullif(b.title, ''), 'Sessão'), b.status::text, mp.full_name,
    b.starts_at >= now() + make_interval(hours => (public._regras(b.org_id)).cancel_hours)
  from public.bookings b join public.links l on l.id = b.link_id
  left join public.memberships m on m.id = b.membership_id left join public.persons mp on mp.id = m.person_id
  where l.person_id = public.my_person_id() and b.starts_at >= now() - interval '1 hour' and b.status in ('pending','confirmed')
  order by b.starts_at;
$$;

revoke execute on function public._regras(uuid) from public, anon, authenticated;
revoke execute on function public.schedule_conflicts(uuid, uuid, uuid, timestamptz, timestamptz, uuid),
  public.create_booking_series(uuid, uuid, uuid, uuid, public.booking_type, text, timestamptz, int, date),
  public.my_pt_slots(uuid, date, int), public.book_my_pt(uuid, timestamptz), public.cancel_my_booking(uuid), public.my_bookings() from public, anon;
grant execute on function public.schedule_conflicts(uuid, uuid, uuid, timestamptz, timestamptz, uuid),
  public.create_booking_series(uuid, uuid, uuid, uuid, public.booking_type, text, timestamptz, int, date),
  public.my_pt_slots(uuid, date, int), public.book_my_pt(uuid, timestamptz), public.cancel_my_booking(uuid), public.my_bookings() to authenticated;
