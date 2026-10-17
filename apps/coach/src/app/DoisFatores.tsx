import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { verificarSegundoFator, useAuthStore } from '@luna/core';
import { Botao, Campo, Esqueleto, Nota } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';
import './gestao.css';

type Estado = 'a-verificar' | 'ok' | 'por-ativar' | 'por-confirmar';

/**
 * Dois fatores obrigatórios para quem vê o PAR-Q ou saúde (D18): o papel com
 * health.read só entra na Gestão com a sessão em aal2. Quem ainda não tem
 * ativa-os aqui (TOTP), quem tem confirma o código.
 */
export function DoisFatores({ children }: { children: ReactNode }) {
  const scope = useAuthStore((s) => s.scope);
  const exige = !!scope?.permissions.includes('health.read');
  const [estado, setEstado] = useState<Estado>(exige ? 'a-verificar' : 'ok');
  const [qr, setQr] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  useEffect(() => {
    if (!exige) { setEstado('ok'); return; }
    const client = getSupabaseClient();
    if (!client) { setEstado('ok'); return; }
    void client.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data, error }) => {
      if (error || !data) { setEstado('por-ativar'); return; }
      if (data.currentLevel === 'aal2') setEstado('ok');
      else if (data.nextLevel === 'aal2') setEstado('por-confirmar');
      else setEstado('por-ativar');
    });
  }, [exige, scope?.orgId]);

  useEffect(() => {
    if (estado !== 'por-ativar' || qr) return;
    const client = getSupabaseClient();
    if (!client) return;
    void client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'LunaOS' }).then(({ data, error }) => {
      if (error || !data) { setErro(error?.message ?? 'Não foi possível preparar os dois fatores.'); return; }
      setQr(data.totp.qr_code);
      setFactorId(data.id);
    });
  }, [estado, qr]);

  if (estado === 'ok') return <>{children}</>;
  if (estado === 'a-verificar') return <main className="lv-root" style={{ padding: 'var(--espaco-32)' }}><Esqueleto /></main>;

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try {
      if (estado === 'por-ativar' && factorId) {
        const { error } = await client.auth.mfa.challengeAndVerify({ factorId, code: codigo });
        if (error) throw new Error('Código errado ou expirado.');
      } else {
        await verificarSegundoFator(client, codigo);
      }
      setEstado('ok');
    } catch (err) { setErro(err instanceof Error ? err.message : 'Código errado.'); }
    finally { setACarregar(false); }
  };

  return (
    <main className="lv-root lg-entrar">
      <section className="lg-entrar__destaque" aria-hidden>
        <span className="lv-sobretitulo">Dados de saúde</span>
        <p className="lg-entrar__frase">Quem vê saúde entra com dois fatores.</p>
      </section>
      <section className="lg-entrar__form">
        <form onSubmit={(e) => void confirmar(e)} className="lg-entrar__campos">
          <h1 className="lv-titulo-ecra">{estado === 'por-ativar' ? 'Ativar dois fatores' : 'Dois fatores'}</h1>
          {estado === 'por-ativar' && (
            <>
              <Nota>O teu papel vê o PAR-Q e dados de saúde dos clientes. Lê o código com uma app de autenticação (Google Authenticator, 1Password, Authy) e escreve os 6 dígitos.</Nota>
              {qr ? <img src={qr} alt="Código QR para a app de autenticação" width={200} height={200} style={{ alignSelf: 'center', background: 'var(--cor-superficie)', borderRadius: 'var(--raio-linha)' }} />
                : !erro && <Esqueleto linhas={3} />}
            </>
          )}
          <Campo rotulo="Código de 6 dígitos" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
            value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required />
          {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
          <Botao type="submit" fixo aCarregar={aCarregar} disabled={codigo.length !== 6}>Confirmar</Botao>
          <button type="button" className="lg-entrar__link" onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</button>
        </form>
      </section>
    </main>
  );
}
