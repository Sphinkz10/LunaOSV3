import { useEffect } from 'react';
import { bootstrapAuth } from '@luna/core';
import { getSupabaseClient } from '../lib/supabase';

/** Arranca a sessão; sem .env o estado fica 'notConfigured' (nunca um esqueleto infinito). */
export function useAuthBootstrap(): void {
  useEffect(() => bootstrapAuth(getSupabaseClient()), []);
}
