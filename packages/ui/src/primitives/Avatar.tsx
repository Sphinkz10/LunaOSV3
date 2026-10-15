const sizes = { xs: 24, sm: 32, md: 40, lg: 48, xl: 64 } as const;
export function Avatar({ name, size = 'md' }: { name: string; size?: keyof typeof sizes }) {
  const initials = name.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const s = sizes[size];
  return (
    <span role="img" aria-label={name}
      style={{ width: s, height: s, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
               background: 'var(--surface-2)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)',
               fontFamily: 'var(--font-display)', fontSize: s * 0.38, fontWeight: 700 }}>{initials}</span>
  );
}
