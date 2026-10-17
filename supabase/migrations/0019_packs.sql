-- ============================================================
-- LUNA.OS v3 · 0019 · Packs de sessões de PT (tarefa 26 parte A, D18).
--   · O PT cria packs (sessões, validade, preço) e vende-os a um cliente.
--   · Cada sessão feita (ou falta, ou desmarcação fora do prazo) desconta
--     do pack válido mais antigo, uma só vez; voltar atrás devolve.
--   · Saldo e validade na ficha (G-06) e na app (C-06); "em atenção" passa
--     a ter as regras dos packs (2 sessões ou menos; validade em 7 dias).
-- O LunaOS não cobra os clientes do PT: o pagamento regista-se à mão (F1b).
-- ============================================================

create table public.pack_products (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  name           text not null check (length(trim(name)) > 0),
  sessions       int not null check (sessions between 1 and 200),
  validity_days  int not null check (validity_days between 1 and 730),
  price_cents    int not null default 0 check (price_cents >= 0),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  unique (id, org_id)
);

create table public.client_packs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  link_id         uuid not null,
  product_id      uuid,
  name            text not null,
  sessions_total  int not null check (sessions_total > 0),
  sessions_used   int not null default 0 check (sessions_used >= 0),
  starts_on       date not null default current_date,
  valid_until     date not null,
  price_cents     int not null default 0,
  sold_by         uuid,
  created_at      timestamptz not null default now(),
  check (sessions_used <= sessions_total),
  unique (id, org_id),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references public.pack_products(id, org_id) on delete set null (product_id),
  foreign key (sold_by, org_id) references public.memberships(id, org_id) on delete set null (sold_by)
);
create index on public.client_packs (link_id, valid_until);

create table public.pack_usages (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  pack_id     uuid not null,
  booking_id  uuid,
  session_id  uuid,
  motivo      text not null default 'sessao' check (motivo in ('sessao','falta','fora_do_prazo')),
  used_at     timestamptz not null default now(),
  reverted_at timestamptz,
  foreign key (pack_id, org_id) references public.client_packs(id, org_id) on delete cascade
);
create unique index pack_usages_uma_por_marcacao on public.pack_usages (booking_id) where booking_id is not null and reverted_at is null;
create unique index pack_usages_uma_por_sessao on public.pack_usages (session_id) where session_id is not null and reverted_at is null;

alter table public.pack_products enable row level security;
alter table public.client_packs enable row level security;
alter table public.pack_usages enable row level security;
create policy pack_products_select on public.pack_products for select to authenticated using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy pack_products_write on public.pack_products for all to authenticated
  using (public.has_perm(org_id, 'clients.write')) with check (public.has_perm(org_id, 'clients.write'));
create policy client_packs_select on public.client_packs for select to authenticated using (public.can_see_link(link_id) or public.is_my_link(link_id));
create policy pack_usages_select on public.pack_usages for select to authenticated
  using (exists (select 1 from public.client_packs p where p.id = pack_id and (public.can_see_link(p.link_id) or public.is_my_link(p.link_id))));
grant select, insert, update on public.pack_products to authenticated;
grant select on public.client_packs, public.pack_usages to authenticated;
revoke all on public.pack_products, public.client_packs, public.pack_usages from anon;

-- Vender: cria o pack do cliente a partir do produto (validade a contar de hoje)
create or replace function public.sell_pack(_link uuid, _product uuid, _starts_on date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; p public.pack_products%rowtype; v uuid;
begin
  select * into l from public.links where id = _link;
  select * into p from public.pack_products where id = _product;
  if l.id is null or p.id is null or p.org_id <> l.org_id or p.archived_at is not null
     or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  insert into public.client_packs (org_id, link_id, product_id, name, sessions_total, starts_on, valid_until, price_cents, sold_by)
    values (l.org_id, l.id, p.id, p.name, p.sessions, _starts_on, _starts_on + p.validity_days, p.price_cents, public.my_membership_id(l.org_id))
    returning id into v;
  insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user)
    values (l.org_id, l.id, 'dados', 'Pack vendido: ' || p.name, v, auth.uid());
  return v;
end $$;

-- Desconta uma sessão do pack válido mais antigo (uma só vez por marcação ou sessão)
create or replace function public._descontar(_org uuid, _link uuid, _booking uuid, _session uuid, _motivo text, _quando date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pack uuid;
begin
  if _booking is not null and exists (select 1 from public.pack_usages where booking_id = _booking and reverted_at is null) then return; end if;
  if _session is not null and exists (select 1 from public.pack_usages where session_id = _session and reverted_at is null) then return; end if;
  select id into v_pack from public.client_packs
    where link_id = _link and sessions_used < sessions_total and starts_on <= _quando and valid_until >= _quando
    order by valid_until, created_at limit 1 for update;
  if v_pack is null then return; end if;   -- sem pack válido: a sessão fica por pagar (aviso ao marcar)
  insert into public.pack_usages (org_id, pack_id, booking_id, session_id, motivo) values (_org, v_pack, _booking, _session, _motivo);
  update public.client_packs set sessions_used = sessions_used + 1 where id = v_pack;
end $$;

create or replace function public._devolver(_booking uuid, _session uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare u record;
begin
  for u in select * from public.pack_usages
           where reverted_at is null and ((_booking is not null and booking_id = _booking) or (_session is not null and session_id = _session)) loop
    update public.pack_usages set reverted_at = now() where id = u.id;
    update public.client_packs set sessions_used = greatest(0, sessions_used - 1) where id = u.pack_id;
  end loop;
end $$;

-- Marcações: feita, falta e desmarcação fora do prazo descontam; voltar atrás devolve
create or replace function public._tg_pack_marcacao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare conta text;
begin
  if new.link_id is null or new.type not in ('training') then return new; end if;
  conta := case when new.status = 'completed' then 'sessao' when new.status = 'no_show' then 'falta'
                when new.status = 'cancelled' and new.late_cancel then 'fora_do_prazo' end;
  if conta is not null and (tg_op = 'INSERT' or old.status is distinct from new.status or old.late_cancel is distinct from new.late_cancel) then
    perform public._descontar(new.org_id, new.link_id, new.id, null, conta, (new.starts_at at time zone 'UTC')::date);
  elsif conta is null and tg_op = 'UPDATE' and old.status in ('completed','no_show','cancelled') then
    perform public._devolver(new.id, null);
  end if;
  return new;
end $$;
create trigger bookings_pack after insert or update of status, late_cancel on public.bookings
  for each row execute function public._tg_pack_marcacao();

-- Sessão ao vivo sem marcação também desconta (com marcação, desconta a marcação)
create or replace function public._tg_pack_sessao() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.link_id is null or new.org_id is null then return new; end if;
  if new.phase = 'done' and (tg_op = 'INSERT' or old.phase is distinct from 'done') then
    if new.booking_id is not null then
      update public.bookings set status = 'completed' where id = new.booking_id and status in ('pending','confirmed');
      if exists (select 1 from public.bookings b where b.id = new.booking_id and b.type = 'training') then return new; end if;
    end if;
    perform public._descontar(new.org_id, new.link_id, null, new.id, 'sessao', coalesce(new.started_at, now())::date);
  elsif tg_op = 'UPDATE' and old.phase = 'done' and new.phase = 'cancelled' then
    perform public._devolver(null, new.id);
  end if;
  return new;
end $$;
create trigger sessions_pack after insert or update of phase on public.sessions
  for each row execute function public._tg_pack_sessao();

-- Saldo: o pack em uso (o válido mais antigo com sessões) e o que resta
create or replace function public.pack_balance(_link uuid)
returns table (pack_id uuid, nome text, restam int, total int, valido_ate date, estado text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.name, p.sessions_total - p.sessions_used, p.sessions_total, p.valid_until,
    case when p.valid_until < current_date then 'expirado'
         when p.sessions_used >= p.sessions_total then 'esgotado'
         when p.sessions_total - p.sessions_used <= 2 then 'a_acabar'
         when p.valid_until <= current_date + 7 then 'a_expirar'
         else 'ativo' end
  from public.client_packs p where p.link_id = _link
  order by (p.valid_until >= current_date and p.sessions_used < p.sessions_total) desc, p.valid_until, p.created_at desc;
$$;

-- Os meus packs (C-06 e C-22)
create or replace function public.my_packs()
returns table (org text, nome text, restam int, total int, valido_ate date)
language sql stable security definer set search_path = '' as $$
  select o.name, p.name, p.sessions_total - p.sessions_used, p.sessions_total, p.valid_until
  from public.client_packs p join public.links l on l.id = p.link_id join public.organizations o on o.id = p.org_id
  where l.person_id = public.my_person_id() and p.valid_until >= current_date - 30
  order by p.valid_until;
$$;

-- "Em atenção" com as 4 regras de D18 (as dos packs entram agora)
create or replace function public.clients_attention(_org uuid, _now timestamptz default now())
returns table (link_id uuid, full_name text, reasons text[], last_training timestamptz)
language sql stable security invoker set search_path = '' as $$
  with c as (
    select cl.id, cl.full_name, cl.created_at from public.clients cl
    where cl.org_id = _org and cl.status = 'active' and cl.client_status = 'active' and cl.archived_at is null
  ),
  treinos as (
    select s.link_id, coalesce(s.ended_at, s.started_at) as em from public.sessions s
      where s.org_id = _org and s.phase = 'done' and s.link_id is not null
    union all
    select b.link_id, b.starts_at from public.bookings b
      where b.org_id = _org and b.status = 'completed' and b.link_id is not null and b.starts_at <= _now
  ),
  ult as (select t.link_id, max(t.em) as em from treinos t group by t.link_id),
  ultima as (
    select distinct on (b.link_id) b.link_id, b.status from public.bookings b
    where b.org_id = _org and b.link_id is not null and b.starts_at < _now and b.status <> 'cancelled'
    order by b.link_id, b.starts_at desc
  ),
  pk as (
    select p.link_id, min(p.sessions_total - p.sessions_used) as restam, min(p.valid_until) as ate
    from public.client_packs p
    where p.org_id = _org and p.valid_until >= _now::date and p.sessions_used < p.sessions_total
    group by p.link_id
  ),
  r as (
    select c.id, c.full_name, u.em,
      array_remove(array[
        case when coalesce(u.em, c.created_at) < _now - interval '7 days' then 'sem_treinar_7d' end,
        case when ul.status = 'no_show' then 'falta_sem_aviso' end,
        case when pk.restam <= 2 then 'pack_2_sessoes' end,
        case when pk.ate <= _now::date + 7 then 'pack_validade_7d' end
      ], null) as reasons
    from c left join ult u on u.link_id = c.id left join ultima ul on ul.link_id = c.id left join pk on pk.link_id = c.id
  )
  select r.id, r.full_name, r.reasons, r.em from r
  where cardinality(r.reasons) > 0
  order by cardinality(r.reasons) desc, r.em asc nulls first, r.full_name;
$$;

revoke execute on function public._descontar(uuid, uuid, uuid, uuid, text, date), public._devolver(uuid, uuid),
  public._tg_pack_marcacao(), public._tg_pack_sessao() from public, anon, authenticated;
revoke execute on function public.sell_pack(uuid, uuid, date), public.pack_balance(uuid), public.my_packs() from public, anon;
grant execute on function public.sell_pack(uuid, uuid, date), public.pack_balance(uuid), public.my_packs() to authenticated;
