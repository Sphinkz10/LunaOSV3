import type { CSSProperties, ReactNode } from 'react';
import { useLayout } from './LayoutContext';
import { BottomSheet } from '../overlays/BottomSheet';
import { useState } from 'react';

/** Shell fiel ao HTML: topbar full-width · grid side|main|board · mobile-actions (não bottom-nav). */
export interface ShellSlots {
  nav: ReactNode;
  header?: ReactNode;
  topActions?: ReactNode;
  content: ReactNode;
  aside?: ReactNode;
  /** Barra fixa inferior <960px — ações da página (ex.: Ações + Atribuir). */
  mobileActions?: ReactNode;
}

const topbar: CSSProperties = {
  height: 'var(--header-h)', flexShrink: 0, display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', gap: 'var(--sp-4)', padding: '0 var(--sp-4)',
  paddingTop: 'env(safe-area-inset-top)',
  background: 'var(--surface)', borderBottom: '1px solid var(--border-strong)',
  boxShadow: 'var(--shadow-card)', position: 'relative', zIndex: 50,
};

const sidebar: CSSProperties = {
  minHeight: 0, overflow: 'auto', padding: 'var(--sp-3) var(--sp-2)',
  background: 'rgba(2,16,32,.39)', borderRight: '1px solid var(--border)',
};

const main: CSSProperties = {
  minHeight: 0, overflow: 'auto', padding: 'var(--sp-4)', minWidth: 0,
};

const board: CSSProperties = {
  minHeight: 0, overflow: 'auto', padding: 'var(--sp-3)',
  background: 'rgba(2,16,32,.37)', borderLeft: '1px solid var(--border)',
};

const mobileBar: CSSProperties = {
  position: 'fixed', left: 10, right: 10, bottom: 10, zIndex: 120,
  display: 'flex', gap: 'var(--sp-2)', padding: 'var(--sp-2)',
  borderRadius: 'var(--r-lg)', background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-card)',
  paddingBottom: 'max(var(--sp-2), env(safe-area-inset-bottom))',
};

export function ResponsiveShell({ nav, header, topActions, content, aside, mobileActions }: ShellSlots) {
  const { strategy } = useLayout();
  const [asideOpen, setAsideOpen] = useState(false);
  const showSidebar = strategy.shell === 'sidebar';
  const showBoard = strategy.aside === 'right' && !!aside;
  const collapsed = strategy.shell === 'collapsed';
  const gridCols = showSidebar && showBoard
    ? 'var(--side-w) minmax(0,1fr) var(--board-w)'
    : showSidebar
      ? 'var(--side-w) minmax(0,1fr)'
      : 'minmax(0,1fr)';

  const defaultMobile = aside ? (
    <button type="button" onClick={() => setAsideOpen(true)}
      style={{
        flex: 1, minHeight: 'var(--ctl-md)', borderRadius: 'var(--r-md)',
        border: '1px solid var(--border)', background: 'var(--glass)',
        color: 'var(--text-primary)', fontWeight: 800, fontSize: 'var(--fs-sm)', cursor: 'pointer',
        fontFamily: 'var(--font-body)',
      }}>Ações</button>
  ) : null;

  return (
    <div data-shell={strategy.shell} data-aside={strategy.aside}
         style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column',
                  background: 'var(--color-bg-app)', color: 'var(--text-primary)' }}>
      {(header || topActions) && (
        <header style={topbar}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>{header}</div>
          {topActions && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexShrink: 0 }}>{topActions}</div>}
        </header>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: gridCols }}>
        {showSidebar && <nav aria-label="Navegação principal" style={sidebar}>{nav}</nav>}
        <section style={{ ...main, paddingBottom: collapsed ? 'calc(88px + env(safe-area-inset-bottom))' : main.padding }}>
          {content}
        </section>
        {showBoard && <aside aria-label="Painel de ações" style={board}>{aside}</aside>}
      </div>

      {collapsed && (mobileActions ?? defaultMobile) && (
        <div role="toolbar" aria-label="Ações rápidas" style={mobileBar}>
          {mobileActions ?? defaultMobile}
        </div>
      )}

      {collapsed && aside && (
        <BottomSheet open={asideOpen} onClose={() => setAsideOpen(false)} title="Painel">{aside}</BottomSheet>
      )}
    </div>
  );
}
