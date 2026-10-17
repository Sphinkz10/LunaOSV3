import { createBrowserRouter } from 'react-router-dom';
import {
  BoasVindas, Consentimentos, CriarContaCliente, EntrarCliente, Parq, Partilhas, PedirEncarregado, Pronto,
} from './pages/Conta';
import { Tutela } from './pages/Tutela';

/** App do cliente · F1a: conta, consentimentos, convite, PAR-Q e encarregado (C-01, C-25). */
export const router = createBrowserRouter([
  { path: '/', element: <BoasVindas /> },
  { path: '/convite/:token', element: <BoasVindas /> },
  { path: '/criar-conta', element: <CriarContaCliente /> },
  { path: '/entrar', element: <EntrarCliente /> },
  { path: '/conta/consentimentos', element: <Consentimentos /> },
  { path: '/conta/partilhas', element: <Partilhas /> },
  { path: '/conta/encarregado', element: <PedirEncarregado /> },
  { path: '/conta/parq', element: <Parq /> },
  { path: '/conta/pronto', element: <Pronto /> },
  { path: '/encarregado/:token', element: <Tutela /> },
]);
