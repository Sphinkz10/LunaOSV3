import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { ErrorBoundary, Toaster } from '@luna/ui';
import { router } from './app/router';
import { useAuthBootstrap } from './app/useAuthBootstrap';
import { initObservability } from './lib/observability';
import './styles.css';
import './luna-proto.css';

initObservability();

function App() {
  useAuthBootstrap();
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
      {/* Avisos da app inteira (AUD-73: só existiam na página de prova) */}
      <Toaster />
    </ErrorBoundary>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
