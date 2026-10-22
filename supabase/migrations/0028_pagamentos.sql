-- ============================================================
-- LUNA.OS v3 · 0028 · Pagamentos registados e dinheiro do PT
-- (tarefa 26 parte B e tarefa 29 parte B; F1b passos 25 e 25b).
--   · O LunaOS não cobra os clientes do PT (D17): o PT regista à mão o que
--     recebeu (P-14). Um registo nunca se apaga: corrige-se com outro, com
--     motivo, e ambos ficam no histórico. O cliente nunca vê a nota interna.
--   · G-33 com quatro tipos: pack, mensalidade, sessão avulsa e programa.
--   · Pack partilhado (2 a 4 pessoas): desconta de quem treinar.
--   · O meu dinheiro: recebido no mês, quem deve, packs a acabar; exportar.
-- ============================================================

alter table public.pack_products add column kind text not null default 'pack' check (kind in ('pack','avulsa'));

create table public.monthly_products (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  price_cents       int not null check (price_cents >= 0),
  sessions_per_week int check (sessions_per_week between 1 and 7),
  billing_day       int not null default 1 check (billing_day between 1 and 28),
  leftover          text not null default 'perdem' check (leftover in ('perdem','passam_ate_2','passam')),
  renews            boolean not null default true,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  unique (id, org_id)
);
create table public.program_products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  plan_id     uuid not null,
  price_cents int not null check (price_cents >= 0),
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (id, org_id),
  foreign key (plan_id, org_id) references public.plans(id, org_id) on delete cascade
);
create table public.client_monthlies (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  link_id           uuid not null,
  product_id        uuid,
  name              text not null,
  price_cents       int not null,
  sessions_per_week int,
  billing_day       int not null,
  leftover          text not null,
  renews            boolean not null,
  starts_on         date not null default current_date,
  ends_on           date,
  end_reason        text,
  sold_by           uuid,
  created_at        timestamptz not null default now(),
  unique (id, org_id),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references public.monthly_products(id, org_id) on delete set null (product_id)
);
create table public.client_programs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  link_id       uuid not null,
  product_id    uuid,
  name          text not null,
  price_cents   int not null,
  assignment_id uuid,
  starts_on     date not null default current_date,
  sold_by       uuid,
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (product_id, org_id) references public.program_products(id, org_id) on delete set null (product_id)
);
create table public.pack_sharers (
  pack_id    uuid not null,
  org_id     uuid not null,
  link_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (pack_id, link_id),
  foreign key (pack_id, org_id) references public.client_packs(id, org_id) on delete cascade,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  link_id           uuid not null,
  kind              text not null check (kind in ('pack','mensalidade','avulsa','programa')),
  pack_id           uuid,
  monthly_id        uuid,
  period            text check (period ~ '^[0-9]{4}-[0-9]{2}$'),
  program_id        uuid,
  booking_id        uuid,
  amount_cents      int not null check (amount_cents >= 0),
  paid_on           date not null default current_date,
  method            text not null check (method in ('dinheiro','mbway','transferencia','outro')),
  invoice_ref       text check (length(invoice_ref) <= 60),
  note              text check (length(note) <= 500),
  corrects          uuid references public.payments(id),
  correction_reason text,
  recorded_by       uuid,
  created_at        timestamptz not null default now(),
  check ((kind = 'pack') = (pack_id is not null)),
  check ((kind = 'mensalidade') = (monthly_id is not null and period is not null)),
  check ((kind = 'programa') = (program_id is not null)),
  check (corrects is null or length(trim(coalesce(correction_reason, ''))) > 0),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create unique index payments_uma_correcao on public.payments (corrects) where corrects is not null;
create index on public.payments (org_id, paid_on);
create index on public.payments (link_id);

alter table public.monthly_products enable row level security;
alter table public.program_products enable row level security;
alter table public.client_monthlies enable row level security;
alter table public.client_programs enable row level security;
alter table public.pack_sharers enable row level security;
alter table public.payments enable row level security;
create policy monthly_products_select on public.monthly_products for select to authenticated using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy monthly_products_write on public.monthly_products for all to authenticated using (public.has_perm(org_id, 'clients.write')) with check (public.has_perm(org_id, 'clients.write'));
create policy program_products_select on public.program_products for select to authenticated using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy program_products_write on public.program_products for all to authenticated using (public.has_perm(org_id, 'clients.write')) with check (public.has_perm(org_id, 'clients.write'));
create policy client_monthlies_select on public.client_monthlies for select to authenticated using (public.can_see_link(link_id) or public.is_my_link(link_id));
create policy client_programs_select on public.client_programs for select to authenticated using (public.can_see_link(link_id) or public.is_my_link(link_id));
create policy pack_sharers_select on public.pack_sharers for select to authenticated using (public.can_see_link(link_id) or public.is_my_link(link_id));
-- Pagamentos: só a equipa lê a tabela (tem a nota interna); o cliente usa my_payments()
create policy payments_select on public.payments for select to authenticated using (public.can_see_link(link_id));
grant select, insert, update on public.monthly_products, public.program_products to authenticated;
grant select on public.client_monthlies, public.client_programs, public.pack_sharers, public.payments to authenticated;
revoke all on public.monthly_products, public.program_products, public.client_monthlies, public.client_programs, public.pack_sharers, public.payments from anon;

-- Packs partilhados: o pack em uso pode ser de outra pessoa que o partilha comigo
create or replace function public._descontar(_org uuid, _link uuid, _booking uuid, _session uuid, _motivo text, _quando date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pack uuid;
begin
  if _booking is not null and exists (select 1 from public.pack_usages where booking_id = _booking and reverted_at is null) then return; end if;
  if _session is not null and exists (select 1 from public.pack_usages where session_id = _session and reverted_at is null) then return; end if;
  select id into v_pack from public.client_packs p
    where (p.link_id = _link or exists (select 1 from public.pack_sharers s where s.pack_id = p.id and s.link_id = _link))
      and p.sessions_used < p.sessions_total and p.starts_on <= _quando and p.valid_until >= _quando
    order by (p.link_id = _link) desc, p.valid_until, p.created_at limit 1 for update;
  if v_pack is null then return; end if;
  insert into public.pack_usages (org_id, pack_id, booking_id, session_id, motivo) values (_org, v_pack, _booking, _session, _motivo);
  update public.client_packs set sessions_used = sessions_used + 1 where id = v_pack;
end $$;

create or replace function public.share_pack(_pack uuid, _link uuid, _share boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.client_packs%rowtype;
begin
  select * into p from public.client_packs where id = _pack;
  if not found or not public.can_see_link(p.link_id) or not public.has_perm(p.org_id, 'clients.write')
     or not exists (select 1 from public.links where id = _link and org_id = p.org_id and public.can_see_link(id)) then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if _link = p.link_id then raise exception 'Esse cliente já é o dono do pack.' using errcode = 'check_violation'; end if;
  if _share then
    if (select count(*) from public.pack_sharers where pack_id = _pack) >= 3 then raise exception 'Um pack partilha-se por 2 a 4 pessoas.' using errcode = 'check_violation'; end if;
    insert into public.pack_sharers (pack_id, org_id, link_id) values (_pack, p.org_id, _link) on conflict do nothing;
  else
    delete from public.pack_sharers where pack_id = _pack and link_id = _link;
  end if;
end $$;

-- O saldo que cada pessoa vê inclui os packs partilhados com ela
create or replace function public.pack_balance(_link uuid)
returns table (pack_id uuid, nome text, restam int, total int, valido_ate date, estado text)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.name || case when p.link_id <> _link then ' · partilhado' else '' end, p.sessions_total - p.sessions_used, p.sessions_total, p.valid_until,
    case when p.valid_until < current_date then 'expirado'
         when p.sessions_used >= p.sessions_total then 'esgotado'
         when p.sessions_total - p.sessions_used <= 2 then 'a_acabar'
         when p.valid_until <= current_date + 7 then 'a_expirar'
         else 'ativo' end
  from public.client_packs p where p.link_id = _link or exists (select 1 from public.pack_sharers s where s.pack_id = p.id and s.link_id = _link)
  order by (p.valid_until >= current_date and p.sessions_used < p.sessions_total) desc, p.valid_until, p.created_at desc;
$$;

-- Vender mensalidade e programa
create or replace function public.sell_monthly(_link uuid, _product uuid, _starts_on date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; p public.monthly_products%rowtype; v uuid;
begin
  select * into l from public.links where id = _link;
  select * into p from public.monthly_products where id = _product;
  if l.id is null or p.id is null or p.org_id <> l.org_id or p.archived_at is not null or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  insert into public.client_monthlies (org_id, link_id, product_id, name, price_cents, sessions_per_week, billing_day, leftover, renews, starts_on, sold_by)
    values (l.org_id, l.id, p.id, p.name, p.price_cents, p.sessions_per_week, p.billing_day, p.leftover, p.renews, _starts_on, public.my_membership_id(l.org_id))
    returning id into v;
  insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user) values (l.org_id, l.id, 'dados', 'Mensalidade: ' || p.name, v, auth.uid());
  return v;
end $$;

create or replace function public.end_monthly(_id uuid, _on date, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.client_monthlies%rowtype;
begin
  select * into m from public.client_monthlies where id = _id;
  if not found or not public.can_see_link(m.link_id) or not public.has_perm(m.org_id, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'Terminar pede um motivo.' using errcode = 'check_violation'; end if;
  update public.client_monthlies set ends_on = coalesce(_on, current_date), end_reason = trim(_reason) where id = _id;
end $$;

create or replace function public.sell_program(_link uuid, _product uuid, _starts_on date default current_date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; p public.program_products%rowtype; pv public.plan_versions%rowtype; a uuid; v uuid;
begin
  select * into l from public.links where id = _link;
  select * into p from public.program_products where id = _product;
  if l.id is null or p.id is null or p.org_id <> l.org_id or p.archived_at is not null or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  select * into pv from public.plan_versions where plan_id = p.plan_id order by version desc limit 1;
  if pv.id is null then raise exception 'Publica o plano do programa antes de o vender.' using errcode = 'check_violation'; end if;
  insert into public.assignments (org_id, link_id, target, plan_id, plan_version_id, status, starts_on, responsible_membership_id)
    values (l.org_id, l.id, 'client', p.plan_id, pv.id, 'active', _starts_on, public.my_membership_id(l.org_id))
    returning id into a;
  insert into public.client_programs (org_id, link_id, product_id, name, price_cents, assignment_id, starts_on, sold_by)
    values (l.org_id, l.id, p.id, p.name, p.price_cents, a, _starts_on, public.my_membership_id(l.org_id)) returning id into v;
  insert into public.link_events (org_id, link_id, kind, title, ref_id, actor_user) values (l.org_id, l.id, 'dados', 'Programa: ' || p.name, v, auth.uid());
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- P-14 · Registar e corrigir (nunca apagar)
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(_link uuid, _kind text, _target uuid, _period text, _amount_cents int, _paid_on date,
                                                 _method text, _invoice text default null, _note text default null, _booking uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; v uuid;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) or not public.has_perm(l.org_id, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _amount_cents is null or _amount_cents <= 0 then raise exception 'O valor tem de ser maior que zero.' using errcode = 'check_violation'; end if;
  if _paid_on > current_date then raise exception 'A data não pode ser no futuro.' using errcode = 'check_violation'; end if;
  if _kind = 'pack' and not exists (select 1 from public.client_packs where id = _target and link_id = _link) then raise exception 'pack inválido' using errcode = 'check_violation'; end if;
  if _kind = 'mensalidade' and not exists (select 1 from public.client_monthlies where id = _target and link_id = _link) then raise exception 'mensalidade inválida' using errcode = 'check_violation'; end if;
  if _kind = 'programa' and not exists (select 1 from public.client_programs where id = _target and link_id = _link) then raise exception 'programa inválido' using errcode = 'check_violation'; end if;
  if _kind = 'mensalidade' and exists (select 1 from public.payments p where p.monthly_id = _target and p.period = _period
                                       and not exists (select 1 from public.payments c where c.corrects = p.id)) then
    raise exception 'Esse mês já está registado. Corrige o registo em vez de criar outro.' using errcode = 'check_violation';
  end if;
  insert into public.payments (org_id, link_id, kind, pack_id, monthly_id, period, program_id, booking_id, amount_cents, paid_on, method, invoice_ref, note, recorded_by)
    values (l.org_id, _link, _kind, case when _kind = 'pack' then _target end, case when _kind = 'mensalidade' then _target end,
            case when _kind = 'mensalidade' then _period end, case when _kind = 'programa' then _target end, _booking,
            _amount_cents, coalesce(_paid_on, current_date), _method, nullif(trim(_invoice), ''), nullif(trim(_note), ''), auth.uid())
    returning id into v;
  return v;
end $$;

create or replace function public.correct_payment(_payment uuid, _amount_cents int, _reason text, _method text default null, _invoice text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.payments%rowtype; v uuid;
begin
  select * into p from public.payments where id = _payment for update;
  if not found or not public.can_see_link(p.link_id) or not public.has_perm(p.org_id, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.payments where corrects = _payment) then raise exception 'Este registo já foi corrigido; corrige o mais recente.' using errcode = 'check_violation'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'Corrigir pede um motivo.' using errcode = 'check_violation'; end if;
  if _amount_cents is null or _amount_cents < 0 then raise exception 'Valor inválido.' using errcode = 'check_violation'; end if;
  insert into public.payments (org_id, link_id, kind, pack_id, monthly_id, period, program_id, booking_id, amount_cents, paid_on, method, invoice_ref, note,
                               corrects, correction_reason, recorded_by)
    values (p.org_id, p.link_id, p.kind, p.pack_id, p.monthly_id, p.period, p.program_id, p.booking_id, _amount_cents, p.paid_on,
            coalesce(_method, p.method), coalesce(nullif(trim(_invoice), ''), p.invoice_ref), p.note, p.id, trim(_reason), auth.uid())
    returning id into v;
  return v;
end $$;

-- Pagamentos de um cliente (equipa): com o histórico das correções e quem registou
create or replace function public.client_payments(_link uuid)
returns table (id uuid, kind text, alvo text, periodo text, valor int, pago_em date, metodo text, fatura text, nota text, corrige uuid, motivo text,
               atual boolean, quem text, em timestamptz)
language sql stable security definer set search_path = '' as $$
  select p.id, p.kind,
    coalesce((select name from public.client_packs where id = p.pack_id), (select name from public.client_monthlies where id = p.monthly_id),
             (select name from public.client_programs where id = p.program_id), 'Sessão avulsa'),
    p.period, p.amount_cents, p.paid_on, p.method, p.invoice_ref, p.note, p.corrects, p.correction_reason,
    not exists (select 1 from public.payments c where c.corrects = p.id),
    (select pr.full_name from public.persons pr where pr.user_id = p.recorded_by), p.created_at
  from public.payments p where p.link_id = _link and public.can_see_link(_link)
  order by p.created_at desc;
$$;

-- O que o cliente vê (C-22): sem a nota interna; corrigido já com o valor certo
create or replace function public.my_payments()
returns table (org text, alvo text, periodo text, valor int, pago_em date, metodo text, fatura text, corrigido boolean)
language sql stable security definer set search_path = '' as $$
  select o.name,
    coalesce((select name from public.client_packs where id = p.pack_id), (select name from public.client_monthlies where id = p.monthly_id),
             (select name from public.client_programs where id = p.program_id), 'Sessão avulsa'),
    p.period, p.amount_cents, p.paid_on, p.method, p.invoice_ref, p.corrects is not null
  from public.payments p join public.links l on l.id = p.link_id join public.organizations o on o.id = p.org_id
  where l.person_id = public.my_person_id() and not exists (select 1 from public.payments c where c.corrects = p.id)
  order by p.paid_on desc, p.created_at desc;
$$;

-- O que tenho (C-22): packs (com o que falta pagar), mensalidades e programas
create or replace function public.my_plans()
returns table (tipo text, org text, nome text, restam int, total int, valido_ate date, preco int, pago int, treinador text)
language sql stable security definer set search_path = '' as $$
  select 'pack', o.name, p.name, p.sessions_total - p.sessions_used, p.sessions_total, p.valid_until, p.price_cents,
    coalesce((select sum(x.amount_cents) from public.payments x where x.pack_id = p.id and not exists (select 1 from public.payments c where c.corrects = x.id)), 0)::int,
    (select pr.full_name from public.memberships m join public.persons pr on pr.id = m.person_id where m.id = l.responsible_membership_id)
  from public.client_packs p join public.links l on l.id = p.link_id join public.organizations o on o.id = p.org_id
  where l.person_id = public.my_person_id() and p.valid_until >= current_date - 30
  union all
  select 'mensalidade', o.name, m.name, null, m.sessions_per_week, m.ends_on, m.price_cents, null,
    (select pr.full_name from public.memberships mm join public.persons pr on pr.id = mm.person_id where mm.id = l.responsible_membership_id)
  from public.client_monthlies m join public.links l on l.id = m.link_id join public.organizations o on o.id = m.org_id
  where l.person_id = public.my_person_id() and (m.ends_on is null or m.ends_on >= current_date)
  union all
  select 'programa', o.name, c.name, null, null, null, c.price_cents,
    coalesce((select sum(x.amount_cents) from public.payments x where x.program_id = c.id and not exists (select 1 from public.payments k where k.corrects = x.id)), 0)::int,
    null
  from public.client_programs c join public.links l on l.id = c.link_id join public.organizations o on o.id = c.org_id
  where l.person_id = public.my_person_id();
$$;

-- ---------------------------------------------------------------------------
-- O meu dinheiro (G-01 do PT): recebido no mês, quem deve, packs a acabar
-- ---------------------------------------------------------------------------
create or replace function public.money_overview(_org uuid, _month date default current_date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ini date := date_trunc('month', _month)::date; fim date := (date_trunc('month', _month) + interval '1 month')::date; tz text; v jsonb;
  avulsa int := (select price_cents from public.pack_products where org_id = _org and kind = 'avulsa' and archived_at is null order by created_at desc limit 1);
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  tz := coalesce((select timezone from public.organizations where id = _org), 'Europe/Lisbon');
  with atual as (select p.* from public.payments p where p.org_id = _org and public.can_see_link(p.link_id) and not exists (select 1 from public.payments c where c.corrects = p.id)),
  deve as (
    -- Packs com parte por pagar
    select cp.link_id, 'pack' as tipo, cp.id as alvo, null::text as periodo, cp.name as nome,
      cp.price_cents - coalesce((select sum(a.amount_cents) from atual a where a.pack_id = cp.id), 0) as valor, cp.created_at::date as desde
    from public.client_packs cp where cp.org_id = _org and public.can_see_link(cp.link_id) and cp.price_cents > 0 and cp.valid_until >= current_date - 60
    union all
    -- Mensalidades com meses vencidos por pagar (desde o início, até este mês)
    select m.link_id, 'mensalidade', m.id, to_char(g, 'YYYY-MM'), m.name || ' · ' || to_char(g, 'TMMonth'), m.price_cents, (g + (m.billing_day - 1))::date
    from public.client_monthlies m
    cross join lateral (select gs::date as g from generate_series(date_trunc('month', m.starts_on), date_trunc('month', least(coalesce(m.ends_on, current_date), current_date)), interval '1 month') gs) gg
    where m.org_id = _org and public.can_see_link(m.link_id) and (g + (m.billing_day - 1))::date <= current_date
      and not exists (select 1 from atual a where a.monthly_id = m.id and a.period = to_char(g, 'YYYY-MM'))
    union all
    -- Sessões feitas sem pack nem pagamento (avulsas), nos últimos 60 dias
    select b.link_id, 'avulsa', b.id, null, 'Avulsa · ' || to_char(b.starts_at at time zone tz, 'DD/MM'), avulsa, (b.starts_at at time zone tz)::date
    from public.bookings b
    where avulsa is not null and b.org_id = _org and b.link_id is not null and public.can_see_link(b.link_id) and b.type = 'training' and b.status = 'completed'
      and b.starts_at > now() - interval '60 days'
      and not exists (select 1 from public.pack_usages u where u.booking_id = b.id and u.reverted_at is null)
      and not exists (select 1 from atual a where a.booking_id = b.id)
      and not exists (select 1 from public.client_monthlies m where m.link_id = b.link_id and m.starts_on <= (b.starts_at at time zone tz)::date
                      and (m.ends_on is null or m.ends_on >= (b.starts_at at time zone tz)::date))
  )
  select jsonb_build_object(
    'recebido', coalesce((select sum(amount_cents) from atual where paid_on >= ini and paid_on < fim), 0),
    'registos', (select count(*) from atual where paid_on >= ini and paid_on < fim),
    'por_metodo', coalesce((select jsonb_object_agg(method, total) from (select method, sum(amount_cents) total from atual where paid_on >= ini and paid_on < fim group by 1) x), '{}'::jsonb),
    'por_receber', coalesce((select sum(valor) from deve where valor > 0), 0),
    'quem_deve', coalesce((select jsonb_agg(jsonb_build_object('link_id', d.link_id, 'nome', c.full_name, 'tipo', d.tipo, 'alvo', d.alvo, 'periodo', d.periodo,
                                                               'item', d.nome, 'valor', d.valor, 'desde', d.desde) order by d.desde)
                           from deve d join public.clients c on c.id = d.link_id where d.valor > 0), '[]'::jsonb),
    'a_acabar', coalesce((select jsonb_agg(jsonb_build_object('link_id', cp.link_id, 'nome', c.full_name, 'pack', cp.name, 'restam', cp.sessions_total - cp.sessions_used, 'valido_ate', cp.valid_until))
                          from public.client_packs cp join public.clients c on c.id = cp.link_id
                          where cp.org_id = _org and public.can_see_link(cp.link_id) and cp.valid_until >= current_date
                            and (cp.sessions_total - cp.sessions_used <= 2 or cp.valid_until <= current_date + 7)), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- Exportar tudo (também em só leitura): clientes, planos, sessões e pagamentos
create or replace function public.export_business(_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(_org, 'org.manage') and not public.has_perm(_org, 'clients.read_all') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return jsonb_build_object(
    'clientes', coalesce((select jsonb_agg(jsonb_build_object('nome', c.full_name, 'email', c.email, 'telefone', c.phone, 'estado', c.client_status, 'desde', c.created_at::date))
                          from public.clients c where c.org_id = _org), '[]'::jsonb),
    'planos', coalesce((select jsonb_agg(jsonb_build_object('cliente', c.full_name, 'plano', coalesce(pl.name, w.name), 'desde', a.starts_on, 'ate', a.ends_on, 'estado', a.status))
                        from public.assignments a left join public.clients c on c.id = a.link_id left join public.plans pl on pl.id = a.plan_id left join public.workouts w on w.id = a.workout_id
                        where a.org_id = _org), '[]'::jsonb),
    'sessoes', coalesce((select jsonb_agg(jsonb_build_object('cliente', c.full_name, 'inicio', b.starts_at, 'estado', b.status, 'tipo', b.type))
                         from public.bookings b left join public.clients c on c.id = b.link_id where b.org_id = _org and b.type <> 'class'), '[]'::jsonb),
    'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('cliente', c.full_name, 'tipo', p.kind, 'periodo', p.period, 'valor', round(p.amount_cents / 100.0, 2),
                                                                'pago_em', p.paid_on, 'metodo', p.method, 'fatura', p.invoice_ref,
                                                                'corrige', p.corrects is not null, 'motivo', p.correction_reason) order by p.paid_on)
                            from public.payments p join public.clients c on c.id = p.link_id where p.org_id = _org), '[]'::jsonb));
end $$;

revoke execute on function public.share_pack(uuid, uuid, boolean), public.sell_monthly(uuid, uuid, date), public.end_monthly(uuid, date, text),
  public.sell_program(uuid, uuid, date), public.record_payment(uuid, text, uuid, text, int, date, text, text, text, uuid),
  public.correct_payment(uuid, int, text, text, text), public.client_payments(uuid), public.my_payments(), public.my_plans(),
  public.money_overview(uuid, date), public.export_business(uuid) from public, anon;
grant execute on function public.share_pack(uuid, uuid, boolean), public.sell_monthly(uuid, uuid, date), public.end_monthly(uuid, date, text),
  public.sell_program(uuid, uuid, date), public.record_payment(uuid, text, uuid, text, int, date, text, text, text, uuid),
  public.correct_payment(uuid, int, text, text, text), public.client_payments(uuid), public.my_payments(), public.my_plans(),
  public.money_overview(uuid, date), public.export_business(uuid) to authenticated;
