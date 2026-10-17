import React from 'react';
import ReactDOM from 'react-dom/client';
import { RouterProvider } from 'react-router-dom';
import { Avisos } from '@luna/ui/v3';
import { vigiarRede } from '@luna/core';
import { router } from './router';
import './cliente.css';

vigiarRede();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <Avisos />
  </React.StrictMode>,
);
