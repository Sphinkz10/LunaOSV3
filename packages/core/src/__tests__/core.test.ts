import { computeSessionSummary, parseTargetLoadKg, parseTargetReps } from '../api/live';
import { clampLimit, MAX_LIMIT, DEFAULT_LIMIT } from '../api/coachQuery';
import { createLunaClient } from '../api/client';
import { summarizeAthleteDocs } from '../api/athletes';
import { qk } from '../api/queryKeys';
import { useAuthStore } from '../authStore';

describe('coachQuery — convenção de paginação', () => {
  it('aplica default e teto de limit', () => {
    expect(clampLimit()).toBe(DEFAULT_LIMIT);
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(10_000)).toBe(MAX_LIMIT);
  });
});
describe('client — segurança', () => {
  it('recusa service_role no cliente', () => {
    expect(() => createLunaClient('https://x.supabase.co', 'ey.service_role.key')).toThrow();
  });
});
describe('queryKeys — estáveis e cirúrgicas', () => {
  it('família por entidade', () => {
    expect(qk.bookings.month('2026-07')).toEqual(['bookings', { month: '2026-07' }]);
    expect(qk.athletes.detail('a1')[0]).toBe('athletes');
  });
});
describe('authStore', () => {
  it('signIn/signOut transitam o estado', () => {
    useAuthStore.getState().signIn('u1', 'coach');
    expect(useAuthStore.getState().status).toBe('signedIn');
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});

describe('summarizeAthleteDocs', () => {
  it('marca OK sem documentos ou só válidos', () => {
    expect(summarizeAthleteDocs([])).toMatchObject({ docsOk: true, docsLabel: 'OK', pending: 0 });
    expect(summarizeAthleteDocs(['valid'])).toMatchObject({ docsOk: true, pending: 0 });
  });
  it('prioriza expired e conta pendências', () => {
    expect(summarizeAthleteDocs(['expiring', 'expired'])).toMatchObject({
      docsOk: false, docsLabel: 'Expirado', docsIssueCount: 2, pending: 2,
    });
  });
});

describe('coachQuery — tipos', () => {
  it('CoachTables exclui tabelas sem coach_id (compile-time)', () => {
    // @ts-expect-error profiles não tem coach_id — a convenção é imposta pelo tipo
    const bad: import('../api/coachQuery').CoachTables = 'profiles';
    const ok: import('../api/coachQuery').CoachTables = 'bookings';
    expect(ok).toBe('bookings'); expect(bad).toBeDefined();
  });
});
describe('live — prescrição e resumo', () => {
  it('lê reps e carga da prescrição', () => {
    expect(parseTargetReps('8-10')).toBe(8);
    expect(parseTargetReps(null)).toBeNull();
    expect(parseTargetLoadKg('62,5 kg')).toBe(62.5);
    expect(parseTargetLoadKg('75% 1RM')).toBeNull();
    expect(parseTargetLoadKg('RPE 8')).toBeNull();
  });
  it('resumo conta só séries concluídas', () => {
    const s = computeSessionSummary([
      { reps: 10, loadKg: 60, rpe: 7, completed: true },
      { reps: 8, loadKg: 65, rpe: 8, completed: true },
      { reps: 3, loadKg: 70, rpe: 10, completed: false },
    ]);
    expect(s).toEqual({ sets: 2, failed: 1, volumeKg: 1120, avgRpe: 7.5 });
    expect(computeSessionSummary([]).avgRpe).toBeNull();
  });
});
