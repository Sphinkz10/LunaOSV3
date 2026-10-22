-- ============================================================
-- LUNA.OS v3 · 0022 · Horário, funções antigas (tarefa 24, G-09 e G-10).
--   · Por confirmar com prazo: ao passar, a hora fica livre e quem marcou
--     é avisado (a função corre no agendador e ao abrir o horário).
--   · Cancelar pede sempre motivo; o cliente é avisado quando não foi ele.
--   · Histórico de cada marcação: antes, depois, quem e quando.
-- ============================================================

alter table public.bookings add column confirm_by timestamptz;

create table public.booking_events (
  id         bigint generated always as identity primary key,
  org_id     uuid not null,
  booking_id uuid not null,
  what       text not null,
  before     text,
  after      text,
  reason     text,
  actor_user uuid,
  created_at timestamptz not null default now(),
  foreign key (booking_id, org_id) references public.bookings(id, org_id) on delete cascade
);
create index on public.booking_events (booking_id, created_at);
alter table public.booking_events enable row level security;
-- Vê o histórico quem vê a marcação (o RLS das marcações aplica-se dentro)
create policy booking_events_select on public.booking_events for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));
grant select on public.booking_events to authenticated;
revoke all on public.booking_events from anon;

-- Prazo por omissão para confirmar: 24 h ou até 2 h antes, o que vier primeiro (nunca menos de 30 min)
create or replace function public._tg_marcacao_antes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending' and new.confirm_by is null and new.type <> 'class' then
    new.confirm_by := greatest(now() + interval '30 minutes', least(now() + interval '24 hours', new.starts_at - interval '2 hours'));
  end if;
  if new.status <> 'pending' then new.confirm_by := null; end if;
  if new.status = 'cancelled' and (tg_op = 'INSERT' or old.status is distinct from 'cancelled')
     and coalesce(trim(new.cancel_reason), '') = '' then
    raise exception 'Cancelar pede um motivo' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger bookings_antes before insert or update on public.bookings
  for each row execute function public._tg_marcacao_antes();

-- Histórico e avisos depois de cada mudança
create or replace function public._tg_marcacao_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare tz text := coalesce((select timezone from public.organizations where id = new.org_id), 'Europe/Lisbon');
  quando text := to_char(new.starts_at at time zone tz, 'DD/MM HH24:MI'); v_cliente uuid;
  est text[] := array['pending','Por confirmar','confirmed','Confirmada','cancelled','Cancelada','completed','Feita','no_show','Faltou','waitlisted','Em espera'];
  rot text;
begin
  if tg_op = 'INSERT' then
    insert into public.booking_events (org_id, booking_id, what, after, actor_user)
      values (new.org_id, new.id, 'Criada', quando || case when new.series_id is not null then ' · série semanal' else '' end, auth.uid());
    return new;
  end if;
  if old.status is distinct from new.status then
    rot := est[array_position(est, new.status::text) + 1];
    insert into public.booking_events (org_id, booking_id, what, before, after, reason, actor_user)
      values (new.org_id, new.id, coalesce(rot, new.status::text), est[array_position(est, old.status::text) + 1], rot,
              case when new.status = 'cancelled' then new.cancel_reason end, auth.uid());
    -- O cliente é avisado quando outra pessoa cancela
    if new.status = 'cancelled' and new.link_id is not null then
      select p.user_id into v_cliente from public.links l join public.persons p on p.id = l.person_id where l.id = new.link_id;
      if v_cliente is not null and v_cliente is distinct from auth.uid() then
        insert into public.notifications (user_id, org_id, type, title, body, action_url)
          values (v_cliente, new.org_id, 'marcacao_cancelada', 'Sessão cancelada', quando || ' · ' || new.cancel_reason, '/aulas');
      end if;
    end if;
  end if;
  if old.starts_at is distinct from new.starts_at or old.ends_at is distinct from new.ends_at then
    insert into public.booking_events (org_id, booking_id, what, before, after, actor_user)
      values (new.org_id, new.id, 'Hora mudada', to_char(old.starts_at at time zone tz, 'DD/MM HH24:MI'), quando, auth.uid());
  end if;
  if old.room_id is distinct from new.room_id then
    insert into public.booking_events (org_id, booking_id, what, before, after, actor_user)
      values (new.org_id, new.id, 'Sala mudada', (select name from public.rooms where id = old.room_id), (select name from public.rooms where id = new.room_id), auth.uid());
  end if;
  if old.membership_id is distinct from new.membership_id then
    insert into public.booking_events (org_id, booking_id, what, before, after, actor_user)
      values (new.org_id, new.id, 'PT mudado',
        (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = old.membership_id),
        (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = new.membership_id), auth.uid());
  end if;
  return new;
end $$;
create trigger bookings_historico after insert or update on public.bookings
  for each row execute function public._tg_marcacao_historico();

-- Por confirmar fora do prazo: liberta a hora e avisa quem marcou e o PT
create or replace function public._expirar_por_confirmar(_org uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare b record; n int := 0;
begin
  for b in select x.* from public.bookings x
           where x.status = 'pending' and x.confirm_by is not null and x.confirm_by < now() and (_org is null or x.org_id = _org)
           for update skip locked loop
    update public.bookings set status = 'cancelled', cancel_reason = 'Não confirmada a tempo' where id = b.id;
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      select p.user_id, b.org_id, 'marcacao_expirada', 'Uma marcação ficou por confirmar',
        to_char(b.starts_at at time zone coalesce((select timezone from public.organizations where id = b.org_id), 'Europe/Lisbon'), 'DD/MM HH24:MI') || ' · a hora ficou livre', '/schedule'
      from public.memberships m join public.persons p on p.id = m.person_id where m.id = b.membership_id and p.user_id is not null;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._expirar_por_confirmar(uuid), public._tg_marcacao_antes(), public._tg_marcacao_historico() from public, anon, authenticated;
grant execute on function public._expirar_por_confirmar(uuid) to service_role;

-- Ao abrir o horário, quem é da organização liberta as que passaram do prazo
create or replace function public.expire_pending(_org uuid)
returns int language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return public._expirar_por_confirmar(_org);
end $$;
revoke execute on function public.expire_pending(uuid) from public, anon;
grant execute on function public.expire_pending(uuid) to authenticated;

-- O agendador dos lembretes também liberta as horas por confirmar
create or replace function public._enviar_lembretes_e_expirar(_now timestamptz default now())
returns int language plpgsql security definer set search_path = '' as $$
begin
  perform public._expirar_por_confirmar(null);
  return public._enviar_lembretes(_now);
end $$;
revoke execute on function public._enviar_lembretes_e_expirar(timestamptz) from public, anon, authenticated;
grant execute on function public._enviar_lembretes_e_expirar(timestamptz) to service_role;
