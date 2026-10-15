import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { signOut, useAuthStore } from '@luna/core';
import { getSupabaseClient } from '../lib/supabase';
import { CoachNav } from './CoachNav';
import { MobileNav } from './MobileNav';

/**
 * Shell fiel ao protótipo HTML: .app > .topbar + .layout(.sidebar|.main|.board).
 * Desktop (>=960px): sidebar + board visíveis.
 * Mobile (<960px): botão ☰ abre drawer lateral com navegação completa + barra inferior.
 */
export function CoachShell({
  headStrong,
  headSub,
  topActions,
  children,
  board,
  pageActions,
  mainClassName,
  layoutClassName,
}: {
  headStrong: string;
  headSub: string;
  topActions?: ReactNode;
  children: ReactNode;
  board?: ReactNode;
  pageActions?: ReactNode;
  mainClassName?: string;
  /** Ex.: athlete-mode no Atleta 360 */
  layoutClassName?: string;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  const onLogout = async () => {
    const client = getSupabaseClient();
    if (client) await signOut(client);
    useAuthStore.getState().signOut();
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="nav-toggle"
            aria-label="Abrir menu de navegação"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            ☰
          </button>
          <Link to="/dashboard" className="brand-badge" aria-label="Voltar ao Início">
            <div className="brand-i">L</div>
            <div className="brand-t">LUNA.OS</div>
          </Link>
          <div className="hsep hide-mobile" />
          <div className="hcopy">
            <strong>{headStrong}</strong>
            <span>{headSub}</span>
          </div>
        </div>
        <div className="top-actions">
          {topActions}
          <button type="button" className="btn ghost small hide-mobile" onClick={() => void onLogout()}>Sair</button>
        </div>
      </header>

      {navOpen && (
        <button type="button" className="nav-scrim" aria-label="Fechar menu" onClick={() => setNavOpen(false)} />
      )}

      <main className={`layout${layoutClassName ? ` ${layoutClassName}` : ''}`}>
        <aside className={`sidebar${navOpen ? ' drawer-open' : ''}`}>
          <CoachNav onNavigate={() => setNavOpen(false)} />
        </aside>
        <section className={`main${mainClassName ? ` ${mainClassName}` : ''}`}>{children}</section>
        {board != null && <aside className="board">{board}</aside>}
      </main>

      {pageActions}
      <MobileNav />
    </div>
  );
}
