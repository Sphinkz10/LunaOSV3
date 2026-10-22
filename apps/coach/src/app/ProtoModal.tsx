import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export type ModalSize = 'sm' | 'md' | 'lg' | 'wide';

/**
 * Modal partilhado de toda a app coach — estilo e tamanhos consistentes,
 * fiéis ao HTML (.modal-h / .modal-b / .modal-f). Tamanhos: sm | md | lg | wide.
 * Acessibilidade: foco inicial, fecho por ESC e por clique no fundo, scroll bloqueado.
 */
export function ProtoModal({
  open,
  onClose,
  title,
  sub,
  size = 'md',
  footer,
  children,
  closeOnBackdrop = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  sub?: string;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  closeOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // AUD-72: o foco vai para a janela só ao abrir; quem a usa pode redesenhar à vontade
  const fechar = useRef(onClose);
  fechar.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      {/* Fundo: fecha com o rato; o teclado fecha com Esc (tratado acima) */}
      <div className="proto-modal-backdrop" aria-hidden="true" role="presentation" onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        ref={ref}
        className={`proto-modal ${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="proto-modal-h">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          <button type="button" className="ico" aria-label="Fechar" onClick={onClose}>×</button>
        </div>
        <div className="proto-modal-b">{children}</div>
        {footer && <div className="proto-modal-f">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}
