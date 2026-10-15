// Spike P0.8 — timer fiável: deriva SEMPRE de timestamps; nunca conta ticks.
export interface TimerState { startedAt: number; pausedAt: number | null; pausedTotal: number; durationMs: number; }
export const start = (durationMs: number, now = Date.now()): TimerState =>
  ({ startedAt: now, pausedAt: null, pausedTotal: 0, durationMs });
export const pause = (t: TimerState, now = Date.now()): TimerState =>
  t.pausedAt ? t : { ...t, pausedAt: now };
export const resume = (t: TimerState, now = Date.now()): TimerState =>
  t.pausedAt ? { ...t, pausedTotal: t.pausedTotal + (now - t.pausedAt), pausedAt: null } : t;
export const elapsedMs = (t: TimerState, now = Date.now()): number =>
  (t.pausedAt ?? now) - t.startedAt - t.pausedTotal;
export const remainingMs = (t: TimerState, now = Date.now()): number =>
  Math.max(0, t.durationMs - elapsedMs(t, now));
// Ao voltar do background: chamar remainingMs(t) — recalcula sozinho. Notificação local agendada para startedAt+pausedTotal+durationMs.
