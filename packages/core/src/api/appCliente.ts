import type { LunaClient } from './client';
import type { EnumOf } from '../types/database';

/**
 * App do cliente (tarefa 09): Hoje (C-03), Eu (C-21) e privacidade (C-24).
 * A conta é da pessoa; cada organização só vê o que a pessoa partilha.
 */
export type CategoriaPartilha = EnumOf<'share_category'>;

export interface MeuHoje {
  treino: { nome: string; duracaoMin: number | null; plano: string | null; org: string; workoutId: string } | null;
  proxima: { inicio: string; titulo: string; tipo: string; org: string; local: string | null } | null;
  feitosSemana: number;
  organizacoes: number;
}

export async function fetchMeuHoje(client: LunaClient): Promise<MeuHoje> {
  const { data, error } = await client.rpc('my_today', {});
  if (error) throw error;
  const d = (data ?? {}) as {
    treino: { nome: string; duracao_min: number | null; plano: string | null; org: string; workout_id: string } | null;
    proxima: { inicio: string; titulo: string; tipo: string; org: string; local: string | null } | null;
    feitos_semana: number; organizacoes: number;
  };
  return {
    treino: d.treino ? { nome: d.treino.nome, duracaoMin: d.treino.duracao_min, plano: d.treino.plano, org: d.treino.org, workoutId: d.treino.workout_id } : null,
    proxima: d.proxima ?? null,
    feitosSemana: d.feitos_semana ?? 0,
    organizacoes: d.organizacoes ?? 0,
  };
}

export interface MinhaLigacao { linkId: string; org: string; responsavel: string | null; desde: string; partilhas: CategoriaPartilha[] }

export async function fetchMinhasLigacoes(client: LunaClient): Promise<MinhaLigacao[]> {
  const { data, error } = await client.rpc('my_links_overview', {});
  if (error) throw error;
  return (data ?? []).map((l) => ({ linkId: l.link_id, org: l.org_name, responsavel: l.responsible_name, desde: l.since, partilhas: l.shares }));
}

/** Liga ou desliga categorias: efeito imediato e registado. */
export async function definirPartilhas(client: LunaClient, linkId: string, partilhas: CategoriaPartilha[]): Promise<void> {
  const { error } = await client.rpc('set_my_shares', { _link: linkId, _shares: partilhas });
  if (error) throw error;
}

/** Os meus dados num ficheiro JSON (portabilidade). */
export async function exportarMeusDados(client: LunaClient): Promise<Blob> {
  const { data, error } = await client.rpc('export_my_data', {});
  if (error) throw error;
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export async function fetchPedidoApagar(client: LunaClient): Promise<string | null> {
  const { data, error } = await client.from('account_deletion_requests').select('scheduled_for')
    .is('cancelled_at', null).is('done_at', null).maybeSingle();
  if (error) throw error;
  return data?.scheduled_for ?? null;
}

/** Pede para apagar a conta: 30 dias para voltar atrás. Devolve a data. */
export async function pedirApagarConta(client: LunaClient): Promise<string> {
  const { data, error } = await client.rpc('request_account_deletion', {});
  if (error) throw error;
  return data as string;
}

export async function cancelarApagarConta(client: LunaClient): Promise<void> {
  const { error } = await client.rpc('cancel_account_deletion', {});
  if (error) throw error;
}

/** Os meus objetivos e marcos (só leitura; quem os gere é o treinador). */
export interface MeuObjetivo { id: string; titulo: string; criterio: string | null; estado: string; nota: string | null; marcos: { titulo: string; feito: boolean; prazo: string | null }[] }

export async function fetchMeusObjetivos(client: LunaClient): Promise<MeuObjetivo[]> {
  const { data, error } = await client.from('goals').select('id,title,criterion,status,status_note').is('archived_at', null).order('priority');
  if (error) throw error;
  const ids = (data ?? []).map((g) => g.id);
  const { data: m } = ids.length ? await client.from('milestones').select('goal_id,title,done_at,due_on').in('goal_id', ids) : { data: [] };
  return (data ?? []).map((g) => ({
    id: g.id, titulo: g.title, criterio: g.criterion, estado: g.status, nota: g.status_note,
    marcos: (m ?? []).filter((x) => x.goal_id === g.id).map((x) => ({ titulo: x.title, feito: !!x.done_at, prazo: x.due_on })),
  }));
}
