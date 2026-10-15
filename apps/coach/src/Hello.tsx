import { Button, Card } from '@luna/ui';
import { moduleAccent, calState } from '@luna/tokens';

/** Página de verificação da F0: tokens reais + ui base + acento por módulo. */
export function Hello() {
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--sp-8) var(--sp-4)', display: 'grid', gap: 'var(--sp-6)' }}>
      <header>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-3xl)', margin: 0 }}>🌑 LUNA.OS</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-base)' }}>
          Monorepo F0 ativo — tokens reais do legado, layout trocável a caminho (F1).
        </p>
      </header>

      {(Object.keys(moduleAccent) as Array<keyof typeof moduleAccent>).slice(0, 4).map((mod) => (
        <section key={mod} data-module={mod} style={{ ['--accent-module' as string]: `var(--${mod === 'dashboard' || mod === 'studio' ? 'gold' : mod === 'calendar' ? 'sky' : mod === 'live' ? 'orange' : 'lime'})` }}>
          <Card>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', marginTop: 0, color: 'var(--accent)' }}>{mod}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--fs-sm)' }}>
              O mesmo Button fica com o acento do módulo — sem CSS por módulo.
            </p>
            <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
              <Button>Primário</Button>
              <Button variant="secondary">Secundário</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Perigo</Button>
            </div>
          </Card>
        </section>
      ))}

      <Card elevated>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', marginTop: 0 }}>9 estados de dia</h2>
        <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          {Object.entries(calState).map(([k]) => (
            <span key={k} style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
              border: '1px solid var(--border)', borderRadius: 'var(--r-pill)',
              padding: 'var(--sp-1) var(--sp-3)', fontSize: 'var(--fs-xs)', color: 'var(--text-secondary)',
            }}>
              <i style={{ width: 10, height: 10, borderRadius: '50%', background: `var(--cal-${k})` }} aria-hidden />
              {k}
            </span>
          ))}
        </div>
      </Card>
    </main>
  );
}
