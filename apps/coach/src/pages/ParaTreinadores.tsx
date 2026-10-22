import { useNavigate } from 'react-router-dom';
import { PLANOS } from '@luna/core';
import { Botao } from '@luna/ui/v3';
import { Barbell, Buildings, CalendarBlank, ChatCircle, ClipboardText, User, Users, UsersThree, Wallet } from '@luna/icons';

const PARA_QUEM = [
  { icone: User, titulo: 'PT independente', texto: '1 lugar · os teus clientes' },
  { icone: UsersThree, titulo: 'Estúdio ou box', texto: 'Equipa, aulas e WOD' },
  { icone: Buildings, titulo: 'Ginásio', texto: 'Entradas e cobranças' },
];
const FUNCOES = [
  { icone: Users, titulo: 'Clientes', texto: 'Ficha, objetivos, saúde e histórico num só sítio.' },
  { icone: CalendarBlank, titulo: 'Agenda', texto: 'Marcações, aulas e lembretes automáticos.' },
  { icone: Barbell, titulo: 'Treino', texto: 'Planos, sessões ao vivo e recordes.' },
  { icone: ClipboardText, titulo: 'Avaliação', texto: 'Questionários, testes e evolução.' },
  { icone: ChatCircle, titulo: 'Mensagens', texto: 'Conversa com cada cliente, com horário.' },
  { icone: Wallet, titulo: 'Negócio', texto: 'Packs, mensalidades e quem te deve.' },
];

// Lojas de apps: a ligação real entra quando a app de atleta estiver publicada
const LOJA_ATLETA = (import.meta.env.VITE_ATHLETE_STORE_URL as string | undefined) || null;

/**
 * W-02 · Página LunaOS para treinadores: para quem é, o que faz e como se
 * paga. Os preços estão por decidir (N7), por isso diz só "por lugar".
 * "Experimentar grátis" abre a criação de conta (X-04).
 */
export function ParaTreinadores() {
  const navigate = useNavigate();
  const experimentar = () => navigate(`/criar-conta${window.location.search}`);
  return (
    <div className="lv-root lg-site">
      <header className="lg-site__topo">
        <span className="lg-site__marca"><span className="lg-site__lua" aria-hidden />LunaOS</span>
        <nav className="lg-site__nav" aria-label="Página">
          <a href="#para-quem">Para quem</a><a href="#funcoes">Funções</a><a href="#precos">Preços</a><a href="#atleta">Sou atleta</a>
        </nav>
        <span className="lc-par">
          <Botao variante="secundario" onClick={() => navigate('/login')}>Entrar</Botao>
          <Botao onClick={experimentar}>Experimentar grátis</Botao>
        </span>
      </header>
      <main>
        <section className="lg-site__heroi" aria-labelledby="site-titulo">
          <span className="lv-pill"><UsersThree size={14} aria-hidden /> Para PT, estúdios, boxes e ginásios</span>
          <h1 id="site-titulo" className="lg-site__titulo">Treina pessoas, não folhas de cálculo.</h1>
          <p className="lg-site__lead">Clientes, agenda, planos de treino e a app dos teus atletas, num só sítio. Pagas por treinador; os clientes são ilimitados.</p>
          <span className="lc-par" style={{ flexWrap: 'wrap' }}>
            <Botao onClick={experimentar}>Experimentar grátis</Botao>
            <Botao variante="secundario" onClick={() => document.getElementById('precos')?.scrollIntoView({ behavior: 'smooth' })}>Ver preços</Botao>
          </span>
        </section>
        <div className="lg-site__grelha">
          <section id="para-quem" aria-labelledby="t-para-quem">
            <h2 id="t-para-quem" className="lv-titulo-cartao">Para quem treina</h2>
            <div className="lg-site__cartoes">
              {PARA_QUEM.map((p) => (
                <article key={p.titulo} className="lg-site__cartao">
                  <span className="lg-site__icone"><p.icone size={28} aria-hidden /></span>
                  <b>{p.titulo}</b><span className="lv-legenda">{p.texto}</span>
                </article>
              ))}
            </div>
          </section>
          <section id="precos" aria-labelledby="t-precos">
            <span className="lc-par" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-precos" className="lv-titulo-cartao">Preços</h2><span className="lv-legenda">Clientes ilimitados</span>
            </span>
            <div className="lv-lista">
              {(['treinador', 'ginasio'] as const).map((k, i) => (
                <div key={k} className={`lg-site__preco${i === 0 ? ' lg-site__preco--destaque' : ''}`}>
                  <span className="lv-linha-lista__corpo"><b>{PLANOS[k].nome}</b><span className="lv-legenda">{k === 'treinador' ? 'Clientes, agenda, treino e app' : 'Junta entradas, cobranças e loja'}</span></span>
                  <span className="lg-site__valor">Por lugar</span>
                </div>
              ))}
              <div id="atleta" className="lg-site__preco">
                <span className="lv-linha-lista__corpo"><b>Atleta</b><span className="lv-legenda">Sozinho ou com o teu treinador</span></span>
                <span className="lg-site__valor">Grátis</span>
              </div>
            </div>
            <p className="lv-legenda">30 dias para experimentar, sem cartão. Sem pagamento, a conta fica só de leitura e nada se apaga.</p>
            {LOJA_ATLETA
              ? <a className="lg-entrar__link" href={LOJA_ATLETA}>Sou atleta: descarregar a app</a>
              : <p className="lv-legenda">Sou atleta: a app chega em breve às lojas, grátis.</p>}
          </section>
        </div>
        <section id="funcoes" aria-labelledby="t-funcoes" className="lg-site__funcoes">
          <h2 id="t-funcoes" className="lv-titulo-cartao">O que faz</h2>
          <div className="lg-site__cartoes lg-site__cartoes--seis">
            {FUNCOES.map((f) => (
              <article key={f.titulo} className="lg-site__cartao lg-site__cartao--texto">
                <f.icone size={20} aria-hidden /><b>{f.titulo}</b><span className="lv-legenda">{f.texto}</span>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
