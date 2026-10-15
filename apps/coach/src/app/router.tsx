import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LayoutProvider } from '@luna/ui';
import { ModuleLayout, Protected } from './ModuleLayout';
import { CoachShell } from './CoachShell';
import { Svg } from './Svg';
import { Hello } from '../Hello';
import { Poc } from '../Poc';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Calendar } from '../pages/Calendar';
import { Athletes } from '../pages/Athletes';
import { Athlete360 } from '../pages/Athlete360';
import { Groups } from '../pages/Groups';
import { Group360 } from '../pages/Group360';
import { Live } from '../pages/Live';

const Soon = ({ name }: { name: string }) => (
  <CoachShell headStrong={name} headSub="Módulo em construção — entra na fase própria do roadmap.">
    <div className="page-head">
      <div>
        <div className="kicker">Em breve</div>
        <h1>{name}</h1>
        <p>Este módulo entra numa fase posterior do roadmap. A navegação e o resto da app já funcionam.</p>
      </div>
    </div>
    <div className="dash-empty"><Svg name="clock" /><h4>{name} — em construção</h4><p>Vamos chegar aqui seguindo o roadmap.</p></div>
  </CoachShell>
);

export const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  { path: '/', element: <Navigate to="/dashboard" replace /> },
  {
    path: '/dashboard',
    element: <Protected><ModuleLayout module="dashboard" /></Protected>,
    children: [{ index: true, element: <Dashboard /> }],
  },
  { path: '/calendar', element: <Protected><ModuleLayout module="calendar" /></Protected>,
    children: [{ index: true, element: <Calendar /> }] },
  { path: '/live/:bookingId?', element: <Protected><ModuleLayout module="live" /></Protected>,
    children: [{ index: true, element: <Live /> }] },
  { path: '/dataos', element: <Protected><ModuleLayout module="dataos" /></Protected>,
    children: [{ index: true, element: <Soon name="Data.OS" /> }] },
  { path: '/studio', element: <Protected><ModuleLayout module="studio" /></Protected>,
    children: [{ index: true, element: <Soon name="Studio" /> }] },
  { path: '/forms', element: <Protected><ModuleLayout module="forms" /></Protected>,
    children: [{ index: true, element: <Soon name="Forms.OS" /> }] },
  { path: '/analytics', element: <Protected><ModuleLayout module="analytics" /></Protected>,
    children: [{ index: true, element: <Soon name="Analytics.OS" /> }] },
  { path: '/athletes', element: <Protected><ModuleLayout module="athletes" /></Protected>,
    children: [
      { index: true, element: <Athletes /> },
      { path: ':id', element: <Athlete360 /> },
    ] },
  { path: '/groups', element: <Protected><ModuleLayout module="groups" /></Protected>,
    children: [
      { index: true, element: <Groups /> },
      { path: ':id', element: <Group360 /> },
    ] },
  { path: '/settings/:section?', element: <Protected><ModuleLayout module="settings" /></Protected>,
    children: [{ index: true, element: <Soon name="Definições" /> }] },
  { path: '/hello', element: <Hello /> },
  { path: '/poc', element: <LayoutProvider><Poc /></LayoutProvider> },
  { path: '*', element: <Soon name="404 — página não encontrada" /> },
]);
