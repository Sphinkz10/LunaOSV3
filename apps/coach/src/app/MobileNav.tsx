import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { hasModule, useAuthStore } from '@luna/core';
import { Svg } from './Svg';
import { vocab } from '../lib/vocab';

/** Navegação mobile (<960px): barra inferior por ícones + botão + com as ações do plano. */
export function MobileNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const modules = useAuthStore((s) => s.modules);
  const [open, setOpen] = useState(false);
  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (to: string) => { setOpen(false); navigate(to); };
  const on = (m: string) => hasModule(modules, m);

  // Plano Treinador: + tem nova sessão, novo cliente e novo treino (G-00)
  const fab = [
    on('clients') && { ico: 'user', label: `Novo ${vocab.pessoa()}`, to: '/clients?novo=1' },
    on('schedule') && { ico: 'cal', label: 'Nova marcação', to: '/schedule' },
    on('training') && { ico: 'play', label: `Iniciar ${vocab.sessao()}`, to: '/live' },
  ].filter(Boolean) as { ico: string; label: string; to: string }[];

  const tabs = [
    on('today') && { ico: 'home', label: 'Hoje', to: '/today' },
    on('clients') && { ico: 'user', label: vocab.pessoa({ plural: true, maiuscula: true }), to: '/clients' },
    on('schedule') && { ico: 'cal', label: 'Horário', to: '/schedule' },
    on('training') && { ico: 'play', label: vocab.sessao({ maiuscula: true }), to: '/live' },
  ].filter(Boolean) as { ico: string; label: string; to: string }[];
  const half = Math.ceil(tabs.length / 2);

  const tab = (t: { ico: string; label: string; to: string }) => (
    <button key={t.to} type="button" className={`mnav-item${isActive(t.to) ? ' on' : ''}`} onClick={() => go(t.to)}>
      <Svg name={t.ico} /><span>{t.label}</span>
    </button>
  );

  return (
    <>
      {open && <button className="mnav-scrim" aria-label="Fechar menu" onClick={() => setOpen(false)} />}

      <nav className="mnav" aria-label="Navegação principal">
        {tabs.slice(0, half).map(tab)}
        {fab.length > 0 && (
          <div className="mnav-fab-wrap">
            {open && (
              <div className="mnav-sheet" role="menu">
                {fab.map((a) => (
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
        )}
        {tabs.slice(half).map(tab)}
      </nav>
    </>
  );
}
