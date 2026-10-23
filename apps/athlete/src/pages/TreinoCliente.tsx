import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchMeuTreino, fetchMinhaSemana, fetchRecordes, novoId, recordesNovos, sincronizarTreinos, terminarTreino, toast, treinoEmCurso, treinosPorEnviar,
  useRede, type DiaDaSemana, type ExercicioDoTreino, type MeuTreino, type Recorde, type SerieFeita, type TreinoFeito,
} from '@luna/core';
import { Botao, BotaoFixo, Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { ArrowLeft, CaretRight, Check, Clock, Pause, Play, WifiSlash, X } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../vocab';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MODO: Record<string, string> = { normal: '', superset: 'Superset', circuito: 'Circuito', emom: 'EMOM', amrap: 'AMRAP', for_time: 'For time' };

/* ── C-12 Plano da semana e C-09 antevisão ─────────────────────────────── */
export function TreinoSemana() {
  const navigate = useNavigate();
  const online = useRede((s) => s.online);
  const [semana, setSemana] = useState<DiaDaSemana[] | null>(null);
  const [hoje, setHoje] = useState<MeuTreino | null | undefined>(undefined);
  const [erro, setErro] = useState<string | null>(null);
  const [porEnviar, setPorEnviar] = useState(treinosPorEnviar().length);
  const emCurso = treinoEmCurso.ler();
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void fetchMinhaSemana(client).then(setSemana).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchMeuTreino(client).then(setHoje).catch(() => setHoje(null));
    if (online) void sincronizarTreinos(client).then(setPorEnviar).catch(() => undefined);
  }, [online]);
  useEffect(() => carregar(), [carregar]);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const [escolhido, setEscolhido] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca"><div style={{ flex: 1 }}><span className="lv-legenda">{semana?.find((x) => x.plano)?.plano ?? 'O que vem esta semana'}</span><h1 className="lc-cabeca__titulo">Treino</h1></div></header>
      {!online && <Nota icone={WifiSlash}>Sem rede. O treino descarregado funciona na mesma; as séries enviam-se depois.</Nota>}
      {porEnviar > 0 && <Nota>{porEnviar} {porEnviar === 1 ? 'treino por enviar' : 'treinos por enviar'} ao teu {t('responsavel')}; vão quando houver rede.</Nota>}
      {emCurso && (
        <section className="lc-destaque lc-destaque--calmo" aria-label="Treino em curso">
          <span className="lc-destaque__sobre"><Clock size={16} aria-hidden />Em curso</span>
          <h2 className="lc-destaque__titulo">{emCurso.nome}</h2>
          <Botao icone={Play} onClick={() => navigate(`/treino/${emCurso.workout_id ?? 'hoje'}/agora`)}>Continuar</Botao>
        </section>
      )}
      {/* C-12 (Figma 114:190): a semana numa faixa de dias e o treino do dia escolhido em destaque */}
      <div className="lc-dias" role="tablist" aria-label="Dias da semana">
        {dias.map((d) => {
          const iso = d.toISOString().slice(0, 10);
          const tem = semana?.some((x) => x.dia === iso);
          return (
            <button key={iso} type="button" role="tab" aria-selected={escolhido === iso} className="lc-dias__dia" onClick={() => setEscolhido(iso)}>
              <span>{DIAS[d.getDay()]}</span><b>{d.getDate()}</b><i className={tem ? 'lc-dias__ponto lc-dias__ponto--sim' : 'lc-dias__ponto'} aria-hidden />
            </button>
          );
        })}
      </div>
      {erro ? <p className="lv-legenda">Não foi possível carregar a semana.</p> : !semana || hoje === undefined ? <Esqueleto /> : (() => {
        const ts = semana.filter((x) => x.dia === escolhido);
        const eHoje = escolhido === dias[0].toISOString().slice(0, 10);
        if (!ts.length) return <Nota>{eHoje ? 'Hoje é dia de descanso.' : 'Dia de descanso.'}</Nota>;
        return ts.map((x) => {
          const detalhe = eHoje && hoje && hoje.workout_id === x.workoutId ? hoje : null;
          const n = detalhe ? detalhe.blocos.reduce((k, bl) => k + bl.exercicios.length, 0) : null;
          const quando = eHoje ? 'Hoje' : new Date(`${escolhido}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'long' });
          return (
            <button key={x.workoutId} type="button" className="lc-dia-treino" onClick={() => navigate(`/treino/${x.workoutId}?dia=${escolhido}${x.plano ? `&plano=${encodeURIComponent(x.plano)}` : ''}`)}
              style={{ backgroundImage: `linear-gradient(to top, var(--cor-destaque) 18%, transparent 70%), url(${fotoDoExercicio(detalhe?.blocos.flatMap((bl) => bl.exercicios).find((e) => !/prancha|mobilidade|alongamento/i.test(e.nome))?.nome ?? x.nome)})` }}>
              <span className="lc-dia-treino__quando">{quando}{detalhe?.duracao_min ? ` · ${detalhe.duracao_min} min` : ''}</span>
              <span className="lc-destaque__titulo">{x.nome}</span>
              <span className="lv-legenda">{n != null ? `${n} exercícios` : x.plano ?? ''}</span>
            </button>
          );
        });
      })()}
    </main>
  );
}

export function TreinoAntevisao() {
  const { id = '' } = useParams<{ id: string }>();
  const plano = new URLSearchParams(window.location.search).get('plano');
  const navigate = useNavigate();
  const [tr, setTr] = useState<MeuTreino | null | undefined>(undefined);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const dia = new URLSearchParams(window.location.search).get('dia') ?? undefined;
    void fetchMeuTreino(client, id, dia).then((x) => { setTr(x); if (x) try { localStorage.setItem(`luna.treino.${id}`, JSON.stringify(x)); } catch { /* cópia sem rede */ } })
      .catch(() => { try { setTr(JSON.parse(localStorage.getItem(`luna.treino.${id}`) ?? 'null') as MeuTreino | null); } catch { setTr(null); } });
  }, [id]);
  if (tr === undefined) return <main className="lc-ecra"><Esqueleto /></main>;
  if (!tr) return <main className="lc-ecra"><EstadoPagina tipo="vazio" titulo="Treino não encontrado" texto={`Fala com o teu ${t('responsavel')}.`} acao={{ rotulo: 'Voltar', onClick: () => navigate('/treino') }} /></main>;
  const n = tr.blocos.reduce((s, b) => s + b.exercicios.length, 0);
  const trocas = tr.blocos.flatMap((b) => b.exercicios.filter((e) => e.trocado_de));
  return (
    <main className="lc-ecra lc-ecra--capa">
      {/* C-09 (Figma 93:250): foto em cima com voltar por cima */}
      <div className="lc-capa" style={{ backgroundImage: `url(${fotoDoExercicio(tr.blocos.flatMap((b) => b.exercicios).find((e) => !/prancha|mobilidade|alongamento/i.test(e.nome))?.nome ?? tr.nome)})` }}>
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => navigate('/treino')}><ArrowLeft size={18} aria-hidden /></button>
      </div>
      <header>
        <h1 className="lc-cabeca__titulo">{tr.nome}</h1>
        <span className="lv-legenda">{plano ? `${plano} · ` : ''}versão {tr.versao}</span>
      </header>
      <div className="lc-par lc-tres">
        <section className="lc-resumo"><b>{tr.duracao_min ? `${tr.duracao_min} min` : '—'}</b><span className="lv-legenda">duração</span></section>
        <section className="lc-resumo"><b>{n}</b><span className="lv-legenda">exercícios</span></section>
        <section className="lc-resumo"><b>{tr.blocos.length}</b><span className="lv-legenda">blocos</span></section>
      </div>
      {trocas.length > 0 && <Nota>O teu {t('responsavel')} adaptou {trocas.length === 1 ? 'um exercício' : `${trocas.length} exercícios`} para ti.</Nota>}
      {tr.blocos.map((b, i) => (
        <section key={i} className="lc-grupo" aria-label={b.rotulo}>
          <h2 className="lv-sobretitulo"><span className="lc-letra">{String.fromCharCode(65 + i)}</span>{b.rotulo}{MODO[b.modo] ? ` · ${MODO[b.modo]}` : ''}{b.voltas ? ` · ${b.voltas} voltas` : ''}</h2>
          {b.exercicios.map((e, k) => (
            <div key={k} className="lc-lista__linha lc-exercicio">
              <img className="lc-exercicio__foto" src={fotoDoExercicio(e.nome)} alt="" />
              <span className="lv-linha-lista__corpo">
                <span className="lv-linha-lista__titulo">{e.nome}</span>
                <span className="lv-legenda">{[[e.series, e.reps].filter(Boolean).join(' × '), e.carga, e.rpe ? `RPE ${e.rpe}` : null].filter(Boolean).join(' · ')}</span>
              </span>
              <CaretRight size={18} aria-hidden />
            </div>
          ))}
        </section>
      ))}
      <BotaoFixo icone={Play} onClick={() => navigate(`/treino/${tr.workout_id}/agora`)}>Começar treino</BotaoFixo>
    </main>
  );
}

/* ── C-10 Treino em curso e C-11 resumo ────────────────────────────────── */
export function TreinoEmCurso() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const online = useRede((s) => s.online);
  const [tr, setTr] = useState<MeuTreino | null>(null);
  const [feito, setFeito] = useState<TreinoFeito | null>(null);
  const [i, setI] = useState(0);
  const [descanso, setDescanso] = useState<number | null>(null);
  const [alternativa, setAlternativa] = useState(false);
  const [fim, setFim] = useState(false);
  const [recordes, setRecordes] = useState<Recorde[]>([]);
  const lista: ExercicioDoTreino[] = useMemo(() => tr?.blocos.flatMap((b) => b.exercicios) ?? [], [tr]);

  useEffect(() => {
    const client = getSupabaseClient();
    const guardado = treinoEmCurso.ler();
    const usar = (x: MeuTreino) => {
      setTr(x);
      setFeito(guardado && (guardado.workout_id === x.workout_id) ? guardado : {
        id: novoId(), link_id: x.link_id, workout_id: x.workout_id, nome: x.nome, started_at: new Date().toISOString(), ended_at: null, rpe: null, nota: '', trocas: [],
        exercicios: x.blocos.flatMap((b) => b.exercicios).map((e) => ({ exercise_id: e.exercise_id, nome: e.nome, series: e.series, sets: [] })),
      });
    };
    const local = () => { try { const x = JSON.parse(localStorage.getItem(`luna.treino.${id}`) ?? 'null') as MeuTreino | null; if (x) usar(x); } catch { /* nada */ } };
    if (client) void fetchMeuTreino(client, id === 'hoje' ? null : id).then((x) => (x ? usar(x) : local())).catch(local);
    else local();
    if (client) void fetchRecordes(client).then(setRecordes).catch(() => setRecordes([]));
  }, [id]);
  useEffect(() => { if (feito) treinoEmCurso.guardar(feito); }, [feito]);
  useEffect(() => {
    if (descanso == null || descanso <= 0) return;
    const t1 = setTimeout(() => setDescanso((d) => (d == null ? null : d - 1)), 1000);
    return () => clearTimeout(t1);
  }, [descanso]);

  if (!tr || !feito) return <main className="lc-ecra"><Esqueleto /></main>;
  const ex = lista[i];
  const reg = feito.exercicios[i];
  const n = reg?.sets.length ?? 0;
  const todas = feito.exercicios.reduce((s, e) => s + e.sets.filter((x) => x.feito).length, 0);
  const previstas = lista.reduce((s, e) => s + (e.series ?? 1), 0);

  const registar = () => {
    const carga = Number(String(ex.carga ?? '').replace(',', '.').replace(/[^\d.]/g, '')) || null;
    const s: SerieFeita = { n: n + 1, reps: Number(ex.reps) || null, carga, rpe: ex.rpe, feito: true, em: new Date().toISOString() };
    setFeito({ ...feito, exercicios: feito.exercicios.map((e, k) => (k === i ? { ...e, sets: [...e.sets, s] } : e)) });
    if (n + 1 >= (ex.series ?? 1)) { if (i + 1 < lista.length) { setI(i + 1); setDescanso(null); } else setFim(true); }
    else setDescanso(ex.descanso ?? 60);
  };
  const mudarSerie = (k: number, p: Partial<SerieFeita>) => setFeito({ ...feito, exercicios: feito.exercicios.map((e, j) => (j === i ? { ...e, sets: e.sets.map((x, m) => (m === k ? { ...x, ...p } : x)) } : e)) });
  const trocar = (a: ExercicioDoTreino['alternativas'][number]) => {
    setFeito({ ...feito, trocas: [...feito.trocas, { de: ex.nome, para: a.nome }], exercicios: feito.exercicios.map((e, k) => (k === i ? { ...e, exercise_id: a.exercise_id, nome: a.nome } : e)) });
    setTr({ ...tr, blocos: tr.blocos.map((b) => ({ ...b, exercicios: b.exercicios.map((e) => (e === ex ? { ...e, exercise_id: a.exercise_id, nome: a.nome, trocado_de: ex.nome } : e)) })) });
    setAlternativa(false);
  };
  const enviar = async () => {
    const final = { ...feito, ended_at: new Date().toISOString() };
    const falta = await terminarTreino(online ? getSupabaseClient() : null, final);
    toast({ variant: 'success', title: falta ? 'Guardado no telemóvel' : `Enviado ao teu ${t('responsavel')}`, description: falta ? 'Envia-se sozinho quando houver rede.' : undefined });
    navigate('/treino');
  };

  if (fim) {
    const novos = recordesNovos(feito, recordes);
    return (
      <main className="lc-ecra">
        <header className="lc-cabeca">
          <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar ao treino" onClick={() => setFim(false)}><X size={18} aria-hidden /></button>
          <div><span className="lv-legenda">{tr.nome} · {Math.max(1, Math.round((Date.now() - Date.parse(feito.started_at)) / 60000))} min</span><h1 className="lc-cabeca__titulo">Muito bem!</h1></div>
        </header>
        <div className="lc-par">
          <section className="lc-cartao lc-cartao--claro"><span className="lc-cartao__rotulo">Séries</span><span className="lv-numero-grande">{todas}/{previstas}</span></section>
          <section className="lc-cartao"><span className="lc-cartao__rotulo">Recorde</span>
            {novos[0] ? <><span className="lv-numero-grande">{novos[0].carga}</span><span className="lv-legenda">kg · {novos[0].exercicio}</span></> : <span className="lv-legenda">Desta vez não</span>}
          </section>
        </div>
        <span className="lv-sobretitulo">Quão duro foi?</span>
        <div className="lc-rpe" role="radiogroup" aria-label="Esforço de 1 a 10">
          {Array.from({ length: 10 }, (_, k) => k + 1).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={feito.rpe === v} className="lc-rpe__n" onClick={() => setFeito({ ...feito, rpe: v })}>{v}</button>
          ))}
        </div>
        <label className="lv-campo"><span className="lv-campo-rotulo">Nota para o teu {t('responsavel')}</span>
          <textarea className="lv-campo-input" rows={3} value={feito.nota} onChange={(e) => setFeito({ ...feito, nota: e.target.value })} placeholder="Como te sentiste?" /></label>
        <BotaoFixo onClick={() => void enviar()}>{online ? `Enviar ao ${t('responsavel')}` : 'Guardar e enviar depois'}</BotaoFixo>
      </main>
    );
  }

  if (alternativa) {
    return (
      <main className="lc-ecra">
        <header className="lc-cabeca">
          <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => setAlternativa(false)}><ArrowLeft size={18} aria-hidden /></button>
          <div><span className="lv-legenda">{ex.nome}</span><h1 className="lc-cabeca__titulo">Máquina ocupada?</h1></div>
        </header>
        <p className="lv-legenda" style={{ margin: 0 }}>O teu {t('responsavel')} autorizou estas alternativas. As séries continuam no mesmo sítio.</p>
        {ex.alternativas.length === 0 ? <Nota>Este exercício não tem alternativas autorizadas. Espera um pouco ou fala com o teu {t('responsavel')}.</Nota>
          : ex.alternativas.map((a) => (
            <button key={a.exercise_id} type="button" className="lc-cartao lc-alternativa" onClick={() => trocar(a)}>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{a.nome}</b><span className="lv-pill">{a.semelhanca === 'igual' ? 'Igual' : 'Parecido'}</span></span>
              <span className="lv-legenda">{[ex.series && `${ex.series} ×`, ex.reps].filter(Boolean).join(' ')}</span>
            </button>
          ))}
        <Nota>O {t('responsavel')} vê que trocaste.</Nota>
      </main>
    );
  }

  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Pausar e sair" onClick={() => navigate('/treino')}><Pause size={18} aria-hidden /></button>
        <div style={{ flex: 1 }}><span className="lv-legenda">{tr.nome} · exercício {i + 1} de {lista.length}</span><h1 className="lc-cabeca__titulo">{ex.nome}</h1></div>
      </header>
      {!online && <Nota icone={WifiSlash}>Sem rede: as séries ficam no telemóvel.</Nota>}
      {/* C-10 (Figma 113:170): a foto do exercício, com o vídeo por cima quando há */}
      <div className="lc-foto-ex" style={{ backgroundImage: `url(${fotoDoExercicio(ex.nome)})` }}>
        {ex.video && <a className="lc-video" href={ex.video} target="_blank" rel="noreferrer"><Play size={16} aria-hidden />Ver como se faz</a>}
      </div>
      <section className="lc-escolhas" aria-label="Séries">
        <div className="lc-series lc-series--cabeca"><span /><span>Previsto</span><span>Feito</span><span>RPE</span></div>
        {Array.from({ length: Math.max(ex.series ?? 1, n) }, (_, k) => {
          const s = reg.sets[k];
          return (
            <div key={k} className={`lc-series${k === n ? ' lc-series--agora' : ''}`}>
              <span>{k + 1}</span>
              <span>{ex.reps ?? '—'}{ex.carga ? ` × ${ex.carga}` : ''}</span>
              {s ? <input className="lv-campo-input" aria-label={`Série ${k + 1} repetições × carga`} value={`${s.reps ?? ''}${s.carga != null ? ` × ${s.carga}` : ''}`}
                onChange={(e) => { const [r, c] = e.target.value.split('×').map((x) => x.trim()); mudarSerie(k, { reps: Number(r) || null, carga: c ? Number(c.replace(',', '.')) || null : null }); }} />
                : <span>—</span>}
              {s ? <input className="lv-campo-input" aria-label={`Série ${k + 1} RPE`} inputMode="numeric" value={s.rpe ?? ''} onChange={(e) => mudarSerie(k, { rpe: Number(e.target.value) || null })} /> : <span>—</span>}
            </div>
          );
        })}
      </section>
      {descanso != null && descanso > 0 && (
        <section className="lc-descanso" aria-live="polite">
          <Clock size={20} aria-hidden />
          <span style={{ flex: 1 }}><span className="lv-numero-grande">{Math.floor(descanso / 60)}:{String(descanso % 60).padStart(2, '0')}</span><span className="lv-legenda" style={{ display: 'block' }}>descanso</span></span>
          <button type="button" className="lc-link" onClick={() => setDescanso(descanso + 30)}>+30s</button>
          <button type="button" className="lc-link" onClick={() => setDescanso(null)}>Saltar</button>
        </section>
      )}
      <div className="lc-par">
        <Botao variante="secundario" onClick={() => setAlternativa(true)}>Máquina ocupada?</Botao>
        <Botao variante="secundario" onClick={() => (i + 1 < lista.length ? setI(i + 1) : setFim(true))}>Saltar exercício</Botao>
      </div>
      <BotaoFixo icone={Check} onClick={registar}>Registar série {n + 1}</BotaoFixo>
    </main>
  );
}

/** Foto provisória do Figma (DS-03) pelo nome do exercício, enquanto não há imagem própria. */
export function fotoDoExercicio(nome: string): string {
  const n = nome.toLocaleLowerCase('pt-PT');
  if (/kettlebell|swing|balanço/.test(n)) return '/media/ex-kettlebell.jpg';
  if (/elástico|elastico|concha/.test(n)) return '/media/ex-elastico.jpg';
  if (/remada|supino|press|curl|haltere|tríceps/.test(n)) return '/media/ex-halteres.jpg';
  if (/prancha|mobilidade|alongamento|abertura|dead bug|equilíbrio/.test(n)) return '/media/ex-mobilidade.jpg';
  if (/bicicleta|corrida|remo erg|burpee|passadeira/.test(n)) return '/media/ex-cardio.jpg';
  return '/media/ex-forca.jpg';
}
