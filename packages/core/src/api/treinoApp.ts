import type { LunaClient } from './client';
import type { Json } from '../types/database';

/**
 * Treino na app do cliente (tarefa 12): a semana (C-12), a antevisão (C-09),
 * o treino em curso sem rede (C-10), o resumo (C-11) e o progresso (C-16).
 * O treino feito guarda-se no telemóvel e sincroniza quando houver rede,
 * uma só vez (o id é gerado aqui).
 */
export interface ExercicioDoTreino {
  exercise_id: string; nome: string; series: number | null; reps: string | null; carga: string | null; rpe: number | null;
  descanso: number | null; notas: string | null; video: string | null; trocado_de?: string;
  escalas: Record<string, { reps?: string; carga?: string }>;
  alternativas: { exercise_id: string; nome: string; semelhanca: 'igual' | 'parecido' }[];
}
export interface BlocoDoTreino { rotulo: string; modo: string; voltas: number | null; minutos: number | null; exercicios: ExercicioDoTreino[] }
export interface MeuTreino { workout_id: string; versao: number; link_id: string; nome: string; duracao_min: number | null; blocos: BlocoDoTreino[] }

export async function fetchMeuTreino(client: LunaClient, workoutId?: string | null, dia?: string): Promise<MeuTreino | null> {
  const { data, error } = await client.rpc('my_workout', { _workout: workoutId ?? null, ...(dia ? { _on: dia } : {}) });
  if (error) throw error;
  if (data) return data as unknown as MeuTreino;
  // Sem plano do treinador: o plano solo da pessoa (C-26)
  const solo = await client.rpc('my_solo_workout', { _day: workoutId ?? null, ...(dia ? { _on: dia } : {}) });
  return (solo.data as unknown as MeuTreino) ?? null;
}

export interface DiaDaSemana { dia: string; workoutId: string; nome: string; plano: string | null }
export async function fetchMinhaSemana(client: LunaClient): Promise<DiaDaSemana[]> {
  const [t, s] = await Promise.all([client.rpc('my_week', {}), client.rpc('my_solo_week', {})]);
  if (t.error) throw t.error;
  // O plano do treinador passa para a frente; nos dias sem ele, o plano solo
  return [...(t.data ?? []), ...(s.data ?? []).filter((x) => !(t.data ?? []).some((y) => y.dia === x.dia))]
    .sort((a, b) => a.dia.localeCompare(b.dia))
    .map((d) => ({ dia: d.dia, workoutId: d.workout_id, nome: d.nome, plano: d.plano }));
}

export interface SerieFeita { n: number; reps: number | null; carga: number | null; rpe: number | null; feito: boolean; em: string }
export interface TreinoFeito {
  id: string; link_id: string | null; workout_id: string | null; nome: string; started_at: string; ended_at: string | null;
  rpe: number | null; nota: string; trocas: { de: string; para: string }[];
  exercicios: { exercise_id: string; nome: string; series: number | null; sets: SerieFeita[] }[];
}

const FILA = 'luna.cliente.fila-treinos';
const CURSO = 'luna.cliente.treino-em-curso';
function ler<T>(k: string, d: T): T { try { return JSON.parse(localStorage.getItem(k) ?? '') as T; } catch { return d; } }
function gravar(k: string, v: unknown): void { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem armazenamento */ } }

/** O treino em curso fica no telemóvel a cada série: fechar a app não perde nada. */
export const treinoEmCurso = {
  ler: (): TreinoFeito | null => ler<TreinoFeito | null>(CURSO, null),
  guardar: (t: TreinoFeito) => gravar(CURSO, t),
  limpar: () => { try { localStorage.removeItem(CURSO); } catch { /* idem */ } },
};

export function novoId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => Math.floor(Math.random() * 16).toString(16));
}

export function treinosPorEnviar(): TreinoFeito[] { return ler<TreinoFeito[]>(FILA, []); }

/** Põe na fila e tenta enviar; com rede, sai da fila. Devolve quantos ficaram por enviar. */
export async function terminarTreino(client: LunaClient | null, t: TreinoFeito): Promise<number> {
  const fila = treinosPorEnviar().filter((x) => x.id !== t.id);
  gravar(FILA, [...fila, t]);
  treinoEmCurso.limpar();
  return client ? sincronizarTreinos(client) : treinosPorEnviar().length;
}

export async function sincronizarTreinos(client: LunaClient): Promise<number> {
  const fila = treinosPorEnviar();
  const falta: TreinoFeito[] = [];
  for (const t of fila) {
    const { error } = await client.rpc('sync_my_session', { _p: t as unknown as Json });
    if (error) falta.push(t);
  }
  gravar(FILA, falta);
  return falta.length;
}

export interface Recorde { exercicio: string; carga: number; reps: number | null; em: string }
export async function fetchRecordes(client: LunaClient): Promise<Recorde[]> {
  const { data, error } = await client.rpc('my_records', {});
  if (error) throw error;
  return (data ?? []).map((r) => ({ ...r, carga: Number(r.carga) }));
}

export interface TreinoHistorico { id: string; em: string; nome: string; minutos: number; series: number; rpe: string | null }
export async function fetchHistorico(client: LunaClient): Promise<TreinoHistorico[]> {
  const { data, error } = await client.rpc('my_history', { _limit: 60 });
  if (error) throw error;
  return data ?? [];
}

/** Assiduidade: treinos por semana nas últimas 8 semanas (mais recente no fim). */
export function assiduidade(h: TreinoHistorico[], agora = new Date()): number[] {
  const s = Array(8).fill(0) as number[];
  for (const t of h) {
    const k = Math.floor((agora.getTime() - Date.parse(t.em)) / (7 * 86_400_000));
    if (k >= 0 && k < 8) s[7 - k] += 1;
  }
  return s;
}

/** Recorde novo neste treino? (melhor carga por exercício face ao histórico) */
export function recordesNovos(t: TreinoFeito, antes: Recorde[]): { exercicio: string; carga: number }[] {
  return t.exercicios.flatMap((e) => {
    const melhor = Math.max(0, ...e.sets.filter((x) => x.feito && x.carga != null).map((x) => x.carga!));
    const anterior = antes.find((r) => r.exercicio === e.nome)?.carga ?? 0;
    return melhor > anterior ? [{ exercicio: e.nome, carga: melhor }] : [];
  });
}

/** C-16: o 1RM estimado por sessão de cada exercício nos últimos dias (mais antigo primeiro). */
export interface Ponto1RM { exercicio: string; dia: string; rm: number }
export async function fetchSerie1RM(client: LunaClient, dias = 56): Promise<Ponto1RM[]> {
  const { data, error } = await (client.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: Ponto1RM[] | null; error: { message: string } | null }>)('my_1rm_series', { _dias: dias });
  if (error) throw new Error(error.message);
  return (data ?? []).map((p) => ({ ...p, rm: Number(p.rm) }));
}

/** C-16: as medidas da própria pessoa (peso, massa muscular…), mais antigas primeiro. */
export interface MinhaMedida { chave: string; valor: number; unidade: string | null; em: string }
export async function fetchMinhasMedidas(client: LunaClient): Promise<MinhaMedida[]> {
  const { data, error } = await client.from('measurements').select('metric_key,value,unit,recorded_at').not('value', 'is', null).order('recorded_at', { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []).map((m) => ({ chave: m.metric_key, valor: Number(m.value), unidade: m.unit, em: m.recorded_at }));
}
