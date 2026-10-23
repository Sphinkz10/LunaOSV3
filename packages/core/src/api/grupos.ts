/**
 * Grupos (G-08, funções antigas): membros com datas de entrada e saída,
 * arquivar e repor com motivo, responsável e histórico. Sair nunca apaga.
 */
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';

export interface Grupo { id: string; nome: string; descricao: string | null; tipo: string; membros: number; responsavelId: string | null; arquivado: boolean; motivoArquivo: string | null }
export interface MembroGrupo { linkId: string; nome: string; desde: string; saiu: string | null; motivo: string | null }
export interface EventoGrupo { em: string; oque: string; detalhe: string | null }

export async function fetchGrupos(client: LunaClient, scope: OrgScope): Promise<Grupo[]> {
  const [g, m] = await Promise.all([
    client.from('groups').select('id,name,description,type,responsible_membership_id,archived_at,archived_reason').eq('org_id', scope.orgId).order('name'),
    client.from('group_members').select('group_id,left_at').eq('org_id', scope.orgId).is('left_at', null),
  ]);
  if (g.error) throw g.error;
  return (g.data ?? []).map((x) => ({
    id: x.id, nome: x.name, descricao: x.description, tipo: x.type, responsavelId: x.responsible_membership_id, arquivado: !!x.archived_at, motivoArquivo: x.archived_reason,
    membros: (m.data ?? []).filter((y) => y.group_id === x.id).length,
  }));
}
export async function criarGrupo(client: LunaClient, scope: OrgScope, nome: string, responsavel: string | null): Promise<string> {
  const { data, error } = await client.from('groups').insert({ org_id: scope.orgId, name: nome.trim(), type: 'program', responsible_membership_id: responsavel }).select('id').single();
  if (error) throw error;
  return data.id;
}
export async function fetchMembrosGrupo(client: LunaClient, grupoId: string): Promise<MembroGrupo[]> {
  const { data, error } = await client.from('group_members').select('link_id,since,left_at,left_reason').eq('group_id', grupoId);
  if (error) throw error;
  const ids = (data ?? []).map((x) => x.link_id);
  const { data: c } = ids.length ? await client.from('clients').select('id,full_name').in('id', ids) : { data: [] as { id: string; full_name: string }[] };
  return (data ?? []).map((x) => ({ linkId: x.link_id, nome: c?.find((y) => y.id === x.link_id)?.full_name ?? '—', desde: x.since, saiu: x.left_at, motivo: x.left_reason }))
    .sort((a, b) => Number(!!a.saiu) - Number(!!b.saiu) || a.nome.localeCompare(b.nome, 'pt-PT'));
}
export async function fetchHistoricoGrupo(client: LunaClient, grupoId: string): Promise<EventoGrupo[]> {
  const { data, error } = await client.from('group_events').select('created_at,what,detail').eq('group_id', grupoId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return (data ?? []).map((x) => ({ em: x.created_at, oque: x.what, detalhe: x.detail }));
}
const rpc = async (client: LunaClient, fn: 'add_group_member' | 'remove_group_member' | 'archive_group' | 'restore_group' | 'set_group_responsible', args: Record<string, unknown>) => {
  const { data, error } = await (client.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  if (error) throw new Error(error.message);
  return data;
};
export const juntarAoGrupo = (c: LunaClient, g: string, link: string, desde: string) => rpc(c, 'add_group_member', { _group: g, _link: link, _since: desde });
export const sairDoGrupo = (c: LunaClient, g: string, link: string, motivo: string, em: string) => rpc(c, 'remove_group_member', { _group: g, _link: link, _reason: motivo, _on: em });
export const arquivarGrupo = async (c: LunaClient, g: string, motivo: string) => (await rpc(c, 'archive_group', { _group: g, _reason: motivo })) as number;
export const reporGrupo = (c: LunaClient, g: string, motivo: string) => rpc(c, 'restore_group', { _group: g, _reason: motivo });
export const mudarResponsavelGrupo = (c: LunaClient, g: string, m: string | null) => rpc(c, 'set_group_responsible', { _group: g, _membership: m });
