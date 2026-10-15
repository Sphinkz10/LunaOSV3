import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  render() {
    if (!this.state.err) return this.props.children;
    return this.props.fallback ?? (
      <div role="alert" style={{ padding: 'var(--sp-8)', textAlign: 'center', color: 'var(--text-secondary)',
        border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', background: 'var(--surface)' }}>
        <p style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', margin: 0 }}>Algo correu mal.</p>
        <button onClick={() => this.setState({ err: false })}
          style={{ marginTop: 'var(--sp-4)', minHeight: 'var(--touch-min)', padding: '0 var(--sp-6)',
                   borderRadius: 'var(--r-pill)', border: '1px solid var(--border-strong)',
                   background: 'var(--glass)', color: 'var(--text-primary)', cursor: 'pointer' }}>Tentar de novo</button>
      </div>
    );
  }
}
