import { useId, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface CardAction { label: string; onAct: () => void; danger?: boolean; }
/** Swipe (Framer) com alternativa ⋮ SEMPRE presente (Guia §11 — gestos com alternativa). */
export function SwipeableCard({ children, actions }: { children: ReactNode; actions: CardAction[] }) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuId = useId();
  const W = 176; // referência do legado
  return (
    <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--r-lg)' }}>
      <div aria-hidden={!open} style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'flex-end' }}>
        {actions.map(a => (
          <button key={a.label} onClick={a.onAct} tabIndex={open ? 0 : -1}
            style={{ width: W / actions.length, border: 'none', cursor: 'pointer',
                     background: a.danger ? 'var(--status-danger)' : 'var(--surface-2)',
                     color: 'var(--text-primary)', fontSize: 'var(--fs-xs)', fontWeight: 700 }}>{a.label}</button>
        ))}
      </div>
      <motion.div drag="x" dragConstraints={{ left: -W, right: 0 }} dragElastic={0.05}
        onDragEnd={(_, info) => setOpen(info.offset.x < -W / 2)}
        animate={{ x: open ? -W : 0 }} transition={{ type: 'tween', duration: 0.22 }}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
                 boxShadow: 'var(--shadow-inset)', padding: 'var(--sp-4)', display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        <button aria-label="Mais ações" aria-expanded={menu} aria-controls={menuId} onClick={() => setMenu(m => !m)}
          style={{ minWidth: 'var(--touch-min)', minHeight: 'var(--touch-min)', borderRadius: 'var(--r-pill)',
                   border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--text-secondary)', cursor: 'pointer' }}>⋮</button>
      </motion.div>
      {menu && (
        <div id={menuId} role="menu" style={{ position: 'absolute', right: 'var(--sp-2)', top: '100%', marginTop: 'var(--sp-1)',
          background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-card)', zIndex: 'var(--z-dropdown)' as unknown as number, display: 'grid', minWidth: 160 }}>
          {actions.map(a => (
            <button key={a.label} role="menuitem" onClick={() => { setMenu(false); a.onAct(); }}
              style={{ minHeight: 'var(--touch-min)', padding: '0 var(--sp-4)', textAlign: 'left', border: 'none',
                       background: 'transparent', cursor: 'pointer', fontSize: 'var(--fs-sm)',
                       color: a.danger ? 'var(--status-danger)' : 'var(--text-primary)' }}>{a.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
