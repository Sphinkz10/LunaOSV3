import { useEffect } from 'react';
import { useToastStore, type ToastItem } from '@luna/core';

const color: Record<ToastItem['variant'], string> = {
  success: 'var(--status-success)', danger: 'var(--status-danger)',
  warning: 'var(--status-warning)', info: 'var(--status-info)',
};
function Item({ t }: { t: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  useEffect(() => { const h = setTimeout(() => dismiss(t.id), t.durationMs); return () => clearTimeout(h); }, [t, dismiss]);
  return (
    <div role="status" style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'flex-start',
      background: 'var(--surface-2)', border: '1px solid var(--border-strong)', borderLeft: `3px solid ${color[t.variant]}`,
      borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-card)', padding: 'var(--sp-3) var(--sp-4)',
      color: 'var(--text-primary)', maxWidth: 360 }}>
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: 'var(--fs-sm)' }}>{t.title}</strong>
        {t.description && <p style={{ margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{t.description}</p>}
      </div>
      <button aria-label="Dispensar" onClick={() => dismiss(t.id)}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--fs-sm)' }}>✕</button>
    </div>
  );
}
/** Pilha central de toasts (top-center, como o legado #toastbox) com aria-live. */
export function Toaster() {
  const items = useToastStore((s) => s.items);
  return (
    <div aria-live="polite" aria-label="Notificações"
      style={{ position: 'fixed', top: 'var(--sp-4)', left: '50%', transform: 'translateX(-50%)',
               display: 'grid', gap: 'var(--sp-2)', zIndex: 'var(--z-toast)' as unknown as number }}>
      {items.map((t) => <Item key={t.id} t={t} />)}
    </div>
  );
}
