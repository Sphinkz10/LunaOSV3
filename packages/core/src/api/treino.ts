import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Json, WorkoutBlockRow } from '../types/database';

/**
 * Treino (tarefa 12): exercícios do ginásio (G-16), treino por blocos (G-17),
 * plano em semanas (G-18) e publicar e atribuir (G-19). Guardar mexe no
 * rascunho; o que já foi atribuído só muda depois de publicar outra vez.
 */
export type ModoBloco = WorkoutBlockRow['mode'];
export const MODOS: { id: ModoBloco; rotulo: string }[] = [
  { id: 'normal', rotulo: 'Normal' }, { id: 'superset', rotulo: 'Superset' }, { id: 'circuito', rotulo: 'Circuito' },
  { id: 'emom', rotulo: 'EMOM' }, { id: 'amrap', rotulo: 'AMRAP' }, { id: 'for_time', rotulo: 'For time' },
];
export type Escala = 'iniciante' | 'intermedio' | 'rx';
export const ESCALAS: { id: Escala; rotulo: string }[] = [{ id: 'iniciante', rotulo: 'Iniciante' }, { id: 'intermedio', rotulo: 'Intermédio' }, { id: 'rx', rotulo: 'RX' }];

export interface LinhaTreino {
  exerciseId: string; nome: string; series: number | null; reps: string; carga: string; rpe: number | null; descanso: number | null; notas: string;
  escalas: Partial<Record<Escala, { reps?: string; carga?: string }>>;
}
export interface BlocoTreino {
  id?: string; rotulo: string; modo: ModoBloco; voltas: number | null; minutos: number | null; notas: string; linhas: LinhaTreino[];
  descansoVoltas?: number | null; descansoDepois?: number | null;
}
export interface Treino {
  id: string; nome: string; descricao: string; duracao: number | null; tipo: 'individual' | 'aula' | 'wod';
  versao: number; publicadoEm: string | null; blocos: BlocoTreino[];
}
export interface TreinoResumo { id: string; nome: string; versao: number; publicadoEm: string | null; atualizadoEm: string; duracao: number | null }

export async function fetchTreinos(client: LunaClient, scope: OrgScope): Promise<TreinoResumo[]> {
  const { data, error } = await client.from('workouts').select('id,name,version,published_at,updated_at,est_duration_min')
    .eq('org_id', scope.orgId).is('archived_at', null).order('name');
  if (error) throw error;
  return (data ?? []).map((w) => ({ id: w.id, nome: w.name, versao: w.version, publicadoEm: w.published_at, atualizadoEm: w.updated_at, duracao: w.est_duration_min }));
}

export async function fetchTreino(client: LunaClient, id: string): Promise<Treino> {
  const [w, b, e] = await Promise.all([
    client.from('workouts').select('*').eq('id', id).single(),
    client.from('workout_blocks').select('*').eq('workout_id', id).order('position'),
    client.from('workout_exercises').select('*').eq('workout_id', id).order('position'),
  ]);
  if (w.error) throw w.error;
  const ids = [...new Set((e.data ?? []).map((x) => x.exercise_id))];
  const { data: ex } = ids.length ? await client.from('exercises').select('id,name').in('id', ids) : { data: [] as { id: string; name: string }[] };
  const nomes = new Map((ex ?? []).map((x) => [x.id, x.name]));
  const linha = (x: NonNullable<typeof e.data>[number]): LinhaTreino => ({
    exerciseId: x.exercise_id, nome: nomes.get(x.exercise_id) ?? 'Exercício', series: x.target_sets, reps: x.target_reps ?? '', carga: x.target_load ?? '',
    rpe: x.target_rpe, descanso: x.rest_seconds, notas: x.notes ?? '', escalas: (x.scales ?? {}) as LinhaTreino['escalas'],
  });
  const blocos: BlocoTreino[] = (b.data ?? []).map((bl) => ({
    id: bl.id, rotulo: bl.label, modo: bl.mode, voltas: bl.rounds, minutos: bl.minutes, notas: bl.notes ?? '',
    descansoVoltas: bl.rest_between_rounds, descansoDepois: bl.rest_after,
    linhas: (e.data ?? []).filter((x) => x.block_id === bl.id).map(linha),
  }));
  // Treinos antigos sem blocos: tudo num bloco normal
  const soltas = (e.data ?? []).filter((x) => !x.block_id);
  if (soltas.length) blocos.push({ rotulo: 'Treino', modo: 'normal', voltas: null, minutos: null, notas: '', linhas: soltas.map(linha) });
  return {
    id: w.data.id, nome: w.data.name, descricao: w.data.description ?? '', duracao: w.data.est_duration_min, tipo: w.data.session_kind,
    versao: w.data.version, publicadoEm: w.data.published_at, blocos,
  };
}

export async function criarTreino(client: LunaClient, scope: OrgScope, nome: string): Promise<string> {
  const { data, error } = await client.from('workouts').insert({ org_id: scope.orgId, name: nome.trim() || 'Treino novo' }).select('id').single();
  if (error) throw error;
  return data.id;
}

/** Guarda o rascunho (blocos e prescrição); a versão publicada não muda. */
export async function guardarTreino(client: LunaClient, scope: OrgScope, t: Treino): Promise<void> {
  const { error } = await client.from('workouts').update({ name: t.nome.trim(), description: t.descricao || null, est_duration_min: t.duracao, session_kind: t.tipo }).eq('id', t.id);
  if (error) throw error;
  const d1 = await client.from('workout_exercises').delete().eq('workout_id', t.id);
  if (d1.error) throw d1.error;
  const d2 = await client.from('workout_blocks').delete().eq('workout_id', t.id);
  if (d2.error) throw d2.error;
  let pos = 0;
  for (const [i, b] of t.blocos.entries()) {
    const { data: bl, error: e1 } = await client.from('workout_blocks').insert({
      org_id: scope.orgId, workout_id: t.id, position: i, label: b.rotulo || `Bloco ${String.fromCharCode(65 + i)}`, mode: b.modo,
      rounds: b.voltas, minutes: b.minutos, notes: b.notas || null, rest_between_rounds: b.descansoVoltas ?? null, rest_after: b.descansoDepois ?? null,
    }).select('id').single();
    if (e1) throw e1;
    if (b.linhas.length) {
      const { error: e2 } = await client.from('workout_exercises').insert(b.linhas.map((l) => ({
        org_id: scope.orgId, workout_id: t.id, block_id: bl.id, exercise_id: l.exerciseId, position: pos++,
        target_sets: l.series, target_reps: l.reps || null, target_load: l.carga || null, target_rpe: l.rpe, rest_seconds: l.descanso,
        notes: l.notas || null, scales: l.escalas as Json, superset_group: b.modo === 'superset' ? i : null,
      })));
      if (e2) throw e2;
    }
  }
}

export async function publicarTreino(client: LunaClient, id: string): Promise<string> {
  const { data, error } = await client.rpc('publish_workout', { _workout: id });
  if (error) {
    if (/pelo menos um exercício/.test(error.message)) throw new Error('Um treino publicado precisa de pelo menos um exercício.');
    throw error;
  }
  return data as string;
}

export async function ultimaVersaoTreino(client: LunaClient, id: string): Promise<{ id: string; versao: number } | null> {
  const { data } = await client.from('workout_versions').select('id,version').eq('workout_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id, versao: data.version } : null;
}

/** Duração prevista (min): soma simples de séries × (40 s + descanso) por exercício, ou os minutos do bloco. */
export function duracaoPrevista(blocos: BlocoTreino[]): number {
  let s = 0;
  for (const b of blocos) {
    if (b.minutos) { s += b.minutos * 60; continue; }
    const voltas = b.voltas ?? 1;
    for (const l of b.linhas) s += (l.series ?? 1) * voltas * (40 + (l.descanso ?? 60));
  }
  return Math.round(s / 60);
}

/* ── Exercícios do ginásio (G-16) ───────────────────────────────────────── */
export interface ExercicioEditavel {
  id?: string; nome: string; categoria: string; descricao: string; video: string; musculos: string[]; material: string[];
  padrao: string; nivel: string; registar: string[]; alternativas: { id: string; nome: string; semelhanca: 'igual' | 'parecido' }[];
}

export async function fetchExercicio(client: LunaClient, id: string): Promise<ExercicioEditavel> {
  const [e, a] = await Promise.all([
    client.from('exercises').select('*').eq('id', id).single(),
    client.from('exercise_alternatives').select('alternative_id,similarity').eq('exercise_id', id),
  ]);
  if (e.error) throw e.error;
  const ids = (a.data ?? []).map((x) => x.alternative_id);
  const { data: n } = ids.length ? await client.from('exercises').select('id,name').in('id', ids) : { data: [] as { id: string; name: string }[] };
  return {
    id: e.data.id, nome: e.data.name, categoria: e.data.category, descricao: e.data.description ?? '', video: e.data.video_url ?? '',
    musculos: e.data.muscles, material: e.data.equipment, padrao: e.data.pattern ?? '', nivel: e.data.level ?? 'iniciante', registar: e.data.record_fields,
    alternativas: (a.data ?? []).map((x) => ({ id: x.alternative_id, nome: n?.find((y) => y.id === x.alternative_id)?.name ?? '—', semelhanca: x.similarity })),
  };
}

export async function guardarExercicio(client: LunaClient, scope: OrgScope, e: ExercicioEditavel): Promise<string> {
  const linha = {
    org_id: scope.orgId, name: e.nome.trim(), category: e.categoria, description: e.descricao || null, video_url: e.video || null,
    muscles: e.musculos, equipment: e.material, pattern: e.padrao || null, level: e.nivel, record_fields: e.registar, joints: [] as string[],
  };
  const r = e.id ? await client.from('exercises').update(linha).eq('id', e.id).select('id').single()
    : await client.from('exercises').insert(linha).select('id').single();
  if (r.error) throw r.error;
  const id = r.data.id;
  const d = await client.from('exercise_alternatives').delete().eq('exercise_id', id);
  if (d.error) throw d.error;
  if (e.alternativas.length) {
    const { error } = await client.from('exercise_alternatives').insert(e.alternativas.map((a) => ({ org_id: scope.orgId, exercise_id: id, alternative_id: a.id, similarity: a.semelhanca })));
    if (error) throw error;
  }
  return id;
}

/* ── Planos (G-18) ──────────────────────────────────────────────────────── */
export interface DiaPlano { semana: number | null; dia: number; treinoId: string; nome: string }
export interface Plano {
  id: string; nome: string; semanas: number; versao: number; publicadoEm: string | null;
  progressao: { tipo?: 'somar' | 'pct' | 'fixo'; subirKg?: number; quandoRpeMax?: number; aCada?: number; max?: number; arredondar?: number };
  descargaSemana: number | null; descargaPct: number | null; dias: DiaPlano[];
}
export interface PlanoResumo { id: string; nome: string; semanas: number | null; versao: number; publicadoEm: string | null }

export async function fetchPlanos(client: LunaClient, scope: OrgScope): Promise<PlanoResumo[]> {
  const { data, error } = await client.from('plans').select('id,name,duration_weeks,version,published_at').eq('org_id', scope.orgId).is('archived_at', null).order('name');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, nome: p.name, semanas: p.duration_weeks, versao: p.version, publicadoEm: p.published_at }));
}

export async function fetchPlano(client: LunaClient, id: string): Promise<Plano> {
  const [p, d] = await Promise.all([
    client.from('plans').select('*').eq('id', id).single(),
    client.from('plan_workouts').select('week,weekday,workout_id,position').eq('plan_id', id).order('position'),
  ]);
  if (p.error) throw p.error;
  const ids = [...new Set((d.data ?? []).map((x) => x.workout_id))];
  const { data: w } = ids.length ? await client.from('workouts').select('id,name').in('id', ids) : { data: [] as { id: string; name: string }[] };
  const pr = (p.data.progression ?? {}) as { tipo?: 'somar' | 'pct' | 'fixo'; valor?: number; subir_kg?: number; quando_rpe_max?: number; a_cada?: number; max?: number; arredondar?: number };
  return {
    id: p.data.id, nome: p.data.name, semanas: p.data.duration_weeks ?? 4, versao: p.data.version, publicadoEm: p.data.published_at,
    progressao: { tipo: pr.tipo, subirKg: pr.valor ?? pr.subir_kg, quandoRpeMax: pr.quando_rpe_max, aCada: pr.a_cada, max: pr.max, arredondar: pr.arredondar },
    descargaSemana: p.data.deload_week, descargaPct: p.data.deload_pct,
    dias: (d.data ?? []).map((x) => ({ semana: x.week, dia: x.weekday ?? 1, treinoId: x.workout_id, nome: w?.find((y) => y.id === x.workout_id)?.name ?? 'Treino' })),
  };
}

export async function criarPlano(client: LunaClient, scope: OrgScope, nome: string, semanas: number): Promise<string> {
  const { data, error } = await client.from('plans').insert({ org_id: scope.orgId, name: nome.trim() || 'Plano novo', duration_weeks: semanas }).select('id').single();
  if (error) throw error;
  return data.id;
}

export async function guardarPlano(client: LunaClient, scope: OrgScope, p: Plano): Promise<void> {
  const { error } = await client.from('plans').update({
    name: p.nome.trim(), duration_weeks: p.semanas, deload_week: p.descargaSemana, deload_pct: p.descargaPct,
    progression: {
      tipo: p.progressao.tipo ?? 'somar', valor: p.progressao.subirKg ?? null, quando_rpe_max: p.progressao.quandoRpeMax ?? null,
      a_cada: p.progressao.aCada ?? null, max: p.progressao.max ?? null, arredondar: p.progressao.arredondar ?? null,
    } as Json,
  }).eq('id', p.id);
  if (error) throw error;
  const d = await client.from('plan_workouts').delete().eq('plan_id', p.id);
  if (d.error) throw d.error;
  if (p.dias.length) {
    const { error: e2 } = await client.from('plan_workouts').insert(p.dias.map((x, i) => ({
      org_id: scope.orgId, plan_id: p.id, workout_id: x.treinoId, week: x.semana, weekday: x.dia, position: i,
    })));
    if (e2) throw e2;
  }
}

export async function publicarPlano(client: LunaClient, id: string): Promise<string> {
  const { data, error } = await client.rpc('publish_plan', { _plan: id });
  if (error) {
    if (/não tem treinos/.test(error.message)) throw new Error('O plano não tem treinos.');
    throw error;
  }
  return data as string;
}

export async function ultimaVersaoPlano(client: LunaClient, id: string): Promise<{ id: string; versao: number } | null> {
  const { data } = await client.from('plan_versions').select('id,version').eq('plan_id', id).order('version', { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id, versao: data.version } : null;
}

/* ── Publicar e atribuir (G-19) ─────────────────────────────────────────── */
export interface Troca { de: string; para: string | null; motivo: string }
export interface PreviaAtribuir { linkId: string; nome: string; trocas: Troca[]; conflito: string | null }
export type O_que = { treinoVersao: string } | { planoVersao: string };

export async function previaAtribuir(client: LunaClient, scope: OrgScope, links: string[], o: O_que, inicio: string): Promise<PreviaAtribuir[]> {
  const { data, error } = await client.rpc('assign_preview', {
    _org: scope.orgId, _links: links, _workout_version: 'treinoVersao' in o ? o.treinoVersao : null,
    _plan_version: 'planoVersao' in o ? o.planoVersao : null, _starts_on: inicio,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({ linkId: r.link_id, nome: r.nome, trocas: (r.trocas as unknown as Troca[]) ?? [], conflito: r.conflito }));
}

export async function atribuirVersao(client: LunaClient, scope: OrgScope, links: string[], o: O_que, inicio: string, conflito: 'manter' | 'substituir' | 'depois'): Promise<number> {
  const { data, error } = await client.rpc('assign_version', {
    _org: scope.orgId, _links: links, _workout_version: 'treinoVersao' in o ? o.treinoVersao : null,
    _plan_version: 'planoVersao' in o ? o.planoVersao : null, _starts_on: inicio, _conflito: conflito,
  });
  if (error) throw error;
  return data as number;
}
