import type { ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@luna/core';
import { Skeleton } from '@luna/ui';

/** Acento por módulo (Guia §3.6): UMA var; componentes só conhecem `accent`. */
const ACCENT: Record<string, string> = {
  dashboard: 'var(--gold)', calendar: 'var(--sky)', live: 'var(--orange)', dataos: 'var(--lime)',
  studio: 'var(--gold)', forms: 'var(--teal)', analytics: 'var(--violet)',
  athletes: 'var(--teal)', groups: 'var(--teal)', settings: 'var(--steel)',
};
export function ModuleLayout({ module: mod }: { module: keyof typeof ACCENT }) {
  return (
    <div data-module={mod} style={{ ['--accent-module' as string]: ACCENT[mod], minHeight: '100dvh' }}>
      <Outlet />
    </div>
  );
}

export function Protected({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  if (status === 'loading') {
    return (
      <main style={{ padding: 'var(--sp-8)', minHeight: '100dvh' }}>
        <Skeleton height={20} width="30%" />
        <div style={{ height: 'var(--sp-4)' }} />
        <Skeleton height={120} />
      </main>
    );
  }
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
