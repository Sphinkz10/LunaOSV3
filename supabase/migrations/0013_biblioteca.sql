-- ============================================================
-- LUNA.OS v3 · 0013 · Biblioteca base de exercícios (tarefa 27).
--   · library_exercises: a biblioteca do LunaOS, por modalidade e versão,
--     só de leitura para as organizações (o conteúdo vem de
--     packages/modalidades e entra pela migração gerada 0014).
--   · media_licenses: cada vídeo ou imagem com a licença registada (D11).
--   · copiar para a organização guarda a origem e a versão; atualizar a
--     biblioteca nunca muda uma cópia nem um treino já publicado.
-- ============================================================

create table public.library_exercises (
  key           text not null,
  version       int  not null check (version > 0),
  sport         text not null default 'fitness',
  name          text not null,
  category      text not null,
  muscles       text[] not null default '{}',
  pattern       text,
  equipment     text[] not null default '{}',
  level         text not null default 'iniciante' check (level in ('iniciante','intermedio','avancado')),
  instructions  text,
  record_fields text[] not null default '{}',
  alternatives  text[] not null default '{}',
  video_url     text,
  image_url     text,
  created_at    timestamptz not null default now(),
  primary key (key, version)
);

create table public.media_licenses (
  id          uuid primary key default gen_random_uuid(),
  url         text not null unique,
  owner       text not null,                         -- LunaOS ou o banco de imagens
  license     text not null,                         -- comercial, nº do contrato…
  source      text,
  valid_until date,
  created_at  timestamptz not null default now()
);

-- Um vídeo ou imagem da biblioteca só entra com licença registada
create or replace function public._media_com_licenca() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.video_url is not null and not exists (select 1 from public.media_licenses m where m.url = new.video_url))
     or (new.image_url is not null and not exists (select 1 from public.media_licenses m where m.url = new.image_url)) then
    raise exception 'media sem licença registada' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger library_media_licenca before insert or update on public.library_exercises
  for each row execute function public._media_com_licenca();

-- Última versão de cada exercício
create view public.library_current with (security_invoker = true) as
  select distinct on (key) * from public.library_exercises order by key, version desc;

alter table public.library_exercises enable row level security;
alter table public.media_licenses enable row level security;
create policy library_select on public.library_exercises for select to authenticated using (true);
create policy media_licenses_select on public.media_licenses for select to authenticated using (true);
grant select on public.library_exercises, public.library_current, public.media_licenses to authenticated;
revoke insert, update, delete on public.library_exercises, public.media_licenses from authenticated, anon;

-- Cópias na organização guardam a origem e a versão; ficam com os campos da biblioteca
alter table public.exercises
  add column origin_key     text,
  add column origin_version int,
  add column pattern        text,
  add column level          text,
  add column record_fields  text[] not null default '{}',
  add column image_url      text,
  add column copied_from    text;                     -- chave@versão de origem, também nas cópias para mudar
create unique index exercises_uma_copia on public.exercises (org_id, origin_key, origin_version)
  where origin_key is not null and archived_at is null;

-- Usar ou duplicar um exercício do LunaOS: devolve a cópia da organização
-- (usar reaproveita a cópia que já existe; duplicar cria sempre uma nova para mudar)
create or replace function public.copy_library_exercise(_org uuid, _key text, _nova boolean default false)
returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.library_exercises%rowtype; v uuid;
begin
  if not public.has_perm(_org, 'training.write') then raise exception 'sem permissão' using errcode = 'insufficient_privilege'; end if;
  select * into l from public.library_exercises where key = _key order by version desc limit 1;
  if not found then raise exception 'exercício não existe na biblioteca' using errcode = 'invalid_parameter_value'; end if;
  if not _nova then
    select id into v from public.exercises
      where org_id = _org and origin_key = l.key and origin_version = l.version and archived_at is null;
    if v is not null then return v; end if;
  end if;
  insert into public.exercises (org_id, name, category, description, video_url, image_url, muscles, equipment,
                                origin_key, origin_version, pattern, level, record_fields, copied_from)
    values (_org, case when _nova then l.name || ' (cópia)' else l.name end, l.category, l.instructions, l.video_url, l.image_url,
            l.muscles, l.equipment, case when _nova then null else l.key end, case when _nova then null else l.version end,
            l.pattern, l.level, l.record_fields, l.key || '@' || l.version)
    returning id into v;
  if _nova then
    insert into public.audit_log (org_id, actor_user, action, entity, entity_id, diff)
      values (_org, auth.uid(), 'biblioteca.duplicar', 'exercises', v, jsonb_build_object('origem', l.key, 'versao', l.version));
  end if;
  return v;
end $$;

revoke execute on function public.copy_library_exercise(uuid, text, boolean), public._media_com_licenca() from public, anon;
grant execute on function public.copy_library_exercise(uuid, text, boolean) to authenticated;
