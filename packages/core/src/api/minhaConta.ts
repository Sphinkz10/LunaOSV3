import type { LunaClient } from './client';
import type { UserSettingsRow } from '../types/database';

/**
 * A minha conta (G-00, tarefa 25): perfil, palavra-passe, dois fatores,
 * sessões e preferências que seguem a pessoa entre aparelhos. O papel continua
 * a ser dado pela gerência.
 */
export interface Perfil { nome: string; email: string | null; telefone: string | null; fuso: string; idioma: string }
export type Preferencias = Pick<UserSettingsRow, 'tema' | 'density' | 'date_format' | 'week_start' | 'language'>;

export async function fetchPerfil(client: LunaClient, userId: string): Promise<{ perfil: Perfil; prefs: Preferencias }> {
  const [p, s] = await Promise.all([
    client.from('persons').select('full_name,email,phone,timezone,locale').eq('user_id', userId).single(),
    client.from('user_settings').select('tema,density,date_format,week_start,language').eq('user_id', userId).single(),
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  return {
    perfil: { nome: p.data.full_name, email: p.data.email, telefone: p.data.phone, fuso: p.data.timezone, idioma: p.data.locale },
    prefs: s.data,
  };
}

export async function guardarPerfil(client: LunaClient, userId: string, p: Pick<Perfil, 'nome' | 'telefone' | 'fuso'>): Promise<void> {
  const { error } = await client.from('persons').update({ full_name: p.nome, phone: p.telefone || null, timezone: p.fuso })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function guardarPreferencias(client: LunaClient, userId: string, p: Partial<Preferencias>): Promise<void> {
  const { error } = await client.from('user_settings').update(p).eq('user_id', userId);
  if (error) throw error;
}

export async function mudarPalavraPasse(client: LunaClient, nova: string): Promise<void> {
  if (nova.length < 10) throw new Error('A palavra-passe precisa de pelo menos 10 caracteres.');
  const { error } = await client.auth.updateUser({ password: nova });
  if (error) throw error;
}

export interface FatorAtivo { id: string; nome: string | null; criadoEm: string }

export async function listarFatores(client: LunaClient): Promise<FatorAtivo[]> {
  const { data, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  return data.totp.filter((f) => f.status === 'verified').map((f) => ({ id: f.id, nome: f.friendly_name ?? null, criadoEm: f.created_at }));
}

export async function removerFator(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.auth.mfa.unenroll({ factorId: id });
  if (error) throw error;
}

/** Termina as outras sessões; esta continua aberta. */
export async function terminarOutrasSessoes(client: LunaClient): Promise<void> {
  const { error } = await client.auth.signOut({ scope: 'others' });
  if (error) throw error;
}

export interface Entrada { id: string; aparelho: string | null; sucesso: boolean; em: string }

/** Últimas entradas desta conta (aparelho e quando). */
export async function fetchEntradas(client: LunaClient): Promise<Entrada[]> {
  const { data, error } = await client.from('login_history').select('id,device,user_agent,success,created_at')
    .order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return (data ?? []).map((e) => ({ id: e.id, aparelho: e.device ?? e.user_agent ?? null, sucesso: e.success, em: e.created_at }));
}

/** Regista esta entrada (aparelho), para a lista de sessões. */
export async function registarEntrada(client: LunaClient, userId: string): Promise<void> {
  const ua = typeof navigator === 'undefined' ? null : navigator.userAgent;
  const aparelho = ua ? (/(iPhone|iPad|Android|Windows|Mac OS X|Linux)/.exec(ua)?.[1] ?? 'Navegador') : null;
  await client.from('login_history').insert({ user_id: userId, device: aparelho, user_agent: ua, success: true });
}
