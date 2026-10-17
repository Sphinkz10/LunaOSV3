import { createBrowserRouter } from 'react-router-dom';
import {
  BoasVindas, Consentimentos, CriarContaCliente, EntrarCliente, Parq, Partilhas, PedirEncarregado, Pronto,
} from './pages/Conta';
import { Tutela } from './pages/Tutela';
import { AppCliente, AvisosCliente, DefinicoesCliente, EuCliente, HojeCliente, PorChegar, PrivacidadeCliente, ProgressoCliente } from './pages/App';
import { TreinoAntevisao, TreinoEmCurso, TreinoSemana } from './pages/TreinoCliente';
import { t } from './vocab';

/** App do cliente · F1a: conta, consentimentos, convite, PAR-Q e encarregado (C-01, C-25); Hoje, avisos, Eu e privacidade (C-03, C-20, C-21, C-24). */
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
  { path: '/treino/:id/agora', element: <TreinoEmCurso /> },
  {
    element: <AppCliente />,
    children: [
      { path: '/hoje', element: <HojeCliente /> },
      { path: '/avisos', element: <AvisosCliente /> },
      { path: '/aulas', element: <PorChegar titulo={t('aula', { plural: true, maiuscula: true })} texto={`Marcar ${t('sessao', { plural: true })} e ${t('aula', { plural: true })} chega com o horário.`} /> },
      { path: '/treino', element: <TreinoSemana /> },
      { path: '/treino/:id', element: <TreinoAntevisao /> },
      { path: '/progresso', element: <ProgressoCliente /> },
      { path: '/eu', element: <EuCliente /> },
      { path: '/eu/privacidade', element: <PrivacidadeCliente /> },
      { path: '/eu/definicoes', element: <DefinicoesCliente /> },
    ],
  },
]);
