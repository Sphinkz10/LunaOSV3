export function KpiCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
                  boxShadow: 'var(--shadow-inset)', padding: 'var(--sp-4) var(--sp-5)' }}>
      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</p>
      <p style={{ margin: 'var(--sp-1) 0 0', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-2xl)', fontWeight: 700, color: 'var(--accent)' }}>{value}</p>
      {hint && <p style={{ margin: 'var(--sp-1) 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)' }}>{hint}</p>}
    </div>
  );
}
