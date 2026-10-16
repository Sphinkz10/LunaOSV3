import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary } from '@luna/ui';
import { Avisos, ConfirmarHost } from '@luna/ui/v3';
import { vigiarRede } from '@luna/core';
import { router } from './app/router';
import { useAuthBootstrap } from './app/useAuthBootstrap';
import { initObservability } from './lib/observability';
import './styles.css';
import './luna-proto.css';

initObservability();
vigiarRede();

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
