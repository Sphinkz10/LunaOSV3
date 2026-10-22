import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchPlanos, fetchTreinos, historicoAtribuicoes, resumoSessao, retirarAtribuicao, sessoesEquipa, substituirAtribuicao, toast,
  ultimaVersaoPlano, ultimaVersaoTreino,
  type AtribuicaoHistorico, type PlanoResumo, type ResumoSessao, type SessaoEquipa, type TreinoResumo,
} from '@luna/core';
import { AvisoSecao, Botao, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { Play } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { PartilharResumo } from '../app/PartilharResumo';
import { VoltarA } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const dia = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' }) : '—');

/* ── Sessões da equipa: em curso (Retomar) e concluídas ────────────────── */
export function SessoesEquipa() {
  const navigate = useNavigate();
  const scope = useScope();
  const [lista, setLista] = useState<SessaoEquipa[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void sessoesEquipa(client, scope).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope]);
  const emCurso = lista?.filter((s) => ['setup', 'live', 'paused'].includes(s.fase)) ?? [];
  const feitas = lista?.filter((s) => s.fase === 'done') ?? [];
  return (
    <CoachShell headStrong={`${vocab.sessao({ plural: true, maiuscula: true })} da equipa`} headSub="Treino" legado={false} topActions={<VoltarA omissao={{ rotulo: 'à Biblioteca', href: '/training/biblioteca' }} />}>
      <div className="lv-root lg-ficha">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} />
          : !lista ? <Esqueleto />
          : (
            <div className="lg-ficha__grelha">
              <section className="lv-lista" aria-label="Em curso">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Em curso</h2>
                {emCurso.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nenhuma {vocab.sessao()} em curso.</p> : emCurso.map((s) => (
                  <div key={s.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{s.cliente ?? '—'}</span>
                      <span className="lv-legenda">{s.treino ?? 'Sem treino'} · {s.quem ?? '—'} · desde {quando(s.inicio)}</span></span>
                    <Estado tom={s.fase === 'paused' ? 'aviso' : 'ok'}>{s.fase === 'paused' ? 'Em pausa' : 'Ao vivo'}</Estado>
                    <Botao variante="secundario" icone={Play} onClick={() => navigate('/live')}>Retomar</Botao>
                  </div>
                ))}
              </section>
              <section className="lv-lista" aria-label="Concluídas">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Concluídas (14 dias)</h2>
                {feitas.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ainda nenhuma.</p> : feitas.map((s) => (
                  <button key={s.id} type="button" className="lv-linha-lista" onClick={() => navigate(`/training/sessao/${s.id}`)}>
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{s.cliente ?? '—'}</span>
                      <span className="lv-legenda">{s.treino ?? 'Sem treino'} · {quando(s.fim ?? s.inicio)}</span></span>
                  </button>
                ))}
              </section>
            </div>
          )}
      </div>
    </CoachShell>
  );
}

/* ── G-14 Resumo: previsto contra feito e origem ───────────────────────── */
export function ResumoSessaoPagina() {
  const { id = '' } = useParams<{ id: string }>();
  const [r, setR] = useState<ResumoSessao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [partilhar, setPartilhar] = useState(false);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void resumoSessao(client, id).then(setR).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [id]);
  useEffect(() => carregar(), [carregar]);
  return (
    <CoachShell headStrong="Resumo da sessão" headSub={r ? `${r.cliente ?? '—'} · ${dia(r.inicio)} · ${r.minutos} min${r.rpeMedio ? ` · RPE médio ${r.rpeMedio}` : ''}` : 'Treino'} legado={false}
      topActions={<VoltarA omissao={{ rotulo: 'às sessões', href: '/training/sessoes' }} />}>
      <div className="lv-root">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !r ? <Esqueleto /> : (
          <div className="lg-ficha__grelha lg-resumo">
            <div className="lg-ficha__coluna">
              <section className="lv-lista" aria-label="Origem">
                <span className="lv-sobretitulo">Origem</span>
                <dl className="lg-conta__dados">
                  <dt>Treino</dt><dd>{r.origem.treino ? `${r.origem.treino}${r.origem.versao ? ` · v${r.origem.versao}` : ''}` : '—'}</dd>
                  <dt>Plano</dt><dd>{r.origem.plano ?? '—'}</dd>
                  <dt>Marcação</dt><dd>{quando(r.origem.marcacao)}</dd>
                  <dt>Comprovativo</dt><dd>{r.id.slice(0, 8).toUpperCase()}</dd>
                </dl>
              </section>
              <section className="lv-lista" aria-label="Partilhado com o cliente">
                <span className="lv-sobretitulo">Partilhado com o cliente</span>
                {r.partilhado ? <p style={{ margin: 0 }}>{r.partilhado.texto}<span className="lv-legenda" style={{ display: 'block' }}>{quando(r.partilhado.em)}</span></p>
                  : <p className="lv-legenda" style={{ margin: 0 }}>Ainda nada. O cliente só vê o que partilhares.</p>}
                {r.cliente && <Botao variante="secundario" onClick={() => setPartilhar(true)}>{r.partilhado ? 'Mudar a mensagem' : 'Partilhar resumo'}</Botao>}
              </section>
              <section className="lv-lista" aria-label="Correções">
                <span className="lv-sobretitulo">Correções durante a sessão</span>
                {r.correcoes.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nenhuma.</p> : r.correcoes.map((c, i) => (
                  <div key={i} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <span className="lg-conta__ponto" aria-hidden />
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.texto}</span><span className="lv-legenda">{quando(c.em)}</span></span>
                  </div>
                ))}
              </section>
            </div>
            <section className="lv-lista lg-tabela" aria-label="Previsto contra feito">
              <div className="lg-resumo__linha lg-tabela__cabeca"><span>Exercício</span><span>Série</span><span>Previsto</span><span>Feito</span><span className="lg-num">RPE</span></div>
              {r.linhas.map((l, i) => (
                <div key={i} className="lg-resumo__linha">
                  <span className="lv-linha-lista__titulo">{i === 0 || r.linhas[i - 1].exercicio !== l.exercicio ? l.exercicio : ''}</span>
                  <span>{l.serie}</span>
                  <span>{l.previsto}</span>
                  <span><b>{l.feitoReps ?? '—'}{l.feitoCarga != null ? ` × ${l.feitoCarga.toLocaleString('pt-PT')} kg` : ''}</b>
                    {l.desvio ? <span className={l.desvio > 0 ? 'lg-resumo__mais' : 'lg-resumo__menos'}> {l.desvio > 0 ? '+' : ''}{l.desvio}</span> : null}</span>
                  <span className="lg-num">{l.rpe ?? '—'}</span>
                </div>
              ))}
              <div className="lg-import__acoes" style={{ justifyContent: 'flex-start' }}>
                <span className="lv-pill">{r.comoPrevisto} de {r.total} séries como previsto</span>
                <span className="lv-pill">Volume {r.volume.toLocaleString('pt-PT')} kg</span>
              </div>
            </section>
          </div>
        )}
      </div>
      <PartilharResumo aberta={partilhar} sessaoId={r?.id ?? null} cliente={r?.cliente ?? null} textoInicial={r?.partilhado?.texto ?? ''} onFechar={() => { setPartilhar(false); carregar(); }} />
    </CoachShell>
  );
}

/* ── P-13 Histórico, retirar e substituir (na ficha do cliente) ────────── */
const TOM: Record<string, EstadoTom> = { Ativo: 'ok', Agendado: 'aviso', Substituído: 'neutro', Retirado: 'neutro', Feito: 'ok', Cancelado: 'neutro' };
const MOTIVOS_RETIRAR = ['Objetivo atingido', 'Lesão', 'Outro'];
const MOTIVOS_SUBST = ['Progressão', 'Pedido do cliente', 'Outro'];

export function AtribuicoesCliente({ linkId, nome }: { linkId: string; nome: string }) {
  const navigate = useNavigate();
  const scope = useScope();
  const [lista, setLista] = useState<AtribuicaoHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [retirar, setRetirar] = useState<AtribuicaoHistorico | null>(null);
  const [subst, setSubst] = useState<AtribuicaoHistorico | null>(null);
  const [motivo, setMotivo] = useState(MOTIVOS_RETIRAR[0]);
  const [treinos, setTreinos] = useState<TreinoResumo[]>([]);
  const [planos, setPlanos] = useState<PlanoResumo[]>([]);
  const [escolha, setEscolha] = useState<{ tipo: 'treino' | 'plano'; id: string } | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void historicoAtribuicoes(client, linkId).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [linkId]);
  useEffect(() => carregar(), [carregar]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!subst || !client) return;
    void fetchTreinos(client, scope).then((t) => setTreinos(t.filter((x) => x.versao > 0)));
    void fetchPlanos(client, scope).then((p) => setPlanos(p.filter((x) => x.versao > 0)));
  }, [subst, scope]);
  const fazerRetirar = async () => {
    const client = getSupabaseClient();
    if (!client || !retirar) return;
    try { const n = await retirarAtribuicao(client, retirar.id, motivo); toast({ variant: 'success', title: `${retirar.nome} retirado`, description: n ? `${n} ${vocab.sessao({ plural: n !== 1 })} por começar canceladas.` : undefined }); setRetirar(null); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível retirar', description: e instanceof Error ? e.message : undefined }); }
  };
  const fazerSubst = async () => {
    const client = getSupabaseClient();
    if (!client || !subst || !escolha) return;
    try {
      const v = escolha.tipo === 'treino' ? await ultimaVersaoTreino(client, escolha.id) : await ultimaVersaoPlano(client, escolha.id);
      if (!v) throw new Error('Publica primeiro.');
      await substituirAtribuicao(client, subst.id, escolha.tipo === 'treino' ? { treinoVersao: v.id } : { planoVersao: v.id }, motivo);
      toast({ variant: 'success', title: 'Substituído', description: 'A atribuição antiga ficou ligada à nova no histórico.' });
      setSubst(null); carregar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível substituir', description: e instanceof Error ? e.message : undefined }); }
  };
  return (
    <section className="lv-lista" aria-label="Histórico de atribuições">
      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Histórico de {nome.split(' ')[0]}</h3>
        <Botao variante="secundario" onClick={() => navigate('/training/biblioteca?tipo=planos')}>Atribuir</Botao></div>
      {erro ? <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar: ${erro}`} />
        : !lista ? <Esqueleto linhas={3} />
        : lista.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ainda sem atribuições.</p>
        : lista.map((a) => (
          <div key={a.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className={`lg-conta__ponto${a.estado === 'Ativo' ? ' lg-conta__ponto--ativo' : ''}`} aria-hidden />
            <span className="lv-linha-lista__corpo">
              <span className="lv-linha-lista__titulo">{a.nome}{a.versao ? ` · v${a.versao}` : ''}</span>
              <span className="lv-legenda">{a.estado === 'Retirado' || a.estado === 'Substituído' ? `${a.estado} · ${a.motivo ?? ''}` : `Desde ${dia(a.inicio)}${a.fim ? ` até ${dia(a.fim)}` : ''}`}</span>
            </span>
            <Estado tom={TOM[a.estado] ?? 'neutro'}>{a.estado}</Estado>
            {(a.estado === 'Ativo' || a.estado === 'Agendado') && <>
              <Botao variante="secundario" onClick={() => { setMotivo(MOTIVOS_SUBST[0]); setEscolha(null); setSubst(a); }}>Substituir</Botao>
              <Botao variante="secundario" onClick={() => { setMotivo(MOTIVOS_RETIRAR[0]); setRetirar(a); }}>Retirar</Botao>
            </>}
          </div>
        ))}
      <Janela aberta={!!retirar} onFechar={() => setRetirar(null)} titulo={`Retirar ${retirar?.nome ?? ''}?`} sub="Cancela as sessões por começar; as já começadas ficam como estavam."
        acoes={<><Botao variante="secundario" onClick={() => setRetirar(null)}>Voltar</Botao><Botao onClick={() => void fazerRetirar()}>Retirar</Botao></>}>
        <span className="lv-sobretitulo">Motivo</span>
        <div role="radiogroup" aria-label="Motivo" className="lg-ficha__metricas">{MOTIVOS_RETIRAR.map((m) => <Chip key={m} role="radio" aria-checked={motivo === m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}</div>
      </Janela>
      <Janela aberta={!!subst} onFechar={() => setSubst(null)} titulo={`Substituir ${subst?.nome ?? ''}`}
        acoes={<><Botao variante="secundario" onClick={() => setSubst(null)}>Voltar</Botao><Botao disabled={!escolha} onClick={() => void fazerSubst()}>Substituir</Botao></>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
          {[...planos.map((p) => ({ tipo: 'plano' as const, id: p.id, nome: p.nome, v: p.versao })), ...treinos.map((t) => ({ tipo: 'treino' as const, id: t.id, nome: t.nome, v: t.versao }))].map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={escolha?.id === x.id} className="lg-juntar__cartao" onClick={() => setEscolha({ tipo: x.tipo, id: x.id })}>
              <b>{x.nome} · v{x.v}</b><span className="lv-legenda">{x.tipo === 'plano' ? 'Plano' : 'Treino'}</span>
            </button>
          ))}
          <span className="lv-sobretitulo">Motivo</span>
          <div role="radiogroup" aria-label="Motivo" className="lg-ficha__metricas">{MOTIVOS_SUBST.map((m) => <Chip key={m} role="radio" aria-checked={motivo === m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}</div>
          <Nota>A atribuição antiga fica ligada à nova no histórico.</Nota>
        </div>
      </Janela>
    </section>
  );
}
