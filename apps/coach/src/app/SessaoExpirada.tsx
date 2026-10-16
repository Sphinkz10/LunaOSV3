import { useState, type FormEvent } from 'react';
import { signInWithPassword, useAuthStore } from '@luna/core';
import { Botao, Campo, SessaoTerminada } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';

/**
 * Sessão terminada (P-01): pede para entrar outra vez por cima do ecrã, sem
 * navegar, para não se perder o que estava a ser feito.
 */
export function SessaoExpirada() {
  const aberta = useAuthStore((s) => s.sessaoTerminada);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try {
      await signInWithPassword(client, email, password);
      setPassword('');
    } catch {
      setErro('Email ou palavra-passe errados.');
    } finally {
      setACarregar(false);
    }
  };

  return (
    <SessaoTerminada aberta={aberta}>
      <form onSubmit={(e) => void entrar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Palavra-passe" type="password" autoComplete="current-password" value={password}
          onChange={(e) => setPassword(e.target.value)} required erro={erro} />
        <div style={{ display: 'flex', gap: 'var(--espaco-8)', justifyContent: 'flex-end' }}>
          <Botao variante="secundario" onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</Botao>
          <Botao type="submit" aCarregar={aCarregar}>Entrar</Botao>
        </div>
      </form>
    </SessaoTerminada>
  );
}
