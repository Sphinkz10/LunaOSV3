-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 26 parte A (packs de sessões de PT).
-- Corre depois de horario_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);   -- PT
insert into public.pack_products (org_id, name, sessions, validity_days, price_cents) values (current_setting('c.org')::uuid, 'Pack de PT 3', 3, 60, 12000);
select set_config('k.prod', (select id::text from public.pack_products where name = 'Pack de PT 3'), false);
select set_config('k.pack', public.sell_pack(current_setting('d.a')::uuid, current_setting('k.prod')::uuid, current_date - 1)::text, false);
reset role;
insert into public.bookings (id, org_id, membership_id, link_id, status, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000d0001', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.a')::uuid, 'confirmed', now() - interval '2 hours', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000d0002', current_setting('c.org')::uuid, current_setting('c.m_pt')::uuid, current_setting('d.a')::uuid, 'confirmed', now() - interval '4 hours', now() - interval '3 hours');

-- ---------- PROVA P1: a sessão feita desconta uma vez; voltar atrás devolve ----------
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000e0002', false);
update public.bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000d0001';
update public.bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000d0001';
do $$ begin
  if (select sessions_used from public.client_packs where id = current_setting('k.pack')::uuid) <> 1 then raise exception 'PROVA P1 FALHOU: desconto errado'; end if;
end $$;
update public.bookings set status = 'confirmed' where id = '00000000-0000-0000-0000-0000000d0001';
do $$ begin
  if (select sessions_used from public.client_packs where id = current_setting('k.pack')::uuid) <> 0 then raise exception 'PROVA P1 FALHOU: não devolveu'; end if;
end $$;
update public.bookings set status = 'completed' where id = '00000000-0000-0000-0000-0000000d0001';

-- ---------- PROVA P2: a falta conta; o saldo diz o que resta ----------
update public.bookings set status = 'no_show' where id = '00000000-0000-0000-0000-0000000d0002';
do $$ declare r record;
begin
  select * into r from public.pack_balance(current_setting('d.a')::uuid) limit 1;
  if r.restam <> 1 or r.estado <> 'a_acabar' then raise exception 'PROVA P2 FALHOU: saldo %', r; end if;
  if not exists (select 1 from public.clients_attention(current_setting('c.org')::uuid) where link_id = current_setting('d.a')::uuid and 'pack_2_sessoes' = any (reasons)) then
    raise exception 'PROVA P2 FALHOU: o pack a acabar não ficou em atenção';
  end if;
end $$;

-- ---------- PROVA P3: sessão ao vivo sem marcação também desconta ----------
reset role;
insert into public.sessions (person_id, org_id, link_id, phase, started_at, ended_at)
  select person_id, org_id, id, 'done', now() - interval '30 minutes', now() from public.links where id = current_setting('d.a')::uuid;
do $$ begin
  if (select sessions_used from public.client_packs where id = current_setting('k.pack')::uuid) <> 3 then raise exception 'PROVA P3 FALHOU'; end if;
  if exists (select 1 from public.pack_balance(current_setting('d.a')::uuid) where estado = 'ativo') then raise exception 'PROVA P3 FALHOU: devia estar esgotado'; end if;
end $$;

select '✅ Packs: TODAS AS PROVAS PASSARAM' as resultado;
