-- ============================================================
-- LUNA.OS v3 · 0026 · Mensagens (G-31 e C-18, F1b passo 23).
--   · Conversas 1:1 PT–cliente (só os dois as veem: nem a receção nem o dono),
--     do ginásio com o cliente (quem gere a carteira), de grupo e avisos (só ler).
--   · Mensagens com id do aparelho (reenviar não duplica): texto, áudio,
--     anexo e resultado (avaliação ou resposta) com resumo.
--   · Horário de resposta do PT: fora dele o PT não é notificado e o cliente
--     vê quando ele responde. Respostas rápidas por pessoa.
-- ============================================================

insert into public.plan_modules (plan, module) values ('treinador', 'messages') on conflict do nothing;
insert into public.entitlements (org_id, module, source)
  select s.org_id, 'messages', 'plan' from public.subscriptions s
  where s.plan = 'treinador' and not exists (select 1 from public.entitlements e where e.org_id = s.org_id and e.module = 'messages');

create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  kind            text not null check (kind in ('pt','ginasio','grupo','aviso')),
  link_id         uuid,
  membership_id   uuid,
  group_id        uuid,
  title           text,
  last_message_at timestamptz,
  created_at      timestamptz not null default now(),
  unique (id, org_id),
  check ((kind in ('pt','ginasio')) = (link_id is not null)),
  check ((kind = 'pt') = (membership_id is not null)),
  check ((kind = 'grupo') = (group_id is not null)),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (membership_id, org_id) references public.memberships(id, org_id) on delete cascade,
  foreign key (group_id, org_id) references public.groups(id, org_id) on delete cascade
);
create unique index conversations_pt_unica on public.conversations (link_id, membership_id) where kind = 'pt';
create unique index conversations_ginasio_unica on public.conversations (link_id) where kind = 'ginasio';
create unique index conversations_grupo_unica on public.conversations (group_id) where kind = 'grupo';

create table public.messages (
  id          uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  org_id      uuid not null,
  author_user uuid,
  author_side text not null check (author_side in ('equipa','cliente')),
  kind        text not null default 'texto' check (kind in ('texto','audio','anexo','resultado')),
  body        text,
  attachment_path text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  check (kind <> 'texto' or length(trim(coalesce(body, ''))) > 0),
  check (length(coalesce(body, '')) <= 4000)
);
create index on public.messages (conversation_id, created_at);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id         uuid not null,
  read_at         timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.reply_hours (
  membership_id uuid primary key references public.memberships(id) on delete cascade,
  start_time    time not null default '08:00',
  end_time      time not null default '20:00',
  days          int[] not null default '{1,2,3,4,5,6}',   -- 0 = domingo
  updated_at    timestamptz not null default now(),
  check (start_time < end_time)
);

create table public.quick_replies (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  body          text not null check (length(trim(body)) between 1 and 200),
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

-- Quem vê esta conversa?
create or replace function public.can_see_conversation(_conv uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = _conv and (
      -- 1:1 com o PT: só o PT e o cliente
      (c.kind = 'pt' and (c.membership_id = public.my_membership_id(c.org_id) or public.is_my_link(c.link_id)))
      -- Ginásio: quem gere a carteira e o cliente
      or (c.kind = 'ginasio' and ((public.has_perm(c.org_id, 'clients.read_all') and public.is_member(c.org_id)) or public.is_my_link(c.link_id)))
      -- Grupo: o responsável, quem gere, e os membros ativos
      or (c.kind = 'grupo' and (
            exists (select 1 from public.groups g where g.id = c.group_id and g.responsible_membership_id = public.my_membership_id(c.org_id))
            or public.has_perm(c.org_id, 'clients.read_all')
            or exists (select 1 from public.group_members m join public.links l on l.id = m.link_id
                       where m.group_id = c.group_id and m.left_at is null and l.person_id = public.my_person_id())))
      -- Avisos: toda a equipa e todos os clientes ligados
      or (c.kind = 'aviso' and (public.is_member(c.org_id) or public.is_linked_to(c.org_id)))
    ));
$$;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.reply_hours enable row level security;
alter table public.quick_replies enable row level security;
create policy conversations_select on public.conversations for select to authenticated using (public.can_see_conversation(id));
create policy messages_select on public.messages for select to authenticated using (public.can_see_conversation(conversation_id));
create policy conversation_reads_own on public.conversation_reads for select to authenticated using (user_id = auth.uid());
create policy reply_hours_select on public.reply_hours for select to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id and (public.is_member(m.org_id) or public.is_linked_to(m.org_id))));
create policy reply_hours_own on public.reply_hours for all to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id and m.person_id = public.my_person_id()))
  with check (exists (select 1 from public.memberships m where m.id = membership_id and m.person_id = public.my_person_id()));
create policy quick_replies_own on public.quick_replies for all to authenticated
  using (exists (select 1 from public.memberships m where m.id = membership_id and m.person_id = public.my_person_id()))
  with check (exists (select 1 from public.memberships m where m.id = membership_id and m.person_id = public.my_person_id()));
grant select on public.conversations, public.messages, public.conversation_reads to authenticated;
grant select, insert, update on public.reply_hours to authenticated;
grant select, insert, update, delete on public.quick_replies to authenticated;
revoke all on public.conversations, public.messages, public.conversation_reads, public.reply_hours, public.quick_replies from anon;

-- Dentro do horário de resposta desta pessoa da equipa? (hora da organização)
create or replace function public._em_horario(_membership uuid, _quando timestamptz default now()) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select extract(dow from (_quando at time zone o.timezone))::int = any (h.days)
       and (_quando at time zone o.timezone)::time >= h.start_time and (_quando at time zone o.timezone)::time < h.end_time
    from public.reply_hours h join public.memberships m on m.id = h.membership_id join public.organizations o on o.id = m.org_id
    where h.membership_id = _membership), true);
$$;

-- Quando responde (texto para o cliente): "responde das 8:00 às 20:00" ou "responde às 8:00"
create or replace function public.reply_window(_conv uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.conversations%rowtype; h public.reply_hours%rowtype; tz text; agora timestamp; d int; i int;
begin
  if not public.can_see_conversation(_conv) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into c from public.conversations where id = _conv;
  if c.kind <> 'pt' then return jsonb_build_object('dentro', true); end if;
  select * into h from public.reply_hours where membership_id = c.membership_id;
  if not found then return jsonb_build_object('dentro', true); end if;
  tz := coalesce((select timezone from public.organizations where id = c.org_id), 'Europe/Lisbon');
  agora := now() at time zone tz;
  if public._em_horario(c.membership_id) then
    return jsonb_build_object('dentro', true, 'texto', 'Responde das ' || to_char(h.start_time, 'FMHH24:MI') || ' às ' || to_char(h.end_time, 'FMHH24:MI'));
  end if;
  -- Próximo dia de resposta
  for i in 0..7 loop
    d := extract(dow from agora + make_interval(days => i))::int;
    if d = any (h.days) and (i > 0 or agora::time < h.start_time) then
      return jsonb_build_object('dentro', false, 'texto', 'Responde ' || case when i = 0 then 'hoje' when i = 1 then 'amanhã'
        else (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[d + 1] end || ' às ' || to_char(h.start_time, 'FMHH24:MI'));
    end if;
  end loop;
  return jsonb_build_object('dentro', false, 'texto', 'Fora do horário de resposta');
end $$;

-- Abrir (ou criar) a conversa 1:1 com o cliente: a do PT responsável, ou a minha
create or replace function public.open_client_conversation(_link uuid, _kind text default 'pt')
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; me uuid; v uuid;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  me := public.my_membership_id(l.org_id);
  if _kind = 'pt' then
    select id into v from public.conversations where kind = 'pt' and link_id = _link and membership_id = me;
    if v is null then insert into public.conversations (org_id, kind, link_id, membership_id) values (l.org_id, 'pt', _link, me) returning id into v; end if;
  elsif _kind = 'ginasio' then
    if not public.has_perm(l.org_id, 'clients.read_all') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
    select id into v from public.conversations where kind = 'ginasio' and link_id = _link;
    if v is null then insert into public.conversations (org_id, kind, link_id, title) values (l.org_id, 'ginasio', _link, (select name from public.organizations where id = l.org_id)) returning id into v; end if;
  else raise exception 'tipo inválido' using errcode = 'invalid_parameter_value';
  end if;
  return v;
end $$;

-- O cliente abre a conversa com o seu PT (o responsável da ligação)
create or replace function public.open_my_pt_conversation(_link uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype; v uuid;
begin
  select * into l from public.links where id = _link;
  if not found or not public.is_my_link(_link) or l.responsible_membership_id is null then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select id into v from public.conversations where kind = 'pt' and link_id = _link and membership_id = l.responsible_membership_id;
  if v is null then insert into public.conversations (org_id, kind, link_id, membership_id) values (l.org_id, 'pt', _link, l.responsible_membership_id) returning id into v; end if;
  return v;
end $$;

create or replace function public.open_group_conversation(_group uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g public.groups%rowtype; v uuid;
begin
  select * into g from public.groups where id = _group;
  if not found or not public.has_perm(g.org_id, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select id into v from public.conversations where kind = 'grupo' and group_id = _group;
  if v is null then insert into public.conversations (org_id, kind, group_id, title) values (g.org_id, 'grupo', g.id, g.name) returning id into v; end if;
  return v;
end $$;

-- Enviar: idempotente pelo id do aparelho; avisa os outros (o PT só dentro do horário)
create or replace function public.send_message(_id uuid, _conv uuid, _body text, _kind text default 'texto', _path text default null, _meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.conversations%rowtype; lado text; quem text; dest record;
begin
  if exists (select 1 from public.messages where id = _id) then return; end if;
  select * into c from public.conversations where id = _conv;
  if not found or not public.can_see_conversation(_conv) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  lado := case when public.is_member(c.org_id) then 'equipa' else 'cliente' end;
  if c.kind = 'aviso' and lado = 'cliente' then raise exception 'Os avisos só se leem.' using errcode = 'check_violation'; end if;
  if _kind not in ('texto','audio','anexo','resultado') then raise exception 'tipo inválido' using errcode = 'invalid_parameter_value'; end if;
  if _kind in ('audio','anexo') and (_path is null or split_part(_path, '/', 1) <> c.id::text) then raise exception 'anexo inválido' using errcode = 'check_violation'; end if;
  insert into public.messages (id, conversation_id, org_id, author_user, author_side, kind, body, attachment_path, meta)
    values (_id, c.id, c.org_id, auth.uid(), lado, _kind, nullif(trim(_body), ''), _path, coalesce(_meta, '{}'::jsonb));
  update public.conversations set last_message_at = now() where id = c.id;
  insert into public.conversation_reads (conversation_id, user_id) values (c.id, auth.uid())
    on conflict (conversation_id, user_id) do update set read_at = now();
  select full_name into quem from public.persons where user_id = auth.uid();
  for dest in
    -- Cliente(s)
    select p.user_id, null::uuid as membership from public.links l join public.persons p on p.id = l.person_id
      where lado = 'equipa' and c.kind in ('pt','ginasio') and l.id = c.link_id and p.user_id is not null
    union
    select p.user_id, null from public.group_members gm join public.links l on l.id = gm.link_id join public.persons p on p.id = l.person_id
      where lado = 'equipa' and c.kind = 'grupo' and gm.group_id = c.group_id and gm.left_at is null and p.user_id is not null
    union
    -- Equipa
    select p.user_id, m.id from public.memberships m join public.persons p on p.id = m.person_id
      where lado = 'cliente' and c.kind = 'pt' and m.id = c.membership_id and p.user_id is not null
    union
    select p.user_id, m.id from public.groups g join public.memberships m on m.id = g.responsible_membership_id join public.persons p on p.id = m.person_id
      where lado = 'cliente' and c.kind = 'grupo' and g.id = c.group_id and p.user_id is not null
  loop
    continue when dest.user_id = auth.uid();
    -- Fora do horário de resposta, o PT não é notificado (vê ao abrir as Mensagens)
    continue when dest.membership is not null and not public._em_horario(dest.membership);
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      values (dest.user_id, c.org_id, 'mensagem', coalesce(quem, 'Nova mensagem'),
              case _kind when 'audio' then 'Áudio' when 'anexo' then 'Anexo' when 'resultado' then coalesce(_meta->>'titulo', 'Resultado') else left(trim(_body), 140) end,
              case when lado = 'equipa' then '/mensagens/' || c.id else '/messages/' || c.id end);
  end loop;
end $$;

create or replace function public.mark_conversation_read(_conv uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_see_conversation(_conv) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  insert into public.conversation_reads (conversation_id, user_id) values (_conv, auth.uid())
    on conflict (conversation_id, user_id) do update set read_at = now();
end $$;

-- Lista de conversas (Gestão e app): última mensagem, por ler e "por responder"
create or replace function public.my_conversations(_org uuid default null)
returns table (id uuid, org_id uuid, kind text, titulo text, link_id uuid, group_id uuid, ultima text, ultima_em timestamptz, ultima_lado text, por_ler int, por_responder boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.kind,
    case c.kind
      when 'pt' then case when public.is_member(c.org_id) then (select full_name from public.clients where id = c.link_id)
                          else (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = c.membership_id) end
      when 'ginasio' then case when public.is_member(c.org_id) then (select full_name from public.clients where id = c.link_id) else coalesce(c.title, 'Ginásio') end
      else coalesce(c.title, 'Conversa') end,
    c.link_id, c.group_id,
    lm.resumo, lm.created_at, lm.author_side,
    (select count(*)::int from public.messages x where x.conversation_id = c.id and coalesce(x.author_user, '00000000-0000-0000-0000-000000000000') <> auth.uid()
       and x.created_at > coalesce((select r.read_at from public.conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()), '-infinity')),
    public.is_member(c.org_id) and lm.author_side = 'cliente'
  from public.conversations c
  left join lateral (
    select m.created_at, m.author_side,
      case m.kind when 'audio' then 'Áudio' when 'anexo' then 'Anexo' when 'resultado' then coalesce(m.meta->>'titulo', 'Resultado') else m.body end
        || '' as resumo
    from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
  where public.can_see_conversation(c.id) and (_org is null or c.org_id = _org)
    and (lm.created_at is not null or public.is_member(c.org_id))
  order by coalesce(lm.created_at, c.created_at) desc
  limit 200;
$$;

-- Contexto do cliente ao lado da conversa (o efeito da restrição, nunca o diagnóstico)
create or replace function public.conversation_context(_conv uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.conversations%rowtype; l public.links%rowtype; tz text;
begin
  select * into c from public.conversations where id = _conv;
  if not found or not public.can_see_conversation(_conv) or not public.is_member(c.org_id) or c.link_id is null then return null; end if;
  select * into l from public.links where id = c.link_id;
  tz := coalesce((select timezone from public.organizations where id = c.org_id), 'Europe/Lisbon');
  return jsonb_build_object(
    'nome', (select full_name from public.clients where id = l.id), 'desde', l.created_at, 'link_id', l.id,
    'proxima', (select b.starts_at from public.bookings b where b.link_id = l.id and b.status in ('pending','confirmed') and b.starts_at > now() order by b.starts_at limit 1),
    'plano', (select coalesce(pl.name, w.name) from public.assignments a left join public.plans pl on pl.id = a.plan_id left join public.workouts w on w.id = a.workout_id
              where a.link_id = l.id and a.status = 'active' order by a.created_at desc limit 1),
    'zonas', to_jsonb(public._zonas_bloqueadas(l.id)),
    'checkin', (select jsonb_build_object('dia', d.day, 'energia', d.energy, 'sono', d.sleep, 'dor', d.pain) from public.daily_checkins d
                where d.person_id = l.person_id and public.can_read_person_data(l.person_id, 'checkins') order by d.day desc limit 1),
    'pack', (select jsonb_build_object('nome', k.name, 'restam', k.sessions_total - k.sessions_used) from public.client_packs k
             where k.link_id = l.id and k.sessions_used < k.sessions_total and k.valid_until >= current_date order by k.valid_until limit 1));
end $$;

-- Anexos e áudio num balde privado; o caminho começa pelo id da conversa
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('mensagens', 'mensagens', false) on conflict (id) do nothing;
    execute $p$create policy mensagens_ler on storage.objects for select to authenticated using (
      bucket_id = 'mensagens' and public.can_see_conversation(nullif(split_part(name, '/', 1), '')::uuid))$p$;
    execute $p$create policy mensagens_enviar on storage.objects for insert to authenticated with check (
      bucket_id = 'mensagens' and public.can_see_conversation(nullif(split_part(name, '/', 1), '')::uuid))$p$;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;

revoke execute on function public._em_horario(uuid, timestamptz) from public, anon, authenticated;
revoke execute on function public.can_see_conversation(uuid), public.reply_window(uuid), public.open_client_conversation(uuid, text), public.open_my_pt_conversation(uuid),
  public.open_group_conversation(uuid), public.send_message(uuid, uuid, text, text, text, jsonb), public.mark_conversation_read(uuid),
  public.my_conversations(uuid), public.conversation_context(uuid) from public, anon;
grant execute on function public.can_see_conversation(uuid), public.reply_window(uuid), public.open_client_conversation(uuid, text), public.open_my_pt_conversation(uuid),
  public.open_group_conversation(uuid), public.send_message(uuid, uuid, text, text, text, jsonb), public.mark_conversation_read(uuid),
  public.my_conversations(uuid), public.conversation_context(uuid) to authenticated;
