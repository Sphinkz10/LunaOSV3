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
