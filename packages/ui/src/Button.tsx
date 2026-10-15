import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant; size?: Size; loading?: boolean; children: ReactNode;
}

const base: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--sp-2)',
  fontFamily: 'var(--font-body)', fontWeight: 600, borderRadius: 'var(--r-pill)',
  border: '1px solid var(--border)', cursor: 'pointer',
  transition: 'transform var(--t-fast), filter var(--t-fast)',
  minWidth: 'var(--touch-min)',
};
const sizes: Record<Size, CSSProperties> = {
  sm: { height: 'var(--ctl-sm)', padding: '0 var(--sp-3)', fontSize: 'var(--fs-sm)' },
  md: { height: 'var(--ctl-md)', padding: '0 var(--sp-4)', fontSize: 'var(--fs-sm)' },
  lg: { height: 'var(--ctl-lg)', padding: '0 var(--sp-6)', fontSize: 'var(--fs-base)' },
};
const variants: Record<Variant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: 'var(--color-bg-app)', borderColor: 'transparent' },
  secondary: { background: 'var(--glass)', color: 'var(--text-primary)' },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'transparent' },
  danger: { background: 'var(--status-danger)', color: 'var(--text-primary)', borderColor: 'transparent' },
};

export function Button({ variant = 'primary', size = 'md', loading, disabled, children, style, ...rest }: ButtonProps) {
  return (
    <button
      style={{ ...base, ...sizes[size], ...variants[variant], opacity: disabled || loading ? 0.55 : 1, ...style }}
      disabled={disabled || loading} aria-busy={loading || undefined} {...rest}
    >
      {loading ? '…' : children}
    </button>
  );
}
