-- ============================================================
-- LUNA.OS · 0002_hardening — Gate G-DB (Guia §9 / Hardening §5)
-- 1) Aresta da auto-promoção  2) audit_log  3) realtime  4) GDPR export
-- ============================================================

-- 1) AUTO-PROMOÇÃO: se o slot libertado conflituar com outra marcação,
--    o candidato FICA em waiting — o cancelamento nunca rebenta (Hardening §5.5).
create or replace function public.promote_from_waitlist()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  w public.waitlist%rowtype;
  new_booking_id uuid;
begin
  if (old.status in ('pending','confirmed')) and (new.status = 'cancelled') then
    select * into w
    from public.waitlist
    where status = 'waiting'
      and coach_id = new.coach_id
      and (
            (new.class_id is not null and class_id = new.class_id)
         or (class_booking_id = new.id)
         or (requested_starts_at = new.starts_at)
      )
    order by priority asc, created_at asc
    limit 1;

    if found then
      -- ARESTA (Hardening §5.5): se o slot já conflitua, o candidato FICA waiting.
      if new.type <> 'class'
         and public.has_booking_conflict(new.coach_id, new.starts_at, new.ends_at, new.id) then
        return new;
      end if;
      insert into public.bookings (coach_id, athlete_id, class_id, type, status,
                                   title, starts_at, ends_at, location, source)
      values (new.coach_id, w.athlete_id, new.class_id, new.type, 'confirmed',
              new.title, new.starts_at, new.ends_at, new.location, 'waitlist')
      returning id into new_booking_id;

      update public.waitlist
        set status = 'promoted', promoted_booking_id = new_booking_id, updated_at = now()
        where id = w.id;
    end if;
  end if;
  return new;
end $$;

-- 2) AUDIT LOG: triggers nas tabelas sensíveis (athletes, bookings, allergies, security)
create or replace function public.fn_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rec jsonb; v_coach uuid; v_id uuid; v_actor uuid := (select auth.uid());
begin
  rec := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_coach := coalesce((rec->>'coach_id')::uuid, (rec->>'user_id')::uuid, v_actor);
  v_id := coalesce((rec->>'id')::uuid, (rec->>'user_id')::uuid);
  if v_coach is null then return coalesce(new, old); end if; -- provisionamento sem ator: não auditar
  insert into public.audit_log (coach_id, action, entity, entity_id, diff)
  values (v_coach, lower(tg_op), tg_table_name, v_id,
          rec || jsonb_build_object('_actor', v_actor));
  return coalesce(new, old);
end $$;

do $$ declare t text;
begin
  foreach t in array array['athletes','bookings','athlete_allergies','security_settings'] loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I
                    for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- 3) REALTIME: publicar bookings + notifications (guardado para ambientes sem a publication)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.bookings; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end;
  else
    create publication supabase_realtime for table public.bookings, public.notifications;
  end if;
end $$;

-- 4) GDPR (Art. 15/20): exportação completa do próprio utilizador
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'auth required'; end if;
  return public._export_all(uid);
end $$;

create or replace function public._export_all(uid uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb := '{}'::jsonb; t text; chunk jsonb;
begin
  result := jsonb_build_object(
    'profile',  (select to_jsonb(p) from public.profiles p where p.id = uid),
    'settings', (select to_jsonb(s) from public.user_settings s where s.user_id = uid),
    'security', (select to_jsonb(s) - 'totp_secret' from public.security_settings s where s.user_id = uid),
    'exported_at', now());
  for t in select c.table_name from information_schema.columns c
           where c.table_schema = 'public' and c.column_name = 'coach_id'
             and c.table_name not in ('audit_log')
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x where x.coach_id = %L', t, uid)
      into chunk;
    result := result || jsonb_build_object(t, chunk);
  end loop;
  return result;
end $$;
