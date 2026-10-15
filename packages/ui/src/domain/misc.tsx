import type { ReactNode } from 'react';
import { ProgressRing } from '../primitives/ProgressRing';

export function LiveButton({ onClick, children = 'LIVE' }: { onClick?: () => void; children?: ReactNode }) {
  return (
    <button onClick={onClick} style={{ minHeight: 'var(--ctl-lg)', padding: '0 var(--sp-8)', borderRadius: 'var(--r-pill)',
      border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 'var(--fs-base)',
      background: 'var(--status-danger)', color: 'var(--text-primary)', animation: 'luna-livepulse 1.6s ease-in-out infinite' }}>
      ● {children}
    </button>
  );
}

export function AllergyBanner({ allergies }: { allergies: { name: string; severity: 'mild'|'moderate'|'severe' }[] }) {
  if (!allergies.length) return null;
  const worst = allergies.some(a => a.severity === 'severe') ? 'severe' : allergies.some(a => a.severity === 'moderate') ? 'moderate' : 'mild';
  const color = worst === 'severe' ? 'var(--status-danger)' : worst === 'moderate' ? 'var(--status-warning)' : 'var(--status-info)';
  return (
    <div role="alert" style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', padding: 'var(--sp-3) var(--sp-4)',
      border: `1px solid ${color}`, borderLeft: `4px solid ${color}`, borderRadius: 'var(--r-md)', background: 'var(--glass)', color: 'var(--text-primary)' }}>
      <span aria-hidden>⚠</span>
      <p style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>
        <strong>Alergias:</strong> {allergies.map(a => a.name).join(', ')}
      </p>
    </div>
  );
}

export function SecurityGauge({ score }: { score: number }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', gap: 'var(--sp-1)' }}>
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        <ProgressRing value={score / 100} size={110} stroke={10} label={`Segurança ${score} de 100`} />
        <strong style={{ position: 'absolute', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)' }}>{score}</strong>
      </div>
      <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>Score de segurança</span>
    </div>
  );
}

export function SourcePill({ source }: { source: string }) {
  return <span title={`Origem: ${source}`} style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)',
    border: '1px dashed var(--border-strong)', borderRadius: 'var(--r-pill)', padding: '1px var(--sp-2)' }}>{source}</span>;
}

export function RpeSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <label style={{ display: 'grid', gap: 'var(--sp-1)', fontSize: 'var(--fs-sm)', color: 'var(--text-secondary)' }}>
      RPE: <strong style={{ color: 'var(--accent)' }}>{value}</strong>
      <input type="range" min={1} max={10} step={1} value={value} aria-valuetext={`RPE ${value} de 10`}
        onChange={(e) => onChange(Number(e.target.value))} style={{ accentColor: 'var(--accent)', minHeight: 'var(--touch-min)' }} />
    </label>
  );
}
