-- ============================================================================
-- LUNA.OS v3 · 0003_acesso — quem vê o quê (RLS, grants, auditoria)
-- ----------------------------------------------------------------------------
-- 1. Dados da organização: só membros ativos, conforme as permissões dos papéis.
--    Um PT com clients.read_own vê os clientes de que é responsável; quem tem
--    clients.read_all vê a carteira toda.
-- 2. Dados da pessoa: a própria, o encarregado, ou uma organização com Link
--    ativo + partilha ativa da categoria (+ health.read para saúde). Revogar
--    corta na leitura seguinte, porque a verificação corre em cada leitura.
-- 3. Saúde: as organizações não leem a tabela; usam get_person_health(), que
--    verifica e regista cada leitura (0004).
-- 4. Ninguém edita os próprios papéis; perfis só nas colunas do perfil (AUD-69).
-- 5. audit_log e health_access_log: só acrescentar, e só por triggers/funções.
-- Todas as funções: SECURITY DEFINER, search_path vazio, decidem só pelo auth.uid().
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Funções de apoio às políticas
-- ---------------------------------------------------------------------------
create or replace function public.my_person_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from public.persons p where p.user_id = auth.uid();
$$;

create or replace function public.my_membership_id(_org uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id
  from public.memberships m
  join public.persons p on p.id = m.person_id
  where m.org_id = _org and m.status = 'active' and p.user_id = auth.uid();
$$;

create or replace function public.is_member(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.my_membership_id(_org) is not null;
$$;

create or replace function public.has_perm(_org uuid, _perm text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.persons p          on p.id = m.person_id
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r            on r.id = mr.role_id
    where m.org_id = _org and m.status = 'active' and p.user_id = auth.uid()
      and _perm = any (r.permissions)
  );
$$;

-- Vê este cliente? (carteira toda, ou só os seus)
create or replace function public.can_see_link(_link uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.links l
    where l.id = _link
      and (public.has_perm(l.org_id, 'clients.read_all')
           or (public.has_perm(l.org_id, 'clients.read_own')
               and l.responsible_membership_id = public.my_membership_id(l.org_id)))
  );
$$;

-- É o próprio, ou o seu encarregado com tutela ativa?
create or replace function public.is_self_or_guardian(_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select _person = public.my_person_id()
      or exists (select 1 from public.guardianships g
                 where g.minor_person_id = _person and g.status = 'active'
                   and g.guardian_person_id = public.my_person_id());
$$;

-- É uma ligação minha (como cliente)?
create or replace function public.is_my_link(_link uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.links l
                 where l.id = _link and public.is_self_or_guardian(l.person_id));
$$;

-- Esta organização tem ligação ativa, visível e com a categoria partilhada?
create or replace function public.org_has_share(_org uuid, _person uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.links l
    join public.link_shares s on s.link_id = l.id and s.category = _cat and s.revoked_at is null
    where l.org_id = _org and l.person_id = _person and l.status = 'active'
      and public.can_see_link(l.id)
      and (_cat <> 'health' or public.has_perm(_org, 'health.read'))
  );
$$;

-- Pode ler este dado da pessoa? (própria, encarregado, ou alguma organização com partilha)
create or replace function public.can_read_person_data(_person uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_self_or_guardian(_person)
      or exists (
        select 1
        from public.links l
        join public.link_shares s on s.link_id = l.id and s.category = _cat and s.revoked_at is null
        where l.person_id = _person and l.status = 'active'
          and public.can_see_link(l.id)
          and (_cat <> 'health' or public.has_perm(l.org_id, 'health.read'))
      );
$$;

-- Pode escrever este dado da pessoa em nome desta organização (ou no modo solo)?
create or replace function public.can_write_person_data(_person uuid, _org uuid, _cat public.share_category)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when _org is null then public.is_self_or_guardian(_person)
    else public.has_perm(_org, 'clients.write') and public.org_has_share(_org, _person, _cat)
  end;
$$;

-- Pode ver o nome e contactos desta pessoa?
create or replace function public.can_see_person(_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_self_or_guardian(_person)
      -- cliente que eu acompanho
      or exists (select 1 from public.links l
                 where l.person_id = _person and public.can_see_link(l.id))
      -- colega de equipa numa organização onde estou ativo
      or exists (select 1 from public.memberships m
                 where m.person_id = _person and m.status in ('invited','active')
                   and public.is_member(m.org_id))
      -- o meu treinador responsável
      or exists (select 1 from public.links l
                 join public.memberships m on m.id = l.responsible_membership_id
                 where m.person_id = _person and public.is_self_or_guardian(l.person_id));
$$;

-- Estou ligado a esta organização como cliente?
create or replace function public.is_linked_to(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.links l
                 where l.org_id = _org and l.status in ('active','paused')
                   and public.is_self_or_guardian(l.person_id));
$$;

-- Pode dar este papel a este membro? Nunca a si próprio; "owner" só quem gere a org.
create or replace function public.can_assign_role(_org uuid, _membership uuid, _role uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.has_perm(_org, 'team.manage')
     and _membership is distinct from public.my_membership_id(_org)
     and exists (
       select 1 from public.roles r
       where r.id = _role
         and (r.org_id is null or r.org_id = _org)
         and (r.key <> 'owner' or public.has_perm(_org, 'org.manage'))
     );
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Identidade
create policy persons_select on public.persons for select to authenticated
  using (public.can_see_person(id));
create policy persons_update on public.persons for update to authenticated
  using (user_id = (select auth.uid())
         or (user_id is null and managed_by_org is not null
             and public.has_perm(managed_by_org, 'clients.write')))
  with check (user_id = (select auth.uid())
         or (user_id is null and managed_by_org is not null
             and public.has_perm(managed_by_org, 'clients.write')));

create policy guardianships_select on public.guardianships for select to authenticated
  using (guardian_person_id = public.my_person_id() or minor_person_id = public.my_person_id());

create policy organizations_select on public.organizations for select to authenticated
  using (public.is_member(id) or public.is_linked_to(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.has_perm(id, 'org.manage')) with check (public.has_perm(id, 'org.manage'));

create policy units_select on public.units for select to authenticated
  using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy units_write on public.units for all to authenticated
  using (public.has_perm(org_id, 'org.manage')) with check (public.has_perm(org_id, 'org.manage'));

create policy rooms_select on public.rooms for select to authenticated
  using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy rooms_write on public.rooms for all to authenticated
  using (public.has_perm(org_id, 'org.manage')) with check (public.has_perm(org_id, 'org.manage'));

create policy roles_select on public.roles for select to authenticated
  using (org_id is null or public.is_member(org_id));
create policy roles_write on public.roles for all to authenticated
  using (org_id is not null and public.has_perm(org_id, 'org.manage'))
  with check (org_id is not null and public.has_perm(org_id, 'org.manage'));

create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(org_id) or person_id = public.my_person_id());
create policy memberships_update on public.memberships for update to authenticated
  using (public.has_perm(org_id, 'team.manage') and person_id <> public.my_person_id())
  with check (public.has_perm(org_id, 'team.manage') and person_id <> public.my_person_id());

create policy membership_roles_select on public.membership_roles for select to authenticated
  using (public.is_member(org_id));
create policy membership_roles_insert on public.membership_roles for insert to authenticated
  with check (public.can_assign_role(org_id, membership_id, role_id));
create policy membership_roles_delete on public.membership_roles for delete to authenticated
  using (public.can_assign_role(org_id, membership_id, role_id));

create policy membership_units_select on public.membership_units for select to authenticated
  using (public.is_member(org_id));
create policy membership_units_write on public.membership_units for all to authenticated
  using (public.has_perm(org_id, 'team.manage')) with check (public.has_perm(org_id, 'team.manage'));

create policy invites_select on public.invites for select to authenticated
  using (public.has_perm(org_id, 'team.manage'));
create policy invites_update on public.invites for update to authenticated
  using (public.has_perm(org_id, 'team.manage')) with check (public.has_perm(org_id, 'team.manage'));

-- Ligações e partilhas
create policy links_select on public.links for select to authenticated
  using (public.can_see_link(id) or public.is_self_or_guardian(person_id));
create policy links_update on public.links for update to authenticated
  using (public.can_see_link(id) and public.has_perm(org_id, 'clients.write'))
  with check (public.can_see_link(id) and public.has_perm(org_id, 'clients.write'));

create policy link_shares_select on public.link_shares for select to authenticated
  using (public.can_see_link(link_id) or public.is_self_or_guardian(person_id));
-- A pessoa controla as partilhas; a organização só enquanto gere uma pessoa sem conta
create policy link_shares_insert on public.link_shares for insert to authenticated
  with check (public.is_self_or_guardian(person_id)
              or exists (select 1 from public.persons p
                         where p.id = person_id and p.user_id is null and p.managed_by_org = org_id
                           and public.has_perm(org_id, 'clients.write')));
create policy link_shares_update on public.link_shares for update to authenticated
  using (public.is_self_or_guardian(person_id)
         or exists (select 1 from public.persons p
                    where p.id = person_id and p.user_id is null and p.managed_by_org = org_id
                      and public.has_perm(org_id, 'clients.write')))
  with check (public.is_self_or_guardian(person_id)
         or exists (select 1 from public.persons p
                    where p.id = person_id and p.user_id is null and p.managed_by_org = org_id
                      and public.has_perm(org_id, 'clients.write')));

-- Modalidades, subscrição, direitos
create policy sports_select on public.sports for select to authenticated using (true);
create policy plan_modules_select on public.plan_modules for select to authenticated using (true);
create policy org_sports_select on public.org_sports for select to authenticated
  using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy org_sports_write on public.org_sports for all to authenticated
  using (public.has_perm(org_id, 'org.manage')) with check (public.has_perm(org_id, 'org.manage'));
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.is_member(org_id));
create policy entitlements_select on public.entitlements for select to authenticated
  using ((org_id is not null and public.is_member(org_id)) or person_id = public.my_person_id());
create policy platform_invoices_select on public.platform_invoices for select to authenticated
  using (public.has_perm(org_id, 'org.manage'));

-- Conta
create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy security_settings_own on public.security_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy backup_codes_own on public.backup_codes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
create policy login_history_select on public.login_history for select to authenticated
  using (user_id = (select auth.uid()));
create policy login_history_insert on public.login_history for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Grupos
create policy groups_select on public.groups for select to authenticated
  using (public.is_member(org_id));
create policy groups_write on public.groups for all to authenticated
  using (public.has_perm(org_id, 'clients.write')) with check (public.has_perm(org_id, 'clients.write'));
create policy group_members_select on public.group_members for select to authenticated
  using (public.can_see_link(link_id));
create policy group_members_write on public.group_members for all to authenticated
  using (public.has_perm(org_id, 'clients.write') and public.can_see_link(link_id))
  with check (public.has_perm(org_id, 'clients.write') and public.can_see_link(link_id));

-- Biblioteca
do $$
declare t text;
begin
  foreach t in array array['exercises','workouts','workout_exercises','plans','plan_workouts'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (public.is_member(org_id));
      create policy %1$s_write on public.%1$I for all to authenticated
        using (public.has_perm(org_id, 'training.write'))
        with check (public.has_perm(org_id, 'training.write'));
    $f$, t);
  end loop;
end $$;

-- Aulas
create policy classes_select on public.classes for select to authenticated
  using (public.is_member(org_id) or public.is_linked_to(org_id));
create policy classes_write on public.classes for all to authenticated
  using (public.has_perm(org_id, 'schedule.write')) with check (public.has_perm(org_id, 'schedule.write'));

-- Atribuições
create policy assignments_select on public.assignments for select to authenticated
  using ((link_id is not null and (public.can_see_link(link_id) or public.is_my_link(link_id)))
         or (group_id is not null and public.is_member(org_id)));
create policy assignments_write on public.assignments for all to authenticated
  using (public.has_perm(org_id, 'clients.write')
         and (link_id is null or public.can_see_link(link_id)))
  with check (public.has_perm(org_id, 'clients.write')
         and (link_id is null or public.can_see_link(link_id)));

-- Horário
create policy availability_select on public.availability for select to authenticated
  using (public.is_member(org_id));
create policy availability_write on public.availability for all to authenticated
  using (public.has_perm(org_id, 'schedule.write')
         and (membership_id = public.my_membership_id(org_id) or public.has_perm(org_id, 'schedule.read_all')))
  with check (public.has_perm(org_id, 'schedule.write')
         and (membership_id = public.my_membership_id(org_id) or public.has_perm(org_id, 'schedule.read_all')));

create policy day_markers_select on public.day_markers for select to authenticated
  using (public.is_member(org_id) or (link_id is not null and public.is_my_link(link_id)));
create policy day_markers_write on public.day_markers for all to authenticated
  using (public.has_perm(org_id, 'schedule.write')
         and (membership_id is null or membership_id = public.my_membership_id(org_id)
              or public.has_perm(org_id, 'schedule.read_all'))
         and (link_id is null or public.can_see_link(link_id)))
  with check (public.has_perm(org_id, 'schedule.write')
         and (membership_id is null or membership_id = public.my_membership_id(org_id)
              or public.has_perm(org_id, 'schedule.read_all'))
         and (link_id is null or public.can_see_link(link_id)));

create policy bookings_select on public.bookings for select to authenticated
  using (public.has_perm(org_id, 'schedule.read_all')
         or membership_id = public.my_membership_id(org_id)
         or (link_id is not null and (public.can_see_link(link_id) or public.is_my_link(link_id))));
create policy bookings_write on public.bookings for all to authenticated
  using (public.has_perm(org_id, 'schedule.write')
         and (public.has_perm(org_id, 'schedule.read_all') or membership_id = public.my_membership_id(org_id))
         and (link_id is null or public.can_see_link(link_id)))
  with check (public.has_perm(org_id, 'schedule.write')
         and (public.has_perm(org_id, 'schedule.read_all') or membership_id = public.my_membership_id(org_id))
         and (link_id is null or public.can_see_link(link_id)));

create policy waitlist_select on public.waitlist for select to authenticated
  using (public.has_perm(org_id, 'schedule.read_all')
         or membership_id = public.my_membership_id(org_id)
         or public.can_see_link(link_id) or public.is_my_link(link_id));
create policy waitlist_write on public.waitlist for all to authenticated
  using (public.has_perm(org_id, 'schedule.write') and public.can_see_link(link_id))
  with check (public.has_perm(org_id, 'schedule.write') and public.can_see_link(link_id));

-- Cliente: notas (nunca o cliente) e documentos
create policy client_notes_all on public.client_notes for all to authenticated
  using (public.can_see_link(link_id)) with check (public.can_see_link(link_id));
create policy client_documents_select on public.client_documents for select to authenticated
  using (public.can_see_link(link_id) or public.is_my_link(link_id));
create policy client_documents_write on public.client_documents for all to authenticated
  using (public.has_perm(org_id, 'clients.write') and public.can_see_link(link_id))
  with check (public.has_perm(org_id, 'clients.write') and public.can_see_link(link_id));

-- Integrações: só o próprio membro
create policy integrations_own on public.integrations for all to authenticated
  using (membership_id = public.my_membership_id(org_id))
  with check (membership_id = public.my_membership_id(org_id));

-- Auditoria e leituras de saúde: ler, nunca escrever
create policy audit_log_select on public.audit_log for select to authenticated
  using ((org_id is not null and public.has_perm(org_id, 'org.manage'))
         or (person_id is not null and person_id = public.my_person_id()));
create policy health_access_log_select on public.health_access_log for select to authenticated
  using (public.has_perm(org_id, 'org.manage') or person_id = public.my_person_id());

-- Dados da pessoa
create policy measurements_select on public.measurements for select to authenticated
  using (public.can_read_person_data(person_id, 'measurements'));
create policy measurements_write on public.measurements for all to authenticated
  using (public.can_write_person_data(person_id, org_id, 'measurements'))
  with check (public.can_write_person_data(person_id, org_id, 'measurements'));

create policy allergies_select on public.allergies for select to authenticated
  using (public.is_self_or_guardian(person_id));
create policy allergies_write on public.allergies for all to authenticated
  using (public.can_write_person_data(person_id, org_id, 'health'))
  with check (public.can_write_person_data(person_id, org_id, 'health'));

do $$
declare t text;
begin
  foreach t in array array['sessions','session_exercises','session_sets'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (public.can_read_person_data(person_id, 'training'));
      create policy %1$s_write on public.%1$I for all to authenticated
        using (public.can_write_person_data(person_id, org_id, 'training'))
        with check (public.can_write_person_data(person_id, org_id, 'training'));
    $f$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- GRANTS — RLS filtra as linhas; os grants por coluna limitam o que se edita.
-- anon não recebe nada.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Escritas só por funções (convites, ligações, papéis próprios, subscrição…)
revoke insert, delete on public.persons, public.organizations, public.memberships,
  public.invites, public.links, public.subscriptions, public.entitlements,
  public.platform_invoices, public.plan_modules, public.sports, public.guardianships,
  public.notifications
  from authenticated;
-- Partilhas: criar e revogar, nunca apagar (o histórico de consentimento fica)
revoke delete on public.link_shares from authenticated;
revoke update on public.subscriptions, public.entitlements, public.platform_invoices,
  public.plan_modules, public.sports, public.guardianships
  from authenticated;

-- Só acrescentar, e só pelo servidor
revoke insert, update, delete on public.audit_log, public.health_access_log from authenticated;

-- UPDATE só nas colunas que cada um pode mudar (AUD-69)
revoke update on public.persons, public.organizations, public.memberships, public.links,
  public.link_shares, public.invites, public.membership_roles, public.integrations
  from authenticated;
grant update (full_name, email, phone, birth_date, avatar_url, locale, timezone)
  on public.persons to authenticated;
grant update (name, slug, brand, theme, timezone) on public.organizations to authenticated;
grant update (status, title, title_valid_until, left_at) on public.memberships to authenticated;
grant update (type, status, responsible_membership_id, client_status, status_note,
              current_plan_id, ended_at, archived_at, archived_reason)
  on public.links to authenticated;
grant update (revoked_at) on public.link_shares to authenticated;
grant update (revoked_at) on public.invites to authenticated;
grant update (status, config, expires_at, last_sync_at) on public.integrations to authenticated;

-- ---------------------------------------------------------------------------
-- AUDITORIA (só acrescentar)
-- ---------------------------------------------------------------------------
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rec jsonb;
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.audit_log (org_id, person_id, actor_user, action, entity, entity_id, diff)
  values (nullif(rec->>'org_id', '')::uuid,
          nullif(rec->>'person_id', '')::uuid,
          auth.uid(),
          lower(tg_op), tg_table_name,
          coalesce(nullif(rec->>'id', '')::uuid, nullif(rec->>'membership_id', '')::uuid),
          case when tg_op = 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
               else rec end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['links','link_shares','memberships','membership_roles','invites',
                           'bookings','allergies','client_documents','organizations','integrations'] loop
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function public.fn_audit()', t);
  end loop;
end $$;
