-- ============================================================
-- LUNA.OS v3 · 0024 · Avaliação (tarefa 13, F1b passo 22):
--   G-20 o que está por avaliar · G-21 questionários com versões ·
--   G-22 protocolos com versões · G-23 aplicar no terreno, sem rede ·
--   G-24 enviar ou agendar · G-25 rever, comparar, invalidar com motivo.
--   App: C-08 check-in diário e semanal, C-15 responder, C-16 progresso.
--   · Publicar cria uma versão; cada resposta guarda a versão em que foi dada.
--   · Respostas, valores e fotos são da pessoa (person_id); a organização vê
--     o que a pessoa partilha. Questionários de saúde só com health.read ou
--     pelo PT responsável. Fotos: só o PT responsável (nunca a receção).
--   · Invalidar nunca apaga: sai dos gráficos e fica no histórico.
-- ============================================================

insert into public.plan_modules (plan, module) values ('treinador', 'assessment') on conflict do nothing;
insert into public.entitlements (org_id, module, source)
  select s.org_id, 'assessment', 'plan' from public.subscriptions s
  where s.plan = 'treinador' and not exists (select 1 from public.entitlements e where e.org_id = s.org_id and e.module = 'assessment');

-- Grupos: sair nunca apaga (data e motivo); usado pelos envios recorrentes e por G-08
alter table public.group_members add column left_at timestamptz, add column left_reason text;

-- Quem é o PT responsável deste cliente?
create or replace function public.sou_responsavel(_link uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.links l where l.id = _link and l.responsible_membership_id = public.my_membership_id(l.org_id));
$$;

-- ---------------------------------------------------------------------------
-- G-21 · Questionários
-- ---------------------------------------------------------------------------
create table public.forms (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  kind        text not null default 'outro' check (kind in ('anamnese','satisfacao','checkin_semanal','outro')),
  name        text not null check (length(trim(name)) > 0),
  health      boolean not null default false,       -- respostas sobre saúde: só health.read ou o PT responsável
  questions   jsonb not null default '[]'::jsonb,   -- o rascunho
  version     int not null default 0,               -- última publicada (0 = nunca)
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create table public.form_versions (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null,
  org_id       uuid not null,
  version      int not null,
  name         text not null,
  kind         text not null,
  health       boolean not null,
  questions    jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid,
  unique (form_id, version),
  foreign key (form_id, org_id) references public.forms(id, org_id) on delete cascade
);
alter table public.forms enable row level security;
alter table public.form_versions enable row level security;
create policy forms_select on public.forms for select to authenticated using (public.is_member(org_id));
create policy forms_write on public.forms for all to authenticated
  using (public.has_perm(org_id, 'training.write')) with check (public.has_perm(org_id, 'training.write'));
create policy form_versions_select on public.form_versions for select to authenticated using (public.is_member(org_id) or public.is_linked_to(org_id));
grant select, insert, update on public.forms to authenticated;
grant select on public.form_versions to authenticated;
revoke all on public.forms, public.form_versions from anon;

-- Valida as perguntas: tipos conhecidos, ids únicos, escolhas com opções, condições para trás
create or replace function public._perguntas_validas(_q jsonb) returns text
language plpgsql immutable set search_path = '' as $$
declare q jsonb; ids text[] := '{}';
begin
  if jsonb_typeof(_q) <> 'array' or jsonb_array_length(_q) = 0 then return 'O questionário não tem perguntas.'; end if;
  for q in select * from jsonb_array_elements(_q) loop
    if coalesce(q->>'id', '') = '' or q->>'id' = any (ids) then return 'Cada pergunta precisa de um identificador único.'; end if;
    if coalesce(trim(q->>'texto'), '') = '' then return 'Há uma pergunta sem texto.'; end if;
    if q->>'tipo' not in ('texto','numero','escala','escolha','escolha_multipla','sim_nao','foto','data','hora') then return 'Tipo de pergunta desconhecido: ' || coalesce(q->>'tipo', '—'); end if;
    if q->>'tipo' in ('escolha','escolha_multipla') and coalesce(jsonb_array_length(q->'opcoes'), 0) < 2 then return 'A pergunta "' || (q->>'texto') || '" precisa de pelo menos 2 opções.'; end if;
    if q ? 'se' and not ((q->'se'->>'pergunta') = any (ids)) then return 'A condição da pergunta "' || (q->>'texto') || '" tem de depender de uma pergunta anterior.'; end if;
    if q->>'tipo' = 'numero' and q ? 'min' and q ? 'max' and (q->>'min')::numeric > (q->>'max')::numeric then return 'Limites trocados em "' || (q->>'texto') || '".'; end if;
    ids := ids || (q->>'id');
  end loop;
  return null;
end $$;

create or replace function public.publish_form(_form uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare f public.forms%rowtype; erro text;
begin
  select * into f from public.forms where id = _form for update;
  if not found or not public.has_perm(f.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  erro := public._perguntas_validas(f.questions);
  if erro is not null then raise exception '%', erro using errcode = 'check_violation'; end if;
  insert into public.form_versions (form_id, org_id, version, name, kind, health, questions, published_by)
    values (f.id, f.org_id, f.version + 1, f.name, f.kind, f.health, f.questions, auth.uid());
  update public.forms set version = f.version + 1, updated_at = now() where id = f.id;
  return f.version + 1;
end $$;

-- ---------------------------------------------------------------------------
-- G-22 · Protocolos de avaliação física
-- ---------------------------------------------------------------------------
create table public.protocols (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  blocks      jsonb not null default '[]'::jsonb,   -- [{titulo, testes:[{chave, nome, unidade, tentativas, guarda, menor_melhor, zonas, como}]}]
  version     int not null default 0,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, org_id)
);
create table public.protocol_versions (
  id           uuid primary key default gen_random_uuid(),
  protocol_id  uuid not null,
  org_id       uuid not null,
  version      int not null,
  name         text not null,
  blocks       jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid,
  unique (protocol_id, version),
  unique (id, org_id),
  foreign key (protocol_id, org_id) references public.protocols(id, org_id) on delete cascade
);
alter table public.protocols enable row level security;
alter table public.protocol_versions enable row level security;
create policy protocols_select on public.protocols for select to authenticated using (public.is_member(org_id));
create policy protocols_write on public.protocols for all to authenticated
  using (public.has_perm(org_id, 'training.write')) with check (public.has_perm(org_id, 'training.write'));
create policy protocol_versions_select on public.protocol_versions for select to authenticated using (public.is_member(org_id) or public.is_linked_to(org_id));
grant select, insert, update on public.protocols to authenticated;
grant select on public.protocol_versions to authenticated;
revoke all on public.protocols, public.protocol_versions from anon;

create or replace function public.publish_protocol(_protocol uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare p public.protocols%rowtype; b jsonb; t jsonb; chaves text[] := '{}';
begin
  select * into p from public.protocols where id = _protocol for update;
  if not found or not public.has_perm(p.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if jsonb_array_length(p.blocks) = 0 then raise exception 'O protocolo não tem testes.' using errcode = 'check_violation'; end if;
  for b in select * from jsonb_array_elements(p.blocks) loop
    for t in select * from jsonb_array_elements(coalesce(b->'testes', '[]')) loop
      if coalesce(t->>'chave', '') = '' or coalesce(trim(t->>'nome'), '') = '' or coalesce(t->>'unidade', '') = '' then
        raise exception 'Cada teste precisa de nome e unidade.' using errcode = 'check_violation';
      end if;
      if t->>'chave' = any (chaves) then raise exception 'O teste "%" aparece duas vezes.', t->>'nome' using errcode = 'check_violation'; end if;
      if coalesce((t->>'tentativas')::int, 1) not between 1 and 5 then raise exception 'Tentativas entre 1 e 5.' using errcode = 'check_violation'; end if;
      chaves := chaves || (t->>'chave');
    end loop;
  end loop;
  if cardinality(chaves) = 0 then raise exception 'O protocolo não tem testes.' using errcode = 'check_violation'; end if;
  insert into public.protocol_versions (protocol_id, org_id, version, name, blocks, published_by)
    values (p.id, p.org_id, p.version + 1, p.name, p.blocks, auth.uid());
  update public.protocols set version = p.version + 1, updated_at = now() where id = p.id;
  return p.version + 1;
end $$;

-- ---------------------------------------------------------------------------
-- G-24 · Pedidos (uma vez ou recorrentes)
-- ---------------------------------------------------------------------------
create table public.request_schedules (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  form_id         uuid not null,
  links           uuid[] not null default '{}',
  group_id        uuid,
  weekday         int not null check (weekday between 0 and 6),
  hour            int not null default 18 check (hour between 0 and 23),
  due_days        int not null default 2 check (due_days between 1 and 14),
  until_plan_end  boolean not null default true,
  until_date      date,
  remind          boolean not null default true,
  notify_pt       boolean not null default true,
  stopped_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  foreign key (form_id, org_id) references public.forms(id, org_id) on delete cascade
);
create table public.requests (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  link_id             uuid not null,
  kind                text not null check (kind in ('form','protocol')),
  form_version_id     uuid references public.form_versions(id),
  protocol_version_id uuid references public.protocol_versions(id),
  schedule_id         uuid references public.request_schedules(id) on delete set null,
  booking_id          uuid,
  status              text not null default 'pendente' check (status in ('pendente','respondido','retirado','expirado')),
  due_at              timestamptz,
  remind              boolean not null default true,
  reminded_at         timestamptz,
  opened_at           timestamptz,
  answered_at         timestamptz,
  withdrawn_reason    text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  check ((kind = 'form') = (form_version_id is not null)),
  check ((kind = 'protocol') = (protocol_version_id is not null)),
  check (status <> 'retirado' or length(trim(coalesce(withdrawn_reason, ''))) > 0),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create index on public.requests (link_id, status);
create unique index requests_um_por_semana on public.requests (schedule_id, link_id, (date_trunc('week', created_at at time zone 'UTC')))
  where schedule_id is not null;
alter table public.request_schedules enable row level security;
alter table public.requests enable row level security;
create policy request_schedules_select on public.request_schedules for select to authenticated using (public.is_member(org_id));
create policy requests_select on public.requests for select to authenticated using (public.can_see_link(link_id) or public.is_my_link(link_id));
grant select on public.request_schedules, public.requests to authenticated;
revoke all on public.request_schedules, public.requests from anon;

create or replace function public._criar_pedido(_org uuid, _link uuid, _kind text, _fv uuid, _pv uuid, _due timestamptz, _remind boolean, _schedule uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid; u uuid; nome text;
begin
  insert into public.requests (org_id, link_id, kind, form_version_id, protocol_version_id, schedule_id, due_at, remind, created_by)
    values (_org, _link, _kind, _fv, _pv, _schedule, _due, _remind, auth.uid())
    on conflict do nothing returning id into v;
  if v is null then return null; end if;
  select p.user_id into u from public.links l join public.persons p on p.id = l.person_id where l.id = _link;
  nome := coalesce((select name from public.form_versions where id = _fv), (select name from public.protocol_versions where id = _pv));
  if u is not null and _kind = 'form' then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      values (u, _org, 'pedido', 'Tens um pedido para responder', nome, '/pedido/' || v);
  end if;
  return v;
end $$;

-- Enviar agora (questionário a vários) ou marcar uma avaliação física
create or replace function public.send_requests(_org uuid, _form uuid, _links uuid[], _due timestamptz default null, _remind boolean default true)
returns int language plpgsql security definer set search_path = '' as $$
declare fv uuid; l uuid; n int := 0;
begin
  if not public.has_perm(_org, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select v.id into fv from public.form_versions v join public.forms f on f.id = v.form_id
    where f.id = _form and f.org_id = _org and v.version = f.version;
  if fv is null then raise exception 'Publica o questionário antes de o enviar.' using errcode = 'check_violation'; end if;
  foreach l in array _links loop
    if not public.can_see_link(l) then raise exception 'cliente inválido' using errcode = 'insufficient_privilege'; end if;
    if public._criar_pedido(_org, l, 'form', fv, null, coalesce(_due, now() + interval '3 days'), _remind) is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.schedule_requests(_org uuid, _form uuid, _links uuid[], _group uuid, _weekday int, _hour int, _due_days int,
                                                   _until_plan_end boolean default true, _until date default null, _remind boolean default true, _notify_pt boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if not public.has_perm(_org, 'training.write') or not exists (select 1 from public.forms where id = _form and org_id = _org and version > 0) then
    raise exception 'Publica o questionário antes de o agendar.' using errcode = 'check_violation';
  end if;
  insert into public.request_schedules (org_id, form_id, links, group_id, weekday, hour, due_days, until_plan_end, until_date, remind, notify_pt, created_by)
    values (_org, _form, coalesce(_links, '{}'), _group, _weekday, _hour, _due_days, _until_plan_end, _until, _remind, _notify_pt, auth.uid())
    returning id into v;
  perform public._gerar_pedidos(now(), v);
  return v;
end $$;

-- Gera os pedidos da semana dos agendamentos (agendador e ao abrir a Avaliação).
-- Recorrente pára quando o plano do cliente acaba ou na data escolhida.
create or replace function public._gerar_pedidos(_now timestamptz default now(), _so uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare s record; l uuid; fv uuid; tz text; dia_local timestamp; n int := 0;
begin
  for s in select * from public.request_schedules where stopped_at is null and (_so is null or id = _so) loop
    tz := coalesce((select timezone from public.organizations where id = s.org_id), 'Europe/Lisbon');
    dia_local := date_trunc('week', _now at time zone tz) + make_interval(days => (s.weekday + 6) % 7, hours => s.hour);
    if (dia_local at time zone tz) > _now then continue; end if;
    if s.until_date is not null and s.until_date < (_now at time zone tz)::date then
      update public.request_schedules set stopped_at = _now where id = s.id; continue;
    end if;
    select v.id into fv from public.form_versions v join public.forms f on f.id = v.form_id where f.id = s.form_id and v.version = f.version;
    if fv is null then continue; end if;
    for l in
      select x from unnest(s.links) x
      union select gm.link_id from public.group_members gm where s.group_id is not null and gm.group_id = s.group_id and gm.left_at is null
    loop
      if s.until_plan_end and not exists (select 1 from public.assignments a where a.link_id = l and a.status = 'active'
                                           and (a.ends_on is null or a.ends_on >= (_now at time zone tz)::date)) then continue; end if;
      if public._criar_pedido(s.org_id, l, 'form', fv, null, (dia_local at time zone tz) + make_interval(days => s.due_days), s.remind, s.id) is not null then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

create or replace function public.withdraw_request(_request uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype;
begin
  select * into r from public.requests where id = _request for update;
  if not found or not public.can_see_link(r.link_id) or not public.has_perm(r.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'pendente' then raise exception 'Este pedido já não está pendente.' using errcode = 'check_violation'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'Retirar pede um motivo.' using errcode = 'check_violation'; end if;
  update public.requests set status = 'retirado', withdrawn_reason = trim(_reason) where id = _request;
end $$;

-- ---------------------------------------------------------------------------
-- C-15 / C-08 · Respostas (da pessoa), check-in diário e fotos
-- ---------------------------------------------------------------------------
create table public.form_responses (
  id              uuid primary key,                 -- gerado no telemóvel (reenviar nunca duplica)
  person_id       uuid not null references public.persons(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  link_id         uuid not null,
  request_id      uuid references public.requests(id) on delete set null,
  form_version_id uuid not null references public.form_versions(id),
  answers         jsonb not null,
  score           jsonb not null default '{}'::jsonb,
  needs_review    boolean not null default true,
  reviewed_at     timestamptz,
  reviewed_by     uuid,
  reply           text,
  submitted_at    timestamptz not null default now(),
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade
);
create index on public.form_responses (link_id, submitted_at desc);
alter table public.form_responses enable row level security;
create policy form_responses_select on public.form_responses for select to authenticated
  using (person_id = public.my_person_id() or (
    public.can_see_link(link_id) and (
      not (select v.health from public.form_versions v where v.id = form_version_id)
      or public.has_perm(org_id, 'health.read') or public.sou_responsavel(link_id))
    and public.can_read_person_data(person_id, case when (select v.kind from public.form_versions v where v.id = form_version_id) = 'checkin_semanal'
                                                    then 'checkins'::public.share_category else 'training'::public.share_category end)));
grant select on public.form_responses to authenticated;
revoke all on public.form_responses from anon;

create table public.daily_checkins (
  id         uuid primary key,
  person_id  uuid not null references public.persons(id) on delete cascade,
  day        date not null,
  sleep      int check (sleep between 1 and 5),
  energy     int check (energy between 1 and 5),
  pain       boolean not null default false,
  pain_where text,
  created_at timestamptz not null default now(),
  unique (person_id, day)
);
alter table public.daily_checkins enable row level security;
create policy daily_checkins_select on public.daily_checkins for select to authenticated
  using (public.can_read_person_data(person_id, 'checkins'));
grant select on public.daily_checkins to authenticated;
revoke all on public.daily_checkins from anon;

create table public.progress_photos (
  id         uuid primary key,
  person_id  uuid not null references public.persons(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete set null,
  link_id    uuid,
  source     text not null check (source in ('checkin','avaliacao')),
  ref_id     uuid,
  pose       text check (pose in ('frente','lado','costas','outra')),
  path       text not null,
  created_at timestamptz not null default now()
);
create index on public.progress_photos (person_id, created_at desc);
alter table public.progress_photos enable row level security;
-- Só a própria pessoa e o PT responsável (com a partilha de fotos); nunca a receção
create policy progress_photos_select on public.progress_photos for select to authenticated
  using (person_id = public.my_person_id() or (link_id is not null and public.sou_responsavel(link_id) and public.can_read_person_data(person_id, 'photos')));
grant select on public.progress_photos to authenticated;
revoke all on public.progress_photos from anon;

-- O que a app tem por responder
create or replace function public.my_requests()
returns table (id uuid, org text, nome text, tipo text, saude boolean, prazo timestamptz, perguntas int, de text)
language sql stable security definer set search_path = '' as $$
  select r.id, o.name, v.name, v.kind, v.health, r.due_at, jsonb_array_length(v.questions),
    (select p.full_name from public.memberships m join public.persons p on p.id = m.person_id where m.id = l.responsible_membership_id)
  from public.requests r join public.links l on l.id = r.link_id join public.organizations o on o.id = r.org_id
  join public.form_versions v on v.id = r.form_version_id
  where l.person_id = public.my_person_id() and r.status = 'pendente' and r.kind = 'form'
  order by r.due_at nulls last;
$$;

create or replace function public.open_request(_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; v public.form_versions%rowtype;
begin
  select * into r from public.requests where id = _request;
  if not found or not public.is_my_link(r.link_id) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  update public.requests set opened_at = coalesce(opened_at, now()) where id = _request;
  select * into v from public.form_versions where id = r.form_version_id;
  return jsonb_build_object('id', r.id, 'nome', v.name, 'tipo', v.kind, 'saude', v.health, 'perguntas', v.questions, 'estado', r.status, 'prazo', r.due_at,
    'quem_ve', case when v.health then 'Só o teu PT e quem trata da saúde no ginásio veem estas respostas.' else 'O teu PT vê estas respostas.' end);
end $$;

-- Pontuação: soma por dimensão (peso × valor normalizado de 0 a 1) — só perguntas com "pontua"
create or replace function public._pontuar(_q jsonb, _a jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(dim, round(total::numeric, 2)), '{}'::jsonb) from (
    select q->'pontua'->>'dimensao' dim,
      sum(coalesce((q->'pontua'->>'peso')::numeric, 1) * case q->>'tipo'
        when 'escala' then ((_a->>(q->>'id'))::numeric - coalesce((q->>'min')::numeric, 1)) / nullif(coalesce((q->>'max')::numeric, 5) - coalesce((q->>'min')::numeric, 1), 0)
        when 'sim_nao' then case when (_a->>(q->>'id'))::boolean then 1 else 0 end
        else null end) total
    from jsonb_array_elements(_q) q
    where q ? 'pontua' and _a ? (q->>'id') and jsonb_typeof(_a->(q->>'id')) in ('number','boolean','string')
    group by 1) x where dim is not null;
$$;

create or replace function public.submit_response(_id uuid, _request uuid, _answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.requests%rowtype; v public.form_versions%rowtype; q jsonb; val jsonb; me uuid := public._require_person(); avisar text;
begin
  if exists (select 1 from public.form_responses where id = _id) then return; end if;   -- repetição da fila
  select * into r from public.requests where id = _request for update;
  if not found or not public.is_my_link(r.link_id) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if r.status <> 'pendente' then raise exception 'Este pedido já foi respondido ou retirado.' using errcode = 'check_violation'; end if;
  select * into v from public.form_versions where id = r.form_version_id;
  for q in select * from jsonb_array_elements(v.questions) loop
    val := _answers->(q->>'id');
    -- Obrigatória só se a condição dela se cumprir
    if coalesce((q->>'obrigatorio')::boolean, false) and (val is null or val = 'null'::jsonb or val = '""'::jsonb)
       and (not q ? 'se' or (_answers->(q->'se'->>'pergunta')) <@ (q->'se'->'valores')) then
      raise exception 'Falta responder: %', q->>'texto' using errcode = 'check_violation';
    end if;
    if val is not null and q->>'tipo' = 'numero' and jsonb_typeof(val) = 'number'
       and ((q ? 'min' and (val #>> '{}')::numeric < (q->>'min')::numeric) or (q ? 'max' and (val #>> '{}')::numeric > (q->>'max')::numeric)) then
      raise exception 'Valor fora dos limites em: %', q->>'texto' using errcode = 'check_violation';
    end if;
    if val is not null and q->>'tipo' = 'escolha_multipla' and jsonb_typeof(val) = 'array'
       and ((q ? 'min' and jsonb_array_length(val) < (q->>'min')::int) or (q ? 'max' and jsonb_array_length(val) > (q->>'max')::int)) then
      raise exception 'Escolhe entre % e % opções em: %', coalesce(q->>'min', '1'), coalesce(q->>'max', '—'), q->>'texto' using errcode = 'check_violation';
    end if;
    if q->>'acao' = 'avisar_pt' and (val = 'true'::jsonb or (q ? 'valores_aviso' and val <@ (q->'valores_aviso'))) then
      avisar := coalesce(avisar || ' · ', '') || (q->>'texto');
    end if;
  end loop;
  insert into public.form_responses (id, person_id, org_id, link_id, request_id, form_version_id, answers, score)
    values (_id, me, r.org_id, r.link_id, r.id, v.id, _answers, public._pontuar(v.questions, _answers));
  update public.requests set status = 'respondido', answered_at = now() where id = r.id;
  insert into public.notifications (user_id, org_id, type, title, body, action_url)
    select p.user_id, r.org_id, case when avisar is not null then 'resposta_alerta' else 'resposta' end,
      (select full_name from public.persons where id = me) || ' respondeu: ' || v.name, coalesce('Atenção: ' || avisar, 'Por rever'), '/avaliacao/resposta/' || _id
    from public.links l join public.memberships m on m.id = l.responsible_membership_id join public.persons p on p.id = m.person_id
    where l.id = r.link_id and p.user_id is not null;
end $$;

-- Check-in diário em três toques; uma dor nova avisa o PT
create or replace function public.submit_daily_checkin(_id uuid, _day date, _sleep int, _energy int, _pain boolean, _pain_where text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public._require_person(); nova boolean;
begin
  if _day > current_date + 1 or _day < current_date - 7 then raise exception 'dia inválido' using errcode = 'check_violation'; end if;
  nova := _pain and not exists (select 1 from public.daily_checkins where person_id = me and pain and day between _day - 7 and _day - 1);
  insert into public.daily_checkins (id, person_id, day, sleep, energy, pain, pain_where)
    values (_id, me, _day, _sleep, _energy, coalesce(_pain, false), nullif(trim(_pain_where), ''))
    on conflict (person_id, day) do update set sleep = excluded.sleep, energy = excluded.energy, pain = excluded.pain, pain_where = excluded.pain_where;
  if nova then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      select p.user_id, l.org_id, 'dor_nova', (select full_name from public.persons where id = me) || ' tem uma dor nova',
        coalesce(nullif(trim(_pain_where), ''), 'Check-in de hoje'), '/clients/' || l.id
      from public.links l join public.link_shares s on s.link_id = l.id and s.category = 'checkins' and s.revoked_at is null
      join public.memberships m on m.id = l.responsible_membership_id join public.persons p on p.id = m.person_id
      where l.person_id = me and l.status = 'active' and p.user_id is not null;
  end if;
end $$;

create or replace function public.add_progress_photo(_id uuid, _link uuid, _source text, _ref uuid, _pose text, _path text)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := public.my_person_id(); l public.links%rowtype;
begin
  select * into l from public.links where id = _link;
  if not found then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  -- A pessoa no check-in, ou o PT responsável na avaliação
  if not (l.person_id = me or (_source = 'avaliacao' and public.sou_responsavel(_link))) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _path !~ ('^' || l.person_id::text || '/') then raise exception 'caminho inválido' using errcode = 'check_violation'; end if;
  insert into public.progress_photos (id, person_id, org_id, link_id, source, ref_id, pose, path)
    values (_id, l.person_id, l.org_id, _link, _source, _ref, _pose, _path) on conflict (id) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- G-23 · Avaliação física no terreno (sem rede: upsert pelos ids do aparelho)
-- ---------------------------------------------------------------------------
create table public.assessments (
  id                  uuid primary key,
  org_id              uuid not null references public.organizations(id) on delete cascade,
  link_id             uuid not null,
  person_id           uuid not null references public.persons(id) on delete cascade,
  protocol_version_id uuid not null,
  request_id          uuid references public.requests(id) on delete set null,
  membership_id       uuid,
  status              text not null default 'em_curso' check (status in ('em_curso','fechada')),
  show_client         boolean not null default true,
  started_at          timestamptz not null default now(),
  closed_at           timestamptz,
  reviewed_at         timestamptz,
  reply               text,
  foreign key (link_id, org_id) references public.links(id, org_id) on delete cascade,
  foreign key (protocol_version_id, org_id) references public.protocol_versions(id, org_id)
);
create table public.assessment_values (
  id                 uuid primary key,
  assessment_id      uuid not null references public.assessments(id) on delete cascade,
  person_id          uuid not null,
  test_key           text not null,
  name               text not null,
  unit               text not null,
  attempts           numeric[] not null default '{}',
  value              numeric,
  skipped_reason     text,
  lower_is_better    boolean not null default false,
  invalidated_at     timestamptz,
  invalidated_reason text,
  invalidated_by     uuid,
  recorded_at        timestamptz not null default now(),
  unique (assessment_id, test_key),
  check (invalidated_at is null or length(trim(coalesce(invalidated_reason, ''))) > 0)
);
create index on public.assessments (link_id, started_at desc);
create index on public.assessment_values (person_id, test_key, recorded_at);
alter table public.assessments enable row level security;
alter table public.assessment_values enable row level security;
create policy assessments_select on public.assessments for select to authenticated
  using ((person_id = public.my_person_id() and show_client and status = 'fechada') or (public.can_see_link(link_id) and public.can_read_person_data(person_id, 'measurements')));
create policy assessment_values_select on public.assessment_values for select to authenticated
  using (exists (select 1 from public.assessments a where a.id = assessment_id));
grant select on public.assessments, public.assessment_values to authenticated;
revoke all on public.assessments, public.assessment_values from anon;

create or replace function public.sync_assessment(_p jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.assessments%rowtype; l public.links%rowtype; pv public.protocol_versions%rowtype; v jsonb; t jsonb; teste jsonb; val numeric; tent numeric[];
begin
  select * into l from public.links where id = (_p->>'link_id')::uuid;
  if not found or not public.can_see_link(l.id) or not public.has_perm(l.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into pv from public.protocol_versions where id = (_p->>'protocol_version_id')::uuid and org_id = l.org_id;
  if not found then raise exception 'protocolo inválido' using errcode = 'check_violation'; end if;
  select * into a from public.assessments where id = (_p->>'id')::uuid;
  if found and a.status = 'fechada' then return; end if;   -- depois de fechada, a fila já não mexe
  insert into public.assessments (id, org_id, link_id, person_id, protocol_version_id, request_id, membership_id, started_at)
    values ((_p->>'id')::uuid, l.org_id, l.id, l.person_id, pv.id, nullif(_p->>'request_id', '')::uuid, public.my_membership_id(l.org_id),
            coalesce((_p->>'iniciada_em')::timestamptz, now()))
    on conflict (id) do nothing;
  for v in select * from jsonb_array_elements(coalesce(_p->'valores', '[]')) loop
    select x into teste from jsonb_array_elements(pv.blocks) b, jsonb_array_elements(b->'testes') x where x->>'chave' = v->>'chave' limit 1;
    if teste is null then continue; end if;
    select coalesce(array_agg(e::numeric), '{}') into tent from jsonb_array_elements_text(coalesce(v->'tentativas', '[]')) e where e <> '';
    val := case when cardinality(tent) = 0 then null
                when teste->>'guarda' = 'media' then round((select avg(x) from unnest(tent) x), 2)
                when coalesce((teste->>'menor_melhor')::boolean, false) then (select min(x) from unnest(tent) x)
                else (select max(x) from unnest(tent) x) end;
    insert into public.assessment_values (id, assessment_id, person_id, test_key, name, unit, attempts, value, skipped_reason, lower_is_better)
      values ((v->>'id')::uuid, (_p->>'id')::uuid, l.person_id, teste->>'chave', teste->>'nome', teste->>'unidade', tent, val,
              nullif(trim(v->>'saltado'), ''), coalesce((teste->>'menor_melhor')::boolean, false))
      on conflict (assessment_id, test_key) do update set attempts = excluded.attempts, value = excluded.value, skipped_reason = excluded.skipped_reason, recorded_at = now();
  end loop;
end $$;

create or replace function public.close_assessment(_id uuid, _show_client boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.assessments%rowtype;
begin
  select * into a from public.assessments where id = _id for update;
  if not found or not public.can_see_link(a.link_id) or not public.has_perm(a.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if a.status = 'fechada' then return; end if;
  update public.assessments set status = 'fechada', closed_at = now(), show_client = _show_client where id = _id;
  update public.requests set status = 'respondido', answered_at = now() where id = a.request_id and status = 'pendente';
  if _show_client then
    insert into public.notifications (user_id, org_id, type, title, body, action_url)
      select p.user_id, a.org_id, 'avaliacao', 'A tua avaliação está pronta', 'Vê o que mudou desde a última', '/progresso'
      from public.persons p where p.id = a.person_id and p.user_id is not null;
  end if;
end $$;

-- Invalidar nunca apaga: sai dos gráficos, fica no histórico com motivo e quem
create or replace function public.invalidate_value(_value uuid, _reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.assessments%rowtype;
begin
  select x.* into a from public.assessments x join public.assessment_values v on v.assessment_id = x.id where v.id = _value;
  if a.id is null or not public.can_see_link(a.link_id) or not public.has_perm(a.org_id, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'Invalidar pede um motivo.' using errcode = 'check_violation'; end if;
  update public.assessment_values set invalidated_at = now(), invalidated_reason = trim(_reason), invalidated_by = auth.uid() where id = _value and invalidated_at is null;
end $$;

-- Rever (G-25): marca como lido e, se quiser, responde ao cliente
create or replace function public.review_item(_kind text, _id uuid, _reply text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_link uuid; v_org uuid; v_person uuid; u uuid;
begin
  if _kind = 'resposta' then select link_id, org_id, person_id into v_link, v_org, v_person from public.form_responses where id = _id;
  elsif _kind = 'avaliacao' then select link_id, org_id, person_id into v_link, v_org, v_person from public.assessments where id = _id;
  else raise exception 'tipo inválido' using errcode = 'invalid_parameter_value'; end if;
  if v_link is null or not public.can_see_link(v_link) or not public.has_perm(v_org, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if _kind = 'resposta' then
    update public.form_responses set needs_review = false, reviewed_at = now(), reviewed_by = auth.uid(), reply = coalesce(nullif(trim(_reply), ''), reply) where id = _id;
  else
    update public.assessments set reviewed_at = now(), reply = coalesce(nullif(trim(_reply), ''), reply) where id = _id;
  end if;
  if nullif(trim(_reply), '') is not null then
    select user_id into u from public.persons where id = v_person;
    if u is not null then
      insert into public.notifications (user_id, org_id, type, title, body, action_url)
        values (u, v_org, 'resposta_pt', 'O teu PT respondeu', left(trim(_reply), 200), '/progresso');
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- G-20 · O que está por avaliar · G-25 · comparar e tendência
-- ---------------------------------------------------------------------------
create or replace function public.assessment_overview(_org uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; todos boolean;
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  perform public._gerar_pedidos(now(), null);
  update public.requests set status = 'expirado' where org_id = _org and status = 'pendente' and due_at < now() - interval '14 days';
  todos := public.has_perm(_org, 'clients.read_all');
  with meus as (select l.id, c.full_name from public.links l join public.clients c on c.id = l.id
                where l.org_id = _org and l.status = 'active' and (todos or l.responsible_membership_id = public.my_membership_id(_org)))
  select jsonb_build_object(
    'marcadas', (select count(*) from public.bookings b join meus m on m.id = b.link_id where b.type = 'assessment' and b.status in ('pending','confirmed') and b.starts_at > now()),
    'proxima', (select jsonb_build_object('nome', m.full_name, 'inicio', b.starts_at) from public.bookings b join meus m on m.id = b.link_id
                where b.type = 'assessment' and b.status in ('pending','confirmed') and b.starts_at > now() order by b.starts_at limit 1),
    'em_atraso', (select count(*) from public.reviews r join meus m on m.id = r.link_id where r.done_at is null and r.scheduled_on < current_date),
    'por_responder', (select count(*) from public.requests r join meus m on m.id = r.link_id where r.status = 'pendente'),
    'por_ler', (select count(*) from public.form_responses f join meus m on m.id = f.link_id where f.needs_review)
             + (select count(*) from public.assessments a join meus m on m.id = a.link_id where a.status = 'fechada' and a.reviewed_at is null),
    'fazer', coalesce((select jsonb_agg(x order by x->>'quando') from (
        select jsonb_build_object('tipo', 'resposta', 'id', f.id, 'link_id', m.id, 'nome', m.full_name, 'titulo', v.name,
          'detalhe', 'Respondeu ' || to_char(f.submitted_at, 'DD/MM'), 'quando', f.submitted_at, 'saude', v.health) x
        from public.form_responses f join meus m on m.id = f.link_id join public.form_versions v on v.id = f.form_version_id where f.needs_review
        union all
        select jsonb_build_object('tipo', 'avaliacao', 'id', a.id, 'link_id', m.id, 'nome', m.full_name, 'titulo', pv.name,
          'detalhe', 'Fechada ' || to_char(a.closed_at, 'DD/MM'), 'quando', a.closed_at, 'saude', false)
        from public.assessments a join meus m on m.id = a.link_id join public.protocol_versions pv on pv.id = a.protocol_version_id
        where a.status = 'fechada' and a.reviewed_at is null
        union all
        select jsonb_build_object('tipo', 'em_atraso', 'id', r.id, 'link_id', m.id, 'nome', m.full_name, 'titulo', 'reavaliação em atraso',
          'detalhe', 'Devia ter sido a ' || to_char(r.scheduled_on, 'DD/MM'), 'quando', r.scheduled_on, 'saude', false)
        from public.reviews r join meus m on m.id = r.link_id where r.done_at is null and r.scheduled_on < current_date
        union all
        select jsonb_build_object('tipo', 'em_curso', 'id', a.id, 'link_id', m.id, 'nome', m.full_name, 'titulo', pv.name,
          'detalhe', 'Avaliação por fechar', 'quando', a.started_at, 'saude', false)
        from public.assessments a join meus m on m.id = a.link_id join public.protocol_versions pv on pv.id = a.protocol_version_id
        where a.status = 'em_curso'
      ) z limit 50), '[]'::jsonb)
  ) into v
  from (select 1) _;
  return v;
end $$;

-- Antes e agora: cada teste da avaliação contra o último valor válido anterior
create or replace function public.compare_assessment(_id uuid)
returns table (chave text, nome text, unidade text, antes numeric, agora numeric, mudou numeric, melhor boolean, estado text, valor_id uuid, motivo text, saltado text)
language sql stable security definer set search_path = '' as $$
  select v.test_key, v.name, v.unit, p.value, v.value, v.value - p.value,
    case when v.value is null or p.value is null then null when v.lower_is_better then v.value < p.value else v.value > p.value end,
    case when v.invalidated_at is not null then 'invalidado' when v.value is null then 'nao_feito' else 'ok' end,
    v.id, v.invalidated_reason, v.skipped_reason
  from public.assessments a join public.assessment_values v on v.assessment_id = a.id
  left join lateral (
    select pv.value from public.assessment_values pv join public.assessments pa on pa.id = pv.assessment_id
    where pa.person_id = a.person_id and pv.test_key = v.test_key and pa.started_at < a.started_at and pa.status = 'fechada'
      and pv.invalidated_at is null and pv.value is not null
    order by pa.started_at desc limit 1) p on true
  where a.id = _id and (public.can_see_link(a.link_id) or (a.person_id = public.my_person_id() and a.show_client and a.status = 'fechada'))
  order by v.recorded_at;
$$;

-- Tendência de um teste (só valores válidos: invalidados saem do gráfico)
create or replace function public.test_trend(_person uuid, _key text)
returns table (em timestamptz, valor numeric)
language sql stable security definer set search_path = '' as $$
  select a.started_at, v.value from public.assessment_values v join public.assessments a on a.id = v.assessment_id
  where a.person_id = _person and v.test_key = _key and v.invalidated_at is null and v.value is not null and a.status = 'fechada'
    and (public.can_read_person_data(_person, 'measurements') or (_person = public.my_person_id() and a.show_client))
  order by a.started_at;
$$;

-- Fotos guardadas no Supabase Storage, num balde privado; o caminho começa pelo id da pessoa
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false) on conflict (id) do nothing;
    execute $p$create policy fotos_ler on storage.objects for select to authenticated using (
      bucket_id = 'fotos' and exists (select 1 from public.progress_photos f where f.path = name))$p$;
    execute $p$create policy fotos_enviar on storage.objects for insert to authenticated with check (
      bucket_id = 'fotos' and (split_part(name, '/', 1) = public.my_person_id()::text
        or exists (select 1 from public.links l where l.person_id::text = split_part(name, '/', 1) and public.sou_responsavel(l.id))))$p$;
  end if;
end $$;

revoke execute on function public._perguntas_validas(jsonb), public._criar_pedido(uuid, uuid, text, uuid, uuid, timestamptz, boolean, uuid),
  public._gerar_pedidos(timestamptz, uuid), public._pontuar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public._gerar_pedidos(timestamptz, uuid) to service_role;
revoke execute on function public.sou_responsavel(uuid) from public, anon;
grant execute on function public.sou_responsavel(uuid) to authenticated;
revoke execute on function public.publish_form(uuid), public.publish_protocol(uuid), public.send_requests(uuid, uuid, uuid[], timestamptz, boolean),
  public.schedule_requests(uuid, uuid, uuid[], uuid, int, int, int, boolean, date, boolean, boolean), public.withdraw_request(uuid, text),
  public.my_requests(), public.open_request(uuid), public.submit_response(uuid, uuid, jsonb), public.submit_daily_checkin(uuid, date, int, int, boolean, text),
  public.add_progress_photo(uuid, uuid, text, uuid, text, text), public.sync_assessment(jsonb), public.close_assessment(uuid, boolean),
  public.invalidate_value(uuid, text), public.review_item(text, uuid, text), public.assessment_overview(uuid), public.compare_assessment(uuid),
  public.test_trend(uuid, text) from public, anon;
grant execute on function public.publish_form(uuid), public.publish_protocol(uuid), public.send_requests(uuid, uuid, uuid[], timestamptz, boolean),
  public.schedule_requests(uuid, uuid, uuid[], uuid, int, int, int, boolean, date, boolean, boolean), public.withdraw_request(uuid, text),
  public.my_requests(), public.open_request(uuid), public.submit_response(uuid, uuid, jsonb), public.submit_daily_checkin(uuid, date, int, int, boolean, text),
  public.add_progress_photo(uuid, uuid, text, uuid, text, text), public.sync_assessment(jsonb), public.close_assessment(uuid, boolean),
  public.invalidate_value(uuid, text), public.review_item(text, uuid, text), public.assessment_overview(uuid), public.compare_assessment(uuid),
  public.test_trend(uuid, text) to authenticated;
