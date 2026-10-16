-- ============================================================
-- LUNA.OS · 0003_security_fixes — falhas críticas da auditoria v3
-- 1) Auto-promoção a admin via profiles.role
-- 2) _export_all(uid) exportava os dados de qualquer treinador
-- 3) Registo aberto (ver também supabase/config.toml)
-- ============================================================

-- 1) PAPEL IMUTÁVEL PELO CLIENTE
--    A política profiles_update deixa cada um editar a própria linha — incluindo
--    a coluna role. Um GRANT por coluna não chega (o grant é por tabela), por isso
--    a guarda é um trigger. Corre como o invocador: current_user é o papel do
--    pedido (authenticated/anon via PostgREST; postgres/service_role no servidor).
create or replace function public.guard_profile_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' and new.role <> 'coach' then
    raise exception 'role só pode ser definido por um administrador'
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'role só pode ser alterado por um administrador'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- 2) EXPORTAÇÃO SÓ DO PRÓPRIO
--    _export_all(uid) é SECURITY DEFINER e recebia execute via
--    "grant execute on all functions ... to authenticated" (e PUBLIC por omissão),
--    logo qualquer conta exportava qualquer treinador. Passa a ser interna:
--    só export_my_data() (que fixa uid = auth.uid()) a pode chamar.
revoke execute on function public._export_all(uuid) from public, anon, authenticated;
revoke execute on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
-- guard_profile_role é só para o trigger
revoke execute on function public.guard_profile_role() from public, anon, authenticated;

-- 3) REGISTO FECHADO
--    Não há nada a fazer em SQL: o registo é do Supabase Auth.
--    Local: supabase/config.toml → enable_signup = false.
--    Cloud: Dashboard → Authentication → Sign In / Providers →
--           desligar "Allow new users to sign up". Contas novas entram por convite.
