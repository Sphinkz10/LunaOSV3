import type { ReactNode } from 'react';
type Variant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'accent';
const bg: Record<Variant, string> = {
  default: 'var(--glass)', success: 'var(--status-success)', warning: 'var(--status-warning)',
  danger: 'var(--status-danger)', info: 'var(--status-info)', accent: 'var(--accent)',
};
export function Badge({ variant = 'default', children }: { variant?: Variant; children: ReactNode }) {
  const filled = variant !== 'default';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-1)',
      padding: 'var(--sp-1) var(--sp-3)', borderRadius: 'var(--r-pill)', fontSize: 'var(--fs-xs)', fontWeight: 700,
      background: bg[variant], color: filled ? 'var(--color-bg-app)' : 'var(--text-secondary)',
      border: filled ? 'none' : '1px solid var(--border)' }}>{children}</span>
  );
}
