import { createLunaClient, type LunaClient } from '@luna/core';

let client: LunaClient | null = null;

/** URL e anon key lidos de .env (Vite). Vazio = modo dev sem Supabase. */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim();
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function getSupabaseClient(): LunaClient | null {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  if (!client) client = createLunaClient(cfg.url, cfg.anonKey);
  return client;
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}
