import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { palette } from './node_modules/@luna/tokens/src/primitives';

export default defineConfig({
  /** .env na raiz do monorepo (não em apps/coach). */
  envDir: '../../',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'LUNA.OS', short_name: 'LUNA.OS',
        description: 'Posto de comando do treinador',
        theme_color: palette.bg, background_color: palette.bg,
        display: 'standalone', start_url: '/',
        icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
      },
    }),
  ],
  server: { port: 5173 },
});
