import { Link, useLocation } from 'react-router-dom';
import { Svg } from './Svg';

const PRINCIPAL = [
  { ico: 'home', label: 'Início', to: '/dashboard' },
  { ico: 'user', label: 'Atletas', to: '/athletes' },
  { ico: 'users', label: 'Grupos', to: '/groups' },
  { ico: 'cal', label: 'Studio', to: '/studio' },
  { ico: 'clipboard', label: 'Forms.OS', to: '/forms' },
  { ico: 'chart', label: 'Analytics.OS', to: '/analytics' },
  { ico: 'bolt', label: 'Data.OS', to: '/dataos' },
  { ico: 'play', label: 'Live', to: '/live' },
  { ico: 'cal', label: 'Calendário', to: '/calendar' },
] as const;

const SOON = ['Atribuições', 'Pendências', 'Histórico', 'Planos.OS', 'Treinos.OS', 'Relatórios.OS', 'Calendário.OS'] as const;

export function CoachNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const isActive = (to: string) => pathname === to || (to !== '/dashboard' && pathname.startsWith(`${to}/`));
  const close = () => onNavigate?.();
  return (
    <>
      <div className="side-title"><b>LUNA.OS</b><span>Centro de comando</span></div>

      <div className="nav-group">
        <div className="nav-label">Principal</div>
        {PRINCIPAL.map(({ ico, label, to }) => (
          <Link key={label + to} to={to} onClick={close} className={`nav-item${isActive(to) ? ' on' : ''}`} aria-current={isActive(to) ? 'page' : undefined}>
            <span className="nav-ico"><Svg name={ico} /></span>{label}
          </Link>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-label">Sistema</div>
        <Link to="/settings" onClick={close} className={`nav-item${isActive('/settings') ? ' on' : ''}`}>
          <span className="nav-ico"><Svg name="settings" /></span>Definições
        </Link>
      </div>

      <details className="nav-group soon-group">
        <summary className="nav-label">Próximas fases</summary>
        {SOON.map((label) => (
          <button key={label} type="button" className="nav-item is-soon" disabled>
            <span className="nav-ico" aria-hidden>•</span>{label}<span className="nav-soon">Brevemente</span>
          </button>
        ))}
      </details>
    </>
  );
}
