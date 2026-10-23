import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  agendar, arquivarQuestionario, fetchPedidosDoCliente, retirarPedido, type PedidoCliente, avaliacaoLocal, chaveDeTeste, comecarAvaliacao, compararAvaliacao, duracaoProtocolo, enviarAgora, enviarAvaliacao,
  erroResposta, fecharAvaliacao, fetchAvaliacao, fetchClients, fetchProtocolos, fetchQuestionario, fetchQuestionarios, fetchResposta, fetchResumoAvaliacao,
  fetchVersaoAtual, guardarProtocolo, guardarQuestionario, invalidarValor, MODELO_PROTOCOLO, MODELOS_QUESTIONARIO, mudarTentativa, perguntaVisivel,
  publicarProtocolo, publicarQuestionario, rever, saltarTeste, tendencia, testesDe, TIPOS_PERGUNTA, TIPOS_QUESTIONARIO, toast, ultimosValores,
  useRede, validarPerguntas, valorGuardado, abrirConversaCliente, enviarMensagem, useAuthStore,
  type AvaliacaoDetalhe, type AvaliacaoLocal, type BlocoProtocolo, type ClientRow, type ItemAvaliar, type LinhaComparar, type Pergunta,
  type Protocolo, type Questionario, type RespostaDetalhe, type Respostas, type ResumoAvaliacao, type TesteProtocolo, type TipoPergunta,
  type TipoQuestionario,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Interruptor, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import {
  ArrowLeft, CalendarBlank, ChartLineUp, CheckCircle, ClipboardText, Eye, Heartbeat, Lock, Play, Plus, UploadSimple, Warning, WifiSlash, X,
} from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { VoltarA } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro');
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
const novoIdLocal = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10));
const ZONAS = ['joelho', 'anca', 'lombar', 'ombro', 'cotovelo', 'punho', 'tornozelo', 'cervical'];

/* ── G-20 · O que está por avaliar ──────────────────────────────────────── */
export function AvaliacaoInicio() {
  const scope = useScope();
  const navigate = useNavigate();
  const [r, setR] = useState<ResumoAvaliacao | null>(null);
  const [qs, setQs] = useState<Questionario[]>([]);
  const [ps, setPs] = useState<Protocolo[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [locais] = useState(() => avaliacaoLocal.todas());
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchResumoAvaliacao(client, scope).then(setR).catch((e) => setErro(erroDe(e)));
    void fetchQuestionarios(client, scope).then(setQs).catch(() => setQs([]));
    void fetchProtocolos(client, scope).then(setPs).catch(() => setPs([]));
  }, [scope]);
  const abrir = (x: ItemAvaliar) => {
    if (x.tipo === 'resposta') navigate(`/assessment/resposta/${x.id}`);
    else if (x.tipo === 'avaliacao') navigate(`/assessment/avaliacao/${x.id}`);
    else if (x.tipo === 'em_curso') navigate(`/assessment/aplicar?retomar=${x.id}`);
    else navigate(`/assessment/aplicar?cliente=${x.link_id}`);
  };
  const ICONE = { resposta: ClipboardText, avaliacao: ChartLineUp, em_atraso: Warning, em_curso: Play } as const;
  const ACAO = { resposta: 'Ler', avaliacao: 'Rever', em_atraso: 'Avaliar', em_curso: 'Continuar' } as const;
  return (
    <CoachShell headStrong="Avaliação" headSub="Esta semana" legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <Botao variante="secundario" icone={Play} onClick={() => navigate('/assessment/aplicar')}>Avaliar agora</Botao>
        <Botao icone={UploadSimple} onClick={() => navigate('/assessment/enviar')}>Enviar</Botao>
      </span>}>
      <div className="lv-root lg-vivo">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !r ? <Esqueleto /> : (
          <>
            <div className="lg-hoje__contagens">
              <div className="lg-contagem lg-contagem--acao"><span className="lg-contagem__rotulo"><CalendarBlank size={16} aria-hidden />Marcadas</span><span className="lv-numero-grande">{r.marcadas}</span>
                <span className="lg-contagem__legenda">{r.proxima ? `Próxima: ${r.proxima.nome} a ${dia(r.proxima.inicio)}` : 'Nenhuma marcada'}</span></div>
              <div className={`lg-contagem${r.em_atraso ? ' lg-contagem--aviso' : ''}`}><span className="lg-contagem__rotulo"><Warning size={16} aria-hidden />Em atraso</span><span className="lv-numero-grande">{r.em_atraso}</span>
                <span className="lg-contagem__legenda">Reavaliação passou da data</span></div>
              <div className="lg-contagem"><span className="lg-contagem__rotulo"><ClipboardText size={16} aria-hidden />Por responder</span><span className="lv-numero-grande">{r.por_responder}</span>
                <span className="lg-contagem__legenda">Questionários e check-ins enviados</span></div>
              <div className="lg-contagem"><span className="lg-contagem__rotulo"><ChartLineUp size={16} aria-hidden />Por ler</span><span className="lv-numero-grande">{r.por_ler}</span>
                <span className="lg-contagem__legenda">Respostas e avaliações por rever</span></div>
            </div>
            <div className="lg-hoje__grelha">
              <section className="lv-lista" aria-label="Para fazer">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Para fazer</h2>
                {locais.map((a) => (
                  <div key={a.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <WifiSlash size={18} aria-hidden />
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{a.cliente} · {a.protocolo}</span>
                      <span className="lv-legenda">Neste aparelho{a.versao > a.enviada ? ' · por enviar' : ''}</span></span>
                    <Botao variante="secundario" onClick={() => navigate(`/assessment/aplicar?retomar=${a.id}`)}>Continuar</Botao>
                  </div>
                ))}
                {r.fazer.length === 0 && locais.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada por fazer. Envia um check-in ou marca uma avaliação.</p> : r.fazer.map((x) => {
                  const Ic = ICONE[x.tipo];
                  return (
                    <div key={`${x.tipo}-${x.id}`} className="lv-linha-lista" style={{ cursor: 'default' }}>
                      <Ic size={18} aria-hidden />
                      <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.nome} · {x.titulo}</span>
                        <span className="lv-legenda">{x.detalhe}{x.saude ? ' · saúde' : ''}</span></span>
                      <Botao variante="secundario" onClick={() => abrir(x)}>{ACAO[x.tipo]}</Botao>
                    </div>
                  );
                })}
              </section>
              <aside className="lv-lista" aria-label="Modelos">
                <div className="lv-lista__cabeca"><h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Modelos</h2></div>
                {[...qs.filter((q) => !q.arquivado).map((q) => ({ id: q.id, nome: q.nome, tipo: TIPOS_QUESTIONARIO.find((t) => t.id === q.tipo)?.rotulo ?? 'Questionário', rota: `/assessment/questionario/${q.id}`, v: q.versao })),
                  ...ps.filter((p) => !p.arquivado).map((p) => ({ id: p.id, nome: p.nome, tipo: 'Protocolo', rota: `/assessment/protocolo/${p.id}`, v: p.versao }))].map((m) => (
                  <button key={m.id} type="button" className="lv-linha-lista" onClick={() => navigate(m.rota)}>
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{m.nome}</span><span className="lv-legenda">{m.v ? `versão ${m.v}` : 'Rascunho'}</span></span>
                    <span className="lv-pill">{m.tipo}</span>
                  </button>
                ))}
                <div className="lg-import__acoes" style={{ padding: 0, justifyContent: 'flex-start' }}>
                  <Botao variante="secundario" icone={Plus} onClick={() => navigate('/assessment/questionario/novo')}>Questionário</Botao>
                  <Botao variante="secundario" icone={Plus} onClick={() => navigate('/assessment/protocolo/novo')}>Protocolo</Botao>
                </div>
                <Nota icone={Lock}>O que o cliente responde sobre saúde só o PT responsável e quem tem acesso à saúde veem.</Nota>
              </aside>
            </div>
          </>
        )}
      </div>
    </CoachShell>
  );
}

/* ── G-21 · Construtor de questionário ──────────────────────────────────── */
export function ConstrutorQuestionario() {
  const { id = 'novo' } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const scope = useScope();
  const navigate = useNavigate();
  const [q, setQ] = useState<Questionario | null>(null);
  const [sel, setSel] = useState(0);
  const [previa, setPrevia] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (id === 'novo') {
      const m = MODELOS_QUESTIONARIO[Number(params.get('modelo') ?? 0)] ?? MODELOS_QUESTIONARIO[0];
      setQ({ id: '', nome: m.nome, tipo: m.tipo, saude: m.tipo === 'anamnese', perguntas: m.perguntas, versao: 0, arquivado: false, atualizado: '' });
      return;
    }
    const client = getSupabaseClient();
    if (client) void fetchQuestionario(client, id).then(setQ).catch((e) => toast({ variant: 'danger', title: 'Não foi possível abrir', description: erroDe(e) }));
  }, [id, params]);
  if (!q) return <CoachShell headStrong="Questionário" legado={false}><div className="lv-root"><Esqueleto /></div></CoachShell>;
  const p = q.perguntas[sel];
  const mudarP = (patch: Partial<Pergunta>) => setQ({ ...q, perguntas: q.perguntas.map((x, i) => (i === sel ? { ...x, ...patch } : x)) });
  const juntar = () => { setQ({ ...q, perguntas: [...q.perguntas, { id: `p_${novoIdLocal()}`, tipo: 'texto', texto: '' }] }); setSel(q.perguntas.length); };
  const tirar = (i: number) => { setQ({ ...q, perguntas: q.perguntas.filter((_, j) => j !== i) }); setSel(Math.max(0, i - 1)); };
  const mover = (i: number, d: number) => {
    const j = i + d; if (j < 0 || j >= q.perguntas.length) return;
    const a = [...q.perguntas]; [a[i], a[j]] = [a[j], a[i]]; setQ({ ...q, perguntas: a }); setSel(j);
  };
  const guardar = async (publicar: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    if (!q.nome.trim()) { toast({ variant: 'warning', title: 'Dá um nome ao questionário' }); return; }
    const falha = publicar ? validarPerguntas(q.perguntas) : null;
    if (falha) { toast({ variant: 'warning', title: 'Ainda não dá para publicar', description: falha }); return; }
    setAGravar(true);
    try {
      const nid = await guardarQuestionario(client, scope, { id: q.id || undefined, nome: q.nome, tipo: q.tipo, saude: q.saude, perguntas: q.perguntas });
      if (publicar) {
        const v = await publicarQuestionario(client, nid);
        toast({ variant: 'success', title: `Publicado · versão ${v}`, description: 'As respostas antigas ficam com a versão em que foram dadas.' });
        setQ({ ...q, id: nid, versao: v });
      } else { toast({ variant: 'success', title: 'Rascunho guardado' }); setQ({ ...q, id: nid }); }
      if (!q.id) navigate(`/assessment/questionario/${nid}`, { replace: true });
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
    finally { setAGravar(false); }
  };
  const anteriores = q.perguntas.slice(0, sel).filter((x) => x.tipo === 'sim_nao' || x.tipo === 'escolha' || x.tipo === 'escala');
  return (
    <CoachShell headStrong={q.nome || 'Novo questionário'} headSub={`Avaliação · Questionários · ${q.versao ? `versão ${q.versao}` : 'rascunho'}`} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <VoltarA omissao={{ rotulo: 'à Avaliação', href: '/assessment' }} />
        <Botao variante="secundario" icone={Eye} onClick={() => setPrevia(true)}>Pré-visualizar</Botao>
        <Botao variante="secundario" aCarregar={aGravar} onClick={() => void guardar(false)}>Guardar</Botao>
        <Botao icone={UploadSimple} aCarregar={aGravar} onClick={() => void guardar(true)}>Publicar</Botao>
      </span>}>
      <div className="lv-root lg-construtor">
        <div className="lg-ficha__coluna">
          <section className="lv-lista" aria-label="Questionário">
            <div className="lg-conta__prefs">
              <Campo rotulo="Nome" value={q.nome} onChange={(e) => setQ({ ...q, nome: e.target.value })} />
              <label className="lv-campo"><span className="lv-campo-rotulo">Tipo</span>
                <select className="lv-campo-input" value={q.tipo} onChange={(e) => setQ({ ...q, tipo: e.target.value as TipoQuestionario, saude: e.target.value === 'anamnese' || q.saude })}>
                  {TIPOS_QUESTIONARIO.map((t) => <option key={t.id} value={t.id}>{t.rotulo}</option>)}
                </select></label>
            </div>
            <div className="lv-linha-lista" style={{ cursor: 'default' }}>
              <Heartbeat size={18} aria-hidden />
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Respostas sobre saúde</span>
                <span className="lv-legenda">Só o PT responsável e quem tem acesso à saúde as veem. O cliente é avisado antes de responder.</span></span>
              <Interruptor rotulo="Respostas sobre saúde" ligado={q.saude} onMudar={(v) => setQ({ ...q, saude: v })} disabled={q.tipo === 'anamnese'} />
            </div>
          </section>
          {q.perguntas.map((x, i) => (
            <button key={x.id} type="button" className={`lv-lista lg-pergunta${i === sel ? ' lg-pergunta--ativa' : ''}`} onClick={() => setSel(i)}>
              <span className="lg-pergunta__n">{i + 1}</span>
              <span className="lv-linha-lista__corpo">
                <span className="lv-linha-lista__titulo">{x.texto || 'Pergunta sem texto'}{x.obrigatorio ? ' *' : ''}</span>
                {x.se && <span className="lv-legenda">Só se "{q.perguntas.find((y) => y.id === x.se?.pergunta)?.texto ?? '?'}" for {x.se.valores.map(String).join(' ou ').replace('true', 'sim').replace('false', 'não')}</span>}
                {x.tipo === 'foto' && <span className="lv-legenda"><Lock size={12} aria-hidden /> Só o PT vê as fotos</span>}
                {x.acao === 'avisar_pt' && <span className="lv-legenda">Se sim, avisa o PT</span>}
              </span>
              <span className="lv-pill">{TIPOS_PERGUNTA.find((t) => t.id === x.tipo)?.rotulo}{x.tipo === 'escala' ? ` ${x.min ?? 1} a ${x.max ?? 5}` : x.unidade ? ` · ${x.unidade}` : ''}</span>
            </button>
          ))}
          <Botao variante="secundario" icone={Plus} onClick={juntar}>Acrescentar pergunta</Botao>
        </div>
        <aside className="lv-lista lg-construtor__lado" aria-label="Pergunta">
          {!p ? <p className="lv-legenda" style={{ margin: 0 }}>Escolhe uma pergunta.</p> : (
            <>
              <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Pergunta {sel + 1}</h3>
              <Campo rotulo="Texto" value={p.texto} onChange={(e) => mudarP({ texto: e.target.value })} />
              <span className="lv-sobretitulo">Tipo</span>
              <div className="lg-ficha__metricas" role="radiogroup" aria-label="Tipo">
                {TIPOS_PERGUNTA.map((t) => <Chip key={t.id} role="radio" aria-checked={p.tipo === t.id} ativo={p.tipo === t.id} onClick={() => mudarP({ tipo: t.id as TipoPergunta })}>{t.rotulo}</Chip>)}
              </div>
              {(p.tipo === 'numero' || p.tipo === 'escala' || p.tipo === 'escolha_multipla') && (
                <div className="lg-conta__prefs">
                  <Campo rotulo="Mínimo" type="number" value={p.min ?? ''} onChange={(e) => mudarP({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  <Campo rotulo="Máximo" type="number" value={p.max ?? ''} onChange={(e) => mudarP({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                  {p.tipo === 'numero' && <Campo rotulo="Unidade" value={p.unidade ?? ''} onChange={(e) => mudarP({ unidade: e.target.value || undefined })} />}
                </div>
              )}
              {(p.tipo === 'escolha' || p.tipo === 'escolha_multipla') && (
                <label className="lv-campo"><span className="lv-campo-rotulo">Opções (uma por linha)</span>
                  <textarea className="lv-campo-input" rows={4} value={(p.opcoes ?? []).join('\n')} onChange={(e) => mudarP({ opcoes: e.target.value.split('\n') })} /></label>
              )}
              <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Obrigatória</span></span>
                <Interruptor rotulo="Obrigatória" ligado={!!p.obrigatorio} onMudar={(v) => mudarP({ obrigatorio: v })} />
              </div>
              {anteriores.length > 0 && (
                <label className="lv-campo"><span className="lv-campo-rotulo">Só aparece se</span>
                  <select className="lv-campo-input" value={p.se ? `${p.se.pergunta}|${String(p.se.valores[0])}` : ''}
                    onChange={(e) => {
                      if (!e.target.value) { mudarP({ se: undefined }); return; }
                      const [pid, v] = e.target.value.split('|');
                      mudarP({ se: { pergunta: pid, valores: [v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v] } });
                    }}>
                    <option value="">Aparece sempre</option>
                    {anteriores.flatMap((a) => (a.tipo === 'sim_nao' ? [true, false] : a.tipo === 'escala' ? Array.from({ length: (a.max ?? 5) - (a.min ?? 1) + 1 }, (_, i) => (a.min ?? 1) + i) : (a.opcoes ?? []))
                      .map((v) => <option key={`${a.id}|${String(v)}`} value={`${a.id}|${String(v)}`}>{a.texto} = {v === true ? 'sim' : v === false ? 'não' : String(v)}</option>))}
                  </select></label>
              )}
              {(p.tipo === 'escala' || p.tipo === 'sim_nao') && (
                <div className="lg-conta__prefs">
                  <Campo rotulo="Conta para (pontuação)" placeholder="Ex.: bem_estar" value={p.pontua?.dimensao ?? ''}
                    onChange={(e) => mudarP({ pontua: e.target.value ? { dimensao: e.target.value.toLowerCase().replace(/[^a-z_]/g, '_'), peso: p.pontua?.peso ?? 1 } : undefined })} />
                  {p.pontua && <Campo rotulo="Peso" type="number" min={0} step={0.1} value={p.pontua.peso} onChange={(e) => mudarP({ pontua: { ...p.pontua!, peso: Number(e.target.value) || 1 } })} />}
                </div>
              )}
              {p.tipo === 'sim_nao' && (
                <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Se sim, avisar o PT</span></span>
                  <Interruptor rotulo="Se sim, avisar o PT" ligado={p.acao === 'avisar_pt'} onMudar={(v) => mudarP({ acao: v ? 'avisar_pt' : undefined })} />
                </div>
              )}
              <div className="lg-import__acoes" style={{ padding: 0, justifyContent: 'flex-start' }}>
                <Botao variante="secundario" onClick={() => mover(sel, -1)}>Subir</Botao>
                <Botao variante="secundario" onClick={() => mover(sel, 1)}>Descer</Botao>
                <Botao variante="secundario" className="lg-perigo" onClick={() => tirar(sel)}>Tirar</Botao>
              </div>
              {q.id && <Botao variante="secundario" onClick={() => { const c = getSupabaseClient(); if (c) void arquivarQuestionario(c, q.id, true).then(() => navigate('/assessment')); }}>Arquivar questionário</Botao>}
            </>
          )}
        </aside>
      </div>
      <PreviaQuestionario aberta={previa} perguntas={q.perguntas} nome={q.nome} saude={q.saude} onFechar={() => setPrevia(false)} />
    </CoachShell>
  );
}

/** Pré-visualizar como o cliente vê (C-15): uma pergunta de cada vez. */
function PreviaQuestionario({ aberta, perguntas, nome, saude, onFechar }: { aberta: boolean; perguntas: Pergunta[]; nome: string; saude: boolean; onFechar: () => void }) {
  const [r, setR] = useState<Respostas>({});
  const [i, setI] = useState(0);
  useEffect(() => { if (aberta) { setR({}); setI(0); } }, [aberta]);
  const vis = perguntas.filter((q) => perguntaVisivel(q, r));
  const q = vis[i];
  const erro = q ? erroResposta(q, r[q.id] ?? null) : null;
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo={nome || 'Questionário'} sub={q ? `Pergunta ${i + 1} de ${vis.length} · como o cliente vê` : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        {saude && i === 0 && <Nota icone={Lock}>Só o teu PT e quem trata da saúde no ginásio veem estas respostas.</Nota>}
        {!q ? <p style={{ margin: 0 }}>Fim. O cliente envia aqui.</p> : (
          <>
            <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{q.texto}</h3>
            <CampoResposta q={q} v={r[q.id] ?? null} onMudar={(v) => setR({ ...r, [q.id]: v })} />
            {erro && <span className="lv-legenda" role="alert">{erro}</span>}
          </>
        )}
        <div className="lg-import__acoes" style={{ padding: 0 }}>
          <Botao variante="secundario" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</Botao>
          <Botao disabled={!q || !!erro} onClick={() => setI(i + 1)}>Seguinte</Botao>
        </div>
      </div>
    </Janela>
  );
}

export function CampoResposta({ q, v, onMudar }: { q: Pergunta; v: Respostas[string]; onMudar: (v: Respostas[string]) => void }) {
  if (q.tipo === 'escala') {
    const de = q.min ?? 1; const ate = q.max ?? 5;
    return (
      <div className="lg-escala" role="radiogroup" aria-label={q.texto}>
        {Array.from({ length: ate - de + 1 }, (_, k) => de + k).map((n) => <button key={n} type="button" role="radio" aria-checked={v === n} className="lg-escala__n" onClick={() => onMudar(n)}>{n}</button>)}
      </div>
    );
  }
  if (q.tipo === 'sim_nao') return <div className="lg-ficha__metricas"><Chip ativo={v === false} onClick={() => onMudar(false)}>Não</Chip><Chip ativo={v === true} onClick={() => onMudar(true)}>Sim</Chip></div>;
  if (q.tipo === 'escolha') return <div className="lg-ficha__metricas">{(q.opcoes ?? []).filter(Boolean).map((o) => <Chip key={o} ativo={v === o} onClick={() => onMudar(o)}>{o}</Chip>)}</div>;
  if (q.tipo === 'escolha_multipla') {
    const a = Array.isArray(v) ? v : [];
    return <div className="lg-ficha__metricas">{(q.opcoes ?? []).filter(Boolean).map((o) => <Chip key={o} ativo={a.includes(o)} onClick={() => onMudar(a.includes(o) ? a.filter((x) => x !== o) : [...a, o])}>{o}</Chip>)}</div>;
  }
  if (q.tipo === 'foto') return <Nota icone={Lock}>Na app, o cliente tira ou escolhe as fotos aqui. Só o PT as vê.</Nota>;
  const tipo = q.tipo === 'numero' ? 'number' : q.tipo === 'data' ? 'date' : q.tipo === 'hora' ? 'time' : 'text';
  return <Campo rotulo={q.unidade ? `Resposta (${q.unidade})` : 'Resposta'} type={tipo} inputMode={q.tipo === 'numero' ? 'decimal' : undefined}
    value={v == null ? '' : String(v)} onChange={(e) => onMudar(q.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value.replace(',', '.'))) : e.target.value)} />;
}

/* ── G-22 · Construtor de protocolo ─────────────────────────────────────── */
export function ConstrutorProtocolo() {
  const { id = 'novo' } = useParams<{ id: string }>();
  const scope = useScope();
  const navigate = useNavigate();
  const [p, setP] = useState<{ id: string; nome: string; blocos: BlocoProtocolo[]; versao: number } | null>(null);
  const [blocoAberto, setBlocoAberto] = useState(0);
  const [sel, setSel] = useState<{ b: number; t: number } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (id === 'novo') { setP({ id: '', nome: 'Reavaliação 8 semanas', blocos: MODELO_PROTOCOLO, versao: 0 }); return; }
    const client = getSupabaseClient();
    if (client) void fetchProtocolos(client, scope).then((l) => { const x = l.find((y) => y.id === id); if (x) setP({ id: x.id, nome: x.nome, blocos: x.blocos, versao: x.versao }); });
  }, [id, scope]);
  if (!p) return <CoachShell headStrong="Protocolo" legado={false}><div className="lv-root"><Esqueleto /></div></CoachShell>;
  const t = sel ? p.blocos[sel.b]?.testes[sel.t] : undefined;
  const mudarT = (patch: Partial<TesteProtocolo>) => sel && setP({ ...p, blocos: p.blocos.map((b, i) => (i !== sel.b ? b : { ...b, testes: b.testes.map((x, j) => (j === sel.t ? { ...x, ...patch } : x)) })) });
  const guardar = async (publicar: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true);
    try {
      const nid = await guardarProtocolo(client, scope, { id: p.id || undefined, nome: p.nome, blocos: p.blocos });
      if (publicar) {
        const v = await publicarProtocolo(client, nid);
        toast({ variant: 'success', title: `Publicado · versão ${v}`, description: 'Os resultados antigos ficam com a versão em que foram medidos.' });
        setP({ ...p, id: nid, versao: v });
      } else { toast({ variant: 'success', title: 'Rascunho guardado' }); setP({ ...p, id: nid }); }
      if (!p.id) navigate(`/assessment/protocolo/${nid}`, { replace: true });
    } catch (e) { toast({ variant: 'danger', title: 'Ainda não dá', description: erroDe(e) }); }
    finally { setAGravar(false); }
  };
  return (
    <CoachShell headStrong={p.nome || 'Novo protocolo'} headSub={`Avaliação · Protocolos · ${p.versao ? `versão ${p.versao}` : 'rascunho'}`} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <VoltarA omissao={{ rotulo: 'à Avaliação', href: '/assessment' }} />
        <Botao variante="secundario" aCarregar={aGravar} onClick={() => void guardar(false)}>Guardar</Botao>
        <Botao icone={UploadSimple} aCarregar={aGravar} onClick={() => void guardar(true)}>Publicar</Botao>
      </span>}>
      <div className="lv-root lg-construtor">
        <div className="lg-ficha__coluna">
          <Campo rotulo="Nome" value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} />
          {p.blocos.map((b, bi) => (bi !== blocoAberto ? (
            // G-22 (Figma 118:328): os outros blocos ficam fechados, com os testes num resumo
            <button key={bi} type="button" className="lv-lista lg-protocolo__fechado" onClick={() => { setBlocoAberto(bi); setSel(null); }}>
              <span className="lg-seg__quem"><span className="lg-vivo__bloco">{bi + 1}</span>
                <span><b>{b.titulo}</b><span className="lv-legenda" style={{ display: 'block' }}>{b.testes.map((x) => x.nome).join(', ') || 'Sem testes'}</span></span></span>
              <span className="lv-legenda">{b.testes.reduce((n, x) => n + 1 + x.tentativas, 0)} min</span>
            </button>
          ) : (
            <section key={bi} className="lv-lista lg-protocolo__aberto" aria-label={b.titulo}>
              <div className="lv-lista__cabeca">
                <span className="lg-seg__quem"><span className="lg-vivo__bloco">{bi + 1}</span>
                  <input className="lv-campo-input" aria-label="Nome do bloco" value={b.titulo} onChange={(e) => setP({ ...p, blocos: p.blocos.map((x, i) => (i === bi ? { ...x, titulo: e.target.value } : x)) })} /></span>
                <span className="lv-legenda">{b.testes.reduce((n, x) => n + 1 + x.tentativas, 0)} min</span>
              </div>
              <div className="lg-protocolo__linha lg-tabela__cabeca"><span>Teste</span><span>Tentativas</span><span>Unidade</span><span>Guarda</span></div>
              {b.testes.map((x, ti) => (
                <button key={x.chave} type="button" className={`lg-protocolo__linha${sel?.b === bi && sel.t === ti ? ' lg-protocolo__linha--ativa' : ''}`} onClick={() => setSel({ b: bi, t: ti })}>
                  <b>{x.nome}</b><span>{x.tentativas}</span><span>{x.unidade}</span><span>{x.tentativas > 1 ? (x.guarda === 'media' ? 'Média' : 'Melhor') : '—'}{x.menor_melhor ? ' · menor é melhor' : ''}</span>
                </button>
              ))}
              <Botao variante="secundario" icone={Plus} onClick={() => {
                const nome = `Teste ${b.testes.length + 1}`;
                setP({ ...p, blocos: p.blocos.map((y, i) => (i === bi ? { ...y, testes: [...y.testes, { chave: `${chaveDeTeste(nome)}_${novoIdLocal()}`, nome, unidade: 'kg', tentativas: 1 }] } : y)) });
                setSel({ b: bi, t: b.testes.length });
              }}>Juntar teste</Botao>
            </section>
          )))}
          <Botao variante="secundario" icone={Plus} onClick={() => { setP({ ...p, blocos: [...p.blocos, { titulo: 'Novo bloco', testes: [] }] }); setBlocoAberto(p.blocos.length); }}>Juntar bloco</Botao>
        </div>
        <aside className="lv-lista lg-construtor__lado" aria-label="Teste">
          {!t ? (
            <>
              <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{p.nome}</h3>
              <dl className="lg-conta__dados"><dt>Duração total</dt><dd>{duracaoProtocolo(p.blocos)} min</dd><dt>Testes</dt><dd>{testesDe(p).length}</dd></dl>
              <Nota>Mudar um protocolo publicado cria uma versão nova; os resultados antigos ficam com a versão em que foram medidos.</Nota>
            </>
          ) : (
            <>
              <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{t.nome}</h3>
              <Campo rotulo="Nome" value={t.nome} onChange={(e) => mudarT({ nome: e.target.value })} />
              <div className="lg-conta__prefs">
                <Campo rotulo="Unidade" value={t.unidade} onChange={(e) => mudarT({ unidade: e.target.value })} />
                <Campo rotulo="Tentativas" type="number" min={1} max={5} value={t.tentativas} onChange={(e) => mudarT({ tentativas: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
              </div>
              {t.tentativas > 1 && (
                <div className="lg-ficha__metricas" role="radiogroup" aria-label="Guarda">
                  <Chip ativo={t.guarda !== 'media'} onClick={() => mudarT({ guarda: 'melhor' })}>Guarda a melhor</Chip>
                  <Chip ativo={t.guarda === 'media'} onClick={() => mudarT({ guarda: 'media' })}>Guarda a média</Chip>
                </div>
              )}
              <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Menor é melhor</span><span className="lv-legenda">Cintura, tempo de corrida…</span></span>
                <Interruptor rotulo="Menor é melhor" ligado={!!t.menor_melhor} onMudar={(v) => mudarT({ menor_melhor: v })} />
              </div>
              <span className="lv-sobretitulo">Salta com restrição em</span>
              <div className="lg-ficha__metricas">
                {ZONAS.map((z) => <Chip key={z} ativo={(t.zonas ?? []).includes(z)} onClick={() => mudarT({ zonas: (t.zonas ?? []).includes(z) ? (t.zonas ?? []).filter((x) => x !== z) : [...(t.zonas ?? []), z] })}>{z}</Chip>)}
              </div>
              <label className="lv-campo"><span className="lv-campo-rotulo">Como se faz</span>
                <textarea className="lv-campo-input" rows={3} value={t.como ?? ''} onChange={(e) => mudarT({ como: e.target.value || undefined })} /></label>
              <Nota icone={Warning}>Clientes com restrição nestas zonas saltam este teste; fica "não feito", nunca zero.</Nota>
              <Botao variante="secundario" className="lg-perigo" onClick={() => { if (sel) { setP({ ...p, blocos: p.blocos.map((b, i) => (i === sel.b ? { ...b, testes: b.testes.filter((_, j) => j !== sel.t) } : b)) }); setSel(null); } }}>Tirar teste</Botao>
            </>
          )}
        </aside>
      </div>
    </CoachShell>
  );
}

/* ── G-24 · Enviar e agendar ────────────────────────────────────────────── */
const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export function EnviarPedido() {
  const scope = useScope();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [passo, setPasso] = useState(1);
  const [qs, setQs] = useState<Questionario[] | null>(null);
  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [form, setForm] = useState<string | null>(null);
  const [quem, setQuem] = useState<string[]>(params.get('cliente') ? [params.get('cliente')!] : []);
  const [busca, setBusca] = useState('');
  const [modo, setModo] = useState<'agora' | 'recorrente'>('agora');
  const [prazoDias, setPrazoDias] = useState(3);
  const [diaSemana, setDiaSemana] = useState(0);
  const [horaEnvio, setHoraEnvio] = useState(18);
  const [ateFim, setAteFim] = useState(true);
  const [lembrar, setLembrar] = useState(true);
  const [avisarPT, setAvisarPT] = useState(true);
  const [aEnviar, setAEnviar] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchQuestionarios(client, scope).then((l) => setQs(l.filter((q) => !q.arquivado))).catch(() => setQs([]));
    void fetchClients(client, scope).then(setClientes).catch(() => setClientes([]));
  }, [scope]);
  const f = qs?.find((q) => q.id === form);
  const filtrados = useMemo(() => { const t = busca.trim().toLocaleLowerCase('pt-PT'); return clientes.filter((c) => !t || c.name.toLocaleLowerCase('pt-PT').includes(t)).slice(0, 40); }, [clientes, busca]);
  const semApp = clientes.filter((c) => quem.includes(c.id) && !c.hasAccount).length;
  const enviar = async () => {
    const client = getSupabaseClient();
    if (!client || !form) return;
    setAEnviar(true);
    try {
      if (modo === 'agora') {
        const prazo = new Date(Date.now() + prazoDias * 86_400_000).toISOString();
        const n = await enviarAgora(client, scope, form, quem, prazo, lembrar);
        toast({ variant: 'success', title: `${n} ${n === 1 ? 'pedido enviado' : 'pedidos enviados'}`, description: 'Chegam à app, em Hoje.' });
      } else {
        await agendar(client, scope, { formId: form, links: quem, grupoId: null, diaSemana, hora: horaEnvio, prazoDias, ateFimDoPlano: ateFim, ate: null, lembrar, avisarPT });
        toast({ variant: 'success', title: 'Agendado', description: `Todas as semanas, ${DIAS_SEMANA[diaSemana].toLocaleLowerCase('pt-PT')} às ${horaEnvio}:00.` });
      }
      navigate('/assessment');
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível enviar', description: erroDe(e) }); }
    finally { setAEnviar(false); }
  };
  const PASSOS = [
    { n: 1, t: 'O quê', s: f ? f.nome : 'Escolhe o questionário' },
    { n: 2, t: 'Para quem', s: quem.length ? `${quem.length} ${quem.length === 1 ? vocab.pessoa() : vocab.pessoa({ plural: true })}` : 'Escolhe' },
    { n: 3, t: 'Quando', s: modo === 'agora' ? `Agora, prazo ${prazoDias} dias` : `Recorrente, ${DIAS_SEMANA[diaSemana].toLocaleLowerCase('pt-PT')}` },
    { n: 4, t: 'Confirmar', s: 'Rever e enviar' },
  ];
  return (
    <CoachShell headStrong="Enviar" headSub={f?.nome ?? 'Questionário ou check-in'} legado={false} topActions={<VoltarA omissao={{ rotulo: 'à Avaliação', href: '/assessment' }} />}>
      <div className="lv-root lg-construtor">
        <nav className="lg-ficha__coluna" aria-label="Passos">
          {PASSOS.map((x) => (
            <button key={x.n} type="button" className={`lv-lista lg-pergunta${passo === x.n ? ' lg-pergunta--ativa' : ''}`} disabled={x.n > passo && !(x.n === 2 && form) && !(x.n > 2 && form && quem.length)}
              onClick={() => setPasso(x.n)}>
              <span className="lg-pergunta__n">{x.n < passo ? <CheckCircle size={16} aria-hidden /> : x.n}</span>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.t}</span><span className="lv-legenda">{x.s}</span></span>
            </button>
          ))}
        </nav>
        <section className="lv-lista" aria-label={PASSOS[passo - 1].t}>
          <span className="lv-sobretitulo">Passo {passo} de 4</span>
          <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{['O que vais pedir?', 'Para quem?', 'Quando?', 'Confirmar'][passo - 1]}</h2>
          {passo === 1 && (!qs ? <Esqueleto linhas={3} /> : qs.length === 0
            ? <EstadoPagina tipo="vazio" icone={ClipboardText} titulo="Ainda sem questionários" texto="Cria o primeiro a partir de um modelo." acao={{ rotulo: 'Novo questionário', onClick: () => navigate('/assessment/questionario/novo') }} />
            : qs.map((q) => (
              <button key={q.id} type="button" className="lv-linha-lista" aria-pressed={form === q.id} disabled={!q.versao} onClick={() => setForm(q.id)}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{q.nome}</span>
                  <span className="lv-legenda">{q.versao ? `versão ${q.versao} · ${q.perguntas.length} perguntas` : 'Rascunho: publica antes de enviar'}{q.saude ? ' · saúde' : ''}</span></span>
                {form === q.id && <CheckCircle size={18} weight="fill" aria-hidden />}
              </button>
            )))}
          {passo === 2 && (
            <>
              <Campo rotulo="Procurar" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} />
              {filtrados.map((c) => (
                <button key={c.id} type="button" className="lv-linha-lista" aria-pressed={quem.includes(c.id)} onClick={() => setQuem(quem.includes(c.id) ? quem.filter((x) => x !== c.id) : [...quem, c.id])}>
                  <Avatar nome={c.name} tamanho={32} />
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.name}</span><span className="lv-legenda">{c.hasAccount ? 'Usa a app' : 'Sem app'}</span></span>
                  {quem.includes(c.id) && <CheckCircle size={18} weight="fill" aria-hidden />}
                </button>
              ))}
            </>
          )}
          {passo === 3 && (
            <>
              <div className="lg-ficha__metricas" role="radiogroup" aria-label="Quando">
                <Chip ativo={modo === 'agora'} onClick={() => setModo('agora')}>Agora, uma vez</Chip>
                <Chip ativo={modo === 'recorrente'} onClick={() => setModo('recorrente')}>Recorrente</Chip>
              </div>
              {modo === 'recorrente' && (
                <div className="lg-conta__prefs">
                  <label className="lv-campo"><span className="lv-campo-rotulo">Todas as semanas, ao</span>
                    <select className="lv-campo-input" value={diaSemana} onChange={(e) => setDiaSemana(Number(e.target.value))}>{DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
                  <Campo rotulo="Às (hora)" type="number" min={0} max={23} value={horaEnvio} onChange={(e) => setHoraEnvio(Math.min(23, Math.max(0, Number(e.target.value) || 0)))} />
                </div>
              )}
              <Campo rotulo="Prazo para responder (dias)" type="number" min={1} max={14} value={prazoDias} onChange={(e) => setPrazoDias(Math.min(14, Math.max(1, Number(e.target.value) || 1)))} />
              {modo === 'recorrente' && (
                <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Até ao fim do plano de cada um</span><span className="lv-legenda">Quem não tem plano ativo não recebe.</span></span>
                  <Interruptor rotulo="Até ao fim do plano" ligado={ateFim} onMudar={setAteFim} />
                </div>
              )}
              <span className="lv-sobretitulo">Lembretes</span>
              <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Na manhã do prazo, se não respondeu</span></span>
                <Interruptor rotulo="Lembrete no prazo" ligado={lembrar} onMudar={setLembrar} />
              </div>
              {modo === 'recorrente' && (
                <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Avisar-me de quem não respondeu</span></span>
                  <Interruptor rotulo="Avisar o PT" ligado={avisarPT} onMudar={setAvisarPT} />
                </div>
              )}
              {semApp > 0 && <Nota>{semApp} de {quem.length} não {semApp === 1 ? 'tem' : 'têm'} a app: convida-os primeiro para poderem responder.</Nota>}
            </>
          )}
          {passo === 4 && (
            <>
              <dl className="lg-conta__dados">
                <dt>O quê</dt><dd>{f?.nome} · versão {f?.versao}</dd>
                <dt>Para quem</dt><dd>{quem.length} {quem.length === 1 ? vocab.pessoa() : vocab.pessoa({ plural: true })}</dd>
                <dt>Quando</dt><dd>{modo === 'agora' ? 'Agora' : `${DIAS_SEMANA[diaSemana]} às ${horaEnvio}:00, todas as semanas${ateFim ? ' até ao fim do plano' : ''}`}</dd>
                <dt>Prazo</dt><dd>{prazoDias} dias{lembrar ? ' · com lembrete' : ''}</dd>
              </dl>
              {f?.saude && <Nota icone={Lock}>Antes da primeira pergunta, o cliente vê quem vai ler as respostas.</Nota>}
            </>
          )}
          <div className="lg-import__acoes" style={{ padding: 0 }}>
            <Botao variante="secundario" disabled={passo === 1} onClick={() => setPasso(passo - 1)}>Voltar</Botao>
            {passo < 4 ? <Botao disabled={(passo === 1 && !form) || (passo === 2 && !quem.length)} onClick={() => setPasso(passo + 1)}>Continuar</Botao>
              : <Botao icone={UploadSimple} aCarregar={aEnviar} onClick={() => void enviar()}>{modo === 'agora' ? 'Enviar' : 'Agendar'}</Botao>}
          </div>
        </section>
      </div>
    </CoachShell>
  );
}

/* ── G-25 · Respostas, resultados e check-ins ───────────────────────────── */
export function RespostaPagina() {
  const { id = '' } = useParams<{ id: string }>();
  const [r, setR] = useState<RespostaDetalhe | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (client) void fetchResposta(client, id).then(setR).catch((e) => setErro(erroDe(e)));
  }, [id]);
  useEffect(() => carregar(), [carregar]);
  const fechar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await rever(client, 'resposta', id, texto); toast({ variant: 'success', title: texto.trim() ? 'Resposta enviada' : 'Marcada como lida' }); setTexto(''); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) }); }
  };
  return (
    <CoachShell headStrong={r ? `${r.cliente} · ${r.nome}` : 'Resposta'} headSub={r ? `Avaliação · respondeu a ${dia(r.em)}` : undefined} legado={false}
      topActions={<VoltarA omissao={{ rotulo: 'à Avaliação', href: '/assessment' }} />}>
      <div className="lv-root">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível abrir" texto={erro} /> : !r ? <Esqueleto /> : (
          <div className="lg-hoje__grelha">
            <section className="lv-lista" aria-label="Respostas">
              {r.saude && <Nota icone={Lock}>Respostas sobre saúde: só tu e quem tem acesso à saúde as veem.</Nota>}
              {r.perguntas.filter((q) => perguntaVisivel(q, r.respostas)).map((q, i) => {
                const v = r.respostas[q.id];
                const alerta = q.acao === 'avisar_pt' && v === true;
                return (
                  <div key={q.id} className="lv-linha-lista" style={{ cursor: 'default', alignItems: 'flex-start' }}>
                    <span className="lg-pergunta__n">{i + 1}</span>
                    <span className="lv-linha-lista__corpo"><span className="lv-legenda">{q.texto}</span>
                      <span className="lv-linha-lista__titulo">{v == null || v === '' ? '—' : v === true ? 'Sim' : v === false ? 'Não' : Array.isArray(v) ? v.join(', ') : `${v}${q.unidade ? ` ${q.unidade}` : ''}`}</span></span>
                    {alerta && <Estado tom="aviso">Atenção</Estado>}
                  </div>
                );
              })}
              {Object.keys(r.pontos ?? {}).length > 0 && (
                <dl className="lg-conta__dados">{Object.entries(r.pontos).map(([k, v]) => <><dt key={`${k}t`}>{k.replace(/_/g, ' ')}</dt><dd key={`${k}d`}>{Number(v).toLocaleString('pt-PT')}</dd></>)}</dl>
              )}
            </section>
            <aside className="lv-lista" aria-label="Responder">
              <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{r.revista ? 'Lida' : 'Por ler'}</h3>
              {r.resposta && <Nota>Respondeste: {r.resposta}</Nota>}
              <label className="lv-campo"><span className="lv-campo-rotulo">Responder a {r.cliente.split(' ')[0]} (opcional)</span>
                <textarea className="lv-campo-input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
              <Botao onClick={() => void fechar()}>{texto.trim() ? 'Enviar e marcar como lida' : 'Marcar como lida'}</Botao>
            </aside>
          </div>
        )}
      </div>
    </CoachShell>
  );
}

export function ResultadoAvaliacao() {
  const modulos = useAuthStore((st) => st.modules);
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [a, setA] = useState<AvaliacaoDetalhe | null>(null);
  const [linhas, setLinhas] = useState<LinhaComparar[] | null>(null);
  const [chave, setChave] = useState<string | null>(null);
  const [serie, setSerie] = useState<{ em: string; valor: number }[]>([]);
  const [invalidar, setInvalidar] = useState<LinhaComparar | null>(null);
  const [motivo, setMotivo] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchAvaliacao(client, id).then(setA).catch((e) => setErro(erroDe(e)));
    void compararAvaliacao(client, id).then((l) => { setLinhas(l); setChave((c) => c ?? l.find((x) => x.estado === 'ok')?.chave ?? null); }).catch((e) => setErro(erroDe(e)));
  }, [id]);
  useEffect(() => carregar(), [carregar]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (client && a && chave) void tendencia(client, a.personId, chave).then(setSerie).catch(() => setSerie([]));
  }, [a, chave]);
  const fmt = (v: number | null, u: string) => (v == null ? '—' : `${v.toLocaleString('pt-PT')} ${u}`);
  const tom = (l: LinhaComparar): EstadoTom => (l.melhor == null ? 'neutro' : l.melhor ? 'ok' : 'erro');
  const confirmarInvalidar = async () => {
    const client = getSupabaseClient();
    if (!client || !invalidar) return;
    try { await invalidarValor(client, invalidar.valor_id, motivo); setInvalidar(null); setMotivo(''); toast({ variant: 'success', title: 'Valor invalidado', description: 'Saiu dos gráficos e ficou no histórico.' }); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) }); }
  };
  const responder = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await rever(client, 'avaliacao', id, texto);
      // Com mensagem e com as Mensagens ligadas, segue na conversa com o resultado anexado (G-25)
      if (texto.trim() && a && linhas && modulos.includes('messages')) {
        const ok = linhas.filter((l) => l.estado === 'ok');
        const conv = await abrirConversaCliente(client, a.linkId);
        await enviarMensagem(client, conv, texto, 'equipa', { tipo: 'resultado', meta: {
          titulo: `${a.protocolo} · ${dia(a.inicio)}`, resumo: `${ok.filter((l) => l.melhor).length} de ${ok.length} medidas melhoraram`, rota: '/progresso' } });
      }
      setTexto(''); toast({ variant: 'success', title: texto.trim() ? 'Enviado com o resultado' : 'Marcada como revista' }); carregar();
    }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) }); }
  };
  const melhorou = linhas?.filter((l) => l.estado === 'ok' && l.melhor).length ?? 0;
  const piorou = linhas?.filter((l) => l.estado === 'ok' && l.melhor === false) ?? [];
  return (
    <CoachShell headStrong={a ? `${a.cliente} · ${a.protocolo}` : 'Avaliação'} headSub={a ? `Avaliação · ${dia(a.inicio)} · versão ${a.versao}` : undefined} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <VoltarA omissao={{ rotulo: 'à Avaliação', href: '/assessment' }} />
        {a && <Botao variante="secundario" onClick={() => navigate(`/clients/${a.linkId}?sep=treino`)}>Ajustar plano</Botao>}
      </span>}>
      <div className="lv-root">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível abrir" texto={erro} /> : !linhas || !a ? <Esqueleto /> : (
          <div className="lg-hoje__grelha">
            <section className="lv-lista lg-tabela" aria-label="Comparar">
              <div className="lg-comparar lg-tabela__cabeca"><span>Medida</span><span className="lg-num">Antes</span><span className="lg-num">Agora</span><span className="lg-num">Mudou</span><span /></div>
              {linhas.map((l) => (
                <div key={l.chave} className={`lg-comparar${chave === l.chave ? ' lg-comparar--ativa' : ''}`}>
                  <button type="button" className="lg-link" onClick={() => setChave(l.chave)}>{l.nome}</button>
                  <span className="lg-num">{fmt(l.antes, l.unidade)}</span>
                  <span className="lg-num">{l.estado === 'nao_feito' ? (l.saltado ?? 'Não feito') : fmt(l.agora, l.unidade)}</span>
                  <span className="lg-num">{l.estado === 'invalidado' ? <Estado tom="neutro">Invalidado</Estado> : l.mudou == null ? '—' : <Estado tom={tom(l)}>{l.mudou > 0 ? '+' : ''}{l.mudou.toLocaleString('pt-PT')}</Estado>}</span>
                  <span>{l.estado === 'ok' && <Botao variante="secundario" onClick={() => setInvalidar(l)}>Invalidar</Botao>}</span>
                </div>
              ))}
              {linhas.filter((l) => l.estado === 'invalidado').map((l) => <Nota key={`m-${l.chave}`}>{l.nome}: invalidado — {l.motivo}</Nota>)}
              {chave && <Tendencia nome={linhas.find((l) => l.chave === chave)?.nome ?? ''} serie={serie} />}
            </section>
            <aside className="lg-ficha__coluna">
              <div className="lg-hoje__contagens" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="lg-contagem lg-contagem--acao"><span className="lg-contagem__rotulo">Melhorou</span><span className="lv-numero-grande">{melhorou}</span>
                  <span className="lg-contagem__legenda">de {linhas.filter((l) => l.estado === 'ok').length} medidas</span></div>
                <div className={`lg-contagem${piorou.length ? ' lg-contagem--aviso' : ''}`}><span className="lg-contagem__rotulo">A rever</span><span className="lv-numero-grande">{piorou.length}</span>
                  <span className="lg-contagem__legenda">{piorou.map((l) => l.nome).join(', ') || 'Nada'}</span></div>
              </div>
              <section className="lv-lista" aria-label="Responder">
                <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Responder a {a.cliente.split(' ')[0]}</h3>
                {a.resposta && <Nota>Enviaste: {a.resposta}</Nota>}
                <textarea className="lv-campo-input" rows={3} aria-label="Mensagem" placeholder="Ex.: menos 3 cm de cintura e mais 10 kg no agachamento." value={texto} onChange={(e) => setTexto(e.target.value)} />
                <Botao onClick={() => void responder()}>{texto.trim() ? 'Enviar com o resultado' : a.revista ? 'Revista' : 'Marcar como revista'}</Botao>
              </section>
            </aside>
          </div>
        )}
      </div>
      <Janela aberta={!!invalidar} onFechar={() => setInvalidar(null)} titulo={`Invalidar ${invalidar?.nome ?? ''}?`} sub="Sai dos gráficos e fica no histórico, com o motivo e quem.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <Campo rotulo="Motivo" placeholder="Ex.: dor no ombro durante o teste" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Botao disabled={!motivo.trim()} onClick={() => void confirmarInvalidar()}>Invalidar</Botao>
        </div>
      </Janela>
    </CoachShell>
  );
}

/** Tendência simples em SVG (só valores válidos; os invalidados já não vêm). */
function Tendencia({ nome, serie }: { nome: string; serie: { em: string; valor: number }[] }) {
  if (serie.length < 2) return <p className="lv-legenda" style={{ padding: 'var(--espaco-16)', margin: 0 }}>{nome}: a tendência aparece a partir de 2 avaliações.</p>;
  const L = 560; const A = 120; const min = Math.min(...serie.map((s) => s.valor)); const max = Math.max(...serie.map((s) => s.valor)); const r = max - min || 1;
  const pts = serie.map((s, i) => [(i / (serie.length - 1)) * (L - 16) + 8, A - 12 - ((s.valor - min) / r) * (A - 24)] as const);
  return (
    <figure style={{ margin: 0, padding: 'var(--espaco-16)' }}>
      <figcaption className="lv-linha-lista__titulo" style={{ display: 'flex', justifyContent: 'space-between' }}><span>{nome}</span><span className="lv-legenda">{serie.length} avaliações</span></figcaption>
      <svg viewBox={`0 0 ${L} ${A}`} width="100%" role="img" aria-label={`${nome}: ${serie.map((s) => s.valor).join(', ')}`}>
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth={2.5} className="lg-tendencia__linha" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 5 : 3} className={i === pts.length - 1 ? 'lg-tendencia__ultimo' : 'lg-tendencia__ponto'} />)}
      </svg>
    </figure>
  );
}

/* ── G-23 · Aplicar no terreno (sem rede) ───────────────────────────────── */
export function AplicarAvaliacao() {
  const scope = useScope();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const online = useRede((r) => r.online);
  const [a, setA] = useState<AvaliacaoLocal | null>(() => (params.get('retomar') ? avaliacaoLocal.ler(params.get('retomar')!) : null));
  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [protocolos, setProtocolos] = useState<Protocolo[]>([]);
  const [cliente, setCliente] = useState<string>(params.get('cliente') ?? '');
  const [protocolo, setProtocolo] = useState('');
  const [ultimos, setUltimos] = useState<Map<string, { valor: number; em: string }>>(new Map());
  const [resumo, setResumo] = useState(false);
  const [aFechar, setAFechar] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || a) return;
    void fetchClients(client, scope).then(setClientes).catch(() => setClientes([]));
    void fetchProtocolos(client, scope).then((l) => setProtocolos(l.filter((p) => p.versao > 0 && !p.arquivado))).catch(() => setProtocolos([]));
  }, [scope, a]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !a) return;
    void client.from('links').select('person_id').eq('id', a.linkId).single().then(({ data }) => { if (data) void ultimosValores(client, data.person_id).then(setUltimos); });
  }, [a?.linkId]); // eslint-disable-line react-hooks/exhaustive-deps
  const aplicar = (f: (x: AvaliacaoLocal) => AvaliacaoLocal) => setA((x) => { if (!x) return x; const n = f(x); avaliacaoLocal.guardar(n); return n; });
  useEffect(() => {
    if (!a || !online || a.versao <= a.enviada) return;
    const t = setTimeout(() => { void enviarAvaliacao(getSupabaseClient(), a).then((r) => setA((x) => (x ? { ...x, enviada: Math.max(x.enviada, r.enviada) } : x))); }, 800);
    return () => clearTimeout(t);
  }, [a, online]);
  const comecar = async () => {
    const client = getSupabaseClient();
    if (!client || !cliente || !protocolo) return;
    try {
      const v = await fetchVersaoAtual(client, protocolo);
      if (!v) throw new Error('Publica o protocolo antes de avaliar.');
      const nome = clientes.find((c) => c.id === cliente)?.name ?? '';
      // Só a zona (nunca o diagnóstico): os testes que a carregam ficam por fazer
      const { data: rs } = await client.from('restrictions').select('zone,kind').eq('link_id', cliente).is('revoked_at', null).in('kind', ['bloquear', 'adaptar']);
      const zonas = ZONAS.filter((zz) => (rs ?? []).some((r) => !r.zone || r.zone.toLowerCase().includes(zz)));
      const n = comecarAvaliacao({ linkId: cliente, cliente: nome, zonas, versaoId: v.id, nome: v.nome, blocos: v.blocos });
      avaliacaoLocal.guardar(n); setA(n);
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível começar', description: erroDe(e) }); }
  };
  if (!a) {
    return (
      <CoachShell headStrong="Avaliar" headSub="Avaliação física no terreno" legado={false} topActions={<VoltarA omissao={{ rotulo: 'à Avaliação', href: '/assessment' }} />}>
        <div className="lv-root"><section className="lv-lista" style={{ maxWidth: 560 }} aria-label="Começar">
          <label className="lv-campo"><span className="lv-campo-rotulo">{vocab.pessoa({ maiuscula: true })}</span>
            <select className="lv-campo-input" value={cliente} onChange={(e) => setCliente(e.target.value)}><option value="">Escolher</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="lv-campo"><span className="lv-campo-rotulo">Protocolo</span>
            <select className="lv-campo-input" value={protocolo} onChange={(e) => setProtocolo(e.target.value)}><option value="">Escolher</option>{protocolos.map((p) => <option key={p.id} value={p.id}>{p.nome} · v{p.versao}</option>)}</select></label>
          {protocolos.length === 0 && <Nota>Ainda não há protocolos publicados. <button type="button" className="lg-link" onClick={() => navigate('/assessment/protocolo/novo')}>Criar um</button></Nota>}
          <Nota>Fica tudo neste aparelho enquanto avalias; se a rede falhar, envia quando voltar.</Nota>
          <Botao icone={Play} disabled={!cliente || !protocolo} onClick={() => void comecar()}>Começar</Botao>
        </section></div>
      </CoachShell>
    );
  }
  const testes = testesDe(a);
  const t = testes[a.passo];
  const v = t ? a.valores.find((x) => x.chave === t.chave) : undefined;
  const fechar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAFechar(true);
    try { await fecharAvaliacao(client, a); toast({ variant: 'success', title: 'Avaliação fechada', description: 'Está em Avaliação para rever.' }); navigate(`/assessment/avaliacao/${a.id}`); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível fechar', description: erroDe(e) }); }
    finally { setAFechar(false); }
  };
  return (
    <CoachShell headStrong={resumo ? `Resumo de ${a.cliente.split(' ')[0]}` : t?.nome ?? 'Avaliação'} headSub={`${a.cliente} · ${resumo ? a.protocolo : `passo ${a.passo + 1} de ${testes.length}`}`} legado={false}
      topActions={<span className={a.versao > a.enviada ? 'lg-vivo__rede lg-vivo__rede--aviso' : 'lg-vivo__rede'} role="status">
        {!online ? <><WifiSlash size={14} aria-hidden /> Sem rede · guardado aqui</> : a.versao > a.enviada ? 'A enviar…' : <><CheckCircle size={14} aria-hidden /> Tudo enviado</>}
      </span>}>
      <div className="lv-root lg-aplicar">
        <div className="lg-aplicar__passos" aria-hidden>{testes.map((x, i) => <i key={x.chave} className={i < a.passo || resumo ? 'feito' : i === a.passo ? 'agora' : ''} />)}</div>
        {resumo ? (
          <section className="lv-lista" aria-label="Resumo">
            {testes.map((x) => {
              const vv = a.valores.find((y) => y.chave === x.chave);
              const val = vv ? valorGuardado(x, vv.tentativas) : null;
              const u = ultimos.get(x.chave);
              return (
                <div key={x.chave} className="lg-comparar">
                  <span>{x.nome}</span><span className="lg-num">{u ? `${u.valor} ${x.unidade}` : '—'}</span>
                  <span className="lg-num"><b>{vv?.saltado ? 'Não feito' : val == null ? '—' : `${val} ${x.unidade}`}</b></span>
                  <span className="lg-num">{val != null && u ? `${val - u.valor > 0 ? '+' : ''}${Math.round((val - u.valor) * 100) / 100}` : ''}</span><span />
                </div>
              );
            })}
            <div className="lv-linha-lista" style={{ cursor: 'default' }}>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Mostrar a {a.cliente.split(' ')[0]} na app</span></span>
              <Interruptor rotulo="Mostrar na app" ligado={a.mostrarCliente} onMudar={(m) => aplicar((x) => ({ ...x, mostrarCliente: m, versao: x.versao + 1 }))} />
            </div>
            {!online && <Nota icone={WifiSlash}>Sem rede: fecha quando a rede voltar; está tudo guardado.</Nota>}
            <div className="lg-import__acoes" style={{ padding: 0 }}>
              <Botao variante="secundario" icone={ArrowLeft} onClick={() => setResumo(false)}>Voltar aos testes</Botao>
              <Botao aCarregar={aFechar} disabled={!online} onClick={() => void fechar()}>Fechar avaliação</Botao>
            </div>
          </section>
        ) : t && v ? (
          <section className="lv-lista" aria-label={t.nome}>
            <div className="lg-aplicar__valor"><b>{valorGuardado(t, v.tentativas) ?? '—'}</b><span>{t.unidade}</span></div>
            <span className="lv-sobretitulo">Tentativas{t.tentativas > 1 ? ` · guarda ${t.guarda === 'media' ? 'a média' : t.menor_melhor ? 'a menor' : 'a melhor'}` : ''}</span>
            <div className="lg-aplicar__tentativas">
              {v.tentativas.map((x, i) => (
                <label key={i} className="lv-campo"><span className="lv-campo-rotulo">{i + 1}.ª</span>
                  <input className="lv-campo-input" inputMode="decimal" value={x ?? ''} onChange={(e) => aplicar((y) => mudarTentativa(y, t.chave, i, e.target.value === '' ? null : Number(e.target.value.replace(',', '.'))))} /></label>
              ))}
            </div>
            {ultimos.get(t.chave) && <Nota>Última vez · {ultimos.get(t.chave)!.valor} {t.unidade} a {dia(ultimos.get(t.chave)!.em)}</Nota>}
            {t.como && <Nota>{t.como}</Nota>}
            {v.saltado ? (
              <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                <X size={18} aria-hidden /><span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Não feito</span><span className="lv-legenda">{v.saltado}</span></span>
                <Botao variante="secundario" onClick={() => aplicar((y) => saltarTeste(y, t.chave, null))}>Fazer na mesma</Botao>
              </div>
            ) : <Botao variante="secundario" onClick={() => aplicar((y) => saltarTeste(y, t.chave, 'Não feito hoje'))}>Saltar este teste</Botao>}
            <div className="lg-import__acoes" style={{ padding: 0 }}>
              <Botao variante="secundario" disabled={a.passo === 0} onClick={() => aplicar((y) => ({ ...y, passo: y.passo - 1 }))}>Anterior</Botao>
              <Botao icone={CheckCircle} onClick={() => (a.passo + 1 < testes.length ? aplicar((y) => ({ ...y, passo: y.passo + 1 })) : setResumo(true))}>
                {valorGuardado(t, v.tentativas) != null ? `Guardar ${valorGuardado(t, v.tentativas)} ${t.unidade}` : 'Seguinte'}</Botao>
            </div>
          </section>
        ) : <EstadoPagina tipo="vazio" titulo="Protocolo sem testes" texto="Edita o protocolo." />}
      </div>
    </CoachShell>
  );
}

/* ── Na ficha do cliente: pedidos com histórico e retirar com motivo ────── */
const ESTADO_PEDIDO: Record<string, { tom: EstadoTom; texto: string }> = {
  pendente: { tom: 'aviso', texto: 'Por responder' }, respondido: { tom: 'ok', texto: 'Respondido' }, retirado: { tom: 'neutro', texto: 'Retirado' }, expirado: { tom: 'erro', texto: 'Expirou' },
};
export function PedidosCliente({ linkId }: { linkId: string }) {
  const navigate = useNavigate();
  const [l, setL] = useState<PedidoCliente[] | null>(null);
  const [retirar, setRetirar] = useState<PedidoCliente | null>(null);
  const [motivo, setMotivo] = useState('');
  const carregar = useCallback(() => { const c = getSupabaseClient(); if (c) void fetchPedidosDoCliente(c, linkId).then(setL).catch(() => setL([])); }, [linkId]);
  useEffect(() => carregar(), [carregar]);
  const confirmar = async () => {
    const c = getSupabaseClient();
    if (!c || !retirar) return;
    try { await retirarPedido(c, retirar.id, motivo); setRetirar(null); setMotivo(''); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível retirar', description: erroDe(e) }); }
  };
  return (
    <section className="lv-lista" aria-label="Questionários e avaliações">
      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Questionários e avaliações</h3>
        <span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
          <Botao variante="secundario" onClick={() => navigate(`/assessment/enviar?cliente=${linkId}`)}>Enviar</Botao>
          <Botao variante="secundario" icone={Play} onClick={() => navigate(`/assessment/aplicar?cliente=${linkId}`)}>Avaliar</Botao>
        </span></div>
      {!l ? <Esqueleto linhas={2} /> : l.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ainda nada enviado.</p> : l.map((p) => (
        <div key={p.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{p.nome}</span>
            <span className="lv-legenda">{[`Enviado ${dia(p.criado)}`, p.aberto && `aberto ${dia(p.aberto)}`, p.respondido && `respondido ${dia(p.respondido)}`, p.motivo && `retirado: ${p.motivo}`].filter(Boolean).join(' · ')}</span></span>
          <Estado tom={ESTADO_PEDIDO[p.estado]?.tom ?? 'neutro'}>{ESTADO_PEDIDO[p.estado]?.texto ?? p.estado}</Estado>
          {p.estado === 'pendente' && <Botao variante="secundario" onClick={() => setRetirar(p)}>Retirar</Botao>}
        </div>
      ))}
      <Janela aberta={!!retirar} onFechar={() => setRetirar(null)} titulo="Retirar este pedido?" sub="O cliente deixa de o ver; fica no histórico.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <Campo rotulo="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Botao disabled={!motivo.trim()} onClick={() => void confirmar()}>Retirar</Botao>
        </div>
      </Janela>
    </section>
  );
}
