import type { LunaClient } from './api/client';

/**
 * Entrar e recuperar acesso (X-01): palavra-passe, dois fatores (TOTP),
 * recuperação por email e aceitar convite.
 */

/** Depois da palavra-passe: falta o código de dois fatores? */
export async function precisaSegundoFator(client: LunaClient): Promise<boolean> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) return false;
  return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
}

/** Verifica o código de 6 dígitos da app de autenticação. */
export async function verificarSegundoFator(client: LunaClient, codigo: string): Promise<void> {
  const { data: fatores, error } = await client.auth.mfa.listFactors();
  if (error) throw error;
  const totp = fatores.totp.find((f) => f.status === 'verified');
  if (!totp) throw new Error('Esta conta não tem dois fatores ativos.');
  const { error: e2 } = await client.auth.mfa.challengeAndVerify({ factorId: totp.id, code: codigo });
  if (e2) throw new Error('Código errado ou expirado.');
}

/** Envia o link de recuperação (expira em 30 minutos, configurado no Supabase Auth). */
export async function pedirRecuperacao(client: LunaClient, email: string, redirectTo: string): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function definirPalavraPasse(client: LunaClient, nova: string): Promise<void> {
  if (nova.length < 10) throw new Error('A palavra-passe precisa de pelo menos 10 caracteres.');
  const { error } = await client.auth.updateUser({ password: nova });
  if (error) throw error;
}

/** Cria conta (com confirmação por email). A conta nova não tem papel nenhum. */
export async function criarConta(client: LunaClient, input: { nome: string; email: string; password: string; redirectTo: string }): Promise<void> {
  const { error } = await client.auth.signUp({
    email: input.email, password: input.password,
    options: { data: { full_name: input.nome }, emailRedirectTo: input.redirectTo },
  });
  if (error) throw error;
}

/** Aceita um convite de equipa; devolve a organização. */
export async function aceitarConvite(client: LunaClient, codigo: string): Promise<string> {
  const { data, error } = await client.rpc('accept_invite', { _token: codigo.trim() });
  if (error) {
    if (/outro email/.test(error.message)) throw new Error('Este convite é para outro email. Entra com o email que recebeu o convite.');
    if (/inválido|expirado/.test(error.message)) throw new Error('Convite inválido ou expirado. Pede um novo a quem te convidou.');
    throw error;
  }
  return data as string;
}

/* ── App do cliente (C-01, C-25) ────────────────────────────────────────── */

export type Partilha = 'training' | 'measurements' | 'photos' | 'checkins' | 'health';

/** Versão dos textos legais em vigor (muda quando os textos mudam). */
export const VERSAO_TERMOS = '2026-10';

export async function registarConsentimento(client: LunaClient, kind: string, granted: boolean, org?: string | null): Promise<void> {
  const { error } = await client.rpc('record_consent', { _kind: kind, _version: VERSAO_TERMOS, _granted: granted, _org: org ?? null });
  if (error) throw error;
}

/** Aceita o convite do ginásio ou do PT com as partilhas escolhidas. */
export async function aceitarConviteCliente(client: LunaClient, token: string, partilhas: Partilha[]): Promise<'ligado' | 'a_espera_encarregado'> {
  const { data, error } = await client.rpc('accept_link_invite', { _token: token, _shares: partilhas });
  if (error) {
    if (/inválido|expirado/.test(error.message)) throw new Error('Este convite já não é válido. Pede um novo.');
    throw error;
  }
  return data as 'ligado' | 'a_espera_encarregado';
}

/** PAR-Q: devolve true se alguma resposta for Sim (vai precisar de atestado). */
export async function enviarParq(client: LunaClient, respostas: Record<string, boolean>): Promise<boolean> {
  const { data, error } = await client.rpc('submit_parq', { _answers: respostas });
  if (error) throw error;
  return data === true;
}

export async function pedirEncarregado(client: LunaClient, email: string, telefone?: string | null): Promise<void> {
  const { error } = await client.rpc('request_guardian', { _email: email, _phone: telefone || null });
  if (error) throw error;
}

export async function aceitarTutela(client: LunaClient, token: string, pagador: boolean): Promise<void> {
  const { error } = await client.rpc('accept_guardianship', { _token: token, _is_payer: pagador });
  if (error) {
    if (/inválido|expirado/.test(error.message)) throw new Error('Este pedido já não é válido. Pede ao teu educando que envie outro.');
    if (/conta própria/.test(error.message)) throw new Error('O encarregado precisa de entrar com a sua própria conta.');
    throw error;
  }
}

export async function definirPartilhasEncarregado(client: LunaClient, partilhas: Partilha[]): Promise<void> {
  const { error } = await client.rpc('set_guardian_shares', { _shares: partilhas });
  if (error) throw error;
}

export interface MinhaConta { personId: string; nome: string; nascimento: string | null; menor: boolean; aEsperaEncarregado: boolean }

export async function minhaConta(client: LunaClient, userId: string): Promise<MinhaConta | null> {
  const { data, error } = await client.from('persons').select('id,full_name,birth_date').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [menor, espera] = await Promise.all([
    client.rpc('is_minor', { _person: data.id }),
    client.rpc('minor_waiting', { _person: data.id }),
  ]);
  return { personId: data.id, nome: data.full_name, nascimento: data.birth_date, menor: menor.data === true, aEsperaEncarregado: espera.data === true };
}

/** Criar conta na app do cliente: a data de nascimento diz logo se é menor. */
export async function criarContaCliente(client: LunaClient, input: { nome: string; email: string; password: string; nascimento: string; redirectTo: string }): Promise<void> {
  if (input.password.length < 10) throw new Error('A palavra-passe precisa de pelo menos 10 caracteres.');
  const { error } = await client.auth.signUp({
    email: input.email, password: input.password,
    options: { data: { full_name: input.nome, birth_date: input.nascimento }, emailRedirectTo: input.redirectTo },
  });
  if (error) throw error;
}
