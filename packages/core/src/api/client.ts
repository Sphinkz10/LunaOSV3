import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

export type LunaClient = SupabaseClient<Database>;
/** Cliente tipado. NUNCA usar service_role aqui (Guia §10) — só anon. */
export function createLunaClient(url: string, anonKey: string): LunaClient {
  if (/service_role|sb_secret/i.test(anonKey)) throw new Error('service_role proibido no cliente');
  return createClient<Database>(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } });
}
