import type { ReactNode } from 'react';
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div role="status" style={{ textAlign: 'center', padding: 'var(--sp-12) var(--sp-6)', color: 'var(--text-muted)',
      border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-lg)' }}>
      <p style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', color: 'var(--text-secondary)' }}>{title}</p>
      {hint && <p style={{ margin: 'var(--sp-2) 0 0', fontSize: 'var(--fs-sm)' }}>{hint}</p>}
      {action && <div style={{ marginTop: 'var(--sp-4)' }}>{action}</div>}
    </div>
  );
}
