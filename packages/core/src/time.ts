/**
 * Datas no fuso da unidade/organização (auditoria, Alto: no verão, marcações entre
 * as 00:00 e a 01:00 de Lisboa caíam no dia errado por se usar UTC).
 * Só Intl — sem bibliotecas.
 */

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    fmtCache.set(tz, f);
  }
  return f;
}

interface Wall { year: number; month: number; day: number; hour: number; minute: number; second: number }

/** Hora "de parede" de um instante num fuso. */
export function wallClock(instant: Date | string | number, tz: string): Wall {
  const parts = partsFormatter(tz).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Diferença (ms) entre a hora local do fuso e UTC nesse instante. */
function offsetMs(ms: number, tz: string): number {
  const w = wallClock(ms, tz);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
}

/** Instante UTC de uma hora de parede num fuso (trata a mudança de hora). */
export function zonedToUtc(year: number, month1: number, day: number, hour = 0, minute = 0, tz: string): Date {
  const guess = Date.UTC(year, month1 - 1, day, hour, minute);
  const first = guess - offsetMs(guess, tz);
  const second = guess - offsetMs(first, tz);
  return new Date(second);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' do instante, no fuso. */
export function dayInZone(instant: Date | string | number, tz: string): string {
  const w = wallClock(instant, tz);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

export function todayInZone(tz: string, now: Date = new Date()): string {
  return dayInZone(now, tz);
}

/** Início e fim (exclusivo) de um dia local, em ISO UTC. */
export function dayBoundsInZone(isoDay: string, tz: string): { start: string; end: string } {
  const [y, m, d] = isoDay.split('-').map(Number);
  const start = zonedToUtc(y, m, d, 0, 0, tz);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0, 0, tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Início e fim (exclusivo) de um mês local, em ISO UTC. */
export function monthBoundsInZone(year: number, month0: number, tz: string): { start: string; end: string } {
  const start = zonedToUtc(year, month0 + 1, 1, 0, 0, tz);
  const next = new Date(Date.UTC(year, month0 + 1, 1));
  const end = zonedToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, 1, 0, 0, tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** 'HH:MM' de um instante, no fuso. */
export function timeInZone(instant: Date | string | number, tz: string): string {
  const w = wallClock(instant, tz);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

export const DEFAULT_TIMEZONE = 'Europe/Lisbon';
