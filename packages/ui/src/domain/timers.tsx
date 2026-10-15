import { useEffect, useState } from 'react';
import { spikeTimer } from '@luna/core';
import { ProgressRing } from '../primitives/ProgressRing';

/** Timers por TIMESTAMPS (spike P0.8) — recalculam sozinhos ao voltar do background. */
export function useTicker(intervalMs = 250) {
  const [, setN] = useState(0);
  useEffect(() => { const h = setInterval(() => setN(n => n + 1), intervalMs); return () => clearInterval(h); }, [intervalMs]);
}

export function RestTimer({ state, onDone }: { state: spikeTimer.TimerState; onDone?: () => void }) {
  useTicker();
  const remaining = spikeTimer.remainingMs(state);
  useEffect(() => { if (remaining <= 0) onDone?.(); }, [remaining <= 0]); // dispara uma vez ao chegar a 0
  const total = state.durationMs;
  const secs = Math.ceil(remaining / 1000);
  return (
    <div role="timer" aria-label={`Descanso: ${secs} segundos restantes`}
         style={{ display: 'grid', placeItems: 'center', gap: 'var(--sp-2)' }}>
      <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
        <ProgressRing value={remaining / total} size={120} stroke={10} label="Anel de descanso" />
        <strong style={{ position: 'absolute', fontFamily: 'var(--font-display)', fontSize: 'var(--fs-2xl)' }}>{secs}</strong>
      </div>
    </div>
  );
}

export function SessionClock({ state }: { state: spikeTimer.TimerState }) {
  useTicker(500);
  const ms = spikeTimer.elapsedMs(state);
  const mm = String(Math.floor(ms / 60000)).padStart(2, '0');
  const ss = String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
  return <span role="timer" aria-label={`Sessão: ${mm} minutos ${ss}`} style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-xl)', fontVariantNumeric: 'tabular-nums' }}>{mm}:{ss}</span>;
}
