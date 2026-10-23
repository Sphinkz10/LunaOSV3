import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { verificarSegundoFator } from '@luna/core';
import { Botao, Campo, Esqueleto } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';
import './gestao.css';

type Estado = 'a-verificar' | 'ok' | 'por-confirmar';

/**
 * Código de dois fatores depois da palavra-passe, só para quem os tem ativos
 * (X-01, Figma 80:3489). Quem não os tem entra e ativa-os em A minha conta;
 * os dados de saúde continuam a pedir sessão aal2 no servidor (0006_conta).
 */
export function DoisFatores({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>('a-verificar');
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) { setEstado('ok'); return; }
    void client.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => {
      setEstado(data && data.currentLevel !== 'aal2' && data.nextLevel === 'aal2' ? 'por-confirmar' : 'ok');
    });
  }, []);

  if (estado === 'ok') return <>{children}</>;
  if (estado === 'a-verificar') return <main className="lv-root" style={{ padding: 'var(--espaco-32)' }}><Esqueleto /></main>;

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try {
      await verificarSegundoFator(client, codigo);
      setEstado('ok');
    } catch (err) { setErro(err instanceof Error ? err.message : 'Código errado.'); }
    finally { setACarregar(false); }
  };

  return (
    <main className="lv-root lg-entrar">
      <section className="lg-entrar__destaque" aria-hidden>
        <span className="lv-sobretitulo">LunaOS Gestão</span>
        <p className="lg-entrar__frase">O teu ginásio num só sítio.</p>
      </section>
      <section className="lg-entrar__form">
        <form onSubmit={(e) => void confirmar(e)} className="lg-entrar__campos">
          <h1 className="lv-titulo-ecra">Dois fatores</h1>
          <Campo rotulo="Código de 6 dígitos da app de autenticação" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
            value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required />
          {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
          <Botao type="submit" fixo aCarregar={aCarregar} disabled={codigo.length !== 6}>Confirmar</Botao>
          <button type="button" className="lg-entrar__link" onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</button>
        </form>
      </section>
    </main>
  );
}
