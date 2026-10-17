import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { GoalResourceRow, GoalRow, MilestoneRow, ReviewRow } from '../types/database';
import { DuplicateClientError } from './clients';
import { ConflitoError, diferencas } from '../estados';

export type { GoalRow, MilestoneRow, ReviewRow } from '../types/database';

/**
 * Ficha do cliente · funções antigas (tarefa 22): objetivos e revisões,
 * atividade, progresso por métrica, editar, arquivar e reativar.
 */

/* ── Objetivos, marcos, recursos e revisões ─────────────────────────────── */
export type Objetivo = GoalRow & { marcos: MilestoneRow[]; recursos: GoalResourceRow[] };
export const ESTADO_OBJETIVO: Record<GoalRow['status'], string> = {
  no_caminho: 'No caminho', em_risco: 'Em risco', atingido: 'Atingido', parado: 'Parado',
};
export const CATEGORIA_OBJETIVO: Record<GoalRow['category'], string> = {
  fisico: 'Físico', habitos: 'Hábitos', tecnico: 'Técnico', saude: 'Saúde', outro: 'Outro',
};

export async function fetchObjetivos(client: LunaClient, linkId: string): Promise<{ objetivos: Objetivo[]; revisoes: ReviewRow[] }> {
  const [g, r] = await Promise.all([
    client.from('goals').select('*').eq('link_id', linkId).is('archived_at', null).order('priority'),
    client.from('reviews').select('*').eq('link_id', linkId).order('scheduled_on', { ascending: false }).limit(20),
  ]);
  if (g.error) throw g.error;
  const ids = (g.data ?? []).map((x) => x.id);
  const [m, rc] = ids.length
    ? await Promise.all([
      client.from('milestones').select('*').in('goal_id', ids).order('due_on', { ascending: true, nullsFirst: false }),
      client.from('goal_resources').select('*').in('goal_id', ids),
    ])
    : [{ data: [] as MilestoneRow[], error: null }, { data: [] as GoalResourceRow[], error: null }];
  if (m.error) throw m.error;
  return {
    objetivos: (g.data ?? []).map((x) => ({
      ...x, marcos: (m.data ?? []).filter((y) => y.goal_id === x.id), recursos: (rc.data ?? []).filter((y) => y.goal_id === x.id),
    })),
    // Revisões são da equipa: o cliente não as vê (fica a lista vazia)
    revisoes: r.error ? [] : r.data ?? [],
  };
}

export async function criarObjetivo(client: LunaClient, scope: OrgScope, linkId: string, o: {
  titulo: string; criterio?: string | null; categoria: GoalRow['category']; prioridade: number; ate?: string | null;
}): Promise<void> {
  const { error } = await client.from('goals').insert({
    org_id: scope.orgId, link_id: linkId, title: o.titulo.trim(), criterion: o.criterio?.trim() || null,
    category: o.categoria, priority: o.prioridade, owner_membership_id: scope.membershipId, due_on: o.ate || null,
  });
  if (error) throw error;
}

export async function mudarEstadoObjetivo(client: LunaClient, id: string, estado: GoalRow['status'], nota?: string | null): Promise<void> {
  const { error } = await client.rpc('set_goal_status', { _goal: id, _status: estado, _note: nota ?? null });
  if (error) throw error;
}

export async function arquivarObjetivo(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.rpc('archive_goal', { _goal: id });
  if (error) {
    if (/resolve primeiro/.test(error.message)) throw new Error('Resolve primeiro os marcos abertos e os recursos ligados.');
    throw error;
  }
}

export async function criarMarco(client: LunaClient, scope: OrgScope, goalId: string, titulo: string, ate?: string | null): Promise<void> {
  const { error } = await client.from('milestones').insert({ org_id: scope.orgId, goal_id: goalId, title: titulo.trim(), due_on: ate || null });
  if (error) throw error;
}

export type Evidencia = NonNullable<MilestoneRow['evidence_kind']>;
export async function concluirMarco(client: LunaClient, id: string, tipo: Evidencia, ref: string | null, nota: string | null): Promise<void> {
  const { error } = await client.rpc('complete_milestone', { _id: id, _kind: tipo, _ref: ref, _note: nota });
  if (error) {
    if (/evidência/.test(error.message)) throw new Error('Um marco só se conclui com uma evidência.');
    throw error;
  }
}

export async function ligarRecurso(client: LunaClient, scope: OrgScope, goalId: string, tipo: GoalResourceRow['kind'], refId: string, rotulo: string): Promise<void> {
  const { error } = await client.from('goal_resources').insert({ org_id: scope.orgId, goal_id: goalId, kind: tipo, ref_id: refId, label: rotulo });
  if (error) throw error;
}

export async function desligarRecurso(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('goal_resources').delete().eq('id', id);
  if (error) throw error;
}

export async function marcarRevisao(client: LunaClient, scope: OrgScope, linkId: string, r: { em: string; cadenciaSemanas: number | null; objetivos: string[] }): Promise<void> {
  const { error } = await client.from('reviews').insert({
    org_id: scope.orgId, link_id: linkId, scheduled_on: r.em, every_weeks: r.cadenciaSemanas, owner_membership_id: scope.membershipId, goal_ids: r.objetivos,
  });
  if (error) throw error;
}

export async function concluirRevisao(client: LunaClient, id: string, decisao: string, proxima?: string | null): Promise<void> {
  const { error } = await client.rpc('conclude_review', { _id: id, _decision: decisao, _next_on: proxima ?? null });
  if (error) {
    if (/decisão/.test(error.message)) throw new Error('Uma revisão concluída tem sempre decisão.');
    throw error;
  }
}

/** Revisões e marcos em atraso passam a pendências (Hoje e Inbox). Idempotente. */
export async function sincronizarAtrasos(client: LunaClient, scope: OrgScope): Promise<void> {
  await client.rpc('sync_overdue', { _org: scope.orgId });
}

/* ── Atividade e próximos 30 dias ───────────────────────────────────────── */
export type OrigemAtividade = 'treino' | 'avaliacoes' | 'objetivos' | 'relacao';
export interface EventoAtividade { em: string; origem: OrigemAtividade; titulo: string; detalhe: string; refKind: string; refId: string | null; quem: string | null }

export async function fetchAtividade(client: LunaClient, linkId: string, desde: Date): Promise<EventoAtividade[]> {
  const { data, error } = await client.rpc('client_activity', { _link: linkId, _from: desde.toISOString() });
  if (error) throw error;
  return (data ?? []).map((e) => ({ em: e.em, origem: e.origem as OrigemAtividade, titulo: e.titulo, detalhe: e.detalhe, refKind: e.ref_kind, refId: e.ref_id, quem: e.quem }));
}

export interface Proximo { em: string; tipo: 'marcacao' | 'revisao' | 'marco'; titulo: string; estado: string | null }
export async function fetchProximos(client: LunaClient, linkId: string): Promise<Proximo[]> {
  const { data, error } = await client.rpc('client_upcoming', { _link: linkId, _days: 30 });
  if (error) throw error;
  return (data ?? []).map((p) => ({ em: p.em, tipo: p.tipo as Proximo['tipo'], titulo: p.titulo, estado: p.estado }));
}

/* ── Progresso ──────────────────────────────────────────────────────────── */
export interface MetricaCliente { chave: string; nome: string; unidade: string | null; registos: number }
export const METRICAS_CALCULADAS: MetricaCliente[] = [
  { chave: 'treinos_semana', nome: 'Treinos por semana', unidade: null, registos: 0 },
  { chave: 'rpe_medio', nome: 'RPE médio', unidade: null, registos: 0 },
  { chave: 'carga', nome: 'Carga', unidade: 'kg', registos: 0 },
];

export async function fetchMetricasCliente(client: LunaClient, linkId: string): Promise<MetricaCliente[]> {
  const { data, error } = await client.rpc('client_metrics', { _link: linkId });
  if (error) throw error;
  return [...(data ?? []).map((m) => ({ chave: m.chave, nome: m.nome, unidade: m.unidade, registos: m.n })), ...METRICAS_CALCULADAS];
}

export interface PontoProgresso { em: string; valor: number; detalhe: string; refKind: string; refId: string | null }
export interface Progresso {
  atual: PontoProgresso[]; anterior: PontoProgresso[];
  base: number | null; minimo: number | null; maximo: number | null; variacao: number | null;
}

/** Período escolhido e o anterior do mesmo tamanho; época = desde o início do ano desportivo (setembro). */
export async function fetchProgresso(client: LunaClient, linkId: string, metrica: string, periodo: '7d' | '28d' | 'epoca', agora = new Date()): Promise<Progresso> {
  const fim = agora;
  const inicio = periodo === 'epoca'
    ? new Date(Date.UTC(agora.getUTCMonth() >= 8 ? agora.getUTCFullYear() : agora.getUTCFullYear() - 1, 8, 1))
    : new Date(agora.getTime() - (periodo === '7d' ? 7 : 28) * 86_400_000);
  const antes = new Date(inicio.getTime() - (fim.getTime() - inicio.getTime()));
  const [a, b, primeiro] = await Promise.all([
    client.rpc('client_progress', { _link: linkId, _metric: metrica, _from: inicio.toISOString(), _to: fim.toISOString() }),
    client.rpc('client_progress', { _link: linkId, _metric: metrica, _from: antes.toISOString(), _to: inicio.toISOString() }),
    client.rpc('client_progress', { _link: linkId, _metric: metrica, _from: new Date(0).toISOString(), _to: fim.toISOString() }),
  ]);
  if (a.error) throw a.error;
  const map = (d: typeof a.data) => (d ?? []).map((p) => ({ em: p.em, valor: Number(p.valor), detalhe: p.detalhe, refKind: p.ref_kind, refId: p.ref_id }));
  const atual = map(a.data);
  const anterior = b.error ? [] : map(b.data);
  const valores = atual.map((p) => p.valor);
  const media = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);
  const mA = media(valores); const mB = media(anterior.map((p) => p.valor));
  return {
    atual, anterior,
    base: primeiro.error || !primeiro.data?.length ? null : Number(primeiro.data[0].valor),
    minimo: valores.length ? Math.min(...valores) : null,
    maximo: valores.length ? Math.max(...valores) : null,
    variacao: mA != null && mB != null && mB !== 0 ? ((mA - mB) / mB) * 100 : null,
  };
}

/* ── Editar, arquivar e reativar (P-12) ─────────────────────────────────── */
export interface DadosCliente { nome: string; telefone: string | null; email: string | null; nascimento: string | null; nif: string | null }

export async function fetchDadosCliente(client: LunaClient, linkId: string): Promise<DadosCliente & { vistoEm: string; temConta: boolean }> {
  const { data: l, error } = await client.from('links').select('person_id').eq('id', linkId).single();
  if (error) throw error;
  const { data: p, error: e2 } = await client.from('persons').select('full_name,phone,email,birth_date,tax_id,updated_at,user_id').eq('id', l.person_id).single();
  if (e2) throw e2;
  return { nome: p.full_name, telefone: p.phone, email: p.email, nascimento: p.birth_date, nif: p.tax_id, vistoEm: p.updated_at, temConta: !!p.user_id };
}

const ROTULOS: Record<keyof DadosCliente, string> = { nome: 'Nome', telefone: 'Telemóvel', email: 'Email', nascimento: 'Nascimento', nif: 'NIF' };

/** Grava só se ninguém mudou entretanto; senão lança ConflitoError com os dois valores. */
export async function editarDadosCliente(client: LunaClient, linkId: string, original: DadosCliente, meu: DadosCliente, vistoEm: string): Promise<string> {
  const { data, error } = await client.rpc('update_client_data', {
    _link: linkId, _seen: vistoEm, _full_name: meu.nome, _phone: meu.telefone, _email: meu.email, _birth_date: meu.nascimento, _tax_id: meu.nif,
  });
  if (error) {
    if (error.code === '40001' || /conflito/.test(error.message)) {
      const d = JSON.parse((error as { details?: string }).details ?? '{}') as Record<string, string | null>;
      const servidor: DadosCliente = { nome: d.full_name ?? '', telefone: d.phone ?? null, email: d.email ?? null, nascimento: d.birth_date ?? null, nif: d.tax_id ?? null };
      throw new ConflitoError(diferencas(original as unknown as Record<string, unknown>, meu as unknown as Record<string, unknown>,
        servidor as unknown as Record<string, unknown>, ROTULOS as Record<string, string>), { ...servidor, updated_at: d.updated_at }, null);
    }
    if (/duplicate_client/.test(error.message)) throw new DuplicateClientError();
    if (/conta do cliente/.test(error.message)) throw new Error('Os dados pessoais são da conta do cliente: só ele os muda na app.');
    throw error;
  }
  return data as string;
}

export async function arquivarCliente(client: LunaClient, linkId: string, motivo: string): Promise<void> {
  const { error } = await client.rpc('archive_client', { _link: linkId, _reason: motivo });
  if (error) throw error;
}

export async function reativarCliente(client: LunaClient, linkId: string, motivo: string): Promise<void> {
  const { error } = await client.rpc('reactivate_client', { _link: linkId, _reason: motivo });
  if (error) throw error;
}
