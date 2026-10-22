import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';

/**
 * Packs de sessões de PT (tarefa 26 parte A): o PT cria packs e vende-os;
 * cada sessão feita, falta ou desmarcação fora do prazo desconta sozinha.
 * O LunaOS não cobra os clientes do PT (o pagamento regista-se à mão na F1b).
 */
export interface PackProduto { id: string; nome: string; sessoes: number; validadeDias: number; precoCent: number; arquivado: boolean }
export interface SaldoPack { packId: string; nome: string; restam: number; total: number; validoAte: string; estado: 'ativo' | 'a_acabar' | 'a_expirar' | 'esgotado' | 'expirado' }

export const euros = (c: number) => (c / 100).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' });

export async function fetchPackProdutos(client: LunaClient, scope: OrgScope): Promise<PackProduto[]> {
  const { data, error } = await client.from('pack_products').select('id,name,sessions,validity_days,price_cents,archived_at').eq('org_id', scope.orgId).eq('kind', 'pack').order('sessions');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, nome: p.name, sessoes: p.sessions, validadeDias: p.validity_days, precoCent: p.price_cents, arquivado: !!p.archived_at }));
}

export async function guardarPackProduto(client: LunaClient, scope: OrgScope, p: Omit<PackProduto, 'id' | 'arquivado'> & { id?: string }): Promise<void> {
  const linha = { org_id: scope.orgId, name: p.nome.trim(), sessions: p.sessoes, validity_days: p.validadeDias, price_cents: p.precoCent };
  const { error } = p.id ? await client.from('pack_products').update(linha).eq('id', p.id) : await client.from('pack_products').insert(linha);
  if (error) throw error;
}

export async function arquivarPackProduto(client: LunaClient, id: string, arquivar = true): Promise<void> {
  const { error } = await client.from('pack_products').update({ archived_at: arquivar ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}

export async function venderPack(client: LunaClient, linkId: string, produtoId: string): Promise<string> {
  const { data, error } = await client.rpc('sell_pack', { _link: linkId, _product: produtoId });
  if (error) throw error;
  return data as string;
}

export async function fetchSaldo(client: LunaClient, linkId: string): Promise<SaldoPack[]> {
  const { data, error } = await client.rpc('pack_balance', { _link: linkId });
  if (error) throw error;
  return (data ?? []).map((p) => ({ packId: p.pack_id, nome: p.nome, restam: p.restam, total: p.total, validoAte: p.valido_ate, estado: p.estado as SaldoPack['estado'] }));
}

/** Aviso antes de marcar: sem pack válido ou com o pack a acabar. */
export function avisoPack(saldo: SaldoPack[] | null): string | null {
  if (!saldo) return null;
  const valido = saldo.find((s) => s.estado !== 'esgotado' && s.estado !== 'expirado');
  if (!valido) return saldo.length ? 'O pack acabou ou expirou: esta sessão fica por pagar.' : 'Sem pack de sessões: esta sessão fica por pagar.';
  if (valido.restam <= 2) return `Restam ${valido.restam} sessões no pack.`;
  return null;
}

export interface MeuPack { org: string; nome: string; restam: number; total: number; validoAte: string }
export async function fetchMeusPacks(client: LunaClient): Promise<MeuPack[]> {
  const { data, error } = await client.rpc('my_packs', {});
  if (error) throw error;
  return (data ?? []).map((p) => ({ org: p.org, nome: p.nome, restam: p.restam, total: p.total, validoAte: p.valido_ate }));
}
