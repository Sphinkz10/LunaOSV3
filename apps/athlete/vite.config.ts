import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** App do cliente. .env na raiz do monorepo (a mesma ligação ao Supabase). */
export default defineConfig({
  envDir: '../../',
  plugins: [react()],
  server: { port: 5174 },
});
