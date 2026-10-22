import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { ExerciseFieldRow } from '../types/database';

/**
 * Treino e ao vivo, funções antigas (tarefa 23): verificar antes de publicar,
 * mudanças da biblioteca, campos próprios, testar plano, marcações ao
 * atribuir, retirar e substituir, histórico, sessões da equipa e resumo
 * previsto contra feito com as correções e a origem.
 */
export async function problemasTreino(client: LunaClient, workoutId: string): Promise<string[]> {
  const { data, error } = await client.rpc('workout_problems', { _workout: workoutId });
  if (error) throw error;
  return (data ?? []).map((p) => p.problema);
}

export interface MudancaBiblioteca { exerciseId: string; nome: string; noTreino: number; atual: number }
export async function mudancasBiblioteca(client: LunaClient, workoutId: string): Promise<MudancaBiblioteca[]> {
  const { data, error } = await client.rpc('workout_library_changes', { _workout: workoutId });
  if (error) throw error;
  return (data ?? []).map((m) => ({ exerciseId: m.exercise_id, nome: m.nome, noTreino: m.versao_no_treino, atual: m.versao_atual }));
}

/** "Atualizar": o treino passa a usar a versão atual do exercício (a publicada só muda ao publicar). */
export async function aceitarAtualizacao(client: LunaClient, workoutId: string, exerciseId: string): Promise<void> {
  const { error } = await client.rpc('accept_exercise_update', { _workout: workoutId, _exercise: exerciseId });
  if (error) throw error;
}

/** "Manter": o treino fica com a versão antiga; para isso aceita a marca sem mudar a prescrição. */
export const manterVersao = aceitarAtualizacao;

/* ── Campos próprios do exercício (até 12) ─────────────────────────────── */
export type CampoProprio = Pick<ExerciseFieldRow, 'label' | 'kind' | 'unit' | 'min_value' | 'max_value' | 'required'>;
export const TIPOS_CAMPO: { id: CampoProprio['kind']; rotulo: string }[] = [
  { id: 'numero', rotulo: 'Número' }, { id: 'sim_nao', rotulo: 'Sim/não' }, { id: 'texto', rotulo: 'Texto' }, { id: 'pct', rotulo: '%' },
];
export async function fetchCamposProprios(client: LunaClient, exerciseId: string): Promise<CampoProprio[]> {
  const { data, error } = await client.from('exercise_fields').select('label,kind,unit,min_value,max_value,required').eq('exercise_id', exerciseId).order('position');
  if (error) throw error;
  return data ?? [];
}
export async function guardarCamposProprios(client: LunaClient, scope: OrgScope, exerciseId: string, campos: CampoProprio[]): Promise<void> {
  if (campos.length > 12) throw new Error('Um exercício tem no máximo 12 campos próprios.');
  const d = await client.from('exercise_fields').delete().eq('exercise_id', exerciseId);
  if (d.error) throw d.error;
  if (campos.length) {
    const { error } = await client.from('exercise_fields').insert(campos.map((c, i) => ({ ...c, org_id: scope.orgId, exercise_id: exerciseId, position: i })));
    if (error) throw error;
  }
}
export async function definirInativo(client: LunaClient, exerciseId: string, inativo: boolean): Promise<void> {
  const { error } = await client.from('exercises').update({ inactive: inativo }).eq('id', exerciseId);
  if (error) throw error;
}

/* ── Testar plano ───────────────────────────────────────────────────────── */
export interface SemanaPrevista { semana: number; carga: number; descarga: boolean }
export async function testarPlano(client: LunaClient, planId: string, base: number): Promise<SemanaPrevista[]> {
  const { data, error } = await client.rpc('plan_preview', { _plan: planId, _base: base });
  if (error) throw error;
  return (data ?? []).map((x) => ({ ...x, carga: Number(x.carga) }));
}

/* ── Marcações ao atribuir ──────────────────────────────────────────────── */
export interface MarcacaoPrevista { dia: string; inicio: string; nome: string; conflito: boolean }
export async function previaMarcacoes(client: LunaClient, scope: OrgScope, membershipId: string, planVersionId: string, inicio: string, hora: string, minutos: number): Promise<MarcacaoPrevista[]> {
  const { data, error } = await client.rpc('assign_bookings_preview', {
    _org: scope.orgId, _membership: membershipId, _plan_version: planVersionId, _start: inicio, _hora: hora, _minutos: minutos,
  });
  if (error) throw error;
  return data ?? [];
}
export async function criarMarcacoes(client: LunaClient, assignmentId: string, membershipId: string, hora: string, minutos: number): Promise<number> {
  const { data, error } = await client.rpc('create_assignment_bookings', { _assignment: assignmentId, _membership: membershipId, _hora: hora, _minutos: minutos });
  if (error) {
    if (/conflito/.test(error.message)) throw new Error('Há marcações em conflito: muda a hora ou o responsável antes de criar.');
    throw error;
  }
  return data as number;
}

/* ── Histórico, retirar e substituir (P-13) ─────────────────────────────── */
export interface AtribuicaoHistorico {
  id: string; nome: string; versao: number | null; tipo: 'treino' | 'plano'; estado: string; inicio: string | null; fim: string | null;
  motivo: string | null; substituidaPor: string | null; criadaEm: string; planVersaoId: string | null; treinoVersaoId: string | null;
}
export async function historicoAtribuicoes(client: LunaClient, linkId: string): Promise<AtribuicaoHistorico[]> {
  const { data, error } = await client.from('assignments')
    .select('id,status,starts_on,ends_on,withdrawn_reason,replaced_by,created_at,plan_id,workout_id,plan_version_id,workout_version_id')
    .eq('link_id', linkId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const planos = [...new Set((data ?? []).map((a) => a.plan_id).filter((x): x is string => !!x))];
  const treinos = [...new Set((data ?? []).map((a) => a.workout_id).filter((x): x is string => !!x))];
  const pvs = [...new Set((data ?? []).map((a) => a.plan_version_id).filter((x): x is string => !!x))];
  const wvs = [...new Set((data ?? []).map((a) => a.workout_version_id).filter((x): x is string => !!x))];
  const [p, w, pv, wv] = await Promise.all([
    planos.length ? client.from('plans').select('id,name').in('id', planos) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    treinos.length ? client.from('workouts').select('id,name').in('id', treinos) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    pvs.length ? client.from('plan_versions').select('id,version').in('id', pvs) : Promise.resolve({ data: [] as { id: string; version: number }[] }),
    wvs.length ? client.from('workout_versions').select('id,version').in('id', wvs) : Promise.resolve({ data: [] as { id: string; version: number }[] }),
  ]);
  return (data ?? []).map((a) => ({
    id: a.id, tipo: a.plan_id ? 'plano' : 'treino',
    nome: (a.plan_id ? p.data?.find((x) => x.id === a.plan_id)?.name : w.data?.find((x) => x.id === a.workout_id)?.name) ?? '—',
    versao: (a.plan_version_id ? pv.data?.find((x) => x.id === a.plan_version_id)?.version : wv.data?.find((x) => x.id === a.workout_version_id)?.version) ?? null,
    estado: a.replaced_by ? 'Substituído' : a.withdrawn_reason ? 'Retirado' : a.status === 'active' ? 'Ativo' : a.status === 'scheduled' ? 'Agendado' : a.status === 'completed' ? 'Feito' : 'Cancelado',
    inicio: a.starts_on, fim: a.ends_on, motivo: a.withdrawn_reason, substituidaPor: a.replaced_by, criadaEm: a.created_at,
    planVersaoId: a.plan_version_id, treinoVersaoId: a.workout_version_id,
  }));
}
export async function retirarAtribuicao(client: LunaClient, id: string, motivo: string): Promise<number> {
  const { data, error } = await client.rpc('withdraw_assignment', { _id: id, _reason: motivo });
  if (error) throw error;
  return data as number;
}
export async function substituirAtribuicao(client: LunaClient, id: string, o: { treinoVersao?: string; planoVersao?: string }, motivo: string): Promise<string> {
  const { data, error } = await client.rpc('replace_assignment', { _old: id, _workout_version: o.treinoVersao ?? null, _plan_version: o.planoVersao ?? null, _reason: motivo });
  if (error) throw error;
  return data as string;
}

/* ── Ao vivo: sessões da equipa e resumo (G-14) ─────────────────────────── */
export interface SessaoEquipa { id: string; cliente: string | null; quem: string | null; fase: string; inicio: string | null; fim: string | null; treino: string | null }
export async function sessoesEquipa(client: LunaClient, scope: OrgScope): Promise<SessaoEquipa[]> {
  const { data, error } = await client.rpc('team_sessions', { _org: scope.orgId, _days: 14 });
  if (error) throw error;
  return data ?? [];
}

export interface LinhaResumo { setId: string; exercicio: string; serie: number; previsto: string; feitoReps: number | null; feitoCarga: number | null; rpe: number | null; desvio: number | null }
export interface ResumoSessao {
  id: string; cliente: string | null; inicio: string | null; minutos: number; rpeMedio: number | null; linhas: LinhaResumo[];
  correcoes: { em: string; texto: string }[]; origem: { treino: string | null; versao: number | null; marcacao: string | null; plano: string | null };
  comoPrevisto: number; total: number; volume: number;
  partilhado: { texto: string; em: string } | null;
}
export async function resumoSessao(client: LunaClient, sessionId: string): Promise<ResumoSessao> {
  const [s, ex, sets, ed] = await Promise.all([
    client.from('sessions').select('id,link_id,workout_id,booking_id,started_at,elapsed_seconds,shared_note,shared_at').eq('id', sessionId).single(),
    client.from('session_exercises').select('id,exercise_id,position,target_sets').eq('session_id', sessionId).order('position'),
    client.from('session_sets').select('id,session_exercise_id,set_index,reps,load_kg,rpe,completed').eq('session_id', sessionId).order('set_index'),
    client.from('session_set_edits').select('set_id,before,after,created_at').eq('session_id', sessionId).order('created_at'),
  ]);
  if (s.error) throw s.error;
  const exIds = [...new Set((ex.data ?? []).map((e) => e.exercise_id).filter((x): x is string => !!x))];
  const [nomes, cli, wk, bk, plan] = await Promise.all([
    exIds.length ? client.from('exercises').select('id,name').in('id', exIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    s.data.link_id ? client.from('clients').select('full_name').eq('id', s.data.link_id).maybeSingle() : Promise.resolve({ data: null }),
    s.data.workout_id ? client.from('workouts').select('name,version').eq('id', s.data.workout_id).maybeSingle() : Promise.resolve({ data: null }),
    s.data.booking_id ? client.from('bookings').select('starts_at,assignment_id').eq('id', s.data.booking_id).maybeSingle() : Promise.resolve({ data: null }),
    s.data.workout_id && s.data.link_id ? client.from('workout_exercises').select('exercise_id,target_reps,target_load').eq('workout_id', s.data.workout_id) : Promise.resolve({ data: [] as { exercise_id: string; target_reps: string | null; target_load: string | null }[] }),
  ]);
  const nome = (id: string | null) => nomes.data?.find((n) => n.id === id)?.name ?? 'Exercício';
  const previstoDe = (id: string | null) => {
    const p = plan.data?.find((x) => x.exercise_id === id);
    return p ? [p.target_reps, p.target_load].filter(Boolean).join(' × ') || 'registar' : '—';
  };
  const linhas: LinhaResumo[] = (ex.data ?? []).flatMap((e) => (sets.data ?? []).filter((x) => x.session_exercise_id === e.id).map((x) => {
    const prevReps = Number(plan.data?.find((p) => p.exercise_id === e.exercise_id)?.target_reps ?? NaN);
    return {
      setId: x.id, exercicio: nome(e.exercise_id), serie: x.set_index, previsto: previstoDe(e.exercise_id), feitoReps: x.reps, feitoCarga: x.load_kg == null ? null : Number(x.load_kg),
      rpe: x.rpe == null ? null : Number(x.rpe), desvio: Number.isFinite(prevReps) && x.reps != null ? x.reps - prevReps : null,
    };
  }));
  const rpes = linhas.map((l) => l.rpe).filter((x): x is number => x != null);
  const exDoSet = (setId: string) => {
    const st = sets.data?.find((x) => x.id === setId);
    const e = ex.data?.find((y) => y.id === st?.session_exercise_id);
    return `${nome(e?.exercise_id ?? null)} · série ${st?.set_index ?? '?'}`;
  };
  return {
    partilhado: s.data.shared_note && s.data.shared_at ? { texto: s.data.shared_note, em: s.data.shared_at } : null,
    id: s.data.id, cliente: (cli.data as { full_name: string } | null)?.full_name ?? null, inicio: s.data.started_at, minutos: Math.round(s.data.elapsed_seconds / 60),
    rpeMedio: rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null,
    linhas,
    correcoes: (ed.data ?? []).map((c) => {
      const b = c.before as { reps?: number; carga?: number }; const a = c.after as { reps?: number; carga?: number };
      const mud = b.reps !== a.reps ? `${b.reps} → ${a.reps} reps` : `${b.carga} → ${a.carga} kg`;
      return { em: c.created_at, texto: `${exDoSet(c.set_id)} · ${mud}` };
    }),
    origem: {
      treino: (wk.data as { name: string } | null)?.name ?? null, versao: (wk.data as { version: number } | null)?.version ?? null,
      marcacao: (bk.data as { starts_at: string } | null)?.starts_at ?? null, plano: (bk.data as { assignment_id: string | null } | null)?.assignment_id ? 'Do plano atribuído' : null,
    },
    comoPrevisto: linhas.filter((l) => l.desvio === 0 || l.desvio == null).length, total: linhas.length,
    volume: Math.round(linhas.reduce((v, l) => v + (l.feitoCarga ?? 0) * (l.feitoReps ?? 0), 0)),
  };
}

/** Desfazer e refazer (30 passos) para os construtores. */
export class Historico<T> {
  private atras: T[] = [];
  private frente: T[] = [];
  constructor(private limite = 30) {}
  registar(estado: T) { this.atras.push(estado); if (this.atras.length > this.limite) this.atras.shift(); this.frente = []; }
  desfazer(atual: T): T | null { const v = this.atras.pop(); if (v === undefined) return null; this.frente.push(atual); return v; }
  refazer(atual: T): T | null { const v = this.frente.pop(); if (v === undefined) return null; this.atras.push(atual); return v; }
  get podeDesfazer() { return this.atras.length > 0; }
  get podeRefazer() { return this.frente.length > 0; }
}
