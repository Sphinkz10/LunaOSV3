import { spikeTimer as T } from '@luna/core';

describe('spike-timer (P0.8 — timestamps, nunca ticks)', () => {
  it('elapsed/remaining derivam de timestamps (sobrevive a background)', () => {
    const t0 = 1_000_000;
    let t = T.start(60_000, t0);
    expect(T.remainingMs(t, t0 + 10_000)).toBe(50_000);
    // "background" de 30s: nada foi contado, mas o cálculo está certo na mesma
    expect(T.remainingMs(t, t0 + 40_000)).toBe(20_000);
    expect(T.remainingMs(t, t0 + 70_000)).toBe(0); // clamp a 0
  });
  it('pause/resume descontam o tempo parado', () => {
    const t0 = 0;
    let t = T.start(60_000, t0);
    t = T.pause(t, 10_000);            // pausa aos 10s
    expect(T.elapsedMs(t, 25_000)).toBe(10_000); // congelado
    t = T.resume(t, 30_000);           // esteve 20s pausado
    expect(T.elapsedMs(t, 40_000)).toBe(20_000); // 40 - 20 pausado
    expect(T.remainingMs(t, 40_000)).toBe(40_000);
  });
  it('pause dupla e resume sem pause são no-ops seguros', () => {
    let t = T.start(10_000, 0);
    const p = T.pause(t, 1_000);
    expect(T.pause(p, 2_000)).toEqual(p);
    expect(T.resume(t, 2_000)).toEqual(t);
  });
});
