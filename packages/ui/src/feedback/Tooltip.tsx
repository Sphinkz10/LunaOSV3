import * as RT from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <RT.Provider delayDuration={300}>
      <RT.Root>
        <RT.Trigger asChild>{children}</RT.Trigger>
        <RT.Portal>
          <RT.Content sideOffset={6} style={{ background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
            color: 'var(--text-primary)', fontSize: 'var(--fs-xs)', padding: 'var(--sp-1) var(--sp-3)',
            borderRadius: 'var(--r-sm)', boxShadow: 'var(--shadow-inset)', zIndex: 'var(--z-tooltip)' as unknown as number }}>
            {content}
          </RT.Content>
        </RT.Portal>
      </RT.Root>
    </RT.Provider>
  );
}
