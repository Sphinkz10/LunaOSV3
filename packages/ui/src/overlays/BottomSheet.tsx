import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface BottomSheetProps { open: boolean; onClose: () => void; title: string; children: ReactNode; }
const overlay: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 'var(--z-modal)' as unknown as number };
const sheet: CSSProperties = {
  position: 'fixed', left: 0, right: 0, bottom: 0, maxHeight: '85dvh', overflowY: 'auto',
  background: 'var(--surface)', borderTop: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-xl) var(--r-xl) 0 0', boxShadow: 'var(--shadow-card)', color: 'var(--text-primary)',
  padding: 'var(--sp-6)', paddingBottom: 'calc(var(--sp-6) + env(safe-area-inset-bottom))',
  zIndex: 'var(--z-modal)' as unknown as number,
};

export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const lastFocused = useRef<HTMLElement | null>(null);
  useEffect(() => { if (open) lastFocused.current = document.activeElement as HTMLElement; }, [open]);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay style={overlay} />
        <Dialog.Content onCloseAutoFocus={(e) => { e.preventDefault(); lastFocused.current?.focus(); }} style={sheet} aria-describedby={undefined}>
          <div aria-hidden style={{ width: 44, height: 4, borderRadius: 'var(--r-pill)', background: 'var(--border-strong)', margin: '0 auto var(--sp-4)' }} />
          <Dialog.Title style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', margin: '0 0 var(--sp-4)' }}>{title}</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
