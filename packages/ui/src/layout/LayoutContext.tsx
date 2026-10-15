import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { defaultStrategyFor, type LayoutStrategy } from '@luna/tokens';

/** P1.3/P1.4 — estratégia = breakpoint (default) + override do utilizador (persistido). */
const KEY = 'luna.layout';

export interface LayoutCtx {
  strategy: LayoutStrategy;
  override: Partial<LayoutStrategy>;
  setOverride: (o: Partial<LayoutStrategy>) => void;
  width: number;
}
const Ctx = createContext<LayoutCtx | null>(null);

function readOverride(): Partial<LayoutStrategy> {
  try { return JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}'); } catch { return {}; }
}

export function LayoutProvider({ children, initialWidth }: { children: ReactNode; initialWidth?: number }) {
  const [width, setWidth] = useState(initialWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1280));
  const [override, setOverrideState] = useState<Partial<LayoutStrategy>>(readOverride);

  useEffect(() => {
    const on = () => setWidth(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const setOverride = (o: Partial<LayoutStrategy>) => {
    setOverrideState(prev => {
      const next = { ...prev, ...o };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* offline-safe */ }
      return next;
    });
  };

  const strategy = useMemo<LayoutStrategy>(
    () => ({ ...defaultStrategyFor(width), ...override }),
    [width, override],
  );

  useEffect(() => { document.documentElement.dataset.density = strategy.density; }, [strategy.density]);

  return <Ctx.Provider value={{ strategy, override, setOverride, width }}>{children}</Ctx.Provider>;
}

export function useLayout(): LayoutCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLayout requer <LayoutProvider>');
  return v;
}
