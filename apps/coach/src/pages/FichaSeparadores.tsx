import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  arquivarCliente, CATEGORIA_OBJETIVO, concluirMarco, concluirRevisao, ConflitoError, criarMarco, criarObjetivo, DuplicateClientError,
  editarDadosCliente, ESTADO_OBJETIVO, fetchAtividade, fetchDadosCliente, fetchMetricasCliente, fetchObjetivos, fetchPlans, fetchProgresso,
  fetchProximos, marcarRevisao, mudarEstadoObjetivo, procurarDuplicados, reativarCliente, toast,
  type DadosCliente, type Duplicado, type EventoAtividade, type Evidencia, type MetricaCliente, type Objetivo, type OrigemAtividade,
  type Progresso, type Proximo,
} from '@luna/core';
import type { GoalRow, ReviewRow } from '@luna/core';
import { AvisoSecao, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { ArrowsClockwise, Barbell, CalendarBlank, CaretRight, ChartLineUp, Check, ClipboardText, Plus, Users } from '@luna/icons';
import { AvisoDuplicado } from '../app/ClientesP07';
import { JanelaConflito } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';

const dia = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) : '—');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
const fmt = (n: number | null, casas = 1) => (n == null ? '—' : n.toLocaleString('pt-PT', { maximumFractionDigits: casas }));
const TOM: Record<GoalRow['status'], EstadoTom> = { no_caminho: 'ok', em_risco: 'aviso', atingido: 'ok', parado: 'neutro' };

/* ── Progresso (Figma 163:2) ───────────────────────────────────────────── */
function Grafico({ p, unidade }: { p: Progresso; unidade: string | null }) {
  const W = 600; const H = 160; const pad = 8;
  const todos = [...p.atual, ...p.anterior].map((x) => x.valor);
  if (p.atual.length === 0) return <p className="lv-legenda" style={{ margin: 0 }}>Sem registos neste período.</p>;
  const min = Math.min(...todos); const max = Math.max(...todos);
  const y = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const linha = (pts: { valor: number }[]) => pts.map((q, i) => `${pad + (i / Math.max(1, pts.length - 1)) * (W - 2 * pad)},${y(q.valor)}`).join(' ');
  const ult = p.atual[p.atual.length - 1];
  return (
    <figure className="lg-grafico" style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Último valor ${fmt(ult.valor)} ${unidade ?? ''}`} preserveAspectRatio="none">
        {p.anterior.length > 1 && <polyline points={linha(p.anterior)} className="lg-grafico__anterior" />}
        <polyline points={linha(p.atual)} className="lg-grafico__atual" />
        <circle cx={W - pad} cy={y(ult.valor)} r={5} className="lg-grafico__ponto" />
      </svg>
      <figcaption className="lv-legenda">
        <span className="lg-grafico__leg lg-grafico__leg--atual" />Este período · {fmt(ult.valor)} {unidade ?? ''}
        {p.anterior.length > 0 && <><span className="lg-grafico__leg lg-grafico__leg--anterior" />Período anterior</>}
      </figcaption>
    </figure>
  );
}

export function ProgressoTab({ linkId, nome }: { linkId: string; nome: string }) {
  const navigate = useNavigate();
  const [metricas, setMetricas] = useState<MetricaCliente[] | null>(null);
  const [metrica, setMetrica] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<'7d' | '28d' | 'epoca'>('28d');
  const [p, setP] = useState<Progresso | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMetricasCliente(client, linkId).then((m) => { setMetricas(m); setMetrica((x) => x ?? m[0]?.chave ?? null); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [linkId]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !metrica) return;
    setP(null);
    void fetchProgresso(client, linkId, metrica, periodo).then(setP).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [linkId, metrica, periodo]);
  const m = metricas?.find((x) => x.chave === metrica);
  const ultimo = p?.atual[p.atual.length - 1];
  const abrirOrigem = (k: string, id: string | null) => {
    if (k === 'sessao' && id) navigate(`/live/${id}`);
    else toast({ variant: 'info', title: k === 'medida' ? 'Registo de medida' : 'Origem', description: 'O detalhe abre na Avaliação (próxima tarefa).' });
  };
  if (erro) return <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar o progresso: ${erro}`} />;
  if (!metricas) return <Esqueleto />;
  return (
    <div className="lg-ficha__grelha">
      <div className="lg-ficha__coluna">
        <section className="lv-lista" aria-label="Progresso">
          <div className="lv-lista__cabeca">
            <h3 className="lv-titulo-cartao">{m?.nome ?? 'Progresso'}</h3>
            <div role="radiogroup" aria-label="Período" style={{ display: 'flex', gap: 'var(--espaco-4)' }}>
              {(['7d', '28d', 'epoca'] as const).map((x) => (
                <Chip key={x} role="radio" aria-checked={periodo === x} ativo={periodo === x} onClick={() => setPeriodo(x)}>{x === '7d' ? '7 dias' : x === '28d' ? '28 dias' : 'Época'}</Chip>
              ))}
            </div>
          </div>
          <div role="radiogroup" aria-label="Métrica" className="lg-ficha__metricas">
            {metricas.map((x) => <Chip key={x.chave} role="radio" aria-checked={metrica === x.chave} ativo={metrica === x.chave} onClick={() => setMetrica(x.chave)}>{x.nome}</Chip>)}
          </div>
          {!p ? <Esqueleto linhas={3} /> : <Grafico p={p} unidade={m?.unidade ?? null} />}
        </section>
        {p && p.atual.length > 0 && (
          <section className="lv-lista" aria-label="Valores">
            <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Valores e de onde vieram</h3>
            {[...p.atual].reverse().slice(0, 8).map((x, i) => (
              <button key={`${x.em}-${i}`} type="button" className="lv-linha-lista" onClick={() => abrirOrigem(x.refKind, x.refId)}>
                <span className="lv-linha-lista__corpo">
                  <span className="lv-linha-lista__titulo">{x.detalhe}</span>
                  <span className="lv-legenda">{dia(x.em)} · {x.refKind === 'sessao' ? 'sessão' : x.refKind === 'questionario' ? 'questionário' : x.refKind === 'semana' ? 'semana' : 'medida registada'}</span>
                </span>
                <CaretRight size={16} aria-hidden />
              </button>
            ))}
          </section>
        )}
      </div>
      <aside className="lv-lista lg-ficha__lado" aria-label="Comparar">
        <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Comparar</h3>
        <dl className="lg-conta__dados">
          <dt>Período anterior</dt><dd>{p?.variacao == null ? '—' : `${p.variacao > 0 ? '+' : ''}${fmt(p.variacao)}%`}</dd>
          <dt>Base de {nome.split(' ')[0]}</dt><dd>{fmt(p?.base ?? null)} {m?.unidade ?? ''}</dd>
          <dt>Mínimo · máximo</dt><dd>{fmt(p?.minimo ?? null)} · {fmt(p?.maximo ?? null)}</dd>
          <dt>Registos</dt><dd>{p?.atual.length ?? '—'}</dd>
        </dl>
        {ultimo && <Botao variante="secundario" onClick={() => abrirOrigem(ultimo.refKind, ultimo.refId)}>Abrir a origem do último</Botao>}
      </aside>
    </div>
  );
}

/* ── Objetivos e revisões (Figma 163:180) ──────────────────────────────── */
export function ObjetivosTab({ linkId, nome, soLeitura }: { linkId: string; nome: string; soLeitura: boolean }) {
  const [dados, setDados] = useState<{ objetivos: Objetivo[]; revisoes: ReviewRow[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [marcoPara, setMarcoPara] = useState<Objetivo | null>(null);
  const [concluir, setConcluir] = useState<{ id: string; titulo: string } | null>(null);
  const [estado, setEstado] = useState<Objetivo | null>(null);
  const [revisao, setRevisao] = useState<ReviewRow | 'nova' | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchObjetivos(client, linkId).then(setDados).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [linkId]);
  useEffect(() => carregar(), [carregar]);
  if (erro) return <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar os objetivos: ${erro}`} />;
  if (!dados) return <Esqueleto />;
  const proxima = dados.revisoes.filter((r) => !r.done_at).sort((a, b) => a.scheduled_on.localeCompare(b.scheduled_on))[0];
  const ultima = dados.revisoes.find((r) => r.done_at);
  const marcos = dados.objetivos.flatMap((o) => o.marcos.map((m) => ({ ...m, objetivo: o })));
  const hoje = new Date().toISOString().slice(0, 10);
  return (
    <div className="lg-ficha__grelha">
      <div className="lg-ficha__coluna">
        <section className="lv-lista" aria-label="Objetivos">
          <div className="lv-lista__cabeca">
            <h3 className="lv-titulo-cartao">Objetivos</h3>
            {!soLeitura && <Botao variante="secundario" icone={Plus} onClick={() => setNovo(true)}>Objetivo</Botao>}
          </div>
          {dados.objetivos.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ainda sem objetivos. Começa pelo que {nome.split(' ')[0]} quer conseguir.</p>
            : dados.objetivos.map((o, i) => (
              <div key={o.id} className="lg-objetivo">
                <span className="lg-objetivo__n">{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="lv-linha-lista__titulo">{o.title}</span>
                  <span className="lv-legenda" style={{ display: 'block' }}>{[o.criterion, o.due_on ? `até ${dia(o.due_on)}` : null].filter(Boolean).join(' · ')}</span>
                  <div className="lg-ficha__pills">
                    <span className="lv-pill">{CATEGORIA_OBJETIVO[o.category]}</span>
                    <Estado tom={TOM[o.status]}>{ESTADO_OBJETIVO[o.status]}{o.status_note ? ` · ${o.status_note}` : ''}</Estado>
                    <span className="lv-legenda">avaliado a {dia(o.status_at)}</span>
                  </div>
                </div>
                {!soLeitura && (
                  <div style={{ display: 'flex', gap: 'var(--espaco-8)', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <Botao variante="secundario" onClick={() => setEstado(o)}>Avaliar</Botao>
                    <Botao variante="secundario" onClick={() => setMarcoPara(o)}>Marco</Botao>
                  </div>
                )}
              </div>
            ))}
        </section>
        <section className="lv-lista" aria-label="Marcos">
          <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Marcos</h3><span className="lv-legenda">concluir pede uma evidência</span></div>
          {marcos.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem marcos.</p>
            : marcos.map((m) => (
              <div key={m.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className={`lg-conta__ponto${m.done_at ? ' lg-conta__ponto--ativo' : ''}`} aria-hidden />
                <span className="lv-linha-lista__corpo">
                  <span className="lv-linha-lista__titulo">{m.title}</span>
                  <span className="lv-legenda">{m.done_at ? `Concluído a ${dia(m.done_at)} · evidência: ${m.evidence_note ?? m.evidence_kind}` : `${m.due_on && m.due_on < hoje ? 'Em atraso' : 'Em curso'}${m.due_on ? ` · prazo ${dia(m.due_on)}` : ''}`}</span>
                </span>
                <span className="lv-pill">Objetivo {dados.objetivos.indexOf(m.objetivo) + 1}</span>
                {!m.done_at && !soLeitura && <Botao variante="secundario" onClick={() => setConcluir({ id: m.id, titulo: m.title })}>Concluir</Botao>}
              </div>
            ))}
        </section>
      </div>
      <div className="lg-ficha__coluna">
        <aside className="lv-lista" aria-label="Revisões">
          <div className="lv-lista__cabeca">
            <h3 className="lv-titulo-cartao">Revisões</h3>
            {proxima?.every_weeks && <span className="lv-legenda">a cada {proxima.every_weeks} semanas</span>}
          </div>
          <dl className="lg-conta__dados">
            <dt>Próxima</dt><dd>{proxima ? dia(proxima.scheduled_on) : '—'}</dd>
            <dt>Revê</dt><dd>{proxima?.goal_ids.length ? proxima.goal_ids.map((g) => `Objetivo ${dados.objetivos.findIndex((o) => o.id === g) + 1}`).join(', ') : '—'}</dd>
          </dl>
          {ultima && <Nota>Última · {dia(ultima.done_at)}: {ultima.decision}</Nota>}
          {!soLeitura && (proxima
            ? <Botao onClick={() => setRevisao(proxima)}>Concluir revisão</Botao>
            : <Botao variante="secundario" onClick={() => setRevisao('nova')}>Marcar revisão</Botao>)}
        </aside>
        <aside className="lv-lista" aria-label="Recursos ligados">
          <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Recursos ligados</h3>
          {dados.objetivos.flatMap((o, i) => o.recursos.map((r) => (
            <div key={r.id} className="lg-conta__dados" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{r.label} · {r.kind}</span><b>Objetivo {i + 1}</b>
            </div>
          )))}
          {dados.objetivos.every((o) => o.recursos.length === 0) && <p className="lv-legenda" style={{ margin: 0 }}>Liga planos ou treinos a um objetivo quando os atribuíres.</p>}
        </aside>
        <Nota>{nome.split(' ')[0]} vê objetivos e marcos na app, só para leitura.</Nota>
      </div>

      <NovoObjetivo aberta={novo} onFechar={() => setNovo(false)} onCriado={carregar} linkId={linkId} />
      <NovoMarco objetivo={marcoPara} onFechar={() => setMarcoPara(null)} onCriado={carregar} />
      <ConcluirMarco marco={concluir} onFechar={() => setConcluir(null)} onFeito={carregar} />
      <AvaliarObjetivo objetivo={estado} onFechar={() => setEstado(null)} onFeito={carregar} />
      <Revisao revisao={revisao} objetivos={dados.objetivos} linkId={linkId} onFechar={() => setRevisao(null)} onFeito={carregar} />
    </div>
  );
}

function NovoObjetivo({ aberta, linkId, onFechar, onCriado }: { aberta: boolean; linkId: string; onFechar: () => void; onCriado: () => void }) {
  const scope = useScope();
  const [titulo, setTitulo] = useState(''); const [criterio, setCriterio] = useState(''); const [ate, setAte] = useState('');
  const [categoria, setCategoria] = useState<GoalRow['category']>('fisico'); const [prioridade, setPrioridade] = useState(1);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (aberta) { setTitulo(''); setCriterio(''); setAte(''); setCategoria('fisico'); setPrioridade(1); } }, [aberta]);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true);
    try { await criarObjetivo(client, scope, linkId, { titulo, criterio, categoria, prioridade, ate }); onFechar(); onCriado(); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível criar', description: err instanceof Error ? err.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Novo objetivo">
      <form onSubmit={(e) => void criar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Objetivo" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ex.: Agachar 100 kg × 5" />
        <Campo rotulo="Critério" value={criterio} onChange={(e) => setCriterio(e.target.value)} placeholder="Ex.: 5 repetições com RPE até 8" />
        <div role="radiogroup" aria-label="Categoria" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {(Object.keys(CATEGORIA_OBJETIVO) as GoalRow['category'][]).map((c) => (
            <Chip key={c} role="radio" aria-checked={categoria === c} ativo={categoria === c} onClick={() => setCategoria(c)}>{CATEGORIA_OBJETIVO[c]}</Chip>
          ))}
        </div>
        <Campo rotulo="Prioridade" type="number" min={1} max={20} value={prioridade} onChange={(e) => setPrioridade(Number(e.target.value) || 1)} />
        <Campo rotulo="Até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Botao type="submit" aCarregar={aGravar}>Criar objetivo</Botao>
      </form>
    </Janela>
  );
}

function NovoMarco({ objetivo, onFechar, onCriado }: { objetivo: Objetivo | null; onFechar: () => void; onCriado: () => void }) {
  const scope = useScope();
  const [titulo, setTitulo] = useState(''); const [ate, setAte] = useState('');
  useEffect(() => { setTitulo(''); setAte(''); }, [objetivo]);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !objetivo) return;
    try { await criarMarco(client, scope, objetivo.id, titulo, ate); onFechar(); onCriado(); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível criar', description: err instanceof Error ? err.message : undefined }); }
  };
  return (
    <Janela aberta={!!objetivo} onFechar={onFechar} titulo="Novo marco" sub={objetivo?.title}>
      <form onSubmit={(e) => void criar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Marco" value={titulo} onChange={(e) => setTitulo(e.target.value)} required placeholder="Ex.: Agachamento 90 kg × 5" />
        <Campo rotulo="Prazo" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        <Botao type="submit">Criar marco</Botao>
      </form>
    </Janela>
  );
}

const EVIDENCIAS: { id: Evidencia; rotulo: string }[] = [
  { id: 'sessao', rotulo: 'Sessão' }, { id: 'avaliacao', rotulo: 'Avaliação' }, { id: 'questionario', rotulo: 'Questionário' }, { id: 'nota', rotulo: 'Nota ou vídeo' },
];
function ConcluirMarco({ marco, onFechar, onFeito }: { marco: { id: string; titulo: string } | null; onFechar: () => void; onFeito: () => void }) {
  const [tipo, setTipo] = useState<Evidencia>('sessao'); const [nota, setNota] = useState(''); const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { setTipo('sessao'); setNota(''); setErro(null); }, [marco]);
  const concluir = async () => {
    const client = getSupabaseClient();
    if (!client || !marco) return;
    try { await concluirMarco(client, marco.id, tipo, null, nota); toast({ variant: 'success', title: 'Marco concluído' }); onFechar(); onFeito(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível concluir.'); }
  };
  return (
    <Janela aberta={!!marco} onFechar={onFechar} titulo={`Concluir: ${marco?.titulo ?? ''}`} sub="Um marco só se conclui com uma evidência."
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao disabled={!nota.trim()} onClick={() => void concluir()}>Concluir</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div role="radiogroup" aria-label="Evidência" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {EVIDENCIAS.map((x) => <Chip key={x.id} role="radio" aria-checked={tipo === x.id} ativo={tipo === x.id} onClick={() => setTipo(x.id)}>{x.rotulo}</Chip>)}
        </div>
        <Campo rotulo="Qual" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: sessão de 2 out, 90 kg × 5 com RPE 8" erro={erro} />
      </div>
    </Janela>
  );
}

function AvaliarObjetivo({ objetivo, onFechar, onFeito }: { objetivo: Objetivo | null; onFechar: () => void; onFeito: () => void }) {
  const [estado, setEstado] = useState<GoalRow['status']>('no_caminho'); const [nota, setNota] = useState('');
  useEffect(() => { if (objetivo) { setEstado(objetivo.status); setNota(objetivo.status_note ?? ''); } }, [objetivo]);
  const gravar = async () => {
    const client = getSupabaseClient();
    if (!client || !objetivo) return;
    try { await mudarEstadoObjetivo(client, objetivo.id, estado, nota); onFechar(); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível gravar', description: e instanceof Error ? e.message : undefined }); }
  };
  return (
    <Janela aberta={!!objetivo} onFechar={onFechar} titulo="Como está este objetivo?" sub={objetivo?.title}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao onClick={() => void gravar()}>Guardar</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div role="radiogroup" aria-label="Estado" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {(Object.keys(ESTADO_OBJETIVO) as GoalRow['status'][]).map((s) => <Chip key={s} role="radio" aria-checked={estado === s} ativo={estado === s} onClick={() => setEstado(s)}>{ESTADO_OBJETIVO[s]}</Chip>)}
        </div>
        <Campo rotulo="Onde está agora" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: 92,5 kg" />
      </div>
    </Janela>
  );
}

function Revisao({ revisao, objetivos, linkId, onFechar, onFeito }: {
  revisao: ReviewRow | 'nova' | null; objetivos: Objetivo[]; linkId: string; onFechar: () => void; onFeito: () => void;
}) {
  const scope = useScope();
  const [decisao, setDecisao] = useState(''); const [em, setEm] = useState(''); const [cadencia, setCadencia] = useState(4);
  const [sel, setSel] = useState<string[]>([]); const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    setDecisao(''); setErro(null); setCadencia(4); setSel(objetivos.map((o) => o.id));
    const d = new Date(); d.setDate(d.getDate() + 28); setEm(d.toISOString().slice(0, 10));
  }, [revisao, objetivos]);
  const nova = revisao === 'nova';
  const gravar = async () => {
    const client = getSupabaseClient();
    if (!client || !revisao) return;
    try {
      if (nova) await marcarRevisao(client, scope, linkId, { em, cadenciaSemanas: cadencia, objetivos: sel });
      else await concluirRevisao(client, revisao.id, decisao);
      toast({ variant: 'success', title: nova ? 'Revisão marcada' : 'Revisão concluída', description: nova ? undefined : 'A seguinte ficou marcada pela cadência.' });
      onFechar(); onFeito();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível gravar.'); }
  };
  return (
    <Janela aberta={!!revisao} onFechar={onFechar} titulo={nova ? 'Marcar revisão' : 'Concluir revisão'}
      sub={nova ? 'Com cadência, a seguinte marca-se ao concluir.' : 'A decisão fica no histórico e na atividade.'}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao disabled={!nova && !decisao.trim()} onClick={() => void gravar()}>{nova ? 'Marcar' : 'Concluir'}</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        {nova ? (
          <>
            <Campo rotulo="Quando" type="date" value={em} onChange={(e) => setEm(e.target.value)} />
            <Campo rotulo="Cadência (semanas)" type="number" min={1} max={52} value={cadencia} onChange={(e) => setCadencia(Number(e.target.value) || 4)} />
            <div role="group" aria-label="Objetivos a rever" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
              {objetivos.map((o, i) => <Chip key={o.id} ativo={sel.includes(o.id)} onClick={() => setSel((s) => (s.includes(o.id) ? s.filter((x) => x !== o.id) : [...s, o.id]))}>Objetivo {i + 1}</Chip>)}
            </div>
          </>
        ) : (
          <label className="lv-campo">
            <span className="lv-campo-rotulo">Decisão</span>
            <textarea className="lv-campo-input" rows={3} value={decisao} onChange={(e) => setDecisao(e.target.value)} placeholder="Ex.: manter o plano e subir 2,5 kg no agachamento" />
          </label>
        )}
        {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
      </div>
    </Janela>
  );
}

/* ── Atividade (Figma 164:78) ──────────────────────────────────────────── */
const ORIGENS: { id: OrigemAtividade | 'tudo'; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Tudo' }, { id: 'treino', rotulo: 'Treino' }, { id: 'avaliacoes', rotulo: 'Avaliações' },
  { id: 'objetivos', rotulo: 'Objetivos' }, { id: 'relacao', rotulo: 'Relação' },
];
const ICONE: Record<OrigemAtividade, typeof Barbell> = { treino: Barbell, avaliacoes: ChartLineUp, objetivos: ClipboardText, relacao: Users };

export function AtividadeTab({ linkId, nome }: { linkId: string; nome: string }) {
  const navigate = useNavigate();
  const [dias, setDias] = useState(30);
  const [origem, setOrigem] = useState<OrigemAtividade | 'tudo'>('tudo');
  const [eventos, setEventos] = useState<EventoAtividade[] | null>(null);
  const [proximos, setProximos] = useState<Proximo[] | null>(null);
  const [aberto, setAberto] = useState<EventoAtividade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setEventos(null);
    void fetchAtividade(client, linkId, new Date(Date.now() - dias * 86_400_000)).then(setEventos).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchProximos(client, linkId).then(setProximos).catch(() => setProximos([]));
  }, [linkId, dias]);
  const grupos = useMemo(() => {
    const m = new Map<string, EventoAtividade[]>();
    const hoje = new Date().toDateString(); const ontem = new Date(Date.now() - 86_400_000).toDateString();
    for (const e of (eventos ?? []).filter((x) => origem === 'tudo' || x.origem === origem)) {
      const d = new Date(e.em).toDateString();
      const k = d === hoje ? 'Hoje' : d === ontem ? 'Ontem' : dia(e.em);
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [eventos, origem]);
  const abrirOrigem = (e: EventoAtividade) => {
    if (e.refKind === 'sessao' && e.refId) navigate(`/live/${e.refId}`);
    else if (e.refKind === 'marcacao') navigate('/schedule');
    else toast({ variant: 'info', title: e.titulo, description: e.detalhe || undefined });
  };
  return (
    <div className="lg-ficha__grelha">
      <div className="lg-ficha__coluna">
        <div className="lg-clientes__chips">
          {ORIGENS.map((o) => <Chip key={o.id} ativo={origem === o.id} onClick={() => setOrigem(o.id)}>{o.rotulo}</Chip>)}
          <label className="lv-legenda" style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--espaco-8)' }}>
            <CalendarBlank size={16} aria-hidden />
            <select className="lv-campo-input" value={dias} onChange={(e) => setDias(Number(e.target.value))} aria-label="Período" style={{ minHeight: 36 }}>
              <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option><option value={365}>Último ano</option>
            </select>
          </label>
        </div>
        <section className="lv-lista" aria-label="Atividade">
          {erro ? <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar a atividade: ${erro}`} />
            : !eventos ? <Esqueleto />
            : grupos.length === 0 ? <EstadoPagina tipo="vazio" titulo="Sem atividade" texto="Muda a origem ou o período." />
            : grupos.map(([g, lista]) => (
              <div key={g} className="lg-atividade__dia">
                <span className="lv-sobretitulo">{g}</span>
                {lista.map((e, i) => {
                  const Ic = ICONE[e.origem] ?? ArrowsClockwise;
                  return (
                    <button key={`${e.em}-${i}`} type="button" className={`lv-linha-lista${aberto === e ? ' lg-atividade__aberto' : ''}`} onClick={() => setAberto(e)}>
                      <Ic size={18} aria-hidden />
                      <span className="lv-linha-lista__corpo">
                        <span className="lv-linha-lista__titulo">{e.titulo}</span>
                        <span className="lv-legenda">{hora(e.em)}{e.detalhe ? ` · ${e.detalhe}` : ''}{e.quem ? ` · ${e.quem}` : ''}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
        </section>
      </div>
      <div className="lg-ficha__coluna">
        {aberto && (
          <aside className="lv-lista" aria-label="Detalhe">
            <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{aberto.titulo}</h3>
            <dl className="lg-conta__dados">
              <dt>Quando</dt><dd>{dia(aberto.em)} · {hora(aberto.em)}</dd>
              <dt>Quem fez</dt><dd>{aberto.quem ?? '—'}</dd>
              <dt>Quem vê</dt><dd>{aberto.origem === 'objetivos' ? `Equipa; ${nome.split(' ')[0]} vê objetivos e marcos` : aberto.origem === 'relacao' ? 'Equipa' : `Equipa e ${nome.split(' ')[0]}`}</dd>
            </dl>
            <Botao variante="secundario" onClick={() => abrirOrigem(aberto)}>Abrir origem</Botao>
          </aside>
        )}
        <aside className="lv-lista" aria-label="Próximos 30 dias">
          <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Próximos 30 dias</h3>
          {!proximos ? <Esqueleto linhas={3} /> : proximos.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada marcado.</p>
            : proximos.map((p, i) => (
              <div key={i} className="lg-conta__dados" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{dia(p.em)} · {p.titulo}</span><b>{p.estado ?? (p.tipo === 'marco' ? 'Marco' : '')}</b>
              </div>
            ))}
        </aside>
      </div>
    </div>
  );
}

/* ── P-12: editar dados, arquivar com motivo, reativar ─────────────────── */
export function EditarDados({ linkId, aberta, onFechar, onGuardado, onAbrir }: {
  linkId: string; aberta: boolean; onFechar: () => void; onGuardado: () => void; onAbrir: (id: string) => void;
}) {
  const scope = useScope();
  const [orig, setOrig] = useState<(DadosCliente & { vistoEm: string; temConta: boolean }) | null>(null);
  const [f, setF] = useState<DadosCliente | null>(null);
  const [dups, setDups] = useState<Duplicado[]>([]);
  const [conflito, setConflito] = useState<ConflitoError | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (!aberta) return;
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null); setConflito(null);
    void fetchDadosCliente(client, linkId).then((d) => { setOrig(d); setF({ nome: d.nome, telefone: d.telefone, email: d.email, nascimento: d.nascimento, nif: d.nif }); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [aberta, linkId]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !f || !orig) return;
    const t = setTimeout(() => {
      void procurarDuplicados(client, scope, { telefone: f.telefone ?? '', email: f.email ?? '', nif: f.nif ?? '' }, linkId).then(setDups).catch(() => setDups([]));
    }, 350);
    return () => clearTimeout(t);
  }, [f, orig, scope, linkId]);
  if (!aberta) return null;
  const gravar = async (visto = orig?.vistoEm) => {
    const client = getSupabaseClient();
    if (!client || !orig || !f || !visto) return;
    setAGravar(true); setErro(null);
    try { await editarDadosCliente(client, linkId, orig, f, visto); toast({ variant: 'success', title: 'Dados guardados' }); onFechar(); onGuardado(); }
    catch (e) {
      if (e instanceof ConflitoError) setConflito(e);
      else setErro(e instanceof DuplicateClientError ? 'Já existe outro cliente com este telemóvel, email ou NIF.' : e instanceof Error ? e.message : 'Não foi possível guardar.');
    } finally { setAGravar(false); }
  };
  const set = (k: keyof DadosCliente) => (e: { target: { value: string } }) => setF((x) => (x ? { ...x, [k]: e.target.value || null } : x));
  return (
    <>
      <Janela aberta={!conflito} onFechar={onFechar} titulo={`Editar dados${orig ? ` de ${orig.nome.split(' ')[0]}` : ''}`}>
        {!f || !orig ? (erro ? <p className="lv-campo-erro">{erro}</p> : <Esqueleto linhas={4} />) : orig.temConta ? (
          <Nota>Os dados pessoais são da conta do cliente: só ele os muda na app.</Nota>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); void gravar(); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <Campo rotulo="Nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} required />
            <div className="lg-conta__prefs">
              <Campo rotulo="Telemóvel" value={f.telefone ?? ''} onChange={set('telefone')} inputMode="tel" />
              <Campo rotulo="Nascimento" type="date" value={f.nascimento ?? ''} onChange={set('nascimento')} />
            </div>
            <Campo rotulo="Email" type="email" value={f.email ?? ''} onChange={set('email')} />
            <Campo rotulo="NIF" value={f.nif ?? ''} onChange={set('nif')} inputMode="numeric" />
            <AvisoDuplicado duplicados={dups} onAbrir={(id) => { onFechar(); onAbrir(id); }} />
            {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
            <Botao type="submit" aCarregar={aGravar} disabled={dups.length > 0}>Guardar</Botao>
          </form>
        )}
      </Janela>
      <JanelaConflito conflito={conflito} coisa="estes dados" onEscolher={(qual) => {
        const atual = conflito?.servidor as (DadosCliente & { updated_at: string }) | undefined;
        setConflito(null);
        if (!atual) return;
        if (qual === 'deles') { setOrig({ ...orig!, ...atual, vistoEm: atual.updated_at }); setF({ nome: atual.nome, telefone: atual.telefone, email: atual.email, nascimento: atual.nascimento, nif: atual.nif }); }
        else void gravar(atual.updated_at);
      }} />
    </>
  );
}

const MOTIVOS_ARQUIVO = ['Mudou de cidade', 'Preço', 'Lesão', 'Outro'];
export function ArquivarCliente({ cliente, onFechar, onFeito }: { cliente: { id: string; nome: string } | null; onFechar: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState(MOTIVOS_ARQUIVO[0]); const [outro, setOutro] = useState(''); const [aGravar, setAGravar] = useState(false);
  useEffect(() => { setMotivo(MOTIVOS_ARQUIVO[0]); setOutro(''); }, [cliente]);
  const final = motivo === 'Outro' ? outro.trim() : motivo;
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client || !cliente || !final) return;
    setAGravar(true);
    try { await arquivarCliente(client, cliente.id, final); toast({ variant: 'success', title: `${cliente.nome} arquivado` }); onFechar(); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível arquivar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={!!cliente} onFechar={onFechar} titulo={`Arquivar ${cliente?.nome ?? ''}?`}
      sub="Sai das listas e os planos ativos param. O histórico fica e pode voltar."
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao>
        <Botao className="lv-btn--perigo" aCarregar={aGravar} disabled={!final} onClick={() => void confirmar()}>Arquivar</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <span className="lv-sobretitulo">Motivo</span>
        <div role="radiogroup" aria-label="Motivo" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {MOTIVOS_ARQUIVO.map((m) => <Chip key={m} role="radio" aria-checked={motivo === m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
        </div>
        {motivo === 'Outro' && <Campo rotulo="Qual?" value={outro} onChange={(e) => setOutro(e.target.value)} />}
        <Nota>Dívida e contrato ativo bloqueiam o arquivo quando os pagamentos estiverem ligados.</Nota>
      </div>
    </Janela>
  );
}

const MOTIVOS_REATIVAR = ['Voltou', 'Arquivado por engano', 'Outro'];
export function ReativarCliente({ cliente, onFechar, onFeito }: {
  cliente: { id: string; nome: string; saiu?: string | null } | null; onFechar: () => void; onFeito: (escolherPlano: boolean) => void;
}) {
  const [motivo, setMotivo] = useState(MOTIVOS_REATIVAR[0]); const [outro, setOutro] = useState(''); const [aGravar, setAGravar] = useState(false);
  const [planos, setPlanos] = useState(0);
  const scope = useScope();
  useEffect(() => {
    setMotivo(MOTIVOS_REATIVAR[0]); setOutro('');
    const client = getSupabaseClient();
    if (cliente && client) void fetchPlans(client, scope).then((p) => setPlanos(p.length)).catch(() => setPlanos(0));
  }, [cliente, scope]);
  const final = motivo === 'Outro' ? outro.trim() : motivo;
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client || !cliente || !final) return;
    setAGravar(true);
    try { await reativarCliente(client, cliente.id, final); toast({ variant: 'success', title: `${cliente.nome} voltou à carteira` }); onFechar(); onFeito(planos > 0); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível reativar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={!!cliente} onFechar={onFechar} titulo={`Reativar ${cliente?.nome ?? ''}?`}
      sub={`${cliente?.saiu ? `Saiu: ${cliente.saiu}. ` : ''}O histórico volta; o plano escolhe-se de novo.`}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
        <Botao aCarregar={aGravar} disabled={!final} onClick={() => void confirmar()}>{planos > 0 ? 'Reativar e escolher plano' : 'Reativar'}</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <span className="lv-sobretitulo">Motivo</span>
        <div role="radiogroup" aria-label="Motivo" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {MOTIVOS_REATIVAR.map((m) => <Chip key={m} role="radio" aria-checked={motivo === m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
        </div>
        {motivo === 'Outro' && <Campo rotulo="Qual?" value={outro} onChange={(e) => setOutro(e.target.value)} />}
        <p className="lv-legenda" style={{ margin: 0, display: 'flex', gap: 'var(--espaco-8)', alignItems: 'center' }}><Check size={14} aria-hidden />Fica registado com o teu nome e o motivo.</p>
      </div>
    </Janela>
  );
}

