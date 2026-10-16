import { signOut, toast, useAuthStore, type LunaClient } from '@luna/core';

/** Sair (também no telemóvel): termina a sessão no servidor e limpa o estado local. */
export async function signOutEverywhere(client: LunaClient | null): Promise<void> {
  try {
    if (client) await signOut(client);
  } catch (e) {
    toast({ variant: 'warning', title: 'Sessão terminada só neste aparelho', description: e instanceof Error ? e.message : undefined });
  } finally {
    useAuthStore.getState().signOut();
  }
}
