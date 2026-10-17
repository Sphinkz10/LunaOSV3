import { useEffect, useState, type FormEvent } from 'react';
import { Botao, Campo } from './components';

/**
 * Entrar sem palavra-passe (X-01, Figma 188:92): só o email e um código de 6
 * dígitos, válido 10 minutos e de uma só vez; reenviar só ao fim de 60 s.
 * Apple e Google ao lado; a palavra-passe continua para quem a quiser.
 * Serve a Gestão e a app do cliente (C-01); a lógica vem por callbacks.
 */
export interface EntrarCodigoProps {
  titulo?: string;
  onEnviar: (email: string) => Promise<void>;
  onVerificar: (email: string, codigo: string) => Promise<void>;
  onFornecedor?: (fornecedor: 'apple' | 'google') => Promise<void>;
  onPalavraPasse?: () => void;
}

const REENVIO_S = 60;

export function EntrarCodigo({ titulo = 'Entrar no LunaOS', onEnviar, onVerificar, onFornecedor, onPalavraPasse }: EntrarCodigoProps) {
  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [espera, setEspera] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  const correr = async (fn: () => Promise<void>) => {
    setACarregar(true); setErro(null);
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); } finally { setACarregar(false); }
  };
  const enviar = (e?: FormEvent) => {
    e?.preventDefault();
    void correr(async () => { await onEnviar(email.trim()); setEnviado(true); setEspera(REENVIO_S); setCodigo(''); });
  };
  const verificar = (e: FormEvent) => {
    e.preventDefault();
    void correr(() => onVerificar(email.trim(), codigo));
  };

  if (enviado) {
    return (
      <form onSubmit={verificar} className="lv-entrar">
        <h1 className="lv-titulo-ecra">Vê o teu email</h1>
        <p className="lv-legenda" style={{ margin: 0 }}>Enviámos um código de 6 dígitos para {email}.</p>
        <Campo rotulo="Código" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
          value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required />
        <p className="lv-legenda" style={{ margin: 0 }} aria-live="polite">
          Vale 10 minutos.{espera > 0 ? ` Reenviar daqui a 0:${String(espera).padStart(2, '0')}.` : ''}
        </p>
        {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
        <Botao type="submit" fixo aCarregar={aCarregar} disabled={codigo.length !== 6}>Entrar</Botao>
        <div className="lv-entrar__links">
          <button type="button" className="lv-entrar__link" disabled={espera > 0 || aCarregar} onClick={() => enviar()}>Reenviar código</button>
          <button type="button" className="lv-entrar__link" onClick={() => { setEnviado(false); setErro(null); }}>Usar outro email</button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={enviar} className="lv-entrar">
      <h1 className="lv-titulo-ecra">{titulo}</h1>
      <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
      <Botao type="submit" fixo aCarregar={aCarregar}>Enviar código</Botao>
      {onFornecedor && (
        <>
          <div className="lv-entrar__ou"><span>ou</span></div>
          <Botao variante="secundario" fixo onClick={() => void correr(() => onFornecedor('apple'))}>Continuar com Apple</Botao>
          <Botao variante="secundario" fixo onClick={() => void correr(() => onFornecedor('google'))}>Continuar com Google</Botao>
        </>
      )}
      {onPalavraPasse && <button type="button" className="lv-entrar__link" onClick={onPalavraPasse}>Entrar com palavra-passe</button>}
    </form>
  );
}
