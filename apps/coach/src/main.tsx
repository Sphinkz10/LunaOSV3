import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
import { useAuthBootstrap } from './app/useAuthBootstrap';
import { initObservability } from './lib/observability';
import './styles.css';
import './luna-proto.css';

initObservability();

function App() {
  useAuthBootstrap();
  return <RouterProvider router={router} />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
