import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addLiveExercise, computeSessionSummary, fetchActiveSessionId, fetchClientsLite, fetchBookingClientId,
  fetchExercisesLite, fetchLastPerformance, fetchLiveSession, fetchLiveWorkouts, finishLiveSession,
  parseTargetLoadKg, parseTargetReps, recordLiveSet, setBookingStatus, setLiveExerciseNote, setLiveSessionPhase,
  NoTrainingShareError, spikeTimer, startLiveSession, toast,
  type ClientLite, type ExerciseLite, type LastPerformance, type LiveSession, type LiveSessionExercise,
  type LiveWorkout, type LiveWorkoutExercise,
} from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { PartilharResumo } from '../app/PartilharResumo';
import { useScope } from '../app/ModuleLayout';
import { vocab } from '../lib/vocab';

const P1 = vocab.pessoa({ maiuscula: true });
const p1 = vocab.pessoa();
const pp = vocab.pessoa({ plural: true });
const SESSAO = vocab.sessao({ maiuscula: true });
import { ProtoModal } from '../app/ProtoModal';
import { Svg } from '../app/Svg';
import { getSupabaseClient } from '../lib/supabase';

type Tab = 'exercise' | 'list' | 'summary';
type ExStatus = 'done' | 'skipped' | 'cur' | 'pending';
interface SetDraft { reps: string; load: string; rpe: string }

const NOTE_TAGS = ['Bom dia', 'Cansado', 'Recuperado', 'Dor muscular', 'Foco técnico', 'Aumentar carga'];
const DEFAULT_REST = 90;
const RING_C = 2 * Math.PI * 37;

function fmtTime(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function initials(n: string): string {
  return n.split(/\s+/).slice(0, 2).map((x) => x[0] ?? '').join('').toUpperCase();
}
const toNum = (v: string): number | null => {
  const n = Number(v.replace(',', '.'));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : undefined);

/** Re-render periódico enquanto há relógios a correr (os valores vêm sempre de timestamps). */
function useTick(active: boolean, ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(h);
  }, [active, ms]);
}

export function Live() {
  const scope = useScope();
  const { bookingId } = useParams<{ bookingId?: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [athletes, setAthletes] = useState<ClientLite[]>([]);
  const [workouts, setWorkouts] = useState<LiveWorkout[]>([]);
  const [exercises, setExercises] = useState<ExerciseLite[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pickAthlete, setPickAthlete] = useState<string | null>(null);
  const [pickWorkout, setPickWorkout] = useState<string | null>(null);

  const [session, setSession] = useState<LiveSession | null>(null);
  const [last, setLast] = useState<Map<string, LastPerformance>>(new Map());
  const [tab, setTab] = useState<Tab>('exercise');
  const [curIdx, setCurIdx] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, SetDraft>>({});
  const [clock, setClock] = useState<spikeTimer.TimerState | null>(null);
  const [rest, setRest] = useState<spikeTimer.TimerState | null>(null);
  const [note, setNote] = useState('');
  const [partilhar, setPartilhar] = useState<string | null>(null);
  const [tags, setTags] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<LiveSessionExercise | null>(null);
  const restDoneRef = useRef(false);

  const phase = session?.phase ?? 'setup';
  const running = phase === 'live';
  useTick(running || !!(rest && !rest.pausedAt));

  // ===== carregar setup =====
  const loadSetup = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchClientsLite(client, scope),
      fetchLiveWorkouts(client, scope),
      fetchExercisesLite(client, scope),
      fetchActiveSessionId(client, scope),
      bookingId ? fetchBookingClientId(client, scope, bookingId) : Promise.resolve(null),
    ]).then(([a, w, ex, act, bookingAthlete]) => {
      if (cancelled) return;
      setAthletes(a); setWorkouts(w); setExercises(ex); setActiveId(act); setError(null);
      setPickAthlete((p) => p ?? bookingAthlete ?? a[0]?.id ?? null);
      setPickWorkout((p) => p ?? w[0]?.id ?? null);
    }).catch((e) => {
      if (!cancelled) setError(errMsg(e) ?? 'Erro ao carregar o Live');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, bookingId]);

  useEffect(() => loadSetup(), [loadSetup]);

  const workoutOf = useCallback(
    (s: LiveSession | null) => workouts.find((w) => w.id === s?.workoutId) ?? null,
    [workouts],
  );

  /** Prescrição do treino para um exercício da sessão (mesma posição/exercício). */
  const plannedOf = useCallback((ex: LiveSessionExercise): LiveWorkoutExercise | null => {
    const wk = workoutOf(session);
    return wk?.exercises.find((e) => e.exerciseId === ex.exerciseId) ?? null;
  }, [session, workoutOf]);

  // ===== abrir / recarregar sessão =====
  const openSession = useCallback(async (id: string, keepIdx = false) => {
    const client = getSupabaseClient();
    if (!client) return;
    const s = await fetchLiveSession(client, scope, id);
    setSession(s);
    if (!keepIdx) {
      const first = s.exercises.findIndex((e) => e.sets.length < (e.targetSets ?? 3));
      setCurIdx(first >= 0 ? first : 0);
      const started = s.startedAt ? Date.parse(s.startedAt) : Date.now();
      const base = s.phase === 'paused'
        ? spikeTimer.pause(spikeTimer.start(0, Date.now() - s.elapsedSeconds * 1000))
        : spikeTimer.start(0, started);
      setClock(base);
      setTab('exercise');
    }
    if (s.clientId) {
      const ids = s.exercises.map((e) => e.exerciseId).filter((v): v is string => !!v);
      fetchLastPerformance(client, scope, s.clientId, ids, s.id).then(setLast).catch(() => setLast(new Map()));
    } else {
      setLast(new Map());
    }
  }, [scope]);

  const start = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setBusy(true);
    try {
      const wk = workouts.find((w) => w.id === pickWorkout) ?? null;
      if (!pickAthlete) { toast({ variant: 'info', title: `Escolhe um ${p1}` }); return; }
      const id = await startLiveSession(client, scope, { clientId: pickAthlete, workout: wk, bookingId: bookingId ?? null });
      setSkipped(new Set()); setClosed(new Set()); setDrafts({}); setNote(''); setTags(new Set()); setRest(null);
      await openSession(id);
      toast({ variant: 'success', title: 'Sessão iniciada', description: wk?.name });
    } catch (e) {
      toast({ variant: 'danger', title: 'Não foi possível iniciar', description: e instanceof NoTrainingShareError ? e.message : errMsg(e) });
    } finally { setBusy(false); }
  };

  const resume = async () => {
    if (!activeId) return;
    setBusy(true);
    try { await openSession(activeId); } catch (e) {
      toast({ variant: 'danger', title: 'Não foi possível retomar', description: errMsg(e) });
    } finally { setBusy(false); }
  };

  // ===== derivados =====
  const exList = useMemo(() => session?.exercises ?? [], [session]);
  const statusOf = (e: LiveSessionExercise, i: number): ExStatus => {
    if (skipped.has(e.id)) return 'skipped';
    if (closed.has(e.id) || e.sets.length >= (e.targetSets ?? Number.POSITIVE_INFINITY)) return 'done';
    return i === curIdx ? 'cur' : 'pending';
  };
  const allSets = useMemo(() => exList.flatMap((e) => e.sets), [exList]);
  const summary = useMemo(() => computeSessionSummary(allSets), [allSets]);
  const processed = exList.filter((e, i) => { const st = statusOf(e, i); return st === 'done' || st === 'skipped'; }).length;
  const cur = exList[curIdx] ?? null;
  const elapsedMs = clock ? spikeTimer.elapsedMs(clock) : 0;
  const athleteName = (id: string | null) => athletes.find((a) => a.id === id)?.name ?? `Sem ${p1}`;

  const draftFor = (ex: LiveSessionExercise): SetDraft => {
    const d = drafts[ex.id];
    if (d) return d;
    const prevSet = ex.sets[ex.sets.length - 1];
    const plan = plannedOf(ex);
    const lastPerf = ex.exerciseId ? last.get(ex.exerciseId) : undefined;
    const reps = prevSet?.reps ?? parseTargetReps(plan?.targetReps) ?? lastPerf?.reps ?? null;
    const load = prevSet?.loadKg ?? parseTargetLoadKg(plan?.targetLoad) ?? lastPerf?.loadKg ?? null;
    return { reps: reps != null ? String(reps) : '', load: load != null ? String(load) : '', rpe: '' };
  };
  const setDraft = (ex: LiveSessionExercise, patch: Partial<SetDraft>) =>
    setDrafts((m) => ({ ...m, [ex.id]: { ...draftFor(ex), ...patch } }));

  // ===== descanso =====
  const restTotal = (ex: LiveSessionExercise | null) => (ex?.restSeconds ?? DEFAULT_REST) * 1000;
  const startRest = (ex: LiveSessionExercise | null) => {
    restDoneRef.current = false;
    setRest(spikeTimer.start(restTotal(ex)));
  };
  const restRemaining = rest ? spikeTimer.remainingMs(rest) : restTotal(cur);
  const restDuration = rest?.durationMs ?? restTotal(cur);
  useEffect(() => {
    if (rest && !rest.pausedAt && restRemaining <= 0 && !restDoneRef.current) {
      restDoneRef.current = true;
      toast({ variant: 'success', title: 'Descanso terminado', description: 'Próxima série.' });
    }
  }, [rest, restRemaining]);
  const toggleRest = () => {
    if (!rest || restRemaining <= 0) { startRest(cur); return; }
    setRest(rest.pausedAt ? spikeTimer.resume(rest) : spikeTimer.pause(rest));
  };
  const addRest = () => setRest((r) => (r ? { ...r, durationMs: r.durationMs + 30_000 } : spikeTimer.pause(spikeTimer.start(restTotal(cur) + 30_000))));
  const resetRest = () => { restDoneRef.current = false; setRest(spikeTimer.pause(spikeTimer.start(restTotal(cur)))); };

  // ===== avançar =====
  const nextOpenIdx = (from: number, extraDone?: string) => exList.findIndex((e, i) =>
    i > from && !skipped.has(e.id) && !closed.has(e.id) && e.id !== extraDone && e.sets.length < (e.targetSets ?? Number.POSITIVE_INFINITY));

  const advanceFrom = (doneId: string) => {
    const n = nextOpenIdx(curIdx, doneId);
    if (n >= 0) { setCurIdx(n); toast({ variant: 'success', title: 'Exercício concluído ✓' }); }
    else { setRest(null); setTab('summary'); toast({ variant: 'success', title: 'Treino concluído! 💪' }); }
  };

  const logSet = async (completed: boolean) => {
    if (!cur || !session) return;
    const client = getSupabaseClient();
    if (!client) return;
    const d = draftFor(cur);
    const rpe = toNum(d.rpe);
    if (rpe != null && (rpe < 0 || rpe > 10)) { toast({ variant: 'warning', title: 'RPE vai de 0 a 10' }); return; }
    setBusy(true);
    try {
      const restTaken = rest ? Math.round(spikeTimer.elapsedMs(rest) / 1000) : null;
      await recordLiveSet(client, scope, {
        sessionId: session.id, sessionExerciseId: cur.id, setIndex: cur.sets.length + 1,
        reps: toNum(d.reps), loadKg: toNum(d.load), rpe, completed, restTakenSeconds: restTaken,
      });
      if (!completed) toast({ variant: 'warning', title: 'Série marcada como falhada' });
      setDrafts((m) => ({ ...m, [cur.id]: { ...d, rpe: '' } }));
      const nextCount = cur.sets.length + 1;
      await openSession(session.id, true);
      if (nextCount >= (cur.targetSets ?? Number.POSITIVE_INFINITY)) advanceFrom(cur.id);
      else startRest(cur);
    } catch (e) {
      toast({ variant: 'danger', title: 'Série não gravada', description: errMsg(e) });
    } finally { setBusy(false); }
  };

  /** Regista as séries em falta com os valores atuais e fecha o exercício. */
  const confirmExercise = async () => {
    if (!cur || !session) return;
    const client = getSupabaseClient();
    if (!client) return;
    const d = draftFor(cur);
    const missing = Math.max(0, (cur.targetSets ?? cur.sets.length) - cur.sets.length);
    setBusy(true);
    try {
      for (let k = 0; k < missing; k++) {
        await recordLiveSet(client, scope, {
          sessionId: session.id, sessionExerciseId: cur.id, setIndex: cur.sets.length + k + 1,
          reps: toNum(d.reps), loadKg: toNum(d.load), rpe: toNum(d.rpe), completed: true,
        });
      }
      setClosed((s) => new Set(s).add(cur.id));
      await openSession(session.id, true);
      advanceFrom(cur.id);
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha ao confirmar', description: errMsg(e) });
    } finally { setBusy(false); }
  };

  const skip = () => {
    if (!cur) return;
    setSkipped((s) => new Set(s).add(cur.id));
    const n = nextOpenIdx(curIdx, cur.id);
    if (n >= 0) setCurIdx(n); else setTab('summary');
    setRest(null);
    toast({ variant: 'info', title: 'Exercício saltado' });
  };

  const jump = (i: number) => {
    const e = exList[i];
    if (!e) return;
    setSkipped((s) => { const n = new Set(s); n.delete(e.id); return n; });
    setClosed((s) => { const n = new Set(s); n.delete(e.id); return n; });
    setCurIdx(i); setTab('exercise'); setRest(null);
  };

  const togglePause = async () => {
    if (!session || !clock) return;
    const client = getSupabaseClient();
    if (!client) return;
    const pausing = session.phase === 'live';
    const nextClock = pausing ? spikeTimer.pause(clock) : spikeTimer.resume(clock);
    try {
      await setLiveSessionPhase(client, scope, session.id, pausing ? 'paused' : 'live', spikeTimer.elapsedMs(nextClock) / 1000);
      setClock(nextClock);
      setSession({ ...session, phase: pausing ? 'paused' : 'live' });
      if (pausing && rest && !rest.pausedAt) setRest(spikeTimer.pause(rest));
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha ao atualizar a sessão', description: errMsg(e) });
    }
  };

  const finish = async () => {
    if (!session) return;
    const client = getSupabaseClient();
    if (!client) return;
    setBusy(true);
    try {
      const fullNote = [tags.size ? [...tags].join(' · ') : '', note.trim()].filter(Boolean).join('\n');
      await finishLiveSession(client, scope, session.id, { elapsedSeconds: elapsedMs / 1000, notes: fullNote, summary });
      if (session.bookingId) await setBookingStatus(client, scope, session.bookingId, 'completed');
      setClock((c) => (c ? spikeTimer.pause(c) : c));
      setRest(null);
      setSession({ ...session, phase: 'done' });
      setActiveId(null);
      setTab('summary');
      if (session.clientId) setPartilhar(session.id);
      toast({ variant: 'success', title: 'Sessão guardada', description: session.bookingId ? 'Marcação passou a concluída.' : undefined });
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha ao finalizar', description: errMsg(e) });
    } finally { setBusy(false); }
  };

  const newSession = () => {
    setSession(null); setClock(null); setRest(null); setTab('exercise');
    if (bookingId) navigate('/live');
    loadSetup();
  };

  const addExercise = async (ex: ExerciseLite) => {
    if (!session) return;
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await addLiveExercise(client, scope, session.id, { exerciseId: ex.id, position: exList.length });
      await openSession(session.id, true);
      setAddOpen(false);
      toast({ variant: 'success', title: 'Exercício adicionado', description: ex.name });
    } catch (e) {
      toast({ variant: 'danger', title: 'Não foi possível adicionar', description: errMsg(e) });
    }
  };

  const saveNote = async (text: string) => {
    if (!noteFor || !session) return;
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await setLiveExerciseNote(client, scope, noteFor.id, text);
      await openSession(session.id, true);
      setNoteFor(null);
      toast({ variant: 'success', title: 'Nota guardada' });
    } catch (e) {
      toast({ variant: 'danger', title: 'Nota não guardada', description: errMsg(e) });
    }
  };

  // ===== render =====
  const wk = workoutOf(session);
  const title = session ? (wk?.name ?? 'Sessão livre') : 'Treino ao Vivo';
  const sub = session
    ? `${athleteName(session.clientId)} · ${exList.length} exercícios`
    : `Executa o ${vocab.sessao()} com o ${p1}, série a série.`;

  const head = (
    <div className="live-head">
      <div className="live-head-l">
        <div className="live-head-icon"><Svg name="live" /></div>
        <div style={{ minWidth: 0 }}>
          <div className="live-kicker">
            {phase === 'live' && <span className="live-dot-live" />}
            {phase === 'live' ? 'Live Session · em sessão' : phase === 'paused' ? 'Live Session · em pausa'
              : phase === 'done' ? 'Live Session · terminada' : 'Live Session'}
          </div>
          <div className="live-title">{title}</div>
          <div className="live-head-sub">{sub}</div>
        </div>
      </div>
      <div className="live-head-r">
        {session && <span className="live-head-time" role="timer" aria-label="Duração da sessão">{fmtClock(elapsedMs)}</span>}
        {(phase === 'live' || phase === 'paused') && (
          <>
            <button type="button" className="live-icob" title={phase === 'live' ? 'Pausar sessão' : 'Retomar sessão'}
              aria-label={phase === 'live' ? 'Pausar sessão' : 'Retomar sessão'} onClick={() => void togglePause()}>
              <Svg name={phase === 'live' ? 'pause' : 'play'} />
            </button>
            <button type="button" className="live-icob" title="Adicionar exercício" aria-label="Adicionar exercício" onClick={() => setAddOpen(true)}>
              <Svg name="plus" />
            </button>
            <button type="button" className="btn primary" disabled={busy} onClick={() => void finish()}><Svg name="finish" /> Finalizar</button>
          </>
        )}
        {phase === 'done' && <button type="button" className="btn primary" onClick={newSession}>+ Nova sessão</button>}
        {phase === 'setup' && (
          <button type="button" className="btn live-start" disabled={busy || loading || !pickAthlete} onClick={() => void start()}>
            <Svg name="play" /> Iniciar sessão
          </button>
        )}
      </div>
    </div>
  );

  const tabs = session && (
    <div className="live-tabs" role="tablist">
      {([['exercise', 'dumbbell', 'Exercício', null], ['list', 'list', 'Lista', exList.length], ['summary', 'chart', 'Resumo', null]] as const)
        .map(([id, icon, label, cnt]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`live-tab${tab === id ? ' on' : ''}`} onClick={() => setTab(id)}>
            <Svg name={icon} />{label}{cnt != null && <span className="cnt">{cnt}</span>}
          </button>
        ))}
    </div>
  );

  let body: JSX.Element;
  if (error) {
    body = <div className="live-card"><div className="live-empty"><div className="live-empty-ico"><Svg name="alert" /></div><h4>Erro ao carregar</h4><p>{error}</p></div></div>;
  } else if (!session) {
    body = (
      <SetupPanel
        loading={loading} athletes={athletes} workouts={workouts} pickAthlete={pickAthlete} pickWorkout={pickWorkout}
        onPickAthlete={setPickAthlete} onPickWorkout={setPickWorkout} busy={busy} onStart={() => void start()}
        activeId={activeId} onResume={() => void resume()} fromBooking={!!bookingId}
      />
    );
  } else if (tab === 'list') {
    body = (
      <div className="live-pnl on">
        <div className="live-setup-greet" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.3rem' }}>Lista do treino</h2>
          <p>Salta para qualquer exercício. As séries gravadas ficam na sessão.</p>
        </div>
        <div className="live-list">
          {exList.map((e, i) => {
            const st = statusOf(e, i);
            const plan = plannedOf(e);
            const meta = [
              `${e.targetSets ?? '—'}×${plan?.targetReps ?? '—'}`,
              plan?.targetLoad,
              `${e.sets.filter((s) => s.completed).length}/${e.targetSets ?? e.sets.length} séries`,
            ].filter(Boolean).join(' · ');
            return (
              <div key={e.id} className={`live-lrow${st === 'done' ? ' done' : st === 'skipped' ? ' skipped' : st === 'cur' ? ' cur' : ''}`}>
                <div className="live-lrow-num">{i + 1}</div>
                <button type="button" className="live-lrow-body" style={{ cursor: 'pointer', background: 'none', border: 0, textAlign: 'left', color: 'inherit' }}
                  onClick={() => phase !== 'done' && jump(i)}>
                  <div className="live-lrow-name">{e.name}</div>
                  <div className="live-lrow-meta">{meta}</div>
                </button>
                <span className={`live-lrow-status ${st === 'done' ? 'live-st-done' : st === 'skipped' ? 'live-st-skipped' : st === 'cur' ? 'live-st-cur' : 'live-st-pending'}`}>
                  {st === 'done' ? 'Concluído' : st === 'skipped' ? 'Saltado' : st === 'cur' ? 'Em curso' : 'Pendente'}
                </span>
              </div>
            );
          })}
          {!exList.length && <div className="live-empty"><h4>Sem exercícios</h4><p>Adiciona exercícios para começar a registar séries.</p></div>}
        </div>
        {phase !== 'done' && (
          <button type="button" className="live-ctrl add" style={{ marginTop: 11, width: '100%' }} onClick={() => setAddOpen(true)}>
            <Svg name="plus" /> Adicionar exercício
          </button>
        )}
      </div>
    );
  } else if (tab === 'summary') {
    const locked = phase === 'done';
    body = (
      <div className="live-pnl on">
        <div className="live-setup-greet" style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: '1.3rem' }}>{locked ? 'Sessão terminada' : 'Resumo em tempo real'}</h2>
          <p>{locked ? 'A sessão ficou guardada com as séries, a duração e a nota.' : 'Progresso acumulado. Ao finalizar, a sessão fica guardada.'}</p>
        </div>
        <div className="live-sum-stats">
          <div className="live-sum-stat"><div className="live-sum-val orange">{processed}/{exList.length}</div><div className="live-sum-lbl">Exercícios feitos</div></div>
          <div className="live-sum-stat"><div className="live-sum-val gold">{summary.sets}</div><div className="live-sum-lbl">Séries concluídas</div></div>
          <div className="live-sum-stat"><div className="live-sum-val teal">{summary.volumeKg.toLocaleString('pt-PT')}</div><div className="live-sum-lbl">kg movimentados</div></div>
          <div className="live-sum-stat"><div className="live-sum-val success">{summary.avgRpe ?? '—'}</div><div className="live-sum-lbl">RPE médio</div></div>
        </div>
        <div className="live-card" style={{ marginBottom: 13 }}>
          <div className="live-setup-h"><Svg name="list" /> Exercícios · previsto vs real</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="live-sum-table">
              <thead><tr><th>Exercício</th><th>Previsto</th><th>Real</th><th>Estado</th></tr></thead>
              <tbody>
                {exList.map((e, i) => {
                  const plan = plannedOf(e);
                  const done = e.sets.filter((s) => s.completed);
                  const failed = e.sets.length - done.length;
                  const st = statusOf(e, i);
                  const best = done.reduce<number | null>((m, s) => (s.loadKg != null && (m == null || s.loadKg > m) ? s.loadKg : m), null);
                  return (
                    <tr key={e.id}>
                      <td><b>{e.name}</b></td>
                      <td>{e.targetSets ?? '—'}×{plan?.targetReps ?? '—'}{plan?.targetLoad ? ` · ${plan.targetLoad}` : ''}</td>
                      <td>{done.length} séries{best != null ? ` · até ${best}kg` : ''}{failed ? ` · ${failed} falha(s)` : ''}</td>
                      <td>{st === 'done' ? <span className="badge bsuccess">✓</span> : st === 'skipped' ? <span className="badge bt">Saltado</span> : <span className="badge bwarn">Parcial</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="live-card" style={{ marginBottom: 13 }}>
          <div className="live-setup-h"><Svg name="note" /> Nota do treino</div>
          {locked
            ? <p style={{ fontSize: '.86rem', color: 'var(--muted-hi)', whiteSpace: 'pre-wrap' }}>{[...tags].join(' · ')}{tags.size && note ? '\n' : ''}{note || (tags.size ? '' : 'Sem nota.')}</p>
            : (
              <>
                <textarea className="live-note-area" aria-label="Nota do treino" value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Como correu a sessão?" />
                <div className="live-tagrow">
                  {NOTE_TAGS.map((t) => (
                    <button key={t} type="button" className={`live-tag${tags.has(t) ? ' on' : ''}`} aria-pressed={tags.has(t)}
                      onClick={() => setTags((s) => { const n = new Set(s); if (n.has(t)) n.delete(t); else n.add(t); return n; })}>{t}</button>
                  ))}
                </div>
              </>
            )}
        </div>
        <div className="live-card">
          <div className="live-setup-h"><Svg name="bolt" /> Sessão & duração</div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '.84rem', color: 'var(--muted-hi)' }}>
            <div><b style={{ color: 'var(--white)', fontFamily: 'var(--display)', fontSize: '1.1rem' }}>{Math.max(1, Math.round(elapsedMs / 60000))} min</b><br />duração</div>
            <div><b style={{ color: 'var(--white)', fontFamily: 'var(--display)', fontSize: '1.1rem' }}>{athleteName(session.clientId)}</b><br />{p1}</div>
            <div><b style={{ color: 'var(--white)', fontFamily: 'var(--display)', fontSize: '1.1rem' }}>{title}</b><br />treino</div>
          </div>
          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', marginTop: 16 }}>
            {locked
              ? <button type="button" className="btn primary" onClick={newSession}>+ Nova sessão</button>
              : <button type="button" className="btn primary" disabled={busy} onClick={() => void finish()}><Svg name="check" /> Finalizar e guardar</button>}
          </div>
        </div>
      </div>
    );
  } else if (!cur) {
    body = (
      <div className="live-pnl on"><div className="live-card"><div className="live-empty">
        <div className="live-empty-ico"><Svg name="dumbbell" /></div>
        <h4>Sem exercícios nesta sessão</h4>
        <p>Adiciona exercícios da tua biblioteca para começar a registar séries.</p>
        <button type="button" className="btn primary" style={{ marginTop: 14 }} onClick={() => setAddOpen(true)}>+ Adicionar exercício</button>
      </div></div></div>
    );
  } else {
    const plan = plannedOf(cur);
    const lastPerf = cur.exerciseId ? last.get(cur.exerciseId) : undefined;
    const d = draftFor(cur);
    const target = cur.targetSets ?? Math.max(cur.sets.length + 1, 1);
    const pct = exList.length ? Math.round((processed / exList.length) * 100) : 0;
    const plannedLoad = parseTargetLoadKg(plan?.targetLoad);
    const trend = plannedLoad != null && lastPerf?.loadKg != null ? plannedLoad - lastPerf.loadKg : null;
    const curStatus = statusOf(cur, curIdx);
    const restRunning = !!rest && !rest.pausedAt && restRemaining > 0;
    const ringFrac = restDuration ? restRemaining / restDuration : 0;
    body = (
      <div className="live-pnl on">
        <div className="live-progress-top" style={{ marginBottom: 14 }}>
          <div className="live-prog-bar"><div className="live-prog-fill" style={{ width: `${pct}%` }} /></div>
          <div className="live-prog-txt">{processed}/{exList.length} exercícios · {pct}%</div>
        </div>

        <div className="live-stage">
          <div className="live-ex-head">
            <div style={{ minWidth: 0 }}>
              <div className="live-ex-idx">Exercício {curIdx + 1} de {exList.length}</div>
              <div className="live-ex-name">{cur.name}</div>
              <div className="live-ex-muscle">
                {plan && <span className="live-ex-badge">{CATEGORY_LABEL[plan.category] ?? plan.category}</span>}
                {cur.notes && <span>📝 {cur.notes}</span>}
              </div>
            </div>
          </div>

          <div className="live-cols">
            <div className="live-col planned">
              <div className="live-col-h">Previsto</div>
              <div className="live-col-big">{cur.targetSets ?? '—'} × {plan?.targetReps ?? '—'}</div>
              <div className="live-col-sub">{plan?.targetLoad ?? 'Sem carga prescrita'}</div>
            </div>
            <div className="live-col actual">
              <div className="live-col-h">Real <span style={{ color: 'var(--orange)' }}>série {Math.min(cur.sets.length + 1, target)}/{target}</span></div>
              <div className="live-sets">
                {cur.sets.map((s) => (
                  <div key={s.id} className={`live-set ${s.completed ? 'done' : 'failed'}`}>
                    <div className="live-set-n">{s.setIndex}</div>
                    <div className="live-set-field"><input className="live-set-input" value={s.reps ?? ''} disabled aria-label={`Reps série ${s.setIndex}`} /><div className="live-set-x">reps</div></div>
                    <div className="live-set-field"><input className="live-set-input" value={s.loadKg ?? ''} disabled aria-label={`Carga série ${s.setIndex}`} /><div className="live-set-x">kg</div></div>
                    <div className="live-set-field rpe"><input className="live-set-input" value={s.rpe ?? ''} disabled aria-label={`RPE série ${s.setIndex}`} /><div className="live-set-x">RPE</div></div>
                    <div className="live-set-state"><Svg name={s.completed ? 'check' : 'x'} /></div>
                  </div>
                ))}
                {curStatus !== 'done' && phase !== 'done' && (
                  <div className="live-set cur">
                    <div className="live-set-n">{cur.sets.length + 1}</div>
                    <div className="live-set-field"><input className="live-set-input" type="number" inputMode="numeric" min={0} value={d.reps} aria-label="Reps"
                      onChange={(e) => setDraft(cur, { reps: e.target.value })} /><div className="live-set-x">reps</div></div>
                    <div className="live-set-field"><input className="live-set-input" type="number" inputMode="decimal" min={0} step={0.5} value={d.load} aria-label="Carga (kg)"
                      onChange={(e) => setDraft(cur, { load: e.target.value })} /><div className="live-set-x">kg</div></div>
                    <div className="live-set-field rpe"><input className="live-set-input" type="number" inputMode="decimal" min={0} max={10} step={0.5} value={d.rpe} aria-label="RPE (0 a 10)"
                      placeholder="–" onChange={(e) => setDraft(cur, { rpe: e.target.value })} /><div className="live-set-x">RPE</div></div>
                    <div className="live-set-state" />
                  </div>
                )}
              </div>
            </div>
            <div className="live-col last">
              <div className="live-col-h">Último treino</div>
              {lastPerf ? (
                <>
                  <div className="live-col-big">{lastPerf.reps ?? '—'} × {lastPerf.loadKg ?? '—'}<span style={{ fontSize: '.9rem' }}>kg</span></div>
                  <div className="live-col-sub">{new Date(lastPerf.recordedAt).toLocaleDateString('pt-PT')}{lastPerf.rpe != null ? ` · RPE ${lastPerf.rpe}` : ''}</div>
                  {trend != null && (
                    <div className={`live-col-trend${trend < 0 ? ' down' : ''}`}><Svg name="trend" />
                      {trend > 0 ? `+${trend}kg vs último` : trend < 0 ? `${trend}kg vs último` : 'igual ao último'}
                    </div>
                  )}
                </>
              ) : (
                <div className="live-col-sub">Sem registo anterior deste exercício para o {p1}.</div>
              )}
            </div>
          </div>

          {curStatus !== 'done' && phase !== 'done' && (
            <>
              <div className="live-actions">
                <button type="button" className="live-act ok" disabled={busy || phase !== 'live'} onClick={() => void logSet(true)}><Svg name="check" /> Série OK</button>
                <button type="button" className="live-act fail" disabled={busy || phase !== 'live'} onClick={() => void logSet(false)}><Svg name="x" /> Falhou</button>
                <button type="button" className="live-act note" onClick={() => setNoteFor(cur)}><Svg name="note" /> Nota</button>
              </div>
              {cur.targetSets != null && cur.sets.length < cur.targetSets && (
                <button type="button" className="live-confirm-all" disabled={busy || phase !== 'live'} onClick={() => void confirmExercise()}>
                  ✓ Confirmar exercício inteiro ({cur.targetSets - cur.sets.length} séries com estes valores)
                </button>
              )}
              {phase === 'paused' && <p className="live-col-sub" style={{ marginBottom: 12 }}>Sessão em pausa. Retoma para registar séries.</p>}
            </>
          )}

          <div className="live-timer">
            <div className="live-timer-ring">
              <svg viewBox="0 0 88 88" aria-hidden>
                <circle className="bg" cx="44" cy="44" r="37" />
                <circle className="fg" cx="44" cy="44" r="37" style={{ strokeDasharray: RING_C, strokeDashoffset: (RING_C * (1 - ringFrac)).toFixed(1) }} />
              </svg>
              <div className="live-timer-display" role="timer" aria-label={`Descanso: ${fmtTime(restRemaining / 1000)}`}>{fmtTime(restRemaining / 1000)}</div>
            </div>
            <div className="live-timer-mid">
              <div className="live-timer-lbl">Descanso</div>
              <div className="live-timer-sub">Sugerido: {fmtTime(cur.restSeconds ?? DEFAULT_REST)} entre séries</div>
            </div>
            <div className="live-timer-btns">
              <button type="button" className="live-tbtn primary" onClick={toggleRest}><Svg name={restRunning ? 'pause' : 'play'} />{restRunning ? 'Pausar' : 'Iniciar'}</button>
              <button type="button" className="live-tbtn" onClick={addRest}><Svg name="plus30" /> +30s</button>
              <button type="button" className="live-tbtn" onClick={resetRest}><Svg name="reset" /> Repor</button>
            </div>
          </div>

          <div className="live-next-wrap">
            <div className="live-next-h">Próximos exercícios</div>
            <div className="live-next-scroll">
              {exList.map((e, i) => ({ e, i })).filter((o) => o.i > curIdx).slice(0, 6).map(({ e, i }) => (
                <button key={e.id} type="button" className={`live-next-card${skipped.has(e.id) ? ' skipped' : ''}`} style={{ textAlign: 'left', color: 'inherit' }} onClick={() => jump(i)}>
                  <div className="live-next-num">#{i + 1}</div>
                  <div className="live-next-name">{e.name}</div>
                  <div className="live-next-plan">{e.targetSets ?? '—'}×{plannedOf(e)?.targetReps ?? '—'}{plannedOf(e)?.targetLoad ? ` · ${plannedOf(e)?.targetLoad}` : ''}</div>
                </button>
              ))}
              {curIdx >= exList.length - 1 && <div style={{ fontSize: '.8rem', color: 'var(--muted)', padding: 8 }}>Este é o último exercício.</div>}
            </div>
          </div>
        </div>

        <div className="live-controls">
          <button type="button" className="live-ctrl add" onClick={() => setAddOpen(true)}><Svg name="plus" /> Adicionar exercício</button>
          <button type="button" className="live-ctrl" onClick={skip}><Svg name="skip" /> Pular exercício</button>
          <button type="button" className="live-ctrl finish" disabled={busy} onClick={() => void finish()}><Svg name="finish" /> Finalizar sessão</button>
        </div>
      </div>
    );
  }

  const board = (
    <LiveBoard
      phase={phase} exList={exList} statusOf={statusOf} onJump={jump}
      restLabel={fmtTime(restRemaining / 1000)} summary={summary} processed={processed}
      onStart={() => void start()} canStart={!busy && !loading && !!pickAthlete}
      onAdd={() => setAddOpen(true)} onSkip={skip} onFinish={() => void finish()} onSummary={() => setTab('summary')}
      onNew={newSession} elapsed={fmtClock(elapsedMs)}
    />
  );

  return (
    <CoachShell headStrong={`${SESSAO} ao vivo`} headSub={`Executa o ${vocab.sessao()} com o ${p1}, série a série.`} board={board}>
      <div className="live-root">
        {head}
        {tabs}
        {body}
      </div>
      <AddExerciseModal open={addOpen} onClose={() => setAddOpen(false)} exercises={exercises} onPick={(e) => void addExercise(e)} />
      <ExerciseNoteModal ex={noteFor} onClose={() => setNoteFor(null)} onSave={(t) => void saveNote(t)} />
      <PartilharResumo aberta={!!partilhar} sessaoId={partilhar} cliente={session?.clientId ? athleteName(session.clientId) : null} onFechar={() => setPartilhar(null)} />
    </CoachShell>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  strength: 'Força', cardio: 'Cardio', mobility: 'Mobilidade', plyometric: 'Pliometria',
  balance: 'Equilíbrio', rehab: 'Reabilitação', skill: 'Técnica', other: 'Outro',
};

function SetupPanel({
  loading, athletes, workouts, pickAthlete, pickWorkout, onPickAthlete, onPickWorkout, busy, onStart,
  activeId, onResume, fromBooking,
}: {
  loading: boolean; athletes: ClientLite[]; workouts: LiveWorkout[];
  pickAthlete: string | null; pickWorkout: string | null;
  onPickAthlete: (id: string) => void; onPickWorkout: (id: string | null) => void;
  busy: boolean; onStart: () => void; activeId: string | null; onResume: () => void; fromBooking: boolean;
}) {
  const ath = athletes.find((a) => a.id === pickAthlete);
  const wk = workouts.find((w) => w.id === pickWorkout) ?? null;
  const totalSets = wk?.exercises.reduce((s, e) => s + (e.targetSets ?? 0), 0) ?? 0;
  return (
    <div className="live-pnl on">
      <div className="live-setup">
        <div className="live-setup-greet">
          <h2>Preparar sessão</h2>
          <p>Escolhe o {p1} e o {vocab.sessao()}. A prescrição vem da biblioteca; cada série fica gravada assim que a marcas.</p>
        </div>
        {activeId && (
          <div className="live-resume">
            <span><b>Tens uma sessão em curso.</b> Retoma-a para continuar onde ficaste.</span>
            <button type="button" className="btn secondary" disabled={busy} onClick={onResume}><Svg name="play" /> Retomar sessão</button>
          </div>
        )}
        {fromBooking && <div className="live-resume" style={{ background: 'rgba(252,133,0,.08)', borderColor: 'rgba(252,133,0,.28)' }}>
          <span>Sessão ligada a uma <b>marcação do calendário</b>. Ao finalizar, a marcação passa a concluída.</span>
        </div>}
        <div className="live-setup-grid">
          <div className="live-card">
            <div className="live-setup-h"><Svg name="user" /> {P1}</div>
            {loading && <p className="live-pick-meta">A carregar…</p>}
            {!loading && !athletes.length && <p className="live-pick-meta">Ainda não tens {pp}. Cria um em {vocab.pessoa({ plural: true, maiuscula: true })}.</p>}
            {athletes.map((a) => (
              <button key={a.id} type="button" className={`live-pick${pickAthlete === a.id ? ' on' : ''}`} aria-pressed={pickAthlete === a.id} onClick={() => onPickAthlete(a.id)}>
                <div className="live-pick-av">{initials(a.name)}</div>
                <div className="live-pick-body"><div className="live-pick-name">{a.name}</div></div>
                <div className="live-pick-check"><Svg name="check" /></div>
              </button>
            ))}
          </div>
          <div className="live-card">
            <div className="live-setup-h"><Svg name="dumbbell" /> Treino (da biblioteca)</div>
            {!loading && !workouts.length && <p className="live-pick-meta">Ainda não há treinos. Podes começar uma sessão livre e adicionar exercícios.</p>}
            {workouts.map((w) => (
              <button key={w.id} type="button" className={`live-pick${pickWorkout === w.id ? ' on' : ''}`} aria-pressed={pickWorkout === w.id} onClick={() => onPickWorkout(w.id)}>
                <div className="live-pick-av wk"><Svg name="dumbbell" /></div>
                <div className="live-pick-body">
                  <div className="live-pick-name">{w.name}</div>
                  <div className="live-pick-meta">{w.exercises.length} exercícios{w.estDurationMin ? ` · ~${w.estDurationMin} min` : ''}</div>
                </div>
                <div className="live-pick-check"><Svg name="check" /></div>
              </button>
            ))}
            <button type="button" className={`live-pick${pickWorkout === null ? ' on' : ''}`} aria-pressed={pickWorkout === null} onClick={() => onPickWorkout(null)}>
              <div className="live-pick-av wk"><Svg name="plus" /></div>
              <div className="live-pick-body"><div className="live-pick-name">Sessão livre</div><div className="live-pick-meta">Sem treino; adicionas exercícios durante a sessão</div></div>
              <div className="live-pick-check"><Svg name="check" /></div>
            </button>
          </div>
        </div>
        <div className="live-start-row">
          <div className="live-start-info">
            {ath ? <>Pronto para <b>{ath.name}</b> · <b>{wk?.name ?? 'Sessão livre'}</b>{wk ? ` · ${wk.exercises.length} exercícios · ${totalSets} séries` : ''}</> : `Escolhe um ${p1} para começar.`}
          </div>
          <button type="button" className="btn live-start" disabled={busy || loading || !ath} onClick={onStart}><Svg name="play" /> Iniciar sessão</button>
        </div>
      </div>
    </div>
  );
}

function LiveBoard({
  phase, exList, statusOf, onJump, restLabel, summary, processed, onStart, canStart,
  onAdd, onSkip, onFinish, onSummary, onNew, elapsed,
}: {
  phase: string; exList: LiveSessionExercise[];
  statusOf: (e: LiveSessionExercise, i: number) => ExStatus; onJump: (i: number) => void;
  restLabel: string; summary: { sets: number; volumeKg: number; avgRpe: number | null }; processed: number;
  onStart: () => void; canStart: boolean; onAdd: () => void; onSkip: () => void; onFinish: () => void;
  onSummary: () => void; onNew: () => void; elapsed: string;
}) {
  if (phase === 'setup') {
    return (
      <>
        <div className="board-card">
          <div className="board-title">Live Session</div>
          <div className="board-sub">Executa o {vocab.sessao()} com o {p1} em tempo real. Cada série fica gravada na hora, com reps, carga e RPE.</div>
          <div className="board-actions"><button type="button" className="btn live-start" disabled={!canStart} onClick={onStart}><Svg name="play" /> Iniciar sessão</button></div>
        </div>
        <div className="board-card">
          <div className="board-title">De onde vêm os dados</div>
          <div className="mini-row"><span>Treino & exercícios</span><b>Biblioteca</b></div>
          <div className="mini-row"><span>Último treino</span><b>Sessões anteriores</b></div>
          <div className="mini-row"><span>Marcação</span><b>Calendário</b></div>
        </div>
      </>
    );
  }
  if (phase === 'done') {
    return (
      <div className="board-card">
        <div className="board-title">Sessão terminada</div>
        <div className="mini-row"><span>Duração</span><b>{elapsed}</b></div>
        <div className="mini-row"><span>Exercícios</span><b>{processed}/{exList.length}</b></div>
        <div className="mini-row"><span>Séries</span><b>{summary.sets}</b></div>
        <div className="mini-row"><span>Volume</span><b>{summary.volumeKg.toLocaleString('pt-PT')} kg</b></div>
        <div className="mini-row"><span>RPE médio</span><b>{summary.avgRpe ?? '—'}</b></div>
        <div className="board-actions"><button type="button" className="btn primary" onClick={onNew}>+ Nova sessão</button></div>
      </div>
    );
  }
  return (
    <>
      <div className="board-card">
        <div className="board-title">Descanso</div>
        <div className="live-board-mini-timer">{restLabel}</div>
      </div>
      <div className="board-card">
        <div className="board-title">Progresso</div>
        <div className="board-sub">{processed}/{exList.length} exercícios · {summary.sets} séries · {elapsed}</div>
        <div className="live-board-prog" style={{ marginTop: 9 }}>
          {exList.map((e, i) => {
            const st = statusOf(e, i);
            return (
              <button key={e.id} type="button" className={`live-board-prow${st === 'cur' ? ' cur' : st === 'done' ? ' done' : ''}`}
                style={{ color: 'inherit', textAlign: 'left' }} onClick={() => onJump(i)}>
                <span className="live-board-pdot" /><span className="live-board-pname">{e.name}</span>
              </button>
            );
          })}
        </div>
        <div className="live-board-quick">
          <button type="button" className="live-board-qbtn" onClick={onAdd}><span className="live-board-qico"><Svg name="plus" /></span>Exercício</button>
          <button type="button" className="live-board-qbtn" onClick={onSkip}><span className="live-board-qico"><Svg name="skip" /></span>Pular</button>
          <button type="button" className="live-board-qbtn" onClick={onSummary}><span className="live-board-qico"><Svg name="chart" /></span>Resumo</button>
          <button type="button" className="live-board-qbtn" onClick={onFinish}><span className="live-board-qico"><Svg name="finish" /></span>Finalizar</button>
        </div>
      </div>
    </>
  );
}

function AddExerciseModal({ open, onClose, exercises, onPick }: {
  open: boolean; onClose: () => void; exercises: ExerciseLite[]; onPick: (e: ExerciseLite) => void;
}) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const list = exercises.filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <ProtoModal open={open} onClose={onClose} title="Adicionar exercício" sub="Da biblioteca de exercícios da organização."
      footer={<button type="button" className="btn ghost" onClick={onClose}>Fechar</button>}>
      <div className="proto-form">
        <div className="field"><label htmlFor="live-qa-q">Pesquisar</label>
          <input id="live-qa-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome do exercício" />
        </div>
        <div className="live-qa-list" style={{ display: 'flex', flexDirection: 'column', gap: 7, overflow: 'auto' }}>
          {list.map((e) => (
            <button key={e.id} type="button" className="live-qa-ex" onClick={() => onPick(e)}>
              <span className="live-qa-ex-ico"><Svg name="dumbbell" /></span>
              <span className="live-qa-ex-body"><span className="live-qa-ex-name" style={{ display: 'block' }}>{e.name}</span>
                <span className="live-qa-ex-meta">{CATEGORY_LABEL[e.category] ?? e.category} · 3 séries · 1:30 descanso</span></span>
            </button>
          ))}
          {!list.length && <p className="board-sub">{exercises.length ? 'Nenhum exercício encontrado.' : 'A biblioteca está vazia.'}</p>}
        </div>
      </div>
    </ProtoModal>
  );
}

function ExerciseNoteModal({ ex, onClose, onSave }: { ex: LiveSessionExercise | null; onClose: () => void; onSave: (t: string) => void }) {
  const [text, setText] = useState('');
  useEffect(() => { setText(ex?.notes ?? ''); }, [ex]);
  return (
    <ProtoModal open={!!ex} onClose={onClose} title="Nota do exercício" sub={ex?.name} size="sm"
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => onSave(text.trim())}>Guardar nota</button>
      </>}>
      <textarea className="live-note-area" aria-label="Nota do exercício" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Técnica, dor, ajustes de carga…" />
    </ProtoModal>
  );
}
