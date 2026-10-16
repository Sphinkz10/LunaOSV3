import { Link, useLocation } from 'react-router-dom';
import { hasModule, useAuthStore } from '@luna/core';
import { Svg } from './Svg';
import { vocab } from '../lib/vocab';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';

/** Destinos por papel e direitos (G-00). Nunca um botão que leva a um ecrã vazio. */
export function navItems(modules: string[]) {
  const items = [
    { ico: 'home', label: 'Hoje', to: '/today', module: 'today' },
    { ico: 'user', label: vocab.pessoa({ plural: true, maiuscula: true }), to: '/clients', module: 'clients' },
    { ico: 'users', label: 'Grupos', to: '/groups', module: 'clients' },
    { ico: 'cal', label: 'Horário', to: '/schedule', module: 'schedule' },
    { ico: 'play', label: vocab.sessao({ maiuscula: true }), to: '/live', module: 'training' },
  ];
  return items.filter((i) => hasModule(modules, i.module));
}

export function CoachNav({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const modules = useAuthStore((s) => s.modules);
  const scope = useAuthStore((s) => s.scope);
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);
  const close = () => onNavigate?.();
  return (
    <>
      <div className="side-title"><b>LUNA.OS</b><span>{scope?.orgName ?? ''}</span></div>

      <nav className="nav-group" aria-label="Destinos">
        {navItems(modules).map(({ ico, label, to }) => (
          <Link key={to} to={to} onClick={close} className={`nav-item${isActive(to) ? ' on' : ''}`} aria-current={isActive(to) ? 'page' : undefined}>
            <span className="nav-ico"><Svg name={ico} /></span>{label}
          </Link>
        ))}
      </nav>

      <div className="nav-group">
        <div className="nav-label">Conta</div>
        <button type="button" className="nav-item" onClick={() => { close(); void signOutEverywhere(getSupabaseClient()); }}>
          <span className="nav-ico"><Svg name="settings" /></span>Sair
        </button>
      </div>
    </>
  );
}
