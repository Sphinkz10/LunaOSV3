-- ============================================================
-- LUNA.OS v3 · Provas SQL da tarefa 27: biblioteca base do LunaOS.
-- Corre depois de definicoes_asserts.sql.
-- ============================================================
\set ON_ERROR_STOP on

-- ---------- PROVA B1: uma organização nova vê a biblioteca base logo ----------
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000b1b01', 'novo@biblioteca.test');
set role authenticated;
select set_config('app.uid', '00000000-0000-0000-0000-0000000b1b01', false);
select set_config('b.org', public.create_organization('Estúdio Novo', 'solo_coach')::text, false);
do $$ begin
  if (select count(*) from public.library_current) < 40 then raise exception 'PROVA B1 FALHOU: biblioteca vazia'; end if;
end $$;

-- ---------- PROVA B2: nenhuma organização edita um exercício do LunaOS ----------
do $$ begin
  begin
    update public.library_exercises set name = 'Mudado' where key = 'agachamento-barra';
    raise exception 'PROVA B2 FALHOU: editou a biblioteca';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.library_exercises (key, version, name, category) values ('meu', 1, 'Meu', 'forca');
    raise exception 'PROVA B2 FALHOU: acrescentou à biblioteca';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- PROVA B3: usar reaproveita a cópia; duplicar guarda a origem ----------
do $$ declare a uuid; b uuid; c uuid;
begin
  a := public.copy_library_exercise(current_setting('b.org')::uuid, 'agachamento-barra');
  b := public.copy_library_exercise(current_setting('b.org')::uuid, 'agachamento-barra');
  if a <> b then raise exception 'PROVA B3 FALHOU: usar duas vezes criou duas cópias'; end if;
  c := public.copy_library_exercise(current_setting('b.org')::uuid, 'agachamento-barra', true);
  if c = a then raise exception 'PROVA B3 FALHOU: duplicar não criou cópia nova'; end if;
  if (select copied_from from public.exercises where id = c) <> 'agachamento-barra@1' then raise exception 'PROVA B3 FALHOU: a cópia perdeu a origem'; end if;
  update public.exercises set name = 'Agachamento à minha maneira' where id = c;
  if (select name from public.library_exercises where key = 'agachamento-barra' and version = 1) <> 'Agachamento com barra' then
    raise exception 'PROVA B3 FALHOU: mudar a cópia mudou a biblioteca';
  end if;
end $$;

-- ---------- PROVA B4: vídeo sem licença registada não entra ----------
reset role;
do $$ begin
  begin
    insert into public.library_exercises (key, version, name, category, video_url) values ('teste', 1, 'Teste', 'forca', 'https://video.test/x.m3u8');
    raise exception 'PROVA B4 FALHOU: vídeo sem licença';
  exception when check_violation then null;
  end;
end $$;

select '✅ Biblioteca: TODAS AS PROVAS PASSARAM' as resultado;
