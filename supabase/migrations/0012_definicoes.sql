-- ============================================================
-- LUNA.OS v3 · 0012 · Definições (tarefa 10): equipa e acessos (G-44),
-- segurança e auditoria (G-45), ginásio e preferências (G-46) e importar
-- clientes com relatório de falhas (G-05).
-- ============================================================

-- ---------------------------------------------------------------------------
-- Saúde fora da carteira pede motivo, que fica registado (G-45)
-- ---------------------------------------------------------------------------
alter table public.health_access_log add column reason text;

drop function public.get_person_health(uuid);
create function public.get_person_health(_link uuid, _reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l public.links%rowtype;
begin
  select * into l from public.links where id = _link;
  if not found or not public.can_see_link(_link)
     or not public.org_has_share(l.org_id, l.person_id, 'health') then
    raise exception 'sem permissão' using errcode = 'insufficient_privilege';
  end if;
  if l.responsible_membership_id is distinct from public.my_membership_id(l.org_id)
     and length(trim(coalesce(_reason, ''))) = 0 then
    raise exception 'motivo_obrigatorio' using errcode = 'check_violation';
  end if;
  insert into public.health_access_log (org_id, person_id, link_id, actor_user, reason)
    values (l.org_id, l.person_id, l.id, auth.uid(), nullif(trim(_reason), ''));
  return jsonb_build_object(
    'allergies', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'allergen', a.allergen, 'severity', a.severity,
                                          'reaction', a.reaction, 'notes', a.notes)
                       order by a.severity desc, a.allergen)
      from public.allergies a where a.person_id = l.person_id), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------------
-- Segurança e auditoria (G-45): o registo não se edita nem apaga
-- ---------------------------------------------------------------------------
create or replace function public.org_audit(_org uuid, _limit int default 200)
returns table (em timestamptz, quem text, acao text, entidade text, entity_id uuid, diff jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(_org, 'org.manage') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
    select a.created_at, coalesce(p.full_name, 'Sistema'), a.action, a.entity, a.entity_id, a.diff
    from public.audit_log a left join public.persons p on p.user_id = a.actor_user
    where a.org_id = _org order by a.created_at desc limit least(_limit, 1000);
end $$;

create or replace function public.org_health_access(_org uuid)
returns table (em timestamptz, quem text, cliente text, motivo text, fora_da_carteira boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(_org, 'org.manage') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
    select h.created_at, coalesce(pa.full_name, '—'), coalesce(pc.full_name, '—'), h.reason,
      coalesce(l.responsible_membership_id is distinct from (select m.id from public.memberships m join public.persons x on x.id = m.person_id
                                                          where m.org_id = _org and x.user_id = h.actor_user), true)
    from public.health_access_log h
    left join public.persons pa on pa.user_id = h.actor_user
    left join public.persons pc on pc.id = h.person_id
    left join public.links l on l.id = h.link_id
    where h.org_id = _org order by h.created_at desc limit 300;
end $$;

create or replace function public.org_logins(_org uuid)
returns table (em timestamptz, quem text, aparelho text, sucesso boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(_org, 'org.manage') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
    select lh.created_at, p.full_name, coalesce(lh.device, lh.user_agent), lh.success
    from public.login_history lh
    join public.persons p on p.user_id = lh.user_id
    join public.memberships m on m.person_id = p.id and m.org_id = _org and m.status = 'active'
    order by lh.created_at desc limit 300;
end $$;

-- Dois fatores: obrigatórios para quem gere e para quem vê saúde
create or replace function public.org_two_factor(_org uuid)
returns table (membership_id uuid, nome text, obrigatorio boolean, ativo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare tem_mfa boolean := to_regclass('auth.mfa_factors') is not null;
begin
  if not public.has_perm(_org, 'org.manage') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query execute format($q$
    select m.id, p.full_name,
      exists (select 1 from public.membership_roles mr join public.roles r on r.id = mr.role_id
              where mr.membership_id = m.id and r.permissions && array['health.read','org.manage','team.manage']),
      %s
    from public.memberships m join public.persons p on p.id = m.person_id
    where m.org_id = $1 and m.status = 'active' order by p.full_name $q$,
    case when tem_mfa then 'exists (select 1 from auth.mfa_factors f where f.user_id = p.user_id and f.status = ''verified'')' else 'false' end)
  using _org;
end $$;

-- Título profissional a expirar: aviso à gerência 30 dias antes (idempotente)
create or replace function public.sync_title_alerts(_org uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.is_member(_org) then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  insert into public.notifications (user_id, org_id, type, title, body, data, action_url)
    select gp.user_id, _org, 'titulo_a_expirar', 'Título profissional a expirar',
      p.full_name || ': válido até ' || to_char(m.title_valid_until, 'DD/MM/YYYY'),
      jsonb_build_object('membership_id', m.id, 'valid_until', m.title_valid_until), '/settings/equipa'
    from public.memberships m join public.persons p on p.id = m.person_id
    cross join lateral (
      select gpp.user_id from public.memberships gm join public.persons gpp on gpp.id = gm.person_id
      join public.membership_roles mr on mr.membership_id = gm.id join public.roles r on r.id = mr.role_id
      where gm.org_id = _org and gm.status = 'active' and 'team.manage' = any (r.permissions) and gpp.user_id is not null
      group by gpp.user_id) gp
    where m.org_id = _org and m.status = 'active' and m.title_valid_until is not null
      and m.title_valid_until <= current_date + 30
      and not exists (select 1 from public.notifications n where n.user_id = gp.user_id and n.type = 'titulo_a_expirar'
                      and n.data->>'membership_id' = m.id::text and n.data->>'valid_until' = m.title_valid_until::text);
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- Importar clientes (G-05): nada entra antes do último passo; no fim fica o
-- comprovativo com as linhas que falharam, prontas a corrigir e repetir.
-- ---------------------------------------------------------------------------
create table public.import_runs (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  file_name   text not null,
  total       int not null,
  ok          int not null,
  failed      int not null,
  report      jsonb not null,        -- [{linha, nome, motivo}] das que falharam
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.import_runs enable row level security;
create policy import_runs_select on public.import_runs for select to authenticated
  using (public.has_perm(org_id, 'clients.write') and (created_by = auth.uid() or public.has_perm(org_id, 'clients.read_all')));
grant select on public.import_runs to authenticated;
revoke all on public.import_runs from anon;

create or replace function public.import_clients(_org uuid, _file text, _rows jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r jsonb; i int := 0; v_ok int := 0; v_falhas jsonb := '[]'::jsonb; v_id uuid; v_nasc date;
begin
  if not public.has_perm(_org, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 5000 then
    raise exception 'ficheiro inválido ou com mais de 5000 linhas' using errcode = 'invalid_parameter_value';
  end if;
  for r in select * from jsonb_array_elements(_rows) loop
    i := i + 1;
    begin
      v_nasc := nullif(r->>'nascimento', '')::date;
      perform public.add_client(_org, r->>'nome', nullif(r->>'email', ''), nullif(r->>'telefone', ''), v_nasc,
        nullif(r->>'responsavel', '')::uuid, 'pt_client', nullif(r->>'nif', ''));
      v_ok := v_ok + 1;
    exception
      when unique_violation then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Já existe (telemóvel, email ou NIF)');
      when check_violation then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Falta o nome');
      when invalid_datetime_format or datetime_field_overflow then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Data de nascimento inválida');
      when others then v_falhas := v_falhas || jsonb_build_object('linha', coalesce((r->>'linha')::int, i), 'nome', r->>'nome', 'motivo', 'Linha inválida');
    end;
  end loop;
  insert into public.import_runs (org_id, file_name, total, ok, failed, report, created_by)
    values (_org, coalesce(nullif(trim(_file), ''), 'ficheiro'), i, v_ok, i - v_ok, v_falhas, auth.uid())
    returning id into v_id;
  insert into public.audit_log (org_id, actor_user, action, entity, entity_id, diff)
    values (_org, auth.uid(), 'clientes.importar', 'import_runs', v_id, jsonb_build_object('total', i, 'ok', v_ok));
  return v_id;
end $$;

revoke execute on function public.get_person_health(uuid, text), public.org_audit(uuid, int), public.org_health_access(uuid), public.org_logins(uuid),
  public.org_two_factor(uuid), public.sync_title_alerts(uuid), public.import_clients(uuid, text, jsonb) from public, anon;
grant execute on function public.get_person_health(uuid, text), public.org_audit(uuid, int), public.org_health_access(uuid), public.org_logins(uuid),
  public.org_two_factor(uuid), public.sync_title_alerts(uuid), public.import_clients(uuid, text, jsonb) to authenticated;

-- Antes de importar: que linhas já existem (na organização ou repetidas no ficheiro)
create or replace function public.import_check(_org uuid, _rows jsonb)
returns table (linha int, nome text, motivo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_perm(_org, 'clients.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  return query
  with f as (
    select coalesce((x->>'linha')::int, n::int) as linha, x->>'nome' as nome,
      public._tel(x->>'telefone') as tel, lower(nullif(trim(x->>'email'), '')) as email, nullif(trim(x->>'nif'), '') as nif
    from jsonb_array_elements(_rows) with ordinality as t(x, n)
  )
  select f.linha, f.nome, 'Já existe na organização'
  from f where exists (
    select 1 from public.links l join public.persons p on p.id = l.person_id
    where l.org_id = _org and l.status <> 'ended'
      and ((f.tel is not null and public._tel(p.phone) = f.tel) or (f.email is not null and lower(p.email) = f.email) or (f.nif is not null and p.tax_id = f.nif)))
  union all
  select f.linha, f.nome, 'Repetido no ficheiro (linha ' || g.linha || ')'
  from f join f g on g.linha < f.linha
    and ((f.tel is not null and f.tel = g.tel) or (f.email is not null and f.email = g.email) or (f.nif is not null and f.nif = g.nif))
  order by 1;
end $$;
revoke execute on function public.import_check(uuid, jsonb) from public, anon;
grant execute on function public.import_check(uuid, jsonb) to authenticated;
