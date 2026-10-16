import type { LunaClient } from './client';
import type { NotificationRow } from '../types/database';

/** Notificações da própria conta (P-03): o RLS só devolve as de quem lê. */
export type Notificacao = Pick<NotificationRow, 'id' | 'type' | 'title' | 'body' | 'action_url' | 'read_at' | 'created_at'>;

export async function fetchNotificacoes(client: LunaClient, limite = 30): Promise<Notificacao[]> {
  const { data, error } = await client.from('notifications')
    .select('id,type,title,body,action_url,read_at,created_at')
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  return data ?? [];
}

export async function contarNaoLidas(client: LunaClient): Promise<number> {
  const { count, error } = await client.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
  if (error) throw error;
  return count ?? 0;
}

export async function marcarLidas(client: LunaClient, ids?: string[]): Promise<void> {
  let q = client.from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null);
  if (ids?.length) q = q.in('id', ids);
  const { error } = await q;
  if (error) throw error;
}
