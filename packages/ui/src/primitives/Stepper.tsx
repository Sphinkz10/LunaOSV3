export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol aria-label="Progresso" style={{ display: 'flex', gap: 'var(--sp-2)', listStyle: 'none', padding: 0, margin: 0 }}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo';
        return (
          <li key={s} aria-current={state === 'current' ? 'step' : undefined}
              style={{ flex: 1, display: 'grid', gap: 'var(--sp-1)', fontSize: 'var(--fs-xs)',
                       color: state === 'todo' ? 'var(--text-muted)' : 'var(--text-primary)' }}>
            <span aria-hidden style={{ height: 4, borderRadius: 'var(--r-pill)',
              background: state === 'todo' ? 'var(--glass)' : 'var(--accent)' }} />
            {i + 1}. {s}
          </li>
        );
      })}
    </ol>
  );
}
