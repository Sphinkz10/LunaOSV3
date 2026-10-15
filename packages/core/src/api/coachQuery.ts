import type { LunaClient } from './client';
import type { Database } from '../types/database';

type PublicTables = Database['public']['Tables'];
/** Só tabelas COM coach_id — a convenção é imposta pelo compilador. */
export type CoachTables = { [K in keyof PublicTables]:
  PublicTables[K]['Row'] extends { coach_id: string } ? K : never }[keyof PublicTables];
export interface PageOpts { limit?: number; cursor?: string | null; order?: { column: string; ascending?: boolean } }
export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** Convenção obrigatória (Guia §9/Hardening): coach_id EXPLÍCITO + limite em toda a query de lista. */
export function coachQuery<T extends CoachTables & string>(
  client: LunaClient, table: T, coachId: string, opts: PageOpts = {},
) {
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  let q = client.from(table).select('*').eq('coach_id' as never, coachId as never).limit(limit);
  if (opts.order) q = q.order(opts.order.column, { ascending: opts.order.ascending ?? true });
  if (opts.cursor && opts.order) {
    q = opts.order.ascending === false ? q.lt(opts.order.column, opts.cursor) : q.gt(opts.order.column, opts.cursor);
  }
  return q;
}
/** Helper de validação usado em testes/CI: garante que opts respeitam o teto. */
export const clampLimit = (n?: number) => Math.min(n ?? DEFAULT_LIMIT, MAX_LIMIT);
