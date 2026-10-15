import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  elevated?: boolean; children: ReactNode;
}
export function Card({ elevated, children, style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: elevated ? 'var(--surface-2)' : 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-card)', padding: 'var(--sp-6)',
        color: 'var(--text-primary)', ...style,
      }}
      {...rest}
    >{children}</div>
  );
}
