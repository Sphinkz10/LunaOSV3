import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@luna/ui';
import { Avisos, ConfirmarHost } from '@luna/ui/v3';
import { contarPorEnviar, enviarPendentes, useRede, vigiarRede } from '@luna/core';
import { getSupabaseClient } from './lib/supabase';
import { router } from './app/router';
import { useAuthBootstrap } from './app/useAuthBootstrap';
import { initObservability } from './lib/observability';
import './styles.css';
import './luna-proto.css';

initObservability();
vigiarRede();

// Fila sem rede do ao vivo (regra 8): ao voltar a rede, e de minuto a minuto, envia o que ficou no aparelho
async function esvaziarFila() {
  const client = getSupabaseClient();
  if (client && navigator.onLine) await enviarPendentes(client).catch(() => undefined);
  useRede.getState().setPendentes(contarPorEnviar());
}
window.addEventListener('online', () => void esvaziarFila());
setInterval(() => void esvaziarFila(), 60_000);
void esvaziarFila();

function App() {
  useAuthBootstrap();
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      {/* Avisos da app inteira (AUD-73), com Desfazer quando a ação o permite */}
      <Avisos />
      <ConfirmarHost />
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
