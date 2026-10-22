import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  antesDeFechar, comecarSessao, confirmarDestrutivo, contaComoPresente, corrigirPresenca, enviarSessao, fecharSessao, fetchClientsLite,
  fetchExercisesLite, fetchLastPerformance, fetchTodayBookings, guardarMarcacao, historicoSessao, marcarGrupo, sessoesEsquecidas, wallClock, mudar, porEnviar, prepararSessao, PRESENCAS, resumoFecho, segundosDecorridos,
  sessaoLocal, toast, useRede,
  type ClientLite, type DashboardBooking, type EntradaHistorico, type SessaoEsquecida, type ExerciseLite, type ExercicioLocal, type LastPerformance, type LinhaFecho, type ParticipanteLocal,
  type ParticipantePrep, type Preparacao, type Presenca, type SessaoLocal,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { CheckCircle, Pause, Play, Plus, Timer, WifiSlash } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { VoltarA } from '../app/Estados';
import { PartilharResumo } from '../app/PartilharResumo';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t, vocab } from '../lib/vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro');
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
const relogio = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(',', '.')));

const APTIDAO: Record<ParticipantePrep['aptidao'], { tom: EstadoTom; texto: (z: string[]) => string }> = {
  ok: { tom: 'ok', texto: () => 'Ok' },
  adaptar: { tom: 'aviso', texto: (z) => `Adaptar${z.length ? ` · ${z.join(', ')}` : ''}` },
  atestado: { tom: 'erro', texto: () => 'Atestado em falta' },
  nao_pode: { tom: 'erro', texto: () => 'Não pode treinar' },
};
const PRESENCA: Record<Presenca, { tom: EstadoTom; texto: string }> = {
  presente: { tom: 'ok', texto: 'Presente' }, atrasado: { tom: 'ok', texto: 'Chegou atrasado' }, saiu_cedo: { tom: 'ok', texto: 'Saiu mais cedo' },
  faltou: { tom: 'erro', texto: 'Faltou' }, nao_treina: { tom: 'neutro', texto: 'Não treinou' },
};

/**
 * Sessão de PT, 1:1 ou pequeno grupo (tarefa 08): preparar (G-12), dar
 * (G-13) e fechar (G-14). Tudo grava primeiro no aparelho e segue pela fila
 * sem rede; fechar acontece uma só vez e corrigir depois pede motivo.
 */
export function AoVivo() {
  const { bookingId = '' } = useParams<{ bookingId: string }>();
  const [sessao, setSessao] = useState<SessaoLocal | null>(() => sessaoLocal.ler(bookingId));
  const [prep, setPrep] = useState<Preparacao | null>(null);
  const [doAparelho, setDoAparelho] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [fechada, setFechada] = useState(false);
  const carregar = useCallback(() => {
    setErro(null);
    void prepararSessao(getSupabaseClient(), bookingId)
      .then((r) => { setPrep(r.prep); setDoAparelho(r.doAparelho); setFechada(!!r.prep.submetida_em); })
      .catch((e) => setErro(erroDe(e)));
  }, [bookingId]);
  useEffect(() => { if (!sessao) carregar(); }, [sessao, carregar]);

  if (sessao && !fechada) return <EmCurso inicial={sessao} onFechada={() => { setSessao(null); setFechada(true); carregar(); }} />;
  return (
    <CoachShell headStrong={fechada ? 'Sessão fechada' : `Preparar ${t('sessao')}`} headSub={prep ? `${prep.titulo ?? (prep.participantes.length > 1 ? 'Pequeno grupo' : prep.participantes[0]?.nome ?? '')} · ${hora(prep.inicio)}` : undefined}
      legado={false} topActions={<VoltarA omissao={{ rotulo: 'ao Horário', href: '/schedule' }} />}>
      <div className="lv-root">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível abrir" texto={erro} acao={{ rotulo: 'Tentar outra vez', onClick: carregar }} />
          : !prep ? <Esqueleto />
          : fechada ? <Fecho bookingId={bookingId} />
          : <Preparar prep={prep} doAparelho={doAparelho} onComecar={() => { const s = comecarSessao(prep); sessaoLocal.guardar(s); setSessao(s); }} />}
      </div>
    </CoachShell>
  );
}

/* ── G-12 Preparar ──────────────────────────────────────────────────────── */
function Preparar({ prep, doAparelho, onComecar }: { prep: Preparacao; doAparelho: boolean; onComecar: () => void }) {
  const minutos = Math.round((Date.parse(prep.fim) - Date.parse(prep.inicio)) / 60000);
  const falta = Math.round((Date.parse(prep.inicio) - Date.now()) / 60000);
  const adaptar = prep.participantes.filter((p) => p.aptidao !== 'ok').length;
  const treinos = [...new Map(prep.participantes.filter((p) => p.treino).map((p) => [p.treino!.workout_id, p.treino!])).values()];
  const trocas = prep.participantes.flatMap((p) => (p.treino?.trocas ?? []).map((x) => ({ quem: p.nome, ...x })));
  return (
    <div className="lg-vivo">
      <section className="lg-vivo__topo" aria-label="Sessão">
        <span className="lv-legenda">{falta > 0 ? `Começa em ${falta >= 60 ? `${Math.floor(falta / 60)} h ${falta % 60} min` : `${falta} min`}` : falta > -minutos ? 'A decorrer' : 'Já passou a hora'}{prep.local ? ` · ${prep.local}` : ''}</span>
        <h2 className="lv-titulo-ecra" style={{ margin: 0 }}>{prep.titulo ?? (prep.participantes.length > 1 ? 'Pequeno grupo' : prep.participantes[0]?.nome)} · {hora(prep.inicio)}</h2>
        <div className="lg-vivo__numeros">
          <span><b>{prep.participantes.length}</b>{prep.participantes.length === 1 ? vocab.pessoa() : vocab.pessoa({ plural: true })}</span>
          <span><b>{adaptar}</b>a adaptar</span>
          <span><b>{minutos} min</b>duração</span>
        </div>
        <span className={doAparelho ? 'lg-vivo__rede lg-vivo__rede--aviso' : 'lg-vivo__rede'}>
          {doAparelho ? <><WifiSlash size={14} aria-hidden /> Sem rede: cópia do aparelho</> : <><CheckCircle size={14} aria-hidden /> Disponível sem rede</>}
        </span>
      </section>
      <div className="lg-vivo__tres">
        <section className="lv-lista" aria-label="Quem vem">
          <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Quem vem</h3></div>
          {prep.participantes.map((p) => {
            const a = APTIDAO[p.aptidao];
            return (
              <div key={p.booking_id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                <Avatar nome={p.nome} foto={p.avatar} tamanho={36} />
                <span className="lv-linha-lista__corpo">
                  <span className="lv-linha-lista__titulo">{p.nome}</span>
                  <span className="lv-legenda">{p.pack ? `${p.pack.nome} · restam ${p.pack.restam}` : 'Sem pack válido'}{p.sessoes_semana ? ` · ${p.sessoes_semana + 1}.ª esta semana` : ''}</span>
                </span>
                <Estado tom={a.tom}>{a.texto(p.zonas)}</Estado>
              </div>
            );
          })}
        </section>
        <section className="lv-lista" aria-label="Treino de hoje">
          <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Treino de hoje</h3></div>
          {treinos.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem treino atribuído para hoje. Juntas os exercícios durante a {t('sessao')}.</p>
            : treinos.map((w) => (
              <div key={w.workout_id} className="lg-vivo__treino">
                <span className="lv-sobretitulo">{w.nome} · v{w.versao}</span>
                {w.blocos.map((b, i) => (
                  <div key={i} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <span className="lg-vivo__bloco">{b.rotulo ?? String.fromCharCode(65 + i)}</span>
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{b.exercicios.map((e) => e.nome).join(' · ') || 'Bloco'}</span>
                      <span className="lv-legenda">{b.exercicios.map((e) => [e.series && `${e.series}×${e.reps ?? '—'}`, e.carga].filter(Boolean).join(' ')).join(' · ')}</span>
                    </span>
                    {b.minutos ? <b>{b.minutos}′</b> : null}
                  </div>
                ))}
              </div>
            ))}
          {trocas.map((x, i) => <Nota key={i}>{x.quem}: {x.para ? `${x.de} trocado por ${x.para}` : `${x.de} fica de fora`} (restrição).</Nota>)}
        </section>
      </div>
      <Nota>Antes de começar fica tudo neste aparelho. Presenças e séries guardam-se aqui se a rede falhar e seguem quando voltar.</Nota>
      <div className="lg-import__acoes" style={{ padding: 0 }}>
        <Botao icone={Play} onClick={onComecar}>Começar {t('sessao')} ao vivo</Botao>
      </div>
    </div>
  );
}

/* ── G-13 Ao vivo ───────────────────────────────────────────────────────── */
function useAgora(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => { const i = setInterval(() => setN((n) => n + 1), ms); return () => clearInterval(i); }, [ms]);
}

function EmCurso({ inicial, onFechada }: { inicial: SessaoLocal; onFechada: () => void }) {
  const scope = useScope();
  const online = useRede((r) => r.online);
  const [s, setS] = useState(inicial);
  const [quem, setQuem] = useState(inicial.participantes.find((p) => !['faltou', 'nao_treina'].includes(p.presenca ?? ''))?.linkId ?? inicial.participantes[0]?.linkId);
  const [rever, setRever] = useState(false);
  const [entrada, setEntrada] = useState(false);
  const [juntar, setJuntar] = useState(false);
  const [partilhar, setPartilhar] = useState<{ sessaoId: string; nome: string } | null>(null);
  const [ultimas, setUltimas] = useState<Map<string, LastPerformance>>(new Map());
  const aEnviar = useRef(false);
  useAgora(1000);

  // Cada mudança: primeiro no aparelho, depois a fila
  const aplicar = (f: (x: SessaoLocal) => SessaoLocal) => setS((x) => { const n = f(x); sessaoLocal.guardar(n); return n; });
  const enviar = useCallback(async () => {
    if (aEnviar.current) return;
    aEnviar.current = true;
    try {
      const atual = sessaoLocal.ler(s.bookingId) ?? s;
      const r = await enviarSessao(getSupabaseClient(), atual);
      setS((x) => ({ ...x, enviada: Math.max(x.enviada, r.enviada), ultimoEnvio: r.ultimoEnvio, erroEnvio: r.erroEnvio }));
    } finally { aEnviar.current = false; }
  }, [s]);
  useEffect(() => {
    if (!online || !porEnviar(s)) return;
    const t1 = setTimeout(() => void enviar(), 800);
    return () => clearTimeout(t1);
  }, [s, online, enviar]);
  useEffect(() => { const i = setInterval(() => { if (navigator.onLine) void enviar(); }, 15000); return () => clearInterval(i); }, [enviar]);

  const p = s.participantes.find((x) => x.linkId === quem) ?? s.participantes[0];
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !p || !online) return;
    const ids = p.exercicios.map((e) => e.exerciseId).filter((x): x is string => !!x);
    void fetchLastPerformance(client, scope, p.linkId, ids, p.sessaoId).then(setUltimas).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.linkId, p?.exercicios.length, online]);

  const decorrido = segundosDecorridos(s);
  const pendentes = porEnviar(s);
  const grupo = s.participantes.length > 1;
  return (
    <CoachShell headStrong={`${t('sessao', { maiuscula: true })} ao vivo`} headSub={s.titulo} legado={false}
      topActions={<span className={pendentes ? 'lg-vivo__rede lg-vivo__rede--aviso' : 'lg-vivo__rede'} role="status">
        {!online ? <><WifiSlash size={14} aria-hidden /> Sem rede · guardado neste aparelho</> : pendentes ? 'A enviar…' : <><CheckCircle size={14} aria-hidden /> Tudo enviado</>}
      </span>}>
      <div className="lv-root lg-vivo">
        <section className="lg-vivo__barra" aria-label="Cronómetro">
          <span className="lg-vivo__barra-texto"><span className="lv-legenda">{hora(s.inicioMarcado)} · {s.participantes.length} {s.participantes.length === 1 ? vocab.pessoa() : vocab.pessoa({ plural: true })}</span>
            <b>{p?.exercicios.find((e) => e.sets.length < (e.series ?? 1))?.nome ?? s.titulo}</b></span>
          <span className="lg-vivo__relogio" aria-label={`Tempo de treino ${relogio(decorrido)}`}>{relogio(decorrido)}</span>
          <Botao variante="secundario" icone={s.pausadaDesde ? Play : Pause} onClick={() => aplicar(s.pausadaDesde ? mudar.retomar() : mudar.pausar())}>{s.pausadaDesde ? 'Retomar' : 'Pausa'}</Botao>
          <Botao onClick={() => setRever(true)}>Fechar</Botao>
        </section>
        <div className={grupo ? 'lg-vivo__palco' : 'lg-vivo__palco lg-vivo__palco--um'}>
          {grupo && (
            <section className="lg-vivo__grelha" aria-label="Presentes">
              {s.participantes.map((x) => <Tile key={x.linkId} p={x} ativo={x.linkId === p?.linkId} onClick={() => setQuem(x.linkId)} />)}
              <button type="button" className="lg-vivo__tile lg-vivo__tile--juntar" onClick={() => setEntrada(true)}><Plus size={18} aria-hidden />Entrada sem reserva</button>
            </section>
          )}
          {p && (
            <Registo p={p} ultimas={ultimas} aplicar={aplicar} grupo={grupo} onJuntar={() => setJuntar(true)} onEntrada={() => setEntrada(true)} />
          )}
        </div>
      </div>
      <Rever aberta={rever} s={s} aplicar={aplicar} onFechar={() => setRever(false)}
        onFechada={(partilha) => { setRever(false); if (partilha) setPartilhar(partilha); else onFechada(); }} />
      <EntradaSemReserva aberta={entrada} jaEstao={s.participantes.map((x) => x.linkId)} onFechar={() => setEntrada(false)}
        onEscolher={(c) => { aplicar(mudar.entrada({ linkId: c.id, nome: c.name })); setQuem(c.id); setEntrada(false); }} />
      <JuntarExercicio aberta={juntar} onFechar={() => setJuntar(false)}
        onEscolher={(e) => { if (p) aplicar(mudar.exercicio(p.linkId, e)); setJuntar(false); }} />
      <PartilharResumo aberta={!!partilhar} sessaoId={partilhar?.sessaoId ?? null} cliente={partilhar?.nome ?? null} onFechar={() => { setPartilhar(null); onFechada(); }} />
    </CoachShell>
  );
}

function Tile({ p, ativo, onClick }: { p: ParticipanteLocal; ativo: boolean; onClick: () => void }) {
  const series = p.exercicios.reduce((n, e) => n + e.sets.length, 0);
  const fora = p.presenca === 'faltou' || p.presenca === 'nao_treina';
  return (
    <button type="button" className={`lg-vivo__tile${ativo ? ' lg-vivo__tile--ativo' : ''}${fora ? ' lg-vivo__tile--fora' : ''}`} aria-pressed={ativo} onClick={onClick}>
      <span className="lg-seg__quem"><Avatar nome={p.nome} tamanho={32} /><span><b>{p.nome}</b>
        <span className="lv-legenda" style={{ display: 'block' }}>{p.presenca ? PRESENCA[p.presenca].texto : 'Ainda não chegou'}{p.entradaSemReserva ? ' · sem reserva' : ''}</span></span></span>
      <span className="lg-vivo__tile-num"><b>{fora ? '—' : series}</b><span className="lv-legenda">{fora ? '' : 'séries'}</span></span>
    </button>
  );
}

function Registo({ p, ultimas, aplicar, grupo, onJuntar, onEntrada }: {
  p: ParticipanteLocal; ultimas: Map<string, LastPerformance>; aplicar: (f: (x: SessaoLocal) => SessaoLocal) => void; grupo: boolean; onJuntar: () => void; onEntrada: () => void;
}) {
  const fora = p.presenca === 'faltou' || p.presenca === 'nao_treina';
  const [exId, setExId] = useState<string | null>(null);
  const ex = p.exercicios.find((e) => e.id === exId) ?? p.exercicios.find((e) => e.sets.length < (e.series ?? 1)) ?? p.exercicios[p.exercicios.length - 1];
  const [descanso, setDescanso] = useState<{ ate: number; total: number } | null>(null);
  useEffect(() => setExId(null), [p.linkId]);
  return (
    <section className="lv-lista lg-vivo__registo" aria-label={`Registo de ${p.nome}`}>
      <div className="lv-lista__cabeca">
        <span className="lg-seg__quem"><Avatar nome={p.nome} tamanho={40} /><span><b>{p.nome}</b>
          <span className="lv-legenda" style={{ display: 'block' }}>{p.pack ? `${p.pack.nome} · restam ${p.pack.restam}` : 'Sem pack válido'}</span></span></span>
        {p.aptidao !== 'ok' && <Estado tom={APTIDAO[p.aptidao].tom}>{APTIDAO[p.aptidao].texto(p.zonas)}</Estado>}
      </div>
      <div role="radiogroup" aria-label="Presença" className="lg-ficha__metricas">
        {PRESENCAS.map((x) => <Chip key={x.id} role="radio" aria-checked={p.presenca === x.id} ativo={p.presenca === x.id}
          onClick={() => aplicar(mudar.presenca(p.linkId, x.id))}>{x.rotulo}</Chip>)}
      </div>
      {fora ? <Nota>{p.presenca === 'faltou' ? 'Marcado como falta. Ao fechar aplica-se a regra do pack.' : 'Não treina hoje e não conta como falta.'}</Nota> : (
        <>
          {p.exercicios.length > 0 && (
            <div className="lg-ficha__metricas" role="tablist" aria-label="Exercícios">
              {p.exercicios.map((e) => <Chip key={e.id} ativo={e.id === ex?.id} onClick={() => setExId(e.id)}>
                {e.nome}{e.series ? ` ${e.sets.length}/${e.series}` : e.sets.length ? ` ${e.sets.length}` : ''}</Chip>)}
            </div>
          )}
          {ex ? <Series key={ex.id + p.linkId} ex={ex} ultima={ex.exerciseId ? ultimas.get(ex.exerciseId) : undefined}
            onGravar={(v, n) => {
              aplicar(mudar.serie(p.linkId, ex.id, v, n));
              if (!n && ex.descanso) setDescanso({ ate: Date.now() + ex.descanso * 1000, total: ex.descanso });
            }}
            onNota={(nota) => aplicar(mudar.notaExercicio(p.linkId, ex.id, nota))} />
            : <p className="lv-legenda" style={{ margin: 0 }}>Sem exercícios. Junta o primeiro.</p>}
          {descanso && <Descanso ate={descanso.ate} onFim={() => setDescanso(null)} />}
          <div className="lg-import__acoes" style={{ padding: 0, justifyContent: 'flex-start' }}>
            <Botao variante="secundario" icone={Plus} onClick={onJuntar}>Juntar exercício</Botao>
            {!grupo && <Botao variante="secundario" onClick={onEntrada}>Juntar {vocab.pessoa()}</Botao>}
          </div>
          <label className="lv-campo"><span className="lv-campo-rotulo">Nota da {t('sessao')} (privada)</span>
            <textarea className="lv-campo-input" rows={2} value={p.nota} onChange={(e) => aplicar(mudar.nota(p.linkId, e.target.value))} /></label>
        </>
      )}
    </section>
  );
}

function Series({ ex, ultima, onGravar, onNota }: {
  ex: ExercicioLocal; ultima?: LastPerformance; onGravar: (v: { reps: number | null; carga: number | null; rpe: number | null }, n?: number) => void; onNota: (n: string) => void;
}) {
  const alvoReps = ex.alvo.reps ? String(parseInt(ex.alvo.reps, 10) || '') : '';
  const alvoCarga = ex.alvo.carga ? String(parseFloat(ex.alvo.carga.replace(',', '.')) || '') : '';
  const ult = ex.sets[ex.sets.length - 1];
  const [reps, setReps] = useState(ult?.reps?.toString() ?? alvoReps);
  const [carga, setCarga] = useState(ult?.carga?.toString() ?? (alvoCarga || (ultima?.loadKg?.toString() ?? '')));
  const [rpe, setRpe] = useState('');
  const [editar, setEditar] = useState<number | null>(null);
  const gravar = () => {
    onGravar({ reps: num(reps), carga: num(carga), rpe: num(rpe) }, editar ?? undefined);
    setEditar(null); setRpe('');
  };
  const passo = (d: number) => setCarga((c) => String(Math.max(0, (num(c) ?? 0) + d)));
  return (
    <div className="lg-vivo__series">
      <span className="lv-legenda">
        {[ex.bloco && `Bloco ${ex.bloco}`, ex.series && `Alvo ${ex.series}×${ex.alvo.reps ?? '—'}`, ex.alvo.carga, ex.alvo.rpe && `esforço ${ex.alvo.rpe}`].filter(Boolean).join(' · ')}
        {ultima ? ` · Última vez ${ultima.reps ?? '—'}×${ultima.loadKg ?? '—'} kg` : ''}
      </span>
      <div className="lg-vivo__serie lg-vivo__serie--cabeca"><span>Série</span><span>Reps</span><span>Kg</span><span>Esforço</span><span /></div>
      {ex.sets.map((x) => (
        <button key={x.id} type="button" className="lg-vivo__serie lg-vivo__serie--feita" onClick={() => { setEditar(x.n); setReps(x.reps?.toString() ?? ''); setCarga(x.carga?.toString() ?? ''); setRpe(x.rpe?.toString() ?? ''); }}
          aria-label={`Série ${x.n}: ${x.reps ?? '—'} repetições, ${x.carga ?? '—'} kg. Tocar para corrigir`}>
          <span>{x.n}</span><span>{x.reps ?? '—'}</span><span>{x.carga ?? '—'}</span><span>{x.rpe ?? '—'}</span><CheckCircle size={20} weight="fill" aria-hidden />
        </button>
      ))}
      <div className="lg-vivo__serie lg-vivo__serie--nova">
        <span>{editar ?? ex.sets.length + 1}</span>
        <input className="lv-campo-input" inputMode="numeric" aria-label="Repetições" value={reps} onChange={(e) => setReps(e.target.value)} />
        <input className="lv-campo-input" inputMode="decimal" aria-label="Carga em kg" value={carga} onChange={(e) => setCarga(e.target.value)} />
        <input className="lv-campo-input" inputMode="decimal" aria-label="Esforço de 1 a 10" placeholder="—" value={rpe} onChange={(e) => setRpe(e.target.value)} />
        <Botao onClick={gravar} aria-label={editar ? `Corrigir série ${editar}` : 'Gravar série'}>{editar ? 'Corrigir' : 'Feita'}</Botao>
      </div>
      <div className="lg-vivo__passos">
        {[-2.5, 2.5, 5].map((d) => <Botao key={d} variante="secundario" onClick={() => passo(d)}>{d > 0 ? '+' : ''}{d.toLocaleString('pt-PT')} kg</Botao>)}
      </div>
      <Campo rotulo="Nota do exercício" value={ex.nota} onChange={(e) => onNota(e.target.value)} />
    </div>
  );
}

function Descanso({ ate, onFim }: { ate: number; onFim: () => void }) {
  useAgora(250);
  const resta = Math.max(0, Math.ceil((ate - Date.now()) / 1000));
  useEffect(() => { if (resta === 0) onFim(); }, [resta, onFim]);
  return (
    <div className="lg-vivo__descanso" role="timer" aria-live="off">
      <Timer size={18} aria-hidden /><b>{relogio(resta)}</b><span className="lv-legenda">descanso</span>
      <Botao variante="secundario" onClick={onFim}>Saltar</Botao>
    </div>
  );
}

function EntradaSemReserva({ aberta, jaEstao, onFechar, onEscolher }: { aberta: boolean; jaEstao: string[]; onFechar: () => void; onEscolher: (c: ClientLite) => void }) {
  const scope = useScope();
  const [lista, setLista] = useState<ClientLite[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const client = getSupabaseClient();
    if (!aberta || !client) return;
    void fetchClientsLite(client, scope).then(setLista).catch(() => setLista([]));
  }, [aberta, scope]);
  const f = q.trim().toLocaleLowerCase('pt-PT');
  const vis = (lista ?? []).filter((c) => !jaEstao.includes(c.id) && (!f || c.name.toLocaleLowerCase('pt-PT').includes(f))).slice(0, 30);
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Entrada sem reserva" sub="Fica com a sua marcação nesta sessão e desconta do pack dele ao fechar.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
        <Campo rotulo="Procurar" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        {!lista ? <Esqueleto linhas={3} /> : lista.length === 0 ? <Nota>Sem rede para ver a lista de clientes. Junta-o quando a rede voltar.</Nota>
          : vis.map((c) => (
            <button key={c.id} type="button" className="lv-linha-lista" onClick={() => onEscolher(c)}>
              <Avatar nome={c.name} tamanho={32} /><span className="lv-linha-lista__titulo">{c.name}</span>
            </button>
          ))}
      </div>
    </Janela>
  );
}

function JuntarExercicio({ aberta, onFechar, onEscolher }: { aberta: boolean; onFechar: () => void; onEscolher: (e: { exerciseId: string | null; nome: string }) => void }) {
  const scope = useScope();
  const [lista, setLista] = useState<ExerciseLite[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    const client = getSupabaseClient();
    if (!aberta || !client) return;
    void fetchExercisesLite(client, scope).then(setLista).catch(() => setLista([]));
  }, [aberta, scope]);
  const f = q.trim().toLocaleLowerCase('pt-PT');
  const vis = useMemo(() => (lista ?? []).filter((e) => !f || e.name.toLocaleLowerCase('pt-PT').includes(f)).slice(0, 40), [lista, f]);
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Juntar exercício">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
        <Campo rotulo="Procurar ou escrever" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
        {q.trim() && !vis.some((e) => e.name.toLocaleLowerCase('pt-PT') === f) && (
          <button type="button" className="lv-linha-lista" onClick={() => { onEscolher({ exerciseId: null, nome: q.trim() }); setQ(''); }}>
            <Plus size={18} aria-hidden /><span className="lv-linha-lista__titulo">Usar "{q.trim()}" sem ficha</span>
          </button>
        )}
        {!lista ? <Esqueleto linhas={3} /> : vis.map((e) => (
          <button key={e.id} type="button" className="lv-linha-lista" onClick={() => { onEscolher({ exerciseId: e.id, nome: e.name }); setQ(''); }}>
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{e.name}</span><span className="lv-legenda">{e.category}</span></span>
          </button>
        ))}
      </div>
    </Janela>
  );
}

/* ── G-14 Rever e fechar (uma vez) ──────────────────────────────────────── */
function Rever({ aberta, s, aplicar, onFechar, onFechada }: {
  aberta: boolean; s: SessaoLocal; aplicar: (f: (x: SessaoLocal) => SessaoLocal) => void; onFechar: () => void;
  onFechada: (partilha: { sessaoId: string; nome: string } | null) => void;
}) {
  const online = useRede((r) => r.online);
  const [aFechar, setAFechar] = useState(false);
  const v = antesDeFechar(s);
  const fechar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    const ok = await confirmarDestrutivo({
      titulo: `Fechar a ${t('sessao')}?`, verbo: 'Fechar', manter: 'Continuar a sessão',
      texto: 'Fecha-se uma vez. Depois, cada correção pede um motivo e fica no histórico.',
      efeitos: [
        `${s.participantes.filter((p) => contaComoPresente(p.presenca) || (!p.presenca && p.exercicios.some((e) => e.sets.length))).length} presentes`,
        `${s.participantes.filter((p) => p.presenca === 'faltou').length} faltas`,
        `${v.creditos} ${v.creditos === 1 ? 'crédito' : 'créditos'} a descontar dos packs`,
      ],
      acao: async () => {
        setAFechar(true);
        try {
          const r = await fecharSessao(client, s);
          toast({ variant: 'success', title: r.jaFechada ? 'Já estava fechada' : 'Sessão fechada', description: r.jaFechada ? undefined : `${r.presentes} presentes · ${r.faltas} faltas` });
        } finally { setAFechar(false); }
      },
    });
    if (!ok) return;
    const unico = s.participantes.filter((p) => contaComoPresente(p.presenca) || p.exercicios.some((e) => e.sets.length));
    onFechada(unico.length === 1 ? { sessaoId: unico[0].sessaoId, nome: unico[0].nome } : null);
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo={`Rever antes de fechar`} sub={`${relogio(segundosDecorridos(s))} de treino`} forma="painel">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        {s.participantes.map((p) => {
          const series = p.exercicios.reduce((n, e) => n + e.sets.length, 0);
          return (
            <div key={p.linkId} className="lv-linha-lista" style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <Avatar nome={p.nome} tamanho={32} />
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{p.nome}</span>
                <span className="lv-legenda">{series ? `${series} séries` : 'Sem resultados'}{p.pack ? ` · pack ${p.pack.restam} → ${p.pack.restam - (contaComoPresente(p.presenca) || p.presenca === 'faltou' || series ? 1 : 0)}` : ''}</span></span>
              <select className="lv-campo-input" style={{ width: 'auto' }} aria-label={`Presença de ${p.nome}`} value={p.presenca ?? ''}
                onChange={(e) => e.target.value && aplicar(mudar.presenca(p.linkId, e.target.value as Presenca))}>
                <option value="">Por marcar</option>{PRESENCAS.map((x) => <option key={x.id} value={x.id}>{x.rotulo}</option>)}
              </select>
            </div>
          );
        })}
        {v.semPresenca.length > 0 && <Nota>Falta marcar a presença de {v.semPresenca.join(', ')}.</Nota>}
        {v.semResultados.length > 0 && <Nota>Sem resultados registados: {v.semResultados.join(', ')}. Podes fechar na mesma.</Nota>}
        {!online && <Nota>Sem rede: a sessão fica guardada neste aparelho. Fecha quando a rede voltar.</Nota>}
        <Botao aCarregar={aFechar} disabled={!online || v.semPresenca.length > 0} onClick={() => void fechar()}>Fechar {t('sessao')}</Botao>
      </div>
    </Janela>
  );
}

/* ── G-14 Depois de fechar: resumo, correções e histórico ───────────────── */
function Fecho({ bookingId }: { bookingId: string }) {
  const navigate = useNavigate();
  const [dados, setDados] = useState<{ prep: Preparacao; linhas: LinhaFecho[] } | null>(null);
  const [hist, setHist] = useState<EntradaHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [corrigir, setCorrigir] = useState<LinhaFecho | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void resumoFecho(client, bookingId).then(setDados).catch((e) => setErro(erroDe(e)));
    void historicoSessao(client, bookingId).then(setHist).catch(() => setHist([]));
  }, [bookingId]);
  useEffect(() => carregar(), [carregar]);
  if (erro) return <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} />;
  if (!dados) return <Esqueleto />;
  const pres = dados.linhas.filter((l) => contaComoPresente(l.presenca));
  const faltas = dados.linhas.filter((l) => l.presenca === 'faltou');
  const creditos = dados.linhas.filter((l) => l.pack === 'Descontou 1').length;
  return (
    <div className="lg-vivo">
      <div className="lg-hoje__contagens">
        <div className="lg-contagem lg-contagem--acao"><span className="lg-contagem__rotulo">Presentes</span><span className="lv-numero-grande">{pres.length}</span>
          <span className="lg-contagem__legenda">de {dados.linhas.length}{dados.linhas.some((l) => l.entradaSemReserva) ? ' · com entrada sem reserva' : ''}</span></div>
        <div className="lg-contagem"><span className="lg-contagem__rotulo">Faltas</span><span className="lv-numero-grande">{faltas.length}</span>
          <span className="lg-contagem__legenda">{faltas.map((f) => f.nome).join(', ') || 'Ninguém faltou'}</span></div>
        <div className="lg-contagem"><span className="lg-contagem__rotulo">Resultados</span><span className="lv-numero-grande">{pres.filter((l) => l.series > 0).length}</span>
          <span className="lg-contagem__legenda">de {pres.length} com séries registadas</span></div>
        <div className="lg-contagem lg-contagem--aviso"><span className="lg-contagem__rotulo">Créditos descontados</span><span className="lv-numero-grande">{creditos}</span>
          <span className="lg-contagem__legenda">dos packs</span></div>
      </div>
      <div className="lg-hoje__grelha">
        <section className="lv-lista lg-tabela" aria-label="Clientes">
          <div className="lg-vivo__fecho lg-tabela__cabeca"><span>{vocab.pessoa({ maiuscula: true })}</span><span>Presença</span><span>Resultado</span><span>Pack</span><span /></div>
          {dados.linhas.map((l) => (
            <div key={l.bookingId} className="lg-vivo__fecho">
              <span className="lg-seg__quem"><Avatar nome={l.nome} tamanho={32} /><span><b>{l.nome}</b>{l.entradaSemReserva && <span className="lv-legenda" style={{ display: 'block' }}>Sem reserva</span>}</span></span>
              <span>{l.presenca ? <Estado tom={PRESENCA[l.presenca].tom}>{PRESENCA[l.presenca].texto}</Estado> : '—'}</span>
              <span>{l.series ? `${l.series} séries${l.volume ? ` · ${Math.round(l.volume).toLocaleString('pt-PT')} kg` : ''}` : '—'}</span>
              <span className="lv-legenda">{l.pack ?? '—'}</span>
              <span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
                {l.sessaoId && <Botao variante="secundario" onClick={() => navigate(`/training/sessao/${l.sessaoId}`)}>Séries</Botao>}
                <Botao variante="secundario" onClick={() => setCorrigir(l)}>Corrigir</Botao>
              </span>
            </div>
          ))}
        </section>
        <aside className="lv-lista" aria-label="Histórico desta sessão">
          <span className="lv-sobretitulo">Histórico desta sessão</span>
          {!hist ? <Esqueleto linhas={3} /> : hist.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem registos.</p> : hist.map((h, i) => (
            <div key={i} className="lv-linha-lista" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <span className="lg-conta__ponto" aria-hidden />
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{h.texto}</span>
                <span className="lv-legenda">{[h.quem, new Date(h.em).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}</span>
                {h.motivo && <span className="lv-legenda">Motivo: {h.motivo}</span>}</span>
            </div>
          ))}
          <Nota>Ao corrigir, o crédito acerta-se sozinho no pack e o cliente é avisado.</Nota>
        </aside>
      </div>
      <CorrigirPresenca linha={corrigir} onFechar={() => setCorrigir(null)} onFeito={() => { setCorrigir(null); carregar(); }} />
    </div>
  );
}

function CorrigirPresenca({ linha, onFechar, onFeito }: { linha: LinhaFecho | null; onFechar: () => void; onFeito: () => void }) {
  const [p, setP] = useState<Presenca | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { setP(linha?.presenca ?? null); setMotivo(''); }, [linha]);
  if (!linha) return null;
  const gravar = async () => {
    const client = getSupabaseClient();
    if (!client || !p) return;
    setAGravar(true);
    try { await corrigirPresenca(client, linha.bookingId, p, motivo); toast({ variant: 'success', title: 'Corrigido', description: `${linha.nome} é avisado.` }); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível corrigir', description: erroDe(e) }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta onFechar={onFechar} titulo={`Corrigir ${linha.nome}`} sub={linha.presenca ? `Agora: ${PRESENCA[linha.presenca].texto}` : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div role="radiogroup" aria-label="Presença" className="lg-ficha__metricas">
          {PRESENCAS.map((x) => <Chip key={x.id} role="radio" aria-checked={p === x.id} ativo={p === x.id} onClick={() => setP(x.id)}>{x.rotulo}</Chip>)}
        </div>
        <Campo rotulo="Motivo" placeholder="Ex.: chegou às 19:40 e não passou no leitor" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <Nota>Fica no histórico: o antes, o depois, quem e porquê.</Nota>
        <Botao aCarregar={aGravar} disabled={!p || p === linha.presenca || !motivo.trim()} onClick={() => void gravar()}>Corrigir</Botao>
      </div>
    </Janela>
  );
}

/* ── Iniciar: retomar o que está no aparelho, as de hoje ou uma agora ───── */
export function IniciarSessao() {
  const scope = useScope();
  const navigate = useNavigate();
  const [locais] = useState(() => sessaoLocal.todas());
  const [hoje, setHoje] = useState<DashboardBooking[] | null>(null);
  const [esquecidas, setEsquecidas] = useState<SessaoEsquecida[]>([]);
  const [clientes, setClientes] = useState<ClientLite[] | null>(null);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [aCriar, setACriar] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchTodayBookings(client, scope).then((l) => setHoje(l.filter((b) => b.type === 'training'))).catch(() => setHoje([]));
    void sessoesEsquecidas(client, scope).then(setEsquecidas).catch(() => setEsquecidas([]));
    void fetchClientsLite(client, scope).then(setClientes).catch(() => setClientes([]));
  }, [scope]);
  const agora = async () => {
    const client = getSupabaseClient();
    if (!client || !escolhidos.length) return;
    setACriar(true);
    try {
      const ini = new Date(); ini.setSeconds(0, 0); ini.setMinutes(Math.floor(ini.getMinutes() / 5) * 5);
      let id: string;
      if (escolhidos.length === 1) {
        const w = wallClock(ini, scope.timezone);
        const dia = `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`;
        await guardarMarcacao(client, scope, { membershipId: scope.membershipId, clienteId: escolhidos[0], salaId: null, tipo: 'training', titulo: '', dia,
          hora: `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`, minutos: 60, notas: '' });
        const { data } = await client.from('bookings').select('id').eq('org_id', scope.orgId).eq('link_id', escolhidos[0]).eq('starts_at', ini.toISOString()).maybeSingle();
        if (!data) throw new Error('A marcação não apareceu. Abre-a no Horário.');
        id = data.id;
      } else {
        id = await marcarGrupo(client, scope, { membershipId: scope.membershipId, links: escolhidos, inicio: ini.toISOString(), minutos: 60 });
      }
      navigate(`/live/${id}`);
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível começar', description: erroDe(e) }); }
    finally { setACriar(false); }
  };
  const f = q.trim().toLocaleLowerCase('pt-PT');
  const vis = (clientes ?? []).filter((c) => escolhidos.includes(c.id) || (f && c.name.toLocaleLowerCase('pt-PT').includes(f))).slice(0, 12);
  return (
    <CoachShell headStrong={`Iniciar ${t('sessao')}`} headSub="Preparar, dar e fechar" legado={false}>
      <div className="lv-root lg-ficha__grelha">
        <div className="lg-ficha__coluna">
          {locais.length > 0 && (
            <section className="lv-lista" aria-label="Neste aparelho">
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>A decorrer neste aparelho</h2>
              {locais.map((x) => (
                <button key={x.bookingId} type="button" className="lv-linha-lista" onClick={() => navigate(`/live/${x.bookingId}`)}>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.titulo}</span>
                    <span className="lv-legenda">Desde {hora(x.iniciadaEm)}</span></span>
                  <Estado tom={porEnviar(x) ? 'aviso' : 'ok'}>{porEnviar(x) ? 'Por enviar' : 'Ao vivo'}</Estado>
                </button>
              ))}
            </section>
          )}
          <section className="lv-lista" aria-label="Hoje">
            <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>As tuas de hoje</h2>
            {!hoje ? <Esqueleto linhas={3} /> : hoje.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem {t('sessao', { plural: true })} marcadas para hoje.</p>
              : hoje.map((b) => (
                <button key={b.id} type="button" className="lv-linha-lista" onClick={() => navigate(`/live/${b.id}`)}>
                  <span className="lg-hoje__hora">{b.time}</span>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{b.client ?? b.title ?? 'Sessão'}</span></span>
                  <Estado tom={b.status === 'completed' ? 'ok' : b.status === 'no_show' ? 'erro' : 'neutro'}>{b.status === 'completed' ? 'Feita' : b.status === 'no_show' ? 'Faltou' : 'Preparar'}</Estado>
                </button>
              ))}
          </section>
          {esquecidas.length > 0 && (
            <section className="lv-lista" aria-label="Por fechar">
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Ficaram por fechar</h2>
              {esquecidas.map((x) => (
                <button key={x.id} type="button" className="lv-linha-lista" disabled={!x.bookingId} onClick={() => x.bookingId && navigate(`/live/${x.bookingId}`)}>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.cliente}</span>
                    <span className="lv-legenda">{new Date(x.inicio).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {x.series} séries</span></span>
                  <Estado tom="aviso">Por fechar</Estado>
                </button>
              ))}
            </section>
          )}
        </div>
        <aside className="lg-ficha__coluna">
          <section className="lv-lista" aria-label="Sessão agora">
            <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{t('sessao', { maiuscula: true })} agora</h2>
            <p className="lv-legenda" style={{ margin: 0 }}>Escolhe um {vocab.pessoa()}, ou vários para pequeno grupo. Fica marcada no horário.</p>
            <Campo rotulo="Procurar" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
            {vis.map((c) => {
              const sel = escolhidos.includes(c.id);
              return (
                <button key={c.id} type="button" className="lv-linha-lista" aria-pressed={sel} onClick={() => setEscolhidos(sel ? escolhidos.filter((x) => x !== c.id) : [...escolhidos, c.id])}>
                  <Avatar nome={c.name} tamanho={32} /><span className="lv-linha-lista__titulo">{c.name}</span>{sel && <CheckCircle size={18} weight="fill" aria-hidden />}
                </button>
              );
            })}
            <Botao aCarregar={aCriar} disabled={!escolhidos.length} icone={Play} onClick={() => void agora()}>
              {escolhidos.length > 1 ? `Começar pequeno grupo (${escolhidos.length})` : `Começar ${t('sessao')}`}</Botao>
          </section>
        </aside>
      </div>
    </CoachShell>
  );
}
