import { useNavigate } from 'react-router-dom';
import { PLANOS } from '@luna/core';
import { Botao } from '@luna/ui/v3';
import '../app/gestao.css';
import { CaretRight, UsersThree } from '@luna/icons';

// Fotos provisórias do Figma (DS-03 · Media Library); trocar pelas de produção
const PARA_QUEM = [
  { foto: '/media/pt.jpg', titulo: 'PT independente', texto: '1 lugar · os teus clientes' },
  { foto: '/media/estudio.jpg', titulo: 'Estúdio ou box', texto: 'Equipa, aulas e WOD' },
  { foto: '/media/ginasio.jpg', titulo: 'Ginásio', texto: 'Entradas e cobranças' },
];
const PRECOS = [
  { nome: PLANOS.treinador.nome, texto: 'Clientes, agenda, treino e app', valor: 'Por lugar', destaque: true },
  { nome: PLANOS.ginasio.nome, texto: 'Junta entradas, cobranças e loja', valor: 'Por lugar', destaque: false },
  { nome: 'Atleta', texto: 'Sozinho ou com o teu treinador', valor: 'Grátis', destaque: false },
];

// Lojas de apps: a ligação real entra quando a app de atleta estiver publicada
const LOJA_ATLETA = (import.meta.env.VITE_ATHLETE_STORE_URL as string | undefined) || '#precos';

/**
 * W-02 · Página LunaOS para treinadores (Figma 101:810), igual ao desenho:
 * para quem é, o que faz e como se paga. Os preços estão por decidir (N7),
 * por isso diz só "por lugar". "Experimentar grátis" abre a criação de conta.
 */
export function ParaTreinadores() {
  const navigate = useNavigate();
  const experimentar = () => navigate(`/criar-conta${window.location.search}`);
  const irPara = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  return (
    <div className="lv-root lg-site">
      <header className="lg-site__topo">
        <span className="lg-site__marca"><span className="lg-logo__lua" aria-hidden />LunaOS</span>
        <nav className="lg-site__nav" aria-label="Página">
          <a href="#para-quem">Para quem</a><a href="#para-quem">Funções</a><a href="#precos">Preços</a><a href={LOJA_ATLETA}>Sou atleta</a>
        </nav>
        <span className="lc-par">
          <button type="button" className="lg-site__entrar" onClick={() => navigate('/login')}>Entrar</button>
          <Botao onClick={experimentar}>Experimentar grátis</Botao>
        </span>
      </header>
      <main>
        <section className="lg-site__heroi" aria-labelledby="site-titulo">
          <span className="lg-site__sobre"><UsersThree size={16} aria-hidden /> Para PT, estúdios, boxes e ginásios</span>
          <h1 id="site-titulo" className="lg-site__titulo">Treina pessoas, não folhas de cálculo.</h1>
          <p className="lg-site__lead">Clientes, agenda, planos de treino e a app dos teus atletas, num só sítio. Pagas por treinador; os clientes são ilimitados.</p>
          <span className="lc-par" style={{ flexWrap: 'wrap' }}>
            <Botao onClick={experimentar}>Experimentar grátis</Botao>
            <button type="button" className="lg-site__ver" onClick={() => irPara('precos')}>Ver preços</button>
          </span>
        </section>
        <div className="lg-site__grelha">
          <section id="para-quem" aria-labelledby="t-para-quem">
            <span className="lg-site__cabeca">
              <h2 id="t-para-quem" className="lg-site__h2">Para quem treina</h2>
              <a className="lg-site__mais" href="#para-quem">Ver funções <CaretRight size={16} aria-hidden /></a>
            </span>
            <div className="lg-site__cartoes">
              {PARA_QUEM.map((p) => (
                <article key={p.titulo} className="lg-site__cartao">
                  <img src={p.foto} alt="" className="lg-site__foto" />
                  <b>{p.titulo}</b><span>{p.texto}</span>
                </article>
              ))}
            </div>
          </section>
          <section id="precos" aria-labelledby="t-precos">
            <span className="lg-site__cabeca">
              <h2 id="t-precos" className="lg-site__h2">Preços</h2><span className="lg-site__mais">Clientes ilimitados</span>
            </span>
            <div className="lg-site__precos">
              {PRECOS.map((p) => (
                <div key={p.nome} className={`lg-site__preco${p.destaque ? ' lg-site__preco--destaque' : ''}`}>
                  <span className="lv-linha-lista__corpo"><b>{p.nome}</b><small>{p.texto}</small></span>
                  <span className="lg-site__valor">{p.valor}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
