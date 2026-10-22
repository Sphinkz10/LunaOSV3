/**
 * Pagamentos registados à mão e o dinheiro do PT (passos 25 e 25b da F1b).
 * O LunaOS não cobra os clientes do PT: estes registos são só o que o PT
 * anotou (P-14). Nada se apaga; corrigir cria um registo novo com motivo.
 */
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';

export type Metodo = 'dinheiro' | 'mbway' | 'transferencia' | 'outro';
export const METODOS: { id: Metodo; rotulo: string }[] = [
  { id: 'dinheiro', rotulo: 'Dinheiro' }, { id: 'mbway', rotulo: 'MB WAY' }, { id: 'transferencia', rotulo: 'Transferência' }, { id: 'outro', rotulo: 'Outro' },
];
export const rotuloMetodo = (m: string) => METODOS.find((x) => x.id === m)?.rotulo ?? m;
export type TipoPagamento = 'pack' | 'mensalidade' | 'avulsa' | 'programa';
/** "120,50" ou "120.5" → 12050 cêntimos (null se inválido). */
export function lerEuros(v: string): number | null {
  const s = v.trim().replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/* ── G-33: os quatro tipos ──────────────────────────────────────────────── */
export interface Mensalidade { id: string; nome: string; precoCent: number; sessoesSemana: number | null; diaPagamento: number; sobras: 'perdem' | 'passam_ate_2' | 'passam'; renova: boolean; arquivado: boolean }
export async function fetchMensalidades(client: LunaClient, scope: OrgScope): Promise<Mensalidade[]> {
  const { data, error } = await client.from('monthly_products').select('*').eq('org_id', scope.orgId).order('price_cents');
  if (error) throw error;
  return (data ?? []).map((m) => ({ id: m.id, nome: m.name, precoCent: m.price_cents, sessoesSemana: m.sessions_per_week, diaPagamento: m.billing_day, sobras: m.leftover, renova: m.renews, arquivado: !!m.archived_at }));
}
export async function guardarMensalidade(client: LunaClient, scope: OrgScope, m: Omit<Mensalidade, 'id' | 'arquivado'> & { id?: string }): Promise<void> {
  const linha = { org_id: scope.orgId, name: m.nome.trim(), price_cents: m.precoCent, sessions_per_week: m.sessoesSemana, billing_day: m.diaPagamento, leftover: m.sobras, renews: m.renova };
  const { error } = m.id ? await client.from('monthly_products').update(linha).eq('id', m.id) : await client.from('monthly_products').insert(linha);
  if (error) throw error;
}
export interface Programa { id: string; nome: string; planoId: string; precoCent: number; arquivado: boolean }
export async function fetchProgramas(client: LunaClient, scope: OrgScope): Promise<Programa[]> {
  const { data, error } = await client.from('program_products').select('*').eq('org_id', scope.orgId).order('name');
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, nome: p.name, planoId: p.plan_id, precoCent: p.price_cents, arquivado: !!p.archived_at }));
}
export async function guardarPrograma(client: LunaClient, scope: OrgScope, p: Omit<Programa, 'id' | 'arquivado'> & { id?: string }): Promise<void> {
  const linha = { org_id: scope.orgId, name: p.nome.trim(), plan_id: p.planoId, price_cents: p.precoCent };
  const { error } = p.id ? await client.from('program_products').update(linha).eq('id', p.id) : await client.from('program_products').insert(linha);
  if (error) throw error;
}
export async function arquivarProduto(client: LunaClient, tabela: 'monthly_products' | 'program_products', id: string, arquivar: boolean): Promise<void> {
  const { error } = await client.from(tabela).update({ archived_at: arquivar ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}
export async function precoAvulsa(client: LunaClient, scope: OrgScope): Promise<{ id: string; precoCent: number } | null> {
  const { data } = await client.from('pack_products').select('id,price_cents').eq('org_id', scope.orgId).eq('kind', 'avulsa').is('archived_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data ? { id: data.id, precoCent: data.price_cents } : null;
}
export async function guardarPrecoAvulsa(client: LunaClient, scope: OrgScope, precoCent: number, id?: string): Promise<void> {
  const linha = { org_id: scope.orgId, name: 'Sessão avulsa', sessions: 1, validity_days: 1, price_cents: precoCent, kind: 'avulsa' as const };
  const { error } = id ? await client.from('pack_products').update(linha).eq('id', id) : await client.from('pack_products').insert(linha);
  if (error) throw error;
}

export async function venderMensalidade(client: LunaClient, linkId: string, produtoId: string): Promise<string> {
  const { data, error } = await client.rpc('sell_monthly', { _link: linkId, _product: produtoId });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function terminarMensalidade(client: LunaClient, id: string, motivo: string): Promise<void> {
  const { error } = await client.rpc('end_monthly', { _id: id, _on: new Date().toISOString().slice(0, 10), _reason: motivo });
  if (error) throw new Error(error.message);
}
export async function venderPrograma(client: LunaClient, linkId: string, produtoId: string): Promise<string> {
  const { data, error } = await client.rpc('sell_program', { _link: linkId, _product: produtoId });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function partilharPack(client: LunaClient, packId: string, linkId: string, partilhar = true): Promise<void> {
  const { error } = await client.rpc('share_pack', { _pack: packId, _link: linkId, _share: partilhar });
  if (error) throw new Error(error.message);
}

/* ── P-14 ───────────────────────────────────────────────────────────────── */
export interface NovoPagamento { linkId: string; tipo: TipoPagamento; alvo: string | null; periodo?: string | null; valorCent: number; data: string; metodo: Metodo; fatura?: string; nota?: string; marcacao?: string | null }
export async function registarPagamento(client: LunaClient, p: NovoPagamento): Promise<string> {
  const { data, error } = await client.rpc('record_payment', {
    _link: p.linkId, _kind: p.tipo, _target: p.alvo, _period: p.periodo ?? null, _amount_cents: p.valorCent, _paid_on: p.data, _method: p.metodo,
    _invoice: p.fatura ?? null, _note: p.nota ?? null, _booking: p.marcacao ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function corrigirPagamento(client: LunaClient, id: string, valorCent: number, motivo: string): Promise<string> {
  const { data, error } = await client.rpc('correct_payment', { _payment: id, _amount_cents: valorCent, _reason: motivo });
  if (error) throw new Error(error.message);
  return data as string;
}
export interface PagamentoRegistado { id: string; tipo: TipoPagamento; alvo: string; periodo: string | null; valorCent: number; pagoEm: string; metodo: string; fatura: string | null; nota: string | null; corrige: string | null; motivo: string | null; atual: boolean; quem: string | null; em: string }
export async function fetchPagamentosCliente(client: LunaClient, linkId: string): Promise<PagamentoRegistado[]> {
  const { data, error } = await client.rpc('client_payments', { _link: linkId });
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, tipo: p.kind as TipoPagamento, alvo: p.alvo, periodo: p.periodo, valorCent: p.valor, pagoEm: p.pago_em, metodo: p.metodo,
    fatura: p.fatura, nota: p.nota, corrige: p.corrige, motivo: p.motivo, atual: p.atual, quem: p.quem, em: p.em }));
}
/** Quanto já está pago num item (só os registos atuais). */
export const pagoEm = (ps: PagamentoRegistado[], f: (p: PagamentoRegistado) => boolean) => ps.filter((p) => p.atual && f(p)).reduce((t, p) => t + p.valorCent, 0);

export interface ItemCliente {
  tipo: 'pack' | 'mensalidade' | 'programa'; id: string; nome: string; precoCent: number;
  restam?: number; total?: number; validoAte?: string; partilhadoCom?: number;
  diaPagamento?: number; desde?: string; ate?: string | null;
}
export async function fetchItensCliente(client: LunaClient, linkId: string): Promise<ItemCliente[]> {
  const [p, m, g, s] = await Promise.all([
    client.from('client_packs').select('id,name,price_cents,sessions_total,sessions_used,valid_until').eq('link_id', linkId).order('created_at', { ascending: false }),
    client.from('client_monthlies').select('id,name,price_cents,billing_day,starts_on,ends_on').eq('link_id', linkId).order('created_at', { ascending: false }),
    client.from('client_programs').select('id,name,price_cents').eq('link_id', linkId).order('created_at', { ascending: false }),
    client.from('pack_sharers').select('pack_id'),
  ]);
  return [
    ...(p.data ?? []).map((x) => ({ tipo: 'pack' as const, id: x.id, nome: x.name, precoCent: x.price_cents, restam: x.sessions_total - x.sessions_used, total: x.sessions_total, validoAte: x.valid_until,
      partilhadoCom: (s.data ?? []).filter((y) => y.pack_id === x.id).length })),
    ...(m.data ?? []).map((x) => ({ tipo: 'mensalidade' as const, id: x.id, nome: x.name, precoCent: x.price_cents, diaPagamento: x.billing_day, desde: x.starts_on, ate: x.ends_on })),
    ...(g.data ?? []).map((x) => ({ tipo: 'programa' as const, id: x.id, nome: x.name, precoCent: x.price_cents })),
  ];
}
/** O mês corrente (aaaa-mm) e o seu nome ("novembro"). */
export function mesAtual(d = new Date()): { periodo: string; nome: string } {
  return { periodo: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, nome: d.toLocaleDateString('pt-PT', { month: 'long' }) };
}

/* ── O meu dinheiro ─────────────────────────────────────────────────────── */
export interface Devedor { link_id: string; nome: string; tipo: TipoPagamento; alvo: string; periodo: string | null; item: string; valor: number; desde: string }
export interface Dinheiro { recebido: number; registos: number; por_metodo: Record<string, number>; por_receber: number; quem_deve: Devedor[]; a_acabar: { link_id: string; nome: string; pack: string; restam: number; valido_ate: string }[] }
export async function fetchDinheiro(client: LunaClient, scope: OrgScope, mes?: string): Promise<Dinheiro> {
  const { data, error } = await client.rpc('money_overview', { _org: scope.orgId, ...(mes ? { _month: mes } : {}) });
  if (error) throw error;
  return data as unknown as Dinheiro;
}

/** Exportar tudo em CSV (um ficheiro por tabela, separador ;). */
export function paraCsv(linhas: Record<string, unknown>[]): string {
  if (!linhas.length) return '';
  const cols = Object.keys(linhas[0]);
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [cols.join(';'), ...linhas.map((l) => cols.map((c) => q(l[c])).join(';'))].join('\n');
}
export async function exportarNegocio(client: LunaClient, scope: OrgScope): Promise<Record<'clientes' | 'planos' | 'sessoes' | 'pagamentos', string>> {
  const { data, error } = await client.rpc('export_business', { _org: scope.orgId });
  if (error) throw error;
  const d = data as unknown as Record<'clientes' | 'planos' | 'sessoes' | 'pagamentos', Record<string, unknown>[]>;
  return { clientes: paraCsv(d.clientes), planos: paraCsv(d.planos), sessoes: paraCsv(d.sessoes), pagamentos: paraCsv(d.pagamentos) };
}

/* ── C-22: o que o cliente vê ───────────────────────────────────────────── */
export interface MeuItem { tipo: 'pack' | 'mensalidade' | 'programa'; org: string; nome: string; restam: number | null; total: number | null; validoAte: string | null; precoCent: number; pagoCent: number | null; treinador: string | null }
export interface MeuPagamento { org: string; alvo: string; periodo: string | null; valorCent: number; pagoEm: string; metodo: string; fatura: string | null; corrigido: boolean }
export async function fetchOQueTenho(client: LunaClient): Promise<{ itens: MeuItem[]; pagamentos: MeuPagamento[] }> {
  const [i, p] = await Promise.all([client.rpc('my_plans', {}), client.rpc('my_payments', {})]);
  if (i.error) throw i.error;
  return {
    itens: (i.data ?? []).map((x) => ({ tipo: x.tipo as MeuItem['tipo'], org: x.org, nome: x.nome, restam: x.restam, total: x.total, validoAte: x.valido_ate, precoCent: x.preco, pagoCent: x.pago, treinador: x.treinador })),
    pagamentos: (p.data ?? []).map((x) => ({ org: x.org, alvo: x.alvo, periodo: x.periodo, valorCent: x.valor, pagoEm: x.pago_em, metodo: x.metodo, fatura: x.fatura, corrigido: x.corrigido })),
  };
}
