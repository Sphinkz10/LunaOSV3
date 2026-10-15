export interface ToggleProps { checked: boolean; onChange: (v: boolean) => void; label: string; }
export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', background: 'none', border: 'none',
               cursor: 'pointer', color: 'var(--text-primary)', minHeight: 'var(--touch-min)', padding: 0, fontSize: 'var(--fs-sm)' }}>
      <span aria-hidden style={{ width: 44, height: 24, borderRadius: 'var(--r-pill)', position: 'relative',
        background: checked ? 'var(--accent)' : 'var(--glass)', border: '1px solid var(--border-strong)',
        transition: 'background var(--t-base)' }}>
        <i style={{ position: 'absolute', top: 2, left: checked ? 22 : 2, width: 18, height: 18, borderRadius: '50%',
                    background: 'var(--text-primary)', transition: 'left var(--t-base)' }} />
      </span>
      {label}
    </button>
  );
}
