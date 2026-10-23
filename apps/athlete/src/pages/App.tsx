import { eFeminino } from '@luna/modalidades';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  cancelarApagarConta, definirConsentimentoAnalise, fetchConversas, fetchTreinoSolo, temPlanoSolo, type MeuTreino, definirPartilhas, fetchConsentimentoAnalise, fetchMeusAvisos, guardarMeusAvisos, type MeusAvisos, exportarMeusDados, fetchMeuHoje, fetchMinhasLigacoes, fetchNotificacoes, fetchPedidoApagar,
  assiduidade, fetchHistorico, fetchMeusObjetivos, fetchRecordes, marcarLidas, sincronizarTreinos, treinosPorEnviar, useRede, minhaConta, pedirApagarConta, toast,
  type CategoriaPartilha, type MeuHoje, type MeuObjetivo, type MinhaConta, type Recorde, type TreinoHistorico, type MinhaLigacao, type Notificacao,
} from '@luna/core';
import {
  Atalho, Avatar, Botao, ConfirmarDestrutivo, Esqueleto, EstadoPagina, Interruptor, NavegacaoInferior, Nota, Tema, type TemaId,
} from '@luna/ui/v3';
import {
  ArrowLeft, Barbell, Bell, CalendarBlank, ChatCircle, Wallet, CaretRight, ChartLineUp, Gear, Play, ShieldCheck, SignOut, Sun, UserCircle,
} from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { AvaliacoesProgresso, PedidosHoje } from './AvaliacaoCliente';
import { useSessao } from '../sessao';
import { t } from '../vocab';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TEMA_KEY = 'luna.cliente.tema';
const lerTema = (): TemaId => {
  const q = new URLSearchParams(window.location.search).get('tema');
  if (q === 'oceano' || q === 'ouro' || q === 'limao') return q;
  try { const v = localStorage.getItem(TEMA_KEY); if (v === 'ouro' || v === 'limao') return v; } catch { /* conveniência */ }
  return 'oceano';
};

/**
 * Estrutura da app do cliente (F1a): 5 separadores (Hoje, Aulas, Treino,
 * Progresso, Eu) na navegação em pílula. Sem sessão, vai para Entrar.
 */
export function AppCliente() {
  const { sessao, aCarregar } = useSessao();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [tema, setTema] = useState<TemaId>(lerTema);
  const online = useRede((s) => s.online);
  // Quando a rede volta, os treinos feitos sem rede seguem para o treinador
  useEffect(() => {
    const client = getSupabaseClient();
    if (online && client && treinosPorEnviar().length) {
      void sincronizarTreinos(client).then((falta) => { if (falta === 0) toast({ variant: 'success', title: 'Treinos enviados' }); }).catch(() => undefined);
    }
  }, [online]);
  useEffect(() => { document.documentElement.dataset.tema = tema; }, [tema]);
  useEffect(() => {
    const on = (e: Event) => setTema((e as CustomEvent<TemaId>).detail);
    window.addEventListener('luna:tema', on);
    return () => window.removeEventListener('luna:tema', on);
  }, []);
  if (aCarregar) return <main className="lc-app"><Esqueleto /></main>;
  if (!sessao) return <Navigate to="/entrar" replace />;
  const em = (p: string) => pathname === p || pathname.startsWith(`${p}/`);
  return (
    <Tema tema={tema}>
      <div className="lc-app">
        <Outlet />
        <NavegacaoInferior itens={[
          { id: 'hoje', rotulo: 'Hoje', icone: Sun, ativo: em('/hoje'), onClick: () => navigate('/hoje') },
          { id: 'aulas', rotulo: t('aula', { plural: true, maiuscula: true }), icone: CalendarBlank, ativo: em('/aulas'), onClick: () => navigate('/aulas') },
          { id: 'treino', rotulo: 'Treino', icone: Barbell, ativo: em('/treino'), onClick: () => navigate('/treino') },
          { id: 'progresso', rotulo: 'Progresso', icone: ChartLineUp, ativo: em('/progresso'), onClick: () => navigate('/progresso') },
          { id: 'eu', rotulo: 'Eu', icone: UserCircle, ativo: em('/eu'), onClick: () => navigate('/eu') },
        ]} />
      </div>
    </Tema>
  );
}

function Cabeca({ sobre, titulo, voltar, fim }: { sobre?: string; titulo: string; voltar?: () => void; fim?: ReactNode }) {
  return (
    <header className="lc-cabeca">
      {voltar && (
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={voltar}><ArrowLeft size={18} aria-hidden /></button>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {sobre && <span className="lv-legenda">{sobre}</span>}
        <h1 className="lc-cabeca__titulo">{titulo}</h1>
      </div>
      {fim}
    </header>
  );
}

function useConta(): MinhaConta | null {
  const { sessao } = useSessao();
  const [conta, setConta] = useState<MinhaConta | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (client && sessao) void minhaConta(client, sessao.user.id).then(setConta).catch(() => setConta(null));
  }, [sessao]);
  return conta;
}

/* ── C-03 Hoje (F1a: sem cartão de entrada, ocupação nem check-in) ─────── */
export function HojeCliente() {
  const navigate = useNavigate();
  const conta = useConta();
  const [hoje, setHoje] = useState<MeuHoje | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [naoLidas, setNaoLidas] = useState(0);
  const [msgPorLer, setMsgPorLer] = useState(0);
  const [solo, setSolo] = useState<MeuTreino | null>(null);
  const [temSolo, setTemSolo] = useState(true);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void fetchConversas(client).then((l) => setMsgPorLer(l.reduce((n, c) => n + c.porLer, 0))).catch(() => setMsgPorLer(0));
    void fetchTreinoSolo(client).then(setSolo).catch(() => setSolo(null));
    void temPlanoSolo(client).then(setTemSolo).catch(() => setTemSolo(true));
    void fetchMeuHoje(client).then(setHoje).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchNotificacoes(client, 30).then((n) => setNaoLidas(n.filter((x) => !x.read_at).length)).catch(() => setNaoLidas(0));
  }, []);
  useEffect(() => carregar(), [carregar]);
  const d = new Date();
  const primeiro = conta?.nome.split(' ')[0] ?? '';
  const proxima = hoje?.proxima ? new Date(hoje.proxima.inicio) : null;
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <Avatar nome={conta?.nome ?? '?'} tamanho={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="lv-legenda">{DIAS[d.getDay()]}, {d.getDate()} de {MESES[d.getMonth()]}</span>
          <h1 className="lc-cabeca__titulo">Olá{primeiro ? `, ${primeiro}` : ''}</h1>
        </div>
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label={msgPorLer ? `Mensagens, ${msgPorLer} por ler` : 'Mensagens'}
          onClick={() => navigate('/mensagens')} style={{ position: 'relative' }}>
          <ChatCircle size={18} aria-hidden />{msgPorLer > 0 && <span className="lc-ponto" aria-hidden />}
        </button>
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label={naoLidas ? `Notificações, ${naoLidas} por ler` : 'Notificações'}
          onClick={() => navigate('/avisos')} style={{ position: 'relative' }}>
          <Bell size={18} aria-hidden />{naoLidas > 0 && <span className="lc-ponto" aria-hidden />}
        </button>
      </header>

      {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar o teu dia" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
        : !hoje ? <Esqueleto />
        : (
          <>
            {hoje.treino ? (
              <section className="lc-destaque" aria-label="Treino de hoje">
                <span className="lc-destaque__sobre"><Barbell size={16} aria-hidden />Treino de hoje</span>
                <h2 className="lc-destaque__titulo">{hoje.treino.nome}</h2>
                <span>{[hoje.treino.plano, hoje.treino.duracaoMin ? `${hoje.treino.duracaoMin} min` : null].filter(Boolean).join(' · ')}</span>
                <Botao variante="no-destaque" icone={Play} className="lc-destaque__acao" onClick={() => navigate('/treino')}>Começar</Botao>
              </section>
            ) : (
              <section className="lc-destaque lc-destaque--calmo" aria-label="Treino de hoje">
                <span className="lc-destaque__sobre"><Barbell size={16} aria-hidden />Treino de hoje</span>
                <h2 className="lc-destaque__titulo">{solo ? solo.nome : 'Dia livre'}</h2>
                <span>{solo ? `O teu plano · ${solo.duracao_min ?? 30} min` : hoje.organizacoes ? `Hoje não tens treino no plano. O teu ${t('responsavel')} pode atribuir-te um a qualquer momento.` : 'Podes começar já, sozinho e de graça.'}</span>
                {solo && <Botao variante="no-destaque" icone={Play} className="lc-destaque__acao" onClick={() => navigate('/treino')}>Começar</Botao>}
                {!solo && !hoje.organizacoes && !temSolo && <Botao variante="no-destaque" icone={Play} className="lc-destaque__acao" onClick={() => navigate('/sozinho')}>Começar sozinho</Botao>}
              </section>
            )}
            {!hoje.organizacoes && (
              <button type="button" className="lc-lista__linha lc-cartao" onClick={() => navigate('/eu/treinador')}>
                <span className="lc-lista__icone"><UserCircle size={18} aria-hidden /></span>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Ter um {t('responsavel')}</span><span className="lv-legenda">Liga-te ao teu PT</span></span>
                <CaretRight size={16} aria-hidden />
              </button>
            )}

            <PedidosHoje />

            <div className="lc-atalhos">
              <Atalho icone={CalendarBlank} rotulo="Marcar" principal onClick={() => navigate('/aulas')} />
              <Atalho icone={Barbell} rotulo="Treino" onClick={() => navigate('/treino')} />
              <Atalho icone={ChartLineUp} rotulo="Medidas" onClick={() => navigate('/progresso')} />
            </div>

            <div className="lc-par">
              <section className="lc-cartao lc-cartao--claro" aria-label="Esta semana">
                <span className="lc-cartao__rotulo"><Barbell size={14} aria-hidden />Esta semana</span>
                <span className="lv-numero-grande">{hoje.feitosSemana}</span>
                <span className="lv-legenda">treinos feitos</span>
              </section>
              <section className="lc-cartao lc-cartao--quente" aria-label={`${eFeminino(t('sessao')) ? 'Próxima' : 'Próximo'} ${t('sessao')}`}>
                <span className="lc-cartao__rotulo"><CalendarBlank size={14} aria-hidden />{eFeminino(t('sessao')) ? 'Próxima' : 'Próximo'} {t('sessao')}</span>
                {proxima ? (
                  <>
                    <span className="lv-numero-grande">{proxima.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span className="lv-legenda">{proxima.toDateString() === d.toDateString() ? 'hoje' : `${DIAS[proxima.getDay()].toLowerCase()}, ${proxima.getDate()}`} · {hoje.proxima!.org}</span>
                  </>
                ) : <span className="lv-legenda">Nada marcado.</span>}
              </section>
            </div>
          </>
        )}
    </main>
  );
}

/* ── Separadores que chegam com outras tarefas ─────────────────────────── */
export function PorChegar({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="lc-ecra">
      <Cabeca titulo={titulo} />
      <Tema tema="esboco">
        <EstadoPagina tipo="vazio" titulo="A chegar" texto={texto} />
      </Tema>
    </main>
  );
}

/* ── Progresso (F1a: os objetivos e marcos do treinador, só para leitura) ── */
const ESTADO_OBJ: Record<string, string> = { no_caminho: 'No caminho', em_risco: 'Em risco', atingido: 'Atingido', parado: 'Parado' };
export function ProgressoCliente() {
  const [lista, setLista] = useState<MeuObjetivo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recordes, setRecordes] = useState<Recorde[] | null>(null);
  const [historico, setHistorico] = useState<TreinoHistorico[] | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMeusObjetivos(client).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchRecordes(client).then(setRecordes).catch(() => setRecordes([]));
    void fetchHistorico(client).then(setHistorico).catch(() => setHistorico([]));
  }, []);
  const semanas = historico ? assiduidade(historico) : null;
  const ordenados = recordes ? [...recordes].sort((a, b) => b.carga - a.carga) : [];
  useEffect(() => carregar(), [carregar]);
  return (
    <main className="lc-ecra">
      <Cabeca sobre="A tua evolução" titulo="Progresso" />
      <div className="lc-par">
        <section className="lc-cartao lc-cartao--claro" aria-label="Assiduidade">
          <span className="lc-cartao__rotulo">Assiduidade</span>
          <span className="lv-numero-grande">{semanas ? semanas.slice(-4).reduce((x, y) => x + y, 0) : '…'}</span>
          <span className="lv-legenda">treinos nas últimas 4 semanas</span>
          {semanas && <span className="lc-barras" aria-hidden>{semanas.map((v, k) => <i key={k} style={{ height: 4 + v * 8 }} />)}</span>}
        </section>
        <section className="lc-cartao lc-cartao--quente" aria-label="Recorde">
          <span className="lc-cartao__rotulo">Melhor recorde</span>
          {ordenados[0] ? <><span className="lv-numero-grande">{ordenados[0].carga}</span><span className="lv-legenda">kg · {ordenados[0].exercicio}</span></> : <span className="lv-legenda">Ainda sem recordes</span>}
        </section>
      </div>
      {ordenados.length > 0 && (
        <section className="lc-lista" aria-label="Recordes">
          {ordenados.slice(0, 8).map((r) => (
            <div key={r.exercicio} className="lc-lista__linha">
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{r.exercicio}</span><span className="lv-legenda">{new Date(r.em).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</span></span>
              <b>{r.carga} kg{r.reps ? ` × ${r.reps}` : ''}</b>
            </div>
          ))}
        </section>
      )}
      <AvaliacoesProgresso />
      {historico && historico.length > 0 && (
        <section className="lc-grupo" aria-label="Histórico de treinos">
          <h2 className="lv-sobretitulo">Histórico de treinos</h2>
          {historico.slice(0, 10).map((h) => (
            <div key={h.id} className="lc-aviso" style={{ cursor: 'default' }}>
              <ChartLineUp size={18} aria-hidden />
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{h.nome}</span>
                <span className="lv-legenda">{new Date(h.em).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' })} · {h.minutos} min · {h.series} séries{h.rpe ? ` · esforço ${h.rpe}` : ''}</span></span>
            </div>
          ))}
        </section>
      )}
      {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
        : !lista ? <Esqueleto />
        : lista.length === 0 ? <EstadoPagina tipo="vazio" icone={ChartLineUp} titulo="Ainda sem objetivos" texto={`Os objetivos que combinares com o teu ${t('responsavel')} aparecem aqui.`} />
        : lista.map((o) => (
          <section key={o.id} className="lc-cartao" aria-label={o.titulo}>
            <span className="lc-cartao__rotulo">{ESTADO_OBJ[o.estado] ?? o.estado}{o.nota ? ` · ${o.nota}` : ''}</span>
            <h2 className="lc-cabeca__titulo" style={{ fontSize: 20 }}>{o.titulo}</h2>
            {o.criterio && <span className="lv-legenda">{o.criterio}</span>}
            {o.marcos.map((m) => (
              <span key={m.titulo} className="lv-legenda" style={{ display: 'flex', gap: 'var(--espaco-8)', alignItems: 'center' }}>
                <span className={m.feito ? 'lc-marco lc-marco--feito' : 'lc-marco'} aria-hidden />{m.titulo}{!m.feito && m.prazo ? ` · até ${new Date(`${m.prazo}T12:00:00Z`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}` : ''}
              </span>
            ))}
          </section>
        ))}
      <Nota>Medidas, fotos e avaliações chegam com a avaliação.</Nota>
    </main>
  );
}

/* ── C-20 Notificações ─────────────────────────────────────────────────── */
export function AvisosCliente() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<Notificacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchNotificacoes(client, 50).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, []);
  useEffect(() => carregar(), [carregar]);
  const lidas = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await marcarLidas(client).catch(() => undefined);
    carregar();
  };
  const inicioHoje = new Date(); inicioHoje.setHours(0, 0, 0, 0);
  const grupos: [string, Notificacao[]][] = lista ? [
    ['Hoje', lista.filter((n) => new Date(n.created_at) >= inicioHoje)],
    ['Antes', lista.filter((n) => new Date(n.created_at) < inicioHoje)],
  ] : [];
  return (
    <main className="lc-ecra">
      <Cabeca titulo="Notificações" voltar={() => navigate(-1)}
        fim={lista?.some((n) => !n.read_at) ? <button type="button" className="lc-link" onClick={() => void lidas()}>Marcar lidas</button> : undefined} />
      {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
        : !lista ? <Esqueleto />
        : lista.length === 0 ? <EstadoPagina tipo="vazio" icone={Bell} titulo="Sem notificações" texto="Lembretes, respostas e avisos do teu treino aparecem aqui." />
        : grupos.filter(([, l]) => l.length > 0).map(([titulo, l]) => (
          <section key={titulo} className="lc-grupo" aria-label={titulo}>
            <h2 className="lv-sobretitulo">{titulo}</h2>
            {l.map((n) => (
              <button key={n.id} type="button" className={`lc-aviso${n.read_at ? '' : ' lc-aviso--nova'}`}
                onClick={() => { if (n.action_url?.startsWith('/')) navigate(n.action_url); }}>
                <Bell size={18} aria-hidden />
                <span className="lv-linha-lista__corpo">
                  <span className="lv-linha-lista__titulo">{n.title}</span>
                  {n.body && <span className="lv-legenda">{n.body}</span>}
                </span>
              </button>
            ))}
          </section>
        ))}
    </main>
  );
}

/* ── C-21 Eu ───────────────────────────────────────────────────────────── */
export function EuCliente() {
  const navigate = useNavigate();
  const conta = useConta();
  const [ligacoes, setLigacoes] = useState<MinhaLigacao[] | null>(null);
  const [hoje, setHoje] = useState<MeuHoje | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMinhasLigacoes(client).then(setLigacoes).catch(() => setLigacoes([]));
    void fetchMeuHoje(client).then(setHoje).catch(() => setHoje(null));
  }, []);
  const sair = async () => { await getSupabaseClient()?.auth.signOut(); navigate('/entrar'); };
  const veem = ligacoes?.length ?? 0;
  const linhas: { icone: typeof Gear; titulo: string; sub: string; to: string }[] = [
    { icone: ShieldCheck, titulo: 'Privacidade e partilha', sub: ligacoes ? `${veem} ${veem === 1 ? 'organização vê' : 'organizações veem'} dados teus` : '…', to: '/eu/privacidade' },
    { icone: Wallet, titulo: 'O meu pack', sub: 'Sessões que faltam e pagamentos', to: '/eu/pack' },
    { icone: UserCircle, titulo: `Ligar a um ${t('responsavel')}`, sub: 'Código, QR ou convite', to: '/eu/treinador' },
    { icone: Gear, titulo: 'Definições', sub: 'Tema e consentimentos', to: '/eu/definicoes' },
  ];
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <Avatar nome={conta?.nome ?? '?'} tamanho={64} />
        <div style={{ minWidth: 0 }}>
          <h1 className="lc-cabeca__titulo">{conta?.nome ?? ' '}</h1>
          {ligacoes?.[0] && <span className="lv-legenda">{ligacoes[0].responsavel ? `Com ${ligacoes[0].responsavel} · ` : ''}{ligacoes[0].org}</span>}
        </div>
      </header>
      <div className="lc-par">
        <section className="lc-cartao lc-cartao--claro" aria-label="Organizações">
          <span className="lc-cartao__rotulo">Ligado a</span>
          <span className="lv-numero-grande">{ligacoes?.length ?? '…'}</span>
          <span className="lv-legenda">{ligacoes?.length === 1 ? 'organização' : 'organizações'}</span>
        </section>
        <section className="lc-cartao" aria-label="Esta semana">
          <span className="lc-cartao__rotulo">Esta semana</span>
          <span className="lv-numero-grande">{hoje?.feitosSemana ?? '…'}</span>
          <span className="lv-legenda">treinos</span>
        </section>
      </div>
      <nav className="lc-lista" aria-label="A minha conta">
        {linhas.map((l) => (
          <button key={l.to} type="button" className="lc-lista__linha" onClick={() => navigate(l.to)}>
            <span className="lc-lista__icone"><l.icone size={18} aria-hidden /></span>
            <span className="lv-linha-lista__corpo">
              <span className="lv-linha-lista__titulo">{l.titulo}</span>
              <span className="lv-legenda">{l.sub}</span>
            </span>
            <CaretRight size={16} aria-hidden />
          </button>
        ))}
      </nav>
      <Botao variante="secundario" icone={SignOut} onClick={() => void sair()}>Sair</Botao>
    </main>
  );
}

/* ── C-24 Privacidade e partilha ───────────────────────────────────────── */
const CATEGORIAS: { id: CategoriaPartilha; titulo: string; sub?: string }[] = [
  { id: 'training', titulo: 'Treino e resultados' },
  { id: 'measurements', titulo: 'Medidas e avaliações' },
  { id: 'photos', titulo: 'Fotos de progresso' },
  { id: 'checkins', titulo: 'Check-ins' },
  { id: 'health', titulo: 'Saúde e lesões', sub: 'Questionário e restrições' },
];

export function PrivacidadeCliente() {
  const navigate = useNavigate();
  const [ligacoes, setLigacoes] = useState<MinhaLigacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apagarEm, setApagarEm] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMinhasLigacoes(client).then(setLigacoes).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchPedidoApagar(client).then(setApagarEm).catch(() => setApagarEm(null));
  }, []);
  useEffect(() => carregar(), [carregar]);

  const mudar = async (l: MinhaLigacao, cat: CategoriaPartilha, ligar: boolean) => {
    const client = getSupabaseClient();
    if (!client || !ligacoes) return;
    const novas = ligar ? [...l.partilhas, cat] : l.partilhas.filter((c) => c !== cat);
    setLigacoes(ligacoes.map((x) => (x.linkId === l.linkId ? { ...x, partilhas: novas } : x)));
    try {
      await definirPartilhas(client, l.linkId, novas);
      toast({ variant: 'success', title: ligar ? `${l.org} passa a ver isto` : `${l.org} deixou de ver isto`, description: 'Já está em vigor e ficou registado.' });
    } catch (e) {
      setLigacoes(ligacoes);
      toast({ variant: 'danger', title: 'Não foi possível mudar', description: e instanceof Error ? e.message : undefined });
    }
  };
  const exportar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const blob = await exportarMeusDados(client);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = `os-meus-dados-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível exportar', description: e instanceof Error ? e.message : undefined }); }
  };
  const apagar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true);
    try { setApagarEm(await pedirApagarConta(client)); setConfirmar(false); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível pedir', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  const cancelar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await cancelarApagarConta(client).then(() => { setApagarEm(null); toast({ variant: 'success', title: 'A tua conta fica' }); })
      .catch((e) => toast({ variant: 'danger', title: 'Não foi possível cancelar', description: e instanceof Error ? e.message : undefined }));
  };

  return (
    <main className="lc-ecra">
      <Cabeca titulo="Privacidade e partilha" voltar={() => navigate('/eu')} />
      {apagarEm && (
        <Nota>A tua conta será apagada a {new Date(apagarEm).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })}.{' '}
          <button type="button" className="lc-link" onClick={() => void cancelar()}>Manter a conta</button>
        </Nota>
      )}
      {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
        : !ligacoes ? <Esqueleto />
        : ligacoes.length === 0 ? <EstadoPagina tipo="vazio" icone={ShieldCheck} titulo="Ninguém vê os teus dados" texto="Quando aceitares o convite de um treinador ou ginásio, escolhes aqui o que partilhas." />
        : ligacoes.map((l) => (
          <section key={l.linkId} className="lc-escolhas" aria-label={l.org}>
            <div className="lc-escolha">
              <Avatar nome={l.responsavel ?? l.org} tamanho={40} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="lv-linha-lista__titulo" style={{ display: 'block' }}>{l.responsavel ?? l.org}</span>
                <span className="lv-legenda">{l.responsavel ? `${l.org} · o teu ${t('responsavel')}` : `Desde ${new Date(l.desde).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}`}</span>
              </span>
            </div>
            {CATEGORIAS.map((c) => (
              <div key={c.id} className="lc-escolha">
                <span>
                  <span style={{ display: 'block' }}>{c.titulo}</span>
                  {c.sub && <span className="lv-legenda">{c.sub}</span>}
                </span>
                <Interruptor rotulo={`${c.titulo} com ${l.org}`} ligado={l.partilhas.includes(c.id)} onMudar={(v) => void mudar(l, c.id, v)} />
              </div>
            ))}
            <div className="lc-escolha">
              <span><span style={{ display: 'block' }}>Contacto e marcações</span><span className="lv-legenda">Necessário para o serviço</span></span>
              <span className="lv-pill">Sempre</span>
            </div>
          </section>
        ))}
      <AnaliseAnonima />
      <div className="lc-par">
        <Botao variante="secundario" onClick={() => void exportar()}>Exportar dados</Botao>
        {!apagarEm && <Botao variante="secundario" className="lc-perigo" onClick={() => setConfirmar(true)}>Apagar conta</Botao>}
      </div>
      <ConfirmarDestrutivo aberta={confirmar} titulo="Apagar a tua conta?" verbo="Apagar conta" manter="Manter" aCarregar={aGravar}
        texto="Tens 30 dias para mudar de ideias. Depois disso, a conta e os teus dados são apagados."
        efeitos={[{ texto: 'Os treinadores e ginásios deixam de ver os teus dados' }, { texto: 'Faturas e registos que a lei obriga a guardar ficam com a organização' }]}
        onConfirmar={() => void apagar()} onFechar={() => setConfirmar(false)} />
    </main>
  );
}

/* ── Definições ────────────────────────────────────────────────────────── */
export function DefinicoesCliente() {
  const navigate = useNavigate();
  const [tema, setTema] = useState<TemaId>(lerTema);
  const escolher = (t2: TemaId) => {
    setTema(t2);
    try { localStorage.setItem(TEMA_KEY, t2); } catch { /* conveniência */ }
    window.dispatchEvent(new CustomEvent('luna:tema', { detail: t2 }));
  };
  return (
    <main className="lc-ecra">
      <Cabeca titulo="Definições" voltar={() => navigate('/eu')} />
      <h2 className="lv-sobretitulo">Tema</h2>
      <div className="lc-temas" role="radiogroup" aria-label="Tema">
        {(['oceano', 'ouro', 'limao'] as TemaId[]).map((id) => (
          <button key={id} type="button" role="radio" aria-checked={tema === id} className="lc-tema" onClick={() => escolher(id)}>
            <span data-tema={id} className="lc-tema__amostra" aria-hidden><i /><i /></span>
            {id === 'oceano' ? 'Oceano' : id === 'ouro' ? 'Ouro' : 'Limão'}
          </button>
        ))}
      </div>
      <AvisosPrefs />
      <nav className="lc-lista" aria-label="Mais">
        <button type="button" className="lc-lista__linha" onClick={() => navigate('/conta/consentimentos')}>
          <span className="lc-lista__icone"><ShieldCheck size={18} aria-hidden /></span>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Consentimentos</span><span className="lv-legenda">Termos, privacidade e novidades</span></span>
          <CaretRight size={16} aria-hidden />
        </button>
      </nav>
    </main>
  );
}

/** Avisos (T29A): lembretes das sessões e horas de silêncio. Guardam logo ao mudar. */
function AvisosPrefs() {
  const { sessao } = useSessao();
  const uid = sessao?.user.id ?? null;
  const [a, setA] = useState<MeusAvisos | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !uid) return;
    void fetchMeusAvisos(client, uid).then(setA).catch(() => setA(null));
  }, [uid]);
  if (!a || !uid) return null;
  const mudar = (n: MeusAvisos) => {
    const antes = a;
    setA(n);
    const client = getSupabaseClient();
    if (!client) return;
    void guardarMeusAvisos(client, uid, n).catch(() => { setA(antes); toast({ variant: 'danger', title: 'Não foi possível guardar' }); });
  };
  return (
    <>
      <h2 className="lv-sobretitulo">Avisos</h2>
      <div className="lc-lista">
        <div className="lc-lista__linha" style={{ cursor: 'default' }}>
          <span className="lc-lista__icone"><Bell size={18} aria-hidden /></span>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Lembretes das {t('sessao', { plural: true })}</span>
            <span className="lv-legenda">Na véspera e 2 horas antes</span></span>
          <Interruptor rotulo="Lembretes" ligado={a.lembretes} onMudar={(v) => mudar({ ...a, lembretes: v })} />
        </div>
        <div className="lc-lista__linha" style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Horas de silêncio</span>
            <span className="lv-legenda">Nestas horas não te mandamos nada</span></span>
          <label className="lv-campo" style={{ width: 96 }}><span className="lv-campo-rotulo">Das</span>
            <input className="lv-campo-input" type="time" step={3600} value={a.silencioDe} onChange={(e) => e.target.value && mudar({ ...a, silencioDe: e.target.value })} /></label>
          <label className="lv-campo" style={{ width: 96 }}><span className="lv-campo-rotulo">Às</span>
            <input className="lv-campo-input" type="time" step={3600} value={a.silencioAte} onChange={(e) => e.target.value && mudar({ ...a, silencioAte: e.target.value })} /></label>
        </div>
      </div>
    </>
  );
}

/** C-24 · Análise anónima (T28): desligar tira-te de qualquer métrica individual, já e para trás. */
export function AnaliseAnonima() {
  const [sim, setSim] = useState<boolean | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchConsentimentoAnalise(client).then(setSim).catch(() => setSim(null));
  }, []);
  if (sim === null) return null;
  const mudar = (v: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    setSim(v);
    void definirConsentimentoAnalise(client, v)
      .then(() => toast({ variant: 'success', title: v ? 'Obrigado por ajudar' : 'Deixaste de contar nas métricas', description: v ? undefined : 'Ficou registado.' }))
      .catch(() => { setSim(!v); toast({ variant: 'danger', title: 'Não foi possível mudar' }); });
  };
  return (
    <section className="lc-escolhas" aria-label="Análise anónima">
      <div className="lc-escolha">
        <span>
          <span style={{ display: 'block' }}>Ajudar a melhorar a LunaOS</span>
          <span className="lv-legenda">Contamos o uso da app sem nomes, notas nem dados de saúde.</span>
        </span>
        <Interruptor rotulo="Ajudar a melhorar a LunaOS" ligado={sim} onMudar={mudar} />
      </div>
    </section>
  );
}
