import { useEffect } from 'react';
import { bootstrapAuth } from '@luna/core';
import { getSupabaseClient } from '../lib/supabase';

/** Arranca auth real quando Supabase está configurado. */
export function useAuthBootstrap(): void {
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    return bootstrapAuth(client);
  }, []);
}
