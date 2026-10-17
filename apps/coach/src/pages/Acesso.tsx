import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { criarConta, definirPalavraPasse } from '@luna/core';
import { Botao, Campo } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import '../app/gestao.css';

function Moldura({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main className="lv-root lg-entrar">
      <section className="lg-entrar__destaque" aria-hidden>
        <span className="lv-sobretitulo">LunaOS Gestão</span>
        <p className="lg-entrar__frase">O teu trabalho com cada cliente, num só sítio.</p>
      </section>
      <section className="lg-entrar__form">
        <div className="lg-logo"><span className="lg-logo__lua" aria-hidden /><span className="lg-logo__texto">LunaOS</span></div>
        <div className="lg-entrar__campos">
          <h1 className="lv-titulo-ecra">{titulo}</h1>
          {children}
        </div>
      </section>
    </main>
  );
}

/** Nova palavra-passe, depois do link de recuperação (X-01). */
export function Recuperar() {
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [aCarregar, setACarregar] = useState(false);

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    if (nova !== repetir) { setErro('As duas palavras-passe não são iguais.'); return; }
    setACarregar(true); setErro(null);
    try { await definirPalavraPasse(client, nova); setFeito(true); }
    catch (err) { setErro(err instanceof Error ? err.message : 'O link expirou. Pede um novo.'); }
    finally { setACarregar(false); }
  };

  return (
    <Moldura titulo={feito ? 'Palavra-passe mudada' : 'Nova palavra-passe'}>
      {feito ? (
        <><p className="lv-legenda" style={{ margin: 0 }}>Já podes entrar com a palavra-passe nova.</p>
          <Link className="lg-entrar__link" to="/today">Continuar</Link></>
      ) : (
        <form onSubmit={(e) => void guardar(e)} style={{ display: 'contents' }}>
          <Campo rotulo="Nova palavra-passe" type="password" autoComplete="new-password" minLength={10}
            ajuda="Pelo menos 10 caracteres." value={nova} onChange={(e) => setNova(e.target.value)} required />
          <Campo rotulo="Repetir" type="password" autoComplete="new-password" value={repetir} onChange={(e) => setRepetir(e.target.value)} required />
          {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
          <Botao type="submit" fixo aCarregar={aCarregar}>Guardar</Botao>
        </form>
      )}
    </Moldura>
  );
}

/**
 * Criar conta para aceitar um convite. A conta nova não tem papel nenhum: só
 * entra na equipa ao aceitar o convite, depois de confirmar o email (AUD-71).
 */
export function CriarConta() {
  const [params] = useSearchParams();
  const convite = params.get('convite') ?? '';
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [aCarregar, setACarregar] = useState(false);

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    if (password.length < 10) { setErro('A palavra-passe precisa de pelo menos 10 caracteres.'); return; }
    setACarregar(true); setErro(null);
    try {
      await criarConta(client, { nome, email, password, redirectTo: `${window.location.origin}/login?convite=${encodeURIComponent(convite)}` });
      setEnviado(true);
    } catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível criar a conta.'); }
    finally { setACarregar(false); }
  };

  return (
    <Moldura titulo={enviado ? 'Confirma o teu email' : 'Criar conta'}>
      {enviado ? (
        <p className="lv-legenda" style={{ margin: 0 }} role="status">
          Enviámos um link para {email}. Abre-o para confirmar; depois entras e o convite fica aceite.
        </p>
      ) : (
        <form onSubmit={(e) => void criar(e)} style={{ display: 'contents' }}>
          <Campo rotulo="Nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required />
          <Campo rotulo="Email (o do convite)" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Campo rotulo="Palavra-passe" type="password" autoComplete="new-password" minLength={10}
            ajuda="Pelo menos 10 caracteres." value={password} onChange={(e) => setPassword(e.target.value)} required />
          {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
          <Botao type="submit" fixo aCarregar={aCarregar}>Criar conta</Botao>
          <Link className="lg-entrar__link" to={`/login${convite ? `?convite=${encodeURIComponent(convite)}` : ''}`}>Já tenho conta</Link>
        </form>
      )}
    </Moldura>
  );
}
