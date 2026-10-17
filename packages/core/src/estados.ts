import { create } from 'zustand';
import type { LunaClient } from './api/client';
import type { Database } from './types/database';

/**
 * Estados de todos os ecrãs (X-02, tarefa 25): rascunho que sobrevive à sessão
 * expirada, gravação por confirmar que verifica no servidor antes de repetir e
 * conflito quando outra pessoa mudou o mesmo registo.
 */

/* ── Rascunhos (7 dias) ─────────────────────────────────────────────────── */
const PREFIXO = 'luna.rascunho.';
export const RASCUNHO_DIAS = 7;

function armazem(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function guardarRascunho<T>(chave: string, valor: T, agora = Date.now()): void {
  armazem()?.setItem(PREFIXO + chave, JSON.stringify({ em: agora, valor }));
}

export function lerRascunho<T>(chave: string, agora = Date.now()): T | null {
  const a = armazem();
  const bruto = a?.getItem(PREFIXO + chave);
  if (!bruto) return null;
  try {
    const { em, valor } = JSON.parse(bruto) as { em: number; valor: T };
    if (agora - em > RASCUNHO_DIAS * 86_400_000) { a?.removeItem(PREFIXO + chave); return null; }
    return valor;
  } catch { a?.removeItem(PREFIXO + chave); return null; }
}

export function apagarRascunho(chave: string): void {
  armazem()?.removeItem(PREFIXO + chave);
}

/* ── Alterado por outra pessoa ──────────────────────────────────────────── */
export interface Diferenca { campo: string; rotulo: string; deles: unknown; meu: unknown }

/** Campos em que a minha versão e a do servidor diferem (só os que eu mudei). */
export function diferencas<T extends Record<string, unknown>>(
  original: T, meu: Partial<T>, servidor: T, rotulos: Partial<Record<keyof T, string>> = {},
): Diferenca[] {
  return (Object.keys(meu) as (keyof T)[])
    .filter((k) => !igual(meu[k], original[k]) && !igual(servidor[k], original[k]) && !igual(servidor[k], meu[k]))
    .map((k) => ({ campo: String(k), rotulo: rotulos[k] ?? String(k), deles: servidor[k], meu: meu[k] }));
}
const igual = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export class ConflitoError extends Error {
  constructor(public diferencas: Diferenca[], public servidor: Record<string, unknown>, public quem: string | null) {
    super('Outra pessoa mudou este registo enquanto editavas.');
    this.name = 'ConflitoError';
  }
}

type Tabela = keyof Database['public']['Tables'];

/**
 * Grava só se o registo ainda está como o vi (updated_at). Se outra pessoa o
 * mudou, junta o que mudou dos dois lados: campos que não colidem gravam-se,
 * os que colidem lançam ConflitoError para a pessoa escolher.
 */
export async function gravarComVersao<T extends Record<string, unknown>>(
  client: LunaClient, tabela: Tabela, id: string, original: T & { updated_at: string }, meu: Partial<T>,
  rotulos: Partial<Record<keyof T, string>> = {},
): Promise<void> {
  const q = client.from(tabela as 'clients') as unknown as {
    update: (v: Record<string, unknown>) => { eq: (c: string, v: string) => { eq: (c: string, v: string) => { select: (c: string) => Promise<{ data: unknown[] | null; error: Error | null }> } } };
    select: (c: string) => { eq: (c: string, v: string) => { single: () => Promise<{ data: Record<string, unknown> | null; error: Error | null }> } };
  };
  const r = await q.update(meu).eq('id', id).eq('updated_at', original.updated_at).select('id');
  if (r.error) throw r.error;
  if ((r.data ?? []).length > 0) return;
  const atual = await q.select('*').eq('id', id).single();
  if (atual.error || !atual.data) throw atual.error ?? new Error('O registo já não existe.');
  const dif = diferencas(original, meu, atual.data as T, rotulos);
  if (dif.length === 0) {
    // Ninguém mexeu nos mesmos campos: grava por cima da versão nova
    const r2 = await q.update(meu).eq('id', id).eq('updated_at', String(atual.data.updated_at)).select('id');
    if (r2.error) throw r2.error;
    if ((r2.data ?? []).length > 0) return;
  }
  throw new ConflitoError(dif, atual.data, (atual.data.updated_by_name as string | undefined) ?? null);
}

/* ── Gravação por confirmar ─────────────────────────────────────────────── */
export interface GravacaoIncerta { id: number; rotulo: string; retomar: () => Promise<void> }

interface IncertasState {
  itens: GravacaoIncerta[];
  juntar: (g: Omit<GravacaoIncerta, 'id'>) => void;
  tirar: (id: number) => void;
}
let seq = 0;
export const useGravacoesIncertas = create<IncertasState>((set) => ({
  itens: [],
  juntar: (g) => set((s) => ({ itens: [...s.itens, { ...g, id: ++seq }] })),
  tirar: (id) => set((s) => ({ itens: s.itens.filter((i) => i.id !== id) })),
}));

/** Falha de rede (o pedido pode ter chegado ou não), não uma recusa do servidor. */
export function erroDeRede(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const m = e instanceof Error ? e.message : String(e ?? '');
  return /Failed to fetch|NetworkError|Load failed|network|fetch failed/i.test(m);
}

/**
 * Corre uma gravação. Se a rede cair a meio, não repete às cegas: guarda
 * "Não sabemos se gravou" e, ao retomar, pergunta primeiro ao servidor
 * (verificar) e só grava outra vez se não chegou.
 */
export async function gravarSemRepetir(rotulo: string, gravar: () => Promise<void>, verificar: () => Promise<boolean>): Promise<'gravado' | 'por-confirmar'> {
  try {
    await gravar();
    return 'gravado';
  } catch (e) {
    if (!erroDeRede(e)) throw e;
    useGravacoesIncertas.getState().juntar({
      rotulo,
      retomar: async () => { if (!(await verificar())) await gravar(); },
    });
    return 'por-confirmar';
  }
}
