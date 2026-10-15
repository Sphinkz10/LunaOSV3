import { useId, type InputHTMLAttributes } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string; error?: string; helper?: string;
}
export function Input({ label, error, helper, id, style, ...rest }: InputProps) {
  const auto = useId(); const inputId = id ?? auto;
  const msgId = `${inputId}-msg`;
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-1)' }}>
      <label htmlFor={inputId} style={{ fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)', fontWeight: 600 }}>{label}</label>
      <input id={inputId} aria-invalid={!!error || undefined} aria-describedby={error || helper ? msgId : undefined}
        style={{ height: 'var(--ctl-md)', padding: '0 var(--sp-3)', borderRadius: 'var(--r-sm)',
                 border: `1px solid ${error ? 'var(--status-danger)' : 'var(--border)'}`,
                 background: 'var(--glass)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)',
                 fontSize: 'var(--fs-base)', ...style }} {...rest} />
      {(error || helper) && (
        <p id={msgId} role={error ? 'alert' : undefined}
           style={{ margin: 0, fontSize: 'var(--fs-xs)', color: error ? 'var(--status-danger)' : 'var(--text-muted)' }}>
          {error ?? helper}
        </p>
      )}
    </div>
  );
}
