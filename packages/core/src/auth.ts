import type { LunaClient } from './api/client';
import type { MyOrgRow } from './types/database';
import { useAuthStore } from './authStore';

/** Organizações onde a pessoa trabalha, com papéis e permissões (my_orgs). */
export async function fetchMyOrgs(client: LunaClient): Promise<MyOrgRow[]> {
  const { data, error } = await client.rpc('my_orgs');
  if (error) throw error;
  return (data ?? []) as MyOrgRow[];
}

export async function fetchMyModules(client: LunaClient, orgId: string): Promise<string[]> {
  const { data, error } = await client.rpc('my_modules', { _org: orgId });
  if (error) throw error;
  return (data ?? []) as string[];
}

async function lastOrgId(client: LunaClient, userId: string): Promise<string | null> {
  const { data, error } = await client.from('user_settings').select('last_org_id').eq('user_id', userId).maybeSingle();
  if (error) return null; // é só uma preferência: não bloqueia a entrada
  return (data as { last_org_id: string | null } | null)?.last_org_id ?? null;
}

async function fetchMe(client: LunaClient, userId: string): Promise<{ name: string; avatarUrl: string | null } | null> {
  const { data, error } = await client.from('persons').select('full_name,avatar_url').eq('user_id', userId).maybeSingle();
  if (error || !data) return null; // o cartão do menu mostra o email em falta de nome
  return { name: data.full_name, avatarUrl: data.avatar_url };
}

/** Carrega a sessão: organizações, a última escolhida e os módulos ligados. */
export async function loadSession(client: LunaClient, userId: string): Promise<void> {
  try {
    const [orgs, last, me] = await Promise.all([fetchMyOrgs(client), lastOrgId(client, userId), fetchMe(client, userId)]);
    useAuthStore.getState().signIn(userId, orgs, last);
    useAuthStore.getState().setMe(me);
    const scope = useAuthStore.getState().scope;
    if (scope) useAuthStore.getState().setModules(await fetchMyModules(client, scope.orgId));
  } catch (e) {
    useAuthStore.getState().setError(e instanceof Error ? e.message : 'Não foi possível carregar a sessão.');
  }
}

/** Troca de organização no seletor (G-00) e guarda a escolha. */
export async function switchOrg(client: LunaClient, orgId: string): Promise<void> {
  const { userId } = useAuthStore.getState();
  useAuthStore.getState().selectOrg(orgId);
  const [modules] = await Promise.all([
    fetchMyModules(client, orgId),
    userId ? client.from('user_settings').update({ last_org_id: orgId }).eq('user_id', userId) : Promise.resolve(null),
  ]);
  useAuthStore.getState().setModules(modules);
}

/** P2.8 — liga supabase.auth ao authStore. Sem cliente (.env em falta) → 'notConfigured'. */
export function bootstrapAuth(client: LunaClient | null): () => void {
  if (!client) {
    useAuthStore.getState().setNotConfigured();
    return () => {};
  }
  let current: string | null | undefined;
  const apply = (userId: string | null) => {
    if (userId === current) return;
    current = userId;
    if (!userId) useAuthStore.getState().signOut();
    else void loadSession(client, userId);
  };

  void client.auth.getSession().then(({ data: { session } }) => apply(session?.user?.id ?? null));
  const { data: sub } = client.auth.onAuthStateChange((_event, session) => apply(session?.user?.id ?? null));
  return () => sub.subscription.unsubscribe();
}

export async function signInWithPassword(client: LunaClient, email: string, password: string) {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut(client: LunaClient) {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}
