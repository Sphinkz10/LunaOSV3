import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';

/**
 * Inbox (G-02): tudo o que espera por alguém. Cada pendência diz de onde
 * veio, quem é o dono e qual é a ação; resolve-se no ecrã dono (nada se apaga).
 */
export type CategoriaInbox = 'saude' | 'clientes';
export interface Pendencia {
  id: string; linkId: string; cliente: string; titulo: string; kind: string; categoria: CategoriaInbox;
  donoId: string | null; dono: string | null; criadaEm: string; adiadaAte: string | null;
  resolvidaEm: string | null; resolvidaPor: string | null; resolucao: string | null;
  /** A ação no ecrã dono. */
  acao: { rotulo: string; to: string };
  origem: string;
}

const KIND: Record<string, { categoria: CategoriaInbox; acao: string; origem: string; to: (l: string) => string }> = {
  parq_atestado: { categoria: 'saude', acao: 'Pedir atestado', origem: 'PAR-Q pediu atestado', to: (l) => `/clients/${l}/aptidao` },
  restricao_a_rever: { categoria: 'saude', acao: 'Rever', origem: 'Restrição com data de revisão', to: (l) => `/clients/${l}/aptidao` },
  encarregado_em_falta: { categoria: 'clientes', acao: 'Ver', origem: 'Menor sem encarregado', to: (l) => `/clients/${l}` },
};

export async function fetchInbox(
  client: LunaClient, scope: OrgScope, opts: { resolvidas?: boolean; agora?: Date } = {},
): Promise<Pendencia[]> {
  const agora = (opts.agora ?? new Date()).toISOString();
  let q = client.from('pendencias')
    .select('id,link_id,membership_id,kind,title,status,created_at,resolved_at,resolved_by,snoozed_until,resolution')
    .eq('org_id', scope.orgId).eq('status', opts.resolvidas ? 'resolvida' : 'aberta');
  q = opts.resolvidas ? q.order('resolved_at', { ascending: false }).limit(100) : q.order('created_at', { ascending: false }).limit(200);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const links = [...new Set(rows.map((r) => r.link_id))];
  const membros = [...new Set(rows.map((r) => r.membership_id).filter((v): v is string => !!v))];
  const [cl, st] = await Promise.all([
    links.length ? client.from('clients').select('id,full_name').eq('org_id', scope.orgId).in('id', links) : Promise.resolve({ data: [], error: null }),
    membros.length ? client.from('staff').select('id,full_name').eq('org_id', scope.orgId).in('id', membros) : Promise.resolve({ data: [], error: null }),
  ]);
  const nomes = new Map((cl.data ?? []).map((c) => [c.id, c.full_name]));
  const equipa = new Map((st.data ?? []).map((m) => [m.id, m.full_name]));
  return rows
    .filter((r) => opts.resolvidas || !r.snoozed_until || r.snoozed_until <= agora)
    .map((r) => {
      const k = KIND[r.kind] ?? { categoria: 'clientes' as const, acao: 'Ver', origem: 'Pendência', to: (l: string) => `/clients/${l}` };
      return {
        id: r.id, linkId: r.link_id, cliente: nomes.get(r.link_id) ?? 'Cliente', titulo: r.title, kind: r.kind, categoria: k.categoria,
        donoId: r.membership_id, dono: r.membership_id ? equipa.get(r.membership_id) ?? null : null,
        criadaEm: r.created_at, adiadaAte: r.snoozed_until, resolvidaEm: r.resolved_at, resolvidaPor: r.resolved_by, resolucao: r.resolution,
        acao: { rotulo: k.acao, to: k.to(r.link_id) }, origem: k.origem,
      };
    })
    // As que voltaram de adiar ficam no topo
    .sort((a, b) => (b.adiadaAte ?? '').localeCompare(a.adiadaAte ?? '') || b.criadaEm.localeCompare(a.criadaEm));
}

/** Adiadas que ainda não voltaram (para "Adiadas"). */
export async function contarAdiadas(client: LunaClient, scope: OrgScope, agora = new Date()): Promise<number> {
  const { count, error } = await client.from('pendencias').select('id', { count: 'exact', head: true })
    .eq('org_id', scope.orgId).eq('status', 'aberta').gt('snoozed_until', agora.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function adiarPendencias(client: LunaClient, ids: string[], ate: Date): Promise<void> {
  for (const id of ids) {
    const { error } = await client.rpc('adiar_pendencia', { _id: id, _ate: ate.toISOString() });
    if (error) throw error;
  }
}

export async function reabrirPendencia(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.rpc('reabrir_pendencia', { _id: id });
  if (error) throw error;
}

export async function atribuirPendencias(client: LunaClient, ids: string[], membershipId: string): Promise<void> {
  for (const id of ids) {
    const { error } = await client.rpc('atribuir_pendencia', { _id: id, _membership: membershipId });
    if (error) throw error;
  }
}
