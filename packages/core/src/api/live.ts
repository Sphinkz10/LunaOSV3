import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { EnumOf } from '../types/database';

/**
 * Live: sessão real, série a série (sessions / session_exercises / session_sets).
 * O treino feito é dado da pessoa (person_id); a organização escreve e lê-o só com
 * ligação ativa e partilha de treino. Dono e organização das séries vêm da sessão.
 */
export type SessionPhase = EnumOf<'session_phase'>;

export interface ExerciseLite { id: string; name: string; category: string }

export interface LiveWorkoutExercise {
  exerciseId: string;
  name: string;
  category: string;
  position: number;
  targetSets: number | null;
  targetReps: string | null;
  targetLoad: string | null;
  restSeconds: number | null;
}

export interface LiveWorkout {
  id: string;
  name: string;
  estDurationMin: number | null;
  exercises: LiveWorkoutExercise[];
}

export interface LiveSet {
  id: string;
  sessionExerciseId: string;
  setIndex: number;
  reps: number | null;
  loadKg: number | null;
  rpe: number | null;
  completed: boolean;
  restTakenSeconds: number | null;
  recordedAt: string;
}

export interface LiveSessionExercise {
  id: string;
  exerciseId: string | null;
  name: string;
  position: number;
  targetSets: number | null;
  restSeconds: number | null;
  notes: string | null;
  sets: LiveSet[];
}

export interface LiveSession {
  id: string;
  clientId: string | null;
  bookingId: string | null;
  workoutId: string | null;
  phase: SessionPhase;
  startedAt: string | null;
  endedAt: string | null;
  elapsedSeconds: number;
  notes: string | null;
  exercises: LiveSessionExercise[];
}

export interface LastPerformance { reps: number | null; loadKg: number | null; rpe: number | null; recordedAt: string }

export interface SessionSummary { sets: number; failed: number; volumeKg: number; avgRpe: number | null }

/** Primeiro número de uma prescrição de reps ('8-10' → 8, '12' → 12). */
export function parseTargetReps(target: string | null | undefined): number | null {
  const m = target?.match(/\d+/);
  return m ? Number(m[0]) : null;
}

/** Carga em kg só quando a prescrição é absoluta ('60kg', '62.5'); '%1RM'/'RPE' → null. */
export function parseTargetLoadKg(target: string | null | undefined): number | null {
  if (!target || /%|rpe/i.test(target)) return null;
  const m = target.replace(',', '.').match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** Totais reais da sessão: só séries concluídas contam para volume e RPE médio. */
export function computeSessionSummary(sets: Pick<LiveSet, 'reps' | 'loadKg' | 'rpe' | 'completed'>[]): SessionSummary {
  const done = sets.filter((s) => s.completed);
  const volumeKg = done.reduce((acc, s) => acc + (s.reps ?? 0) * (s.loadKg ?? 0), 0);
  const rpes = done.map((s) => s.rpe).filter((r): r is number => r != null);
  const avgRpe = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
  return { sets: done.length, failed: sets.length - done.length, volumeKg: Math.round(volumeKg * 10) / 10, avgRpe };
}

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

export async function fetchExercisesLite(client: LunaClient, scope: OrgScope): Promise<ExerciseLite[]> {
  const { data, error } = await client.from('exercises')
    .select('id,name,category')
    .eq('org_id', scope.orgId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as ExerciseLite[];
}

/** Treinos do Studio com os exercícios prescritos (ordem do treino). */
export async function fetchLiveWorkouts(client: LunaClient, scope: OrgScope): Promise<LiveWorkout[]> {
  const { data: wks, error } = await client.from('workouts')
    .select('id,name,est_duration_min')
    .eq('org_id', scope.orgId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(200);
  if (error) throw error;
  if (!wks?.length) return [];
  const [{ data: wex, error: e2 }, exercises] = await Promise.all([
    client.from('workout_exercises')
      .select('workout_id,exercise_id,position,target_sets,target_reps,target_load,rest_seconds')
      .eq('org_id', scope.orgId)
      .in('workout_id', wks.map((w) => w.id))
      .order('position', { ascending: true })
      .limit(1000),
    fetchExercisesLite(client, scope),
  ]);
  if (e2) throw e2;
  const exById = new Map(exercises.map((e) => [e.id, e]));
  return wks.map((w) => ({
    id: w.id,
    name: w.name,
    estDurationMin: w.est_duration_min,
    exercises: (wex ?? []).filter((x) => x.workout_id === w.id).map((x) => ({
      exerciseId: x.exercise_id,
      name: exById.get(x.exercise_id)?.name ?? 'Exercício',
      category: exById.get(x.exercise_id)?.category ?? 'other',
      position: x.position,
      targetSets: x.target_sets,
      targetReps: x.target_reps,
      targetLoad: x.target_load,
      restSeconds: x.rest_seconds,
    })),
  }));
}

/** Sessão completa (exercícios + séries) por id. */
export async function fetchLiveSession(client: LunaClient, scope: OrgScope, sessionId: string): Promise<LiveSession> {
  const [{ data: s, error }, { data: sex, error: e2 }, { data: sets, error: e3 }] = await Promise.all([
    client.from('sessions')
      .select('id,link_id,booking_id,workout_id,phase,started_at,ended_at,elapsed_seconds,notes')
      .eq('org_id', scope.orgId).eq('id', sessionId).single(),
    client.from('session_exercises')
      .select('id,exercise_id,position,target_sets,rest_seconds,notes')
      .eq('org_id', scope.orgId).eq('session_id', sessionId)
      .order('position', { ascending: true }).limit(200),
    client.from('session_sets')
      .select('id,session_exercise_id,set_index,reps,load_kg,rpe,completed,rest_taken_seconds,recorded_at')
      .eq('org_id', scope.orgId).eq('session_id', sessionId)
      .order('set_index', { ascending: true }).limit(1000),
  ]);
  if (error) throw error;
  if (e2) throw e2;
  if (e3) throw e3;
  const exIds = [...new Set((sex ?? []).map((x) => x.exercise_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (exIds.length) {
    const { data: exs, error: e4 } = await client.from('exercises').select('id,name').eq('org_id', scope.orgId).in('id', exIds);
    if (e4) throw e4;
    (exs ?? []).forEach((e) => names.set(e.id, e.name));
  }
  return {
    id: s.id,
    clientId: s.link_id,
    bookingId: s.booking_id,
    workoutId: s.workout_id,
    phase: s.phase,
    startedAt: s.started_at,
    endedAt: s.ended_at,
    elapsedSeconds: s.elapsed_seconds,
    notes: s.notes,
    exercises: (sex ?? []).map((x) => ({
      id: x.id,
      exerciseId: x.exercise_id,
      name: (x.exercise_id && names.get(x.exercise_id)) || 'Exercício',
      position: x.position,
      targetSets: x.target_sets,
      restSeconds: x.rest_seconds,
      notes: x.notes,
      sets: (sets ?? []).filter((st) => st.session_exercise_id === x.id).map(toLiveSet),
    })),
  };
}

function toLiveSet(st: {
  id: string; session_exercise_id: string; set_index: number; reps: number | null; load_kg: number | string | null;
  rpe: number | string | null; completed: boolean; rest_taken_seconds: number | null; recorded_at: string;
}): LiveSet {
  return {
    id: st.id,
    sessionExerciseId: st.session_exercise_id,
    setIndex: st.set_index,
    reps: st.reps,
    loadKg: num(st.load_kg),
    rpe: num(st.rpe),
    completed: st.completed,
    restTakenSeconds: st.rest_taken_seconds,
    recordedAt: st.recorded_at,
  };
}

/** Sessão em curso (live/pausada) mais recente deste membro, para retomar. */
export async function fetchActiveSessionId(client: LunaClient, scope: OrgScope): Promise<string | null> {
  const { data, error } = await client.from('sessions')
    .select('id')
    .eq('org_id', scope.orgId)
    .eq('membership_id', scope.membershipId)
    .in('phase', ['live', 'paused'])
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

export interface StartSessionInput {
  clientId: string;
  workout: LiveWorkout | null;
  bookingId?: string | null;
}

export class NoTrainingShareError extends Error {
  constructor() {
    super('Este cliente não partilha o treino com a organização: não é possível registar a sessão.');
    this.name = 'NoTrainingShareError';
  }
}

/**
 * Cria a sessão em 'live' e copia a prescrição. Se já houver uma sessão aberta
 * para este cliente, devolve-a (não se acumulam sessões órfãs). Se a cópia dos
 * exercícios falhar, a sessão é cancelada em vez de ficar órfã.
 */
export async function startLiveSession(client: LunaClient, scope: OrgScope, input: StartSessionInput): Promise<string> {
  const { data: c, error: ce } = await client.from('clients').select('person_id')
    .eq('org_id', scope.orgId).eq('id', input.clientId).single();
  if (ce) throw ce;

  const { data: open, error: oe } = await client.from('sessions').select('id')
    .eq('org_id', scope.orgId).eq('person_id', c.person_id).in('phase', ['setup', 'live', 'paused']).limit(1);
  if (oe) throw oe;
  if (open?.length) return open[0].id;

  const { data: s, error } = await client.from('sessions').insert({
    person_id: c.person_id,
    org_id: scope.orgId,
    link_id: input.clientId,
    membership_id: scope.membershipId,
    workout_id: input.workout?.id ?? null,
    booking_id: input.bookingId ?? null,
    phase: 'live',
    started_at: new Date().toISOString(),
  }).select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '42501') throw new NoTrainingShareError();
    if (/aptidao_em_falta/.test(error.message)) {
      throw new Error('Este cliente precisa de atestado ou restrição registada (PAR-Q) antes da primeira sessão.');
    }
    throw error;
  }
  const rows = (input.workout?.exercises ?? []).map((e, i) => ({
    session_id: s.id,
    exercise_id: e.exerciseId,
    position: i,
    target_sets: e.targetSets,
    rest_seconds: e.restSeconds,
  }));
  if (rows.length) {
    const { error: e2 } = await client.from('session_exercises').insert(rows);
    if (e2) {
      await client.from('sessions').update({ phase: 'cancelled', ended_at: new Date().toISOString() }).eq('id', s.id);
      throw e2;
    }
  }
  return s.id;
}

export async function addLiveExercise(
  client: LunaClient, _scope: OrgScope, sessionId: string,
  input: { exerciseId: string; position: number; targetSets?: number | null; restSeconds?: number | null },
): Promise<void> {
  const { error } = await client.from('session_exercises').insert({
    session_id: sessionId,
    exercise_id: input.exerciseId,
    position: input.position,
    target_sets: input.targetSets ?? 3,
    rest_seconds: input.restSeconds ?? 90,
  });
  if (error) throw error;
}

export async function setLiveExerciseNote(client: LunaClient, scope: OrgScope, sessionExerciseId: string, notes: string): Promise<void> {
  const { error } = await client.from('session_exercises')
    .update({ notes: notes || null })
    .eq('org_id', scope.orgId).eq('id', sessionExerciseId);
  if (error) throw error;
}

export interface RecordSetInput {
  sessionId: string;
  sessionExerciseId: string;
  setIndex: number;
  reps: number | null;
  loadKg: number | null;
  rpe: number | null;
  completed: boolean;
  restTakenSeconds?: number | null;
}

/** Grava a série logo que é marcada (nada se perde se a app fechar). */
export async function recordLiveSet(client: LunaClient, _scope: OrgScope, input: RecordSetInput): Promise<LiveSet> {
  const { data, error } = await client.from('session_sets').insert({
    session_id: input.sessionId,
    session_exercise_id: input.sessionExerciseId,
    set_index: input.setIndex,
    reps: input.reps,
    load_kg: input.loadKg,
    rpe: input.rpe,
    completed: input.completed,
    rest_taken_seconds: input.restTakenSeconds ?? null,
  }).select('id,session_exercise_id,set_index,reps,load_kg,rpe,completed,rest_taken_seconds,recorded_at').single();
  if (error) throw error;
  return toLiveSet(data);
}

export async function setLiveSessionPhase(
  client: LunaClient, scope: OrgScope, sessionId: string, phase: SessionPhase, elapsedSeconds: number,
): Promise<void> {
  const { error } = await client.from('sessions')
    .update({ phase, elapsed_seconds: Math.max(0, Math.round(elapsedSeconds)) })
    .eq('org_id', scope.orgId).eq('id', sessionId);
  if (error) throw error;
}

/** Fecha a sessão: fase 'done', duração, nota e totais reais em summary. */
export async function finishLiveSession(
  client: LunaClient, scope: OrgScope, sessionId: string,
  input: { elapsedSeconds: number; notes: string | null; summary: SessionSummary },
): Promise<void> {
  const { error } = await client.from('sessions').update({
    phase: 'done',
    ended_at: new Date().toISOString(),
    elapsed_seconds: Math.max(0, Math.round(input.elapsedSeconds)),
    notes: input.notes || null,
    summary: { volume_kg: input.summary.volumeKg, sets: input.summary.sets, failed: input.summary.failed, avg_rpe: input.summary.avgRpe },
  }).eq('org_id', scope.orgId).eq('id', sessionId);
  if (error) throw error;
}

/** Última série concluída de cada exercício deste cliente, em sessões anteriores. */
export async function fetchLastPerformance(
  client: LunaClient, scope: OrgScope, clientId: string, exerciseIds: string[], excludeSessionId?: string,
): Promise<Map<string, LastPerformance>> {
  const out = new Map<string, LastPerformance>();
  if (!exerciseIds.length) return out;
  let sq = client.from('sessions').select('id').eq('org_id', scope.orgId).eq('link_id', clientId)
    .order('started_at', { ascending: false }).limit(50);
  if (excludeSessionId) sq = sq.neq('id', excludeSessionId);
  const { data: sessions, error } = await sq;
  if (error) throw error;
  if (!sessions?.length) return out;
  const { data: sex, error: e2 } = await client.from('session_exercises')
    .select('id,exercise_id')
    .in('session_id', sessions.map((s) => s.id))
    .in('exercise_id', exerciseIds)
    .limit(500);
  if (e2) throw e2;
  if (!sex?.length) return out;
  const exOf = new Map(sex.map((x) => [x.id, x.exercise_id as string]));
  const { data: sets, error: e3 } = await client.from('session_sets')
    .select('session_exercise_id,reps,load_kg,rpe,recorded_at')
    .eq('completed', true)
    .in('session_exercise_id', sex.map((x) => x.id))
    .order('recorded_at', { ascending: false })
    .limit(500);
  if (e3) throw e3;
  for (const st of sets ?? []) {
    const exId = exOf.get(st.session_exercise_id);
    if (exId && !out.has(exId)) {
      out.set(exId, { reps: st.reps, loadKg: num(st.load_kg), rpe: num(st.rpe), recordedAt: st.recorded_at });
    }
  }
  return out;
}

/** Cliente da marcação de origem (fluxo Horário → Iniciar treino). */
export async function fetchBookingClientId(client: LunaClient, scope: OrgScope, bookingId: string): Promise<string | null> {
  const { data, error } = await client.from('bookings').select('link_id')
    .eq('org_id', scope.orgId).eq('id', bookingId).maybeSingle();
  if (error) throw error;
  return data?.link_id ?? null;
}
