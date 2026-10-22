import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  aceitarConvite, enviarCodigoEmail, entrarComFornecedor, pedirRecuperacao, precisaSegundoFator, signInWithPassword,
  usarCodigoRecuperacao, useAuthStore, verificarCodigoEmail, verificarSegundoFator,
} from '@luna/core';
import { Botao, Campo, EntrarCodigo, Nota } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import '../app/gestao.css';

type Passo = 'email' | 'entrar' | 'codigo' | 'recuperar' | 'recuperar-enviado' | 'convite' | 'tenho-codigo';

/**
 * Entrar e recuperar acesso (X-01, Figma 80:3489): email e palavra-passe; quem
 * tem dois fatores vê o passo do código; recuperar envia um link que expira
 * em 30 minutos; "Recebi um convite" leva ao código do convite.
 */
export function Login() {
  const status = useAuthStore((s) => s.status);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [passo, setPasso] = useState<Passo>(params.get('convite') ? 'convite' : 'email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ver, setVer] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [convite, setConvite] = useState(params.get('convite') ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const client = getSupabaseClient();

  // Já com sessão e sem passos por fazer: a porta da Gestão decide o resto
  if ((status === 'signedIn' || status === 'noRole' || status === 'error') && (passo === 'entrar' || passo === 'email')) return <Navigate to="/today" replace />;

  const correr = async (fn: () => Promise<void>) => {
    setACarregar(true); setErro(null);
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); } finally { setACarregar(false); }
  };

  const entrar = (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    void correr(async () => {
      try {
        await signInWithPassword(client, email, password);
      } catch (err) {
        const msg = err instanceof Error ? err.message : '';
        throw new Error(/confirm/i.test(msg) ? 'Confirma primeiro o teu email: abre a ligação que te enviámos.'
          : /invalid/i.test(msg) ? 'Email ou palavra-passe errados.' : msg || 'Não foi possível entrar.');
      }
      if (await precisaSegundoFator(client)) setPasso('codigo');
      else if (convite) { await aceitarConvite(client, convite); window.location.assign('/today'); }
    });
  };

  const confirmarCodigo = (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    void correr(async () => {
      await verificarSegundoFator(client, codigo);
      if (convite) await aceitarConvite(client, convite);
      window.location.assign('/today');
    });
  };

  const recuperar = (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    void correr(async () => {
      await pedirRecuperacao(client, email, `${window.location.origin}/recuperar`);
      setPasso('recuperar-enviado');
    });
  };

  // Recuperação assistida: código de uso único dado pela gerência (30 min) e palavra-passe nova
  const usarCodigo = (e: FormEvent) => {
    e.preventDefault();
    if (!client) return;
    void correr(async () => {
      if (password.length < 10) throw new Error('A palavra-passe precisa de pelo menos 10 caracteres.');
      await usarCodigoRecuperacao(client, email.trim(), codigo.trim().toUpperCase(), password);
      await signInWithPassword(client, email.trim(), password);
      if (await precisaSegundoFator(client)) { setCodigo(''); setPasso('codigo'); }
    });
  };

  return (
    <main className="lv-root lg-entrar">
      <section className="lg-entrar__destaque" aria-hidden>
        <span className="lv-sobretitulo">LunaOS Gestão</span>
        <p className="lg-entrar__frase">O teu trabalho com cada cliente, num só sítio.</p>
      </section>
      <section className="lg-entrar__form">
        <div className="lg-logo"><span className="lg-logo__lua" aria-hidden /><span className="lg-logo__texto">LunaOS</span></div>

        {!client ? (
          <Nota>Falta a ligação ao servidor: copia .env.example para .env na raiz do projeto, preenche VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicia a app.</Nota>
        ) : passo === 'email' ? (
          <EntrarCodigo
            onEnviar={(e) => enviarCodigoEmail(client, e, false, `${window.location.origin}/today`)}
            onVerificar={async (e, c) => {
              await verificarCodigoEmail(client, e, c);
              if (await precisaSegundoFator(client)) setPasso('codigo');
            }}
            onFornecedor={(f) => entrarComFornecedor(client, f, `${window.location.origin}/today`)}
            onPalavraPasse={() => setPasso('entrar')} />
        ) : passo === 'entrar' || passo === 'convite' ? (
          <form onSubmit={entrar} className="lg-entrar__campos">
            <h1 className="lv-titulo-ecra">Entrar</h1>
            {passo === 'convite' && (
              <Campo rotulo="Código do convite" value={convite} onChange={(e) => setConvite(e.target.value)}
                ajuda="Está no email do convite. Entra com o email que o recebeu." required />
            )}
            <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <div className="lg-entrar__pass">
              <Campo rotulo="Palavra-passe" type={ver ? 'text' : 'password'} autoComplete="current-password"
                value={password} onChange={(e) => setPassword(e.target.value)} required />
              <button type="button" className="lg-entrar__ver" aria-pressed={ver} onClick={() => setVer((v) => !v)}>
                {ver ? 'Esconder' : 'Mostrar'}
              </button>
            </div>
            <div className="lg-entrar__links">
              <button type="button" className="lg-entrar__link" onClick={() => { setErro(null); setPasso('recuperar'); }}>Esqueci-me da palavra-passe</button>
              {passo === 'entrar' && <button type="button" className="lg-entrar__link" onClick={() => { setErro(null); setPasso('convite'); }}>Recebi um convite</button>}
              {passo === 'entrar' && <button type="button" className="lg-entrar__link" onClick={() => navigate(`/criar-conta${window.location.search}`)}>Sou treinador e quero experimentar</button>}
            </div>
            {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
            <Botao type="submit" fixo aCarregar={aCarregar}>Entrar</Botao>
            {passo === 'convite' && (
              <button type="button" className="lg-entrar__link" onClick={() => navigate(`/criar-conta?convite=${encodeURIComponent(convite)}`)}>
                Ainda não tenho conta
              </button>
            )}
          </form>
        ) : passo === 'codigo' ? (
          <form onSubmit={confirmarCodigo} className="lg-entrar__campos">
            <h1 className="lv-titulo-ecra">Dois fatores</h1>
            <Campo rotulo="Código de 6 dígitos da app de autenticação" inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]{6}" maxLength={6} value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))} required />
            {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
            <Botao type="submit" fixo aCarregar={aCarregar} disabled={codigo.length !== 6}>Confirmar</Botao>
          </form>
        ) : passo === 'recuperar' ? (
          <form onSubmit={recuperar} className="lg-entrar__campos">
            <h1 className="lv-titulo-ecra">Recuperar acesso</h1>
            <p className="lv-legenda" style={{ margin: 0 }}>Enviamos um link para escolheres uma palavra-passe nova. Expira em 30 minutos.</p>
            <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
            <Botao type="submit" fixo aCarregar={aCarregar}>Enviar link</Botao>
            <div className="lg-entrar__links">
              <button type="button" className="lg-entrar__link" onClick={() => { setErro(null); setCodigo(''); setPassword(''); setPasso('tenho-codigo'); }}>Tenho um código</button>
              <button type="button" className="lg-entrar__link" onClick={() => setPasso('entrar')}>Voltar a entrar</button>
            </div>
          </form>
        ) : passo === 'tenho-codigo' ? (
          <form onSubmit={usarCodigo} className="lg-entrar__campos">
            <h1 className="lv-titulo-ecra">Tenho um código</h1>
            <p className="lv-legenda" style={{ margin: 0 }}>A gerência deu-te um código de uso único. Vale 30 minutos.</p>
            <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Campo rotulo="Código" autoComplete="off" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
            <Campo rotulo="Palavra-passe nova" type="password" autoComplete="new-password" minLength={10}
              value={password} onChange={(e) => setPassword(e.target.value)} required ajuda="Pelo menos 10 caracteres" />
            {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
            <Botao type="submit" fixo aCarregar={aCarregar}>Entrar</Botao>
            <button type="button" className="lg-entrar__link" onClick={() => setPasso('entrar')}>Voltar a entrar</button>
          </form>
        ) : (
          <div className="lg-entrar__campos" role="status">
            <h1 className="lv-titulo-ecra">Vê o teu email</h1>
            <p className="lv-legenda" style={{ margin: 0 }}>Se {email} tiver conta, recebe um link que expira em 30 minutos.</p>
            <button type="button" className="lg-entrar__link" onClick={() => setPasso('entrar')}>Voltar a entrar</button>
          </div>
        )}
      </section>
    </main>
  );
}
