import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Svg } from './Svg';

const FAB_ACTIONS = [
  { ico: 'user', label: 'Novo atleta', to: '/athletes' },
  { ico: 'cal', label: 'Nova marcação', to: '/calendar' },
  { ico: 'play', label: 'Iniciar treino', to: '/live' },
] as const;

/** Navegação mobile (<960px): barra inferior por ícones + FAB central com menu radial. */
export function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const isActive = (to: string) => pathname === to || (to !== '/dashboard' && pathname.startsWith(`${to}/`));

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (to: string) => { setOpen(false); navigate(to); };

  return (
    <>
      {open && <button className="mnav-scrim" aria-label="Fechar menu" onClick={() => setOpen(false)} />}

      <nav className="mnav" aria-label="Navegação principal">
        <button type="button" className={`mnav-item${isActive('/dashboard') ? ' on' : ''}`} onClick={() => go('/dashboard')}>
          <Svg name="home" /><span>Início</span>
        </button>
        <button type="button" className={`mnav-item${isActive('/athletes') ? ' on' : ''}`} onClick={() => go('/athletes')}>
          <Svg name="user" /><span>Atletas</span>
        </button>

        <div className="mnav-fab-wrap">
          {open && (
            <div className="mnav-sheet" role="menu">
              {FAB_ACTIONS.map((a) => (
                <button key={a.label} type="button" className="mnav-act" role="menuitem" onClick={() => go(a.to)}>
                  <span className="mnav-act-ic"><Svg name={a.ico} /></span><span>{a.label}</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" className={`mnav-fab${open ? ' open' : ''}`} aria-expanded={open}
            aria-label={open ? 'Fechar ações' : 'Abrir ações rápidas'} onClick={() => setOpen((v) => !v)}>
            <Svg name="plus" />
          </button>
        </div>

        <button type="button" className={`mnav-item${isActive('/studio') ? ' on' : ''}`} onClick={() => go('/studio')}>
          <Svg name="clipboard" /><span>Studio</span>
        </button>
        <button type="button" className={`mnav-item${isActive('/settings') ? ' on' : ''}`} onClick={() => go('/settings')}>
          <Svg name="settings" /><span>Definições</span>
        </button>
      </nav>
    </>
  );
}
