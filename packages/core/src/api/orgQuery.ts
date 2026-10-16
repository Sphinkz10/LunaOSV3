import type { LunaClient } from './client';
import type { Database } from '../types/database';

type PublicTables = Database['public']['Tables'];
/** Só tabelas da organização (org_id obrigatório) — a convenção é imposta pelo compilador. */
export type OrgTables = { [K in keyof PublicTables]:
  PublicTables[K]['Row'] extends { org_id: string } ? K : never }[keyof PublicTables];
export interface PageOpts { limit?: number; cursor?: string | null; order?: { column: string; ascending?: boolean } }
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;
/** Tamanho de página do PostgREST (max_rows = 1000 em supabase/config.toml). */
export const PAGE_SIZE = 1000;

/** Convenção obrigatória: org_id EXPLÍCITO + limite em toda a query de lista. */
export function orgQuery<T extends OrgTables & string>(
  client: LunaClient, table: T, orgId: string, opts: PageOpts = {},
) {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  let q = client.from(table).select('*').eq('org_id' as never, orgId as never).limit(limit);
  if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
  if (opts.cursor && opts.order) {
    q = opts.order.ascending === false ? q.lt(opts.order.column, opts.cursor) : q.gt(opts.order.column, opts.cursor);
  }
  return q;
}
/** Helper de validação usado em testes/CI: garante que opts respeitam o teto. */
export const clampLimit = (n?: number) => Math.min(n ?? DEFAULT_LIMIT, MAX_LIMIT);

/**
 * Lê todas as páginas (auditoria, Médio: listas cortavam em silêncio aos 1000).
 * `page(from, to)` devolve a consulta já com .range(from, to).
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  maxRows = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < maxRows; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) return out;
  }
  return out;
}
