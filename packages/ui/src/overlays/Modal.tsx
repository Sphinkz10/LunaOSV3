import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface ModalProps {
  open: boolean; onClose: () => void; title: string;
  size?: 'sm' | 'md' | 'lg'; children: ReactNode; footer?: ReactNode;
}
const widths = { sm: 420, md: 560, lg: 760 } as const;
const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 'var(--z-modal)' as unknown as number };
const box: CSSProperties = {
  position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
  background: 'var(--surface)', border: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-card)', color: 'var(--text-primary)',
  padding: 'var(--sp-6)', width: 'min(92vw, var(--mw))', zIndex: 'var(--z-modal)' as unknown as number,
};

export function Modal({ open, onClose, title, size = 'md', children, footer }: ModalProps) {
  const lastFocused = useRef<HTMLElement | null>(null);
  useEffect(() => { if (open) lastFocused.current = document.activeElement as HTMLElement; }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={overlay} />
        <Dialog.Content onCloseAutoFocus={(e) => { e.preventDefault(); lastFocused.current?.focus(); }} style={{ ...box, ['--mw' as string]: `${widths[size]}px` }} aria-describedby={undefined}>
          <Dialog.Title style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', margin: '0 0 var(--sp-4)' }}>
            {title}
          </Dialog.Title>
          {children}
          {footer && <div style={{ display: 'flex', gap: 'var(--sp-3)', justifyContent: 'flex-end', marginTop: 'var(--sp-6)' }}>{footer}</div>}
          <Dialog.Close asChild>
            <button aria-label="Fechar" style={{ position: 'absolute', top: 'var(--sp-3)', right: 'var(--sp-3)',
              minWidth: 'var(--touch-min)', minHeight: 'var(--touch-min)', borderRadius: 'var(--r-pill)',
              border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
