import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom';
import { LayoutProvider } from '@luna/ui';
import { ModuleLayout, Protected } from './ModuleLayout';
import { CoachShell } from './CoachShell';
import { Svg } from './Svg';
import { Hello } from '../Hello';
import { Poc } from '../Poc';
import { Login } from '../pages/Login';
import { Today } from '../pages/Today';
import { Schedule } from '../pages/Schedule';
import { Clients } from '../pages/Clients';
import { Client360 } from '../pages/Client360';
import { Groups } from '../pages/Groups';
import { Group360 } from '../pages/Group360';
import { Live } from '../pages/Live';

const NotFound = () => (
  <CoachShell headStrong="Página não encontrada" headSub="Esta ligação não existe ou mudou de sítio.">
    <div className="dash-empty"><Svg name="alert" /><h4>Página não encontrada</h4><p>Usa o menu para voltar a um destino.</p></div>
  </CoachShell>
);

/**
 * Destinos do plano Treinador (G-00): Hoje, Clientes, Horário, Treino, Definições.
 * Cada destino pede o seu módulo ao serviço de direitos; os desligados não aparecem.
 * As Definições entram com as tarefas 10 e 25 (G-44, G-45, G-46).
 */
const routes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/', element: <Navigate to="/today" replace /> },
  { path: '/today', element: <Protected module="today"><ModuleLayout module="today" /></Protected>,
    children: [{ index: true, element: <Today /> }] },
  { path: '/schedule', element: <Protected module="schedule"><ModuleLayout module="schedule" /></Protected>,
    children: [{ index: true, element: <Schedule /> }] },
  { path: '/live/:bookingId?', element: <Protected module="training"><ModuleLayout module="live" /></Protected>,
    children: [{ index: true, element: <Live /> }] },
  { path: '/clients', element: <Protected module="clients"><ModuleLayout module="clients" /></Protected>,
    children: [
      { index: true, element: <Clients /> },
      { path: ':id', element: <Client360 /> },
    ] },
  { path: '/groups', element: <Protected module="clients"><ModuleLayout module="groups" /></Protected>,
    children: [
      { index: true, element: <Groups /> },
      { path: ':id', element: <Group360 /> },
    ] },
  { path: '*', element: <Protected><NotFound /></Protected> },
];

// Páginas de verificação: só em desenvolvimento, nunca em produção (auditoria, Baixo)
if (import.meta.env.DEV) {
  routes.splice(1, 0,
    { path: '/hello', element: <Hello /> },
    { path: '/poc', element: <LayoutProvider><Poc /></LayoutProvider> });
}

export const router = createBrowserRouter(routes);
