/**
 * Treinadores: conta, plano e subscrição por lugar (passo 26 da F1b: W-02,
 * X-04, G-47, J32, J33, J34). O fornecedor de pagamentos é falso e nunca
 * cobra; o real entra pela mesma interface quando N8 estiver decidido.
 */
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Enums } from '../types/database';

export type PlanoLuna = 'treinador' | 'ginasio';
export type EstadoSubscricao = Enums['subscription_status'];
export type ComoTrabalho = 'solo_coach' | 'studio' | 'gym';

export const PLANOS: Record<PlanoLuna, { nome: string; texto: string; inclui: string[] }> = {
  treinador: { nome: 'Treinador', texto: 'Clientes, agenda, treino e app', inclui: ['Clientes, agenda, treino e app', 'Avaliação e mensagens', 'Packs e pagamentos registados'] },
  ginasio: { nome: 'Ginásio', texto: 'Junta entradas, cobranças e unidades', inclui: ['Tudo do Treinador', 'Entradas e balcão', 'Cobranças, faturas e loja', 'Várias unidades'] },
};

export const COMO_TRABALHO: { id: ComoTrabalho; titulo: string; texto: string; plano: PlanoLuna }[] = [
  { id: 'solo_coach', titulo: 'PT independente', texto: 'Eu e os meus clientes · 1 lugar', plano: 'treinador' },
  { id: 'studio', titulo: 'Estúdio, box ou equipa', texto: 'Vários treinadores e aulas', plano: 'treinador' },
  { id: 'gym', titulo: 'Ginásio', texto: 'Entradas, cobranças, unidades', plano: 'ginasio' },
];

/** Modalidades no registo: só fitness está pronta; as outras ficam em lista de espera. */
export const MODALIDADES_REGISTO: { id: string; nome: string; pronta: boolean }[] = [
  { id: 'fitness', nome: 'Fitness e ginásio', pronta: true },
  { id: 'corrida', nome: 'Corrida', pronta: false },
  { id: 'natacao', nome: 'Natação', pronta: false },
];

const ROTULO_ESTADO: Record<EstadoSubscricao, string> = {
  trial: 'Período experimental', active: 'Ativa', grace: 'Em graça', read_only: 'Só leitura', cancelled: 'Cancelada',
};
export const rotuloEstado = (e: EstadoSubscricao) => ROTULO_ESTADO[e];

export interface PessoaLugar { membershipId: string; nome: string; titulo: string | null; papeis: string[]; ocupa: boolean; dono: boolean }
export interface Subscricao {
  plano: PlanoLuna; estado: EstadoSubscricao; lugares: number; ocupados: number;
  experimentalAte: string | null; gracaAte: string | null; temMetodo: boolean; gere: boolean; clientes: number;
  pessoas: PessoaLugar[]; convites: { email: string; papel: string; ocupa: boolean; criado: string }[];
  modulos: { modulo: string; soLeitura: boolean }[];
  historico: { tipo: string; de: string | null; para: string | null; motivo: string | null; em: string }[];
}
export interface EfeitoMudanca { planoDe: PlanoLuna; planoPara: PlanoLuna; lugaresDe: number; lugaresPara: number; ocupados: number; liberta: number; entram: string[]; soLeitura: string[] }

type Raw = Record<string, unknown>;
const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function lerSubscricao(o: Raw): Subscricao {
  return {
    plano: o.plano as PlanoLuna, estado: o.estado as EstadoSubscricao, lugares: Number(o.lugares), ocupados: Number(o.ocupados),
    experimentalAte: (o.experimental_ate as string) ?? null, gracaAte: (o.graca_ate as string) ?? null,
    temMetodo: o.metodo != null, gere: Boolean(o.gere), clientes: Number(o.clientes ?? 0),
    pessoas: lista<Raw>(o.pessoas).map((p) => ({ membershipId: p.membership_id as string, nome: p.nome as string, titulo: (p.titulo as string) ?? null,
      papeis: lista<string>(p.papeis), ocupa: Boolean(p.ocupa), dono: Boolean(p.dono) })),
    convites: lista<Raw>(o.convites).map((c) => ({ email: c.email as string, papel: c.papel as string, ocupa: Boolean(c.ocupa), criado: c.criado as string })),
    modulos: lista<Raw>(o.modulos).map((m) => ({ modulo: m.modulo as string, soLeitura: Boolean(m.so_leitura) })),
    historico: lista<Raw>(o.historico).map((h) => ({ tipo: h.tipo as string, de: (h.de as string) ?? null, para: (h.para as string) ?? null, motivo: (h.motivo as string) ?? null, em: h.em as string })),
  };
}

/** Dias que faltam (arredonda para cima; 0 quando já passou). */
export function diasAte(iso: string | null, agora = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((Date.parse(iso) - agora) / 86_400_000));
}

/** O que a pessoa precisa de saber da subscrição numa linha (barra de aviso). */
export function avisoSubscricao(s: Pick<Subscricao, 'estado' | 'experimentalAte' | 'gracaAte' | 'temMetodo'>, agora = Date.now()): { tom: 'info' | 'aviso' | 'perigo'; texto: string } | null {
  if (s.estado === 'trial') {
    const d = diasAte(s.experimentalAte, agora);
    if (s.temMetodo || d == null || d > 7) return null;
    return { tom: 'info', texto: `O período experimental acaba ${d === 0 ? 'hoje' : `em ${d} ${d === 1 ? 'dia' : 'dias'}`}. Sem pagamento, fica só de leitura; nada se apaga.` };
  }
  if (s.estado === 'grace') {
    const d = diasAte(s.gracaAte, agora);
    return { tom: 'aviso', texto: `O pagamento falhou. Tens ${d ?? 7} ${d === 1 ? 'dia' : 'dias'} para o atualizar antes de ficar só de leitura.` };
  }
  if (s.estado === 'read_only') return { tom: 'perigo', texto: 'Só leitura: vês e exportas tudo e os clientes continuam na app. Retoma a subscrição para voltar a escrever.' };
  if (s.estado === 'cancelled') return { tom: 'perigo', texto: 'Subscrição cancelada: fica tudo em só leitura e nada se apaga.' };
  return null;
}

export async function fetchSubscricao(client: LunaClient, scope: OrgScope): Promise<Subscricao> {
  const { data, error } = await client.rpc('subscription_overview', { _org: scope.orgId });
  if (error) throw error;
  return lerSubscricao(data as Raw);
}

export async function preverMudanca(client: LunaClient, scope: OrgScope, plano: PlanoLuna, lugares: number): Promise<EfeitoMudanca> {
  const { data, error } = await client.rpc('preview_subscription_change', { _org: scope.orgId, _plan: plano, _seats: lugares });
  if (error) throw error;
  const o = data as Raw;
  return { planoDe: o.plano_de as PlanoLuna, planoPara: o.plano_para as PlanoLuna, lugaresDe: Number(o.lugares_de), lugaresPara: Number(o.lugares_para),
    ocupados: Number(o.ocupados), liberta: Number(o.liberta), entram: lista<string>(o.entram), soLeitura: lista<string>(o.so_leitura) };
}

export class EscolherQuemPerdeError extends Error {
  constructor() { super('Há mais lugares ocupados do que os pedidos. Escolhe quem perde o lugar.'); this.name = 'EscolherQuemPerdeError'; }
}

export async function mudarSubscricao(client: LunaClient, scope: OrgScope, plano: PlanoLuna, lugares: number, liberta: string[] = [], motivo?: string): Promise<Subscricao> {
  const { data, error } = await client.rpc('change_subscription', { _org: scope.orgId, _plan: plano, _seats: lugares, _free: liberta, _reason: motivo ?? null });
  if (error) {
    if (/escolhe quem perde/.test(error.message)) throw new EscolherQuemPerdeError();
    throw error;
  }
  return lerSubscricao(data as Raw);
}

/**
 * Fornecedor de pagamentos da subscrição do LunaOS. O falso guarda um método
 * de teste e nunca cobra; o real (N8) implementa a mesma interface.
 */
export interface SubscriptionProvider {
  readonly nome: string;
  readonly cobra: boolean;
  adicionarMetodo(client: LunaClient, orgId: string): Promise<void>;
  cancelar(client: LunaClient, orgId: string, motivo: string): Promise<void>;
  retomar(client: LunaClient, orgId: string): Promise<void>;
}

export const fornecedorFalso: SubscriptionProvider = {
  nome: 'Pagamento de teste',
  cobra: false,
  async adicionarMetodo(client, orgId) {
    const { error } = await client.rpc('add_payment_method', { _org: orgId });
    if (error) throw error;
  },
  async cancelar(client, orgId, motivo) {
    const { error } = await client.rpc('cancel_subscription', { _org: orgId, _reason: motivo });
    if (error) throw error;
  },
  async retomar(client, orgId) {
    const { error } = await client.rpc('resume_subscription', { _org: orgId });
    if (error) {
      if (/falta o método/.test(error.message)) throw new Error('Acrescenta primeiro um método de pagamento.');
      throw error;
    }
  },
};

/** Criar o negócio (X-04): como trabalhas decide o plano; modalidades por suportar vão para a lista de espera. */
export async function criarNegocio(client: LunaClient, e: { nome: string; como: ComoTrabalho; modalidades: string[]; unidade?: string }): Promise<string> {
  const principal = e.modalidades.find((m) => MODALIDADES_REGISTO.some((x) => x.id === m && x.pronta)) ?? 'fitness';
  const { data, error } = await client.rpc('create_organization', { _name: e.nome.trim(), _type: e.como, _sport: principal, _unit: e.unidade?.trim() || null });
  if (error) throw error;
  const espera = e.modalidades.filter((m) => m !== principal);
  if (espera.length) await client.rpc('join_sport_waitlist', { _sports: espera, _org: data as string });
  return data as string;
}
