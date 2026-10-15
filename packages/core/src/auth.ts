import type { LunaClient } from './api/client';
import type { Role } from './authStore';
import { useAuthStore } from './authStore';

/** Mapeia role da BD para o store (fallback coach). */
export function mapProfileRole(role: string | null | undefined): Role {
  if (role === 'admin' || role === 'coach' || role === 'athlete' || role === 'staff') return role;
  return 'coach';
}

/** P2.8 — liga supabase.auth ao authStore (onAuthStateChange + sessão inicial). */
export function bootstrapAuth(client: LunaClient): () => void {
  const applySession = async (userId: string | null) => {
    if (!userId) {
      useAuthStore.getState().signOut();
      return;
    }
    const { data } = await client.from('profiles').select('role').eq('id', userId).maybeSingle();
    useAuthStore.getState().signIn(userId, mapProfileRole(data?.role));
  };

  void client.auth.getSession().then(({ data: { session } }) => applySession(session?.user?.id ?? null));

  const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
    void applySession(session?.user?.id ?? null);
  });

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
