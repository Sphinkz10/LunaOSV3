import * as RTabs from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
export interface TabItem { value: string; label: string; content: ReactNode; }
export function Tabs({ items, value, onChange }: { items: TabItem[]; value: string; onChange: (v: string) => void }) {
  return (
    <RTabs.Root value={value} onValueChange={onChange}>
      <RTabs.List aria-label="Separadores" style={{ display: 'flex', gap: 'var(--sp-2)', overflowX: 'auto',
        borderBottom: '1px solid var(--border)', paddingBottom: 'var(--sp-2)' }}>
        {items.map((t) => (
          <RTabs.Trigger key={t.value} value={t.value}
            style={{ minHeight: 'var(--touch-min)', padding: '0 var(--sp-4)', borderRadius: 'var(--r-pill)',
                     border: '1px solid var(--border)', cursor: 'pointer', whiteSpace: 'nowrap',
                     fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', fontWeight: 600,
                     background: value === t.value ? 'var(--accent)' : 'var(--glass)',
                     color: value === t.value ? 'var(--color-bg-app)' : 'var(--text-secondary)' }}>
            {t.label}
          </RTabs.Trigger>
        ))}
      </RTabs.List>
      {items.map((t) => (
        <RTabs.Content key={t.value} value={t.value} style={{ paddingTop: 'var(--sp-4)' }}>{t.content}</RTabs.Content>
      ))}
    </RTabs.Root>
  );
}
