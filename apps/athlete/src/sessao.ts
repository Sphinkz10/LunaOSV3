import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from './lib/supabase';

/** Sessão Supabase da app do cliente (a conta é da pessoa, sem papel nenhum). */
export function useSessao(): { sessao: Session | null; aCarregar: boolean } {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setACarregar(false); return; }
    void client.auth.getSession().then(({ data }) => { setSessao(data.session); setACarregar(false); });
    const { data: sub } = client.auth.onAuthStateChange((_e, s) => setSessao(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return { sessao, aCarregar };
}

/** Guarda o convite e o pedido de encarregado enquanto a pessoa cria conta e confirma o email. */
const CHAVE = 'luna.cliente.pendente';
export interface Pendente { convite?: string; tutela?: string }
export function lerPendente(): Pendente {
  try { return JSON.parse(localStorage.getItem(CHAVE) ?? '{}') as Pendente; } catch { return {}; }
}
export function guardarPendente(p: Pendente): void {
  try { localStorage.setItem(CHAVE, JSON.stringify({ ...lerPendente(), ...p })); } catch { /* sem armazenamento: segue sem memória */ }
}
export function limparPendente(chave: keyof Pendente): void {
  const p = lerPendente();
  delete p[chave];
  try { localStorage.setItem(CHAVE, JSON.stringify(p)); } catch { /* idem */ }
}
