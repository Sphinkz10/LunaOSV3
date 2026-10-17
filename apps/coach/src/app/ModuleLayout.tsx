import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { hasModule, useAuthStore, type OrgScope } from '@luna/core';
import { Skeleton } from '@luna/ui';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';
import { DoisFatores } from './DoisFatores';

/** Acento por módulo (Guia §3.6): UMA var; componentes só conhecem `accent`. */
const ACCENT: Record<string, string> = {
  today: 'var(--gold)', schedule: 'var(--sky)', live: 'var(--orange)',
  clients: 'var(--teal)', groups: 'var(--teal)', settings: 'var(--steel)',
};
export function ModuleLayout({ module: mod }: { module: keyof typeof ACCENT }) {
  return (
    <div data-module={mod} style={{ ['--accent-module' as string]: ACCENT[mod], minHeight: '100dvh' }}>
      <Outlet />
    </div>
  );
}

function StatePage({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 'var(--sp-6)' }}>
      <div role="alert" style={{ maxWidth: '28rem', textAlign: 'center', display: 'grid', gap: 'var(--sp-3)' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', margin: 0 }}>{title}</h1>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{body}</p>
        {action}
      </div>
    </main>
  );
}

const LeaveButton = () => (
  <button type="button" className="btn ghost" onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</button>
);

/**
 * Porta da Gestão (X-02): a carregar, sem configuração, erro, sem papel de equipa,
 * e o módulo desligado pelo serviço de direitos.
 */
export function Protected({ children, module: mod }: { children: ReactNode; module?: string }) {
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const modules = useAuthStore((s) => s.modules);

  if (status === 'loading') {
    return (
      <main aria-busy="true" style={{ padding: 'var(--sp-8)', minHeight: '100dvh' }}>
        <Skeleton height={20} width="30%" />
        <div style={{ height: 'var(--sp-4)' }} />
        <Skeleton height={120} />
      </main>
    );
  }
  if (status === 'notConfigured') {
    return (
      <StatePage title="Falta a ligação ao servidor"
        body="O ficheiro .env na raiz do projeto não tem VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY. Copia .env.example para .env, preenche os dois valores e reinicia a app." />
    );
  }
  if (status === 'error') {
    return (
      <StatePage title="Não foi possível entrar" body={error ?? 'Erro desconhecido.'}
        action={<button type="button" className="btn primary" onClick={() => window.location.reload()}>Tentar de novo</button>} />
    );
  }
  if (status === 'signedOut') return <Navigate to="/login" replace />;
  if (status === 'noRole') {
    return (
      <StatePage title="Esta conta não pertence a nenhuma equipa"
        body="A Gestão é para quem trabalha numa organização. Pede um convite a quem gere a tua organização e abre a ligação do convite com esta conta."
        action={<LeaveButton />} />
    );
  }
  // Direitos ainda por carregar: mostra; módulo desligado: não aparece
  if (mod && modules.length > 0 && !hasModule(modules, mod)) return <Navigate to="/today" replace />;
  // Papéis que veem saúde só entram com dois fatores (D18)
  return <DoisFatores>{children}</DoisFatores>;
}

/** Âmbito da organização ativa. Só se usa dentro de <Protected>. */
export function useScope(): OrgScope {
  const scope = useAuthStore((s) => s.scope);
  if (!scope) throw new Error('useScope fora de <Protected>');
  return scope;
}
