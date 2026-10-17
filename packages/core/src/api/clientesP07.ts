import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Json } from '../types/database';

/**
 * Clientes · avisos e confirmações (P-07, tarefa 17): duplicados ao escrever,
 * juntar com desfazer, convidar para a app e rascunhos que passam entre aparelhos.
 */
export interface Duplicado {
  linkId: string | null; nome: string; motivo: 'telefone' | 'email' | 'nif'; arquivado: boolean; sessoes: number; visivel: boolean;
}

export async function procurarDuplicados(
  client: LunaClient, scope: OrgScope, dados: { telefone?: string; email?: string; nif?: string }, excluir?: string,
): Promise<Duplicado[]> {
  const tel = dados.telefone?.replace(/\D/g, '') ?? '';
  const email = dados.email?.trim() ?? '';
  const nif = dados.nif?.trim() ?? '';
  if (tel.length < 9 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && nif.length < 9) return [];
  const { data, error } = await client.rpc('find_client_duplicates', {
    _org: scope.orgId, _phone: tel.length >= 9 ? dados.telefone : null, _email: email.includes('@') ? email : null,
    _nif: nif.length >= 9 ? nif : null, _exclude: excluir ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((d) => ({ linkId: d.link_id, nome: d.full_name, motivo: d.motivo, arquivado: d.archived, sessoes: d.sessions, visivel: d.visible }));
}

/** Junta _drop em _keep: o histórico dos dois fica; devolve o id para Desfazer. */
export async function juntarClientes(client: LunaClient, keep: string, drop: string): Promise<string> {
  const { data, error } = await client.rpc('merge_clients', { _keep: keep, _drop: drop });
  if (error) {
    if (/conta própria/.test(error.message)) throw new Error('Este cliente já tem conta na app. Junta ao contrário: mantém este e junta o outro.');
    throw error;
  }
  return data as string;
}

export async function desfazerJuntar(client: LunaClient, mergeId: string): Promise<void> {
  const { error } = await client.rpc('undo_merge', { _merge: mergeId });
  if (error) throw error;
}

export type CanalConvite = 'sms' | 'email' | 'codigo';

/** Convite para a app (vale 7 dias e liga à conta que a pessoa já tiver). Devolve o código. */
export async function convidarParaApp(client: LunaClient, linkId: string, canal: CanalConvite, destino?: string | null): Promise<string> {
  const { data, error } = await client.rpc('send_link_invite', { _link: linkId, _canal: canal, _destino: destino ?? null });
  if (error) {
    if (/já usa a app/.test(error.message)) throw new Error('Já usa a app.');
    if (/falta o email/.test(error.message)) throw new Error('Falta o email.');
    if (/falta o telemóvel/.test(error.message)) throw new Error('Falta o telemóvel.');
    throw error;
  }
  return data as string;
}

/* ── Rascunhos no servidor (7 dias, entre aparelhos) ───────────────────── */
const SETE_DIAS = 7 * 86_400_000;

export async function lerRascunhoServidor<T>(client: LunaClient, userId: string, chave: string): Promise<{ valor: T; em: string } | null> {
  const { data, error } = await client.from('drafts').select('payload,updated_at').eq('user_id', userId).eq('key', chave).maybeSingle();
  if (error || !data) return null;
  if (Date.now() - Date.parse(data.updated_at) > SETE_DIAS) {
    await client.from('drafts').delete().eq('user_id', userId).eq('key', chave);
    return null;
  }
  return { valor: data.payload as T, em: data.updated_at };
}

export async function guardarRascunhoServidor(client: LunaClient, userId: string, chave: string, valor: unknown): Promise<void> {
  const { error } = await client.from('drafts').upsert({ user_id: userId, key: chave, payload: valor as Json, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export async function apagarRascunhoServidor(client: LunaClient, userId: string, chave: string): Promise<void> {
  await client.from('drafts').delete().eq('user_id', userId).eq('key', chave);
}
