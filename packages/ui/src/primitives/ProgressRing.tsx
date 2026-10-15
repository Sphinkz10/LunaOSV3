/** Anel SVG (timers, gauge). value 0..1. */
export function ProgressRing({ value, size = 96, stroke = 8, label }: { value: number; size?: number; stroke?: number; label?: string }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <svg width={size} height={size} role="img" aria-label={label ?? `Progresso ${Math.round(v * 100)}%`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--glass)" strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--accent)" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)}
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition: 'stroke-dashoffset var(--t-base)' }} />
    </svg>
  );
}
