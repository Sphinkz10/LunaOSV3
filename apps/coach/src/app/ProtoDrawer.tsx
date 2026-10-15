import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Painel lateral / bottom sheet — equivalente ao .drawer do protótipo HTML.
 * Em mobile usa sheet de baixo; em desktop/tablet usa drawer lateral direito.
 */
export function ProtoDrawer({
  open,
  onClose,
  title,
  sub,
  children,
  mobileSheet = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  children: ReactNode;
  /** true = bottom sheet em viewport estreita (<=960px via CSS). */
  mobileSheet?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <button type="button" className="proto-drawer-scrim" aria-label="Fechar painel" onClick={onClose} />
      <aside
        ref={ref}
        className={`proto-drawer${mobileSheet ? ' proto-drawer-sheet' : ''} on`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="drawer-h">
          <div>
            <div className="drawer-title">{title}</div>
            {sub ? <div className="drawer-sub">{sub}</div> : null}
          </div>
          <button type="button" className="ico" aria-label="Fechar painel" onClick={onClose}>×</button>
        </div>
        <div className="drawer-b">{children}</div>
      </aside>
    </>,
    document.body,
  );
}
