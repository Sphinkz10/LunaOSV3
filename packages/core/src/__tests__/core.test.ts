import { computeSessionSummary, parseTargetLoadKg, parseTargetReps } from '../api/live';
import { clampLimit, fetchAllPages, MAX_LIMIT, DEFAULT_LIMIT, PAGE_SIZE } from '../api/orgQuery';
import { createLunaClient } from '../api/client';
import { summarizeClientDocs } from '../api/clients';
import { computeDayStates } from '../api/calendar';
import { qk } from '../api/queryKeys';
import { hasModule, hasPerm, useAuthStore } from '../authStore';
import type { MyOrgRow } from '../types/database';
import { dayBoundsInZone, dayInZone, monthBoundsInZone, timeInZone, zonedToUtc } from '../time';

const org = (over: Partial<MyOrgRow> = {}): MyOrgRow => ({
  org_id: 'o1', name: 'Estúdio', type: 'studio', theme: 'oceano', timezone: 'Europe/Lisbon',
  membership_id: 'm1', roles: ['coach'], permissions: ['clients.read_own', 'clients.write'],
  subscription_status: 'trial', ...over,
});

describe('orgQuery — paginação', () => {
  it('aplica default e teto de limit', () => {
    expect(clampLimit()).toBe(DEFAULT_LIMIT);
    expect(clampLimit(10)).toBe(10);
    expect(clampLimit(10_000)).toBe(MAX_LIMIT);
  });
  it('lê todas as páginas em vez de cortar aos 1000', async () => {
    const total = PAGE_SIZE * 2 + 5;
    const rows = await fetchAllPages<number>(async (from, to) => ({
      data: Array.from({ length: Math.max(0, Math.min(to, total - 1) - from + 1) }, (_, i) => from + i), error: null,
    }));
    expect(rows).toHaveLength(total);
  });
  it('propaga erros (erro nunca vira lista vazia)', async () => {
    await expect(fetchAllPages(async () => ({ data: null, error: new Error('falhou') }))).rejects.toThrow('falhou');
  });
  it('OrgTables só aceita tabelas com org_id (compile-time)', () => {
    // @ts-expect-error persons não tem org_id: a convenção é imposta pelo tipo
    const bad: import('../api/orgQuery').OrgTables = 'persons';
    const ok: import('../api/orgQuery').OrgTables = 'bookings';
    expect(ok).toBe('bookings'); expect(bad).toBeDefined();
  });
});

describe('client — segurança', () => {
  it('recusa service_role no cliente', () => {
    expect(() => createLunaClient('https://x.supabase.co', 'ey.service_role.key')).toThrow();
  });
});

describe('queryKeys', () => {
  it('família por entidade', () => {
    expect(qk.bookings.month('2026-07')).toEqual(['bookings', { month: '2026-07' }]);
    expect(qk.clients.detail('a1')[0]).toBe('clients');
  });
});

describe('authStore — papéis vêm da organização', () => {
  it('sem organização a conta fica sem papel (AUD-71)', () => {
    useAuthStore.getState().signIn('u1', []);
    expect(useAuthStore.getState().status).toBe('noRole');
    expect(useAuthStore.getState().scope).toBeNull();
  });
  it('escolhe a última organização usada, ou a primeira', () => {
    useAuthStore.getState().signIn('u1', [org(), org({ org_id: 'o2', name: 'Outro' })], 'o2');
    expect(useAuthStore.getState().scope?.orgId).toBe('o2');
    useAuthStore.getState().signIn('u1', [org()], 'inexistente');
    expect(useAuthStore.getState().scope?.orgId).toBe('o1');
  });
  it('PT só vê os seus; dono vê a carteira toda', () => {
    useAuthStore.getState().signIn('u1', [org()]);
    expect(useAuthStore.getState().scope?.canSeeAllClients).toBe(false);
    useAuthStore.getState().signIn('u1', [org({ permissions: ['clients.read_all'] })]);
    expect(useAuthStore.getState().scope?.canSeeAllClients).toBe(true);
    expect(hasPerm(useAuthStore.getState().scope, 'clients.read_all')).toBe(true);
  });
  it('subscrição só de leitura deixa a organização só de leitura', () => {
    useAuthStore.getState().signIn('u1', [org({ subscription_status: 'read_only' })]);
    expect(useAuthStore.getState().scope?.readOnly).toBe(true);
  });
  it('sem .env o estado é claro, não um esqueleto infinito', () => {
    useAuthStore.getState().setNotConfigured();
    expect(useAuthStore.getState().status).toBe('notConfigured');
    useAuthStore.getState().signOut();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
  it('módulos desligados não aparecem', () => {
    expect(hasModule(['clients', 'today'], 'business')).toBe(false);
    expect(hasModule(['clients', 'today'], 'clients')).toBe(true);
  });
});

describe('time — fuso da unidade', () => {
  it('00:30 de Lisboa no verão é o próprio dia, não o anterior', () => {
    expect(dayInZone('2026-06-30T23:30:00Z', 'Europe/Lisbon')).toBe('2026-07-01');
    expect(timeInZone('2026-06-30T23:30:00Z', 'Europe/Lisbon')).toBe('00:30');
  });
  it('limites do dia e do mês em UTC', () => {
    expect(dayBoundsInZone('2026-07-01', 'Europe/Lisbon')).toEqual({
      start: '2026-06-30T23:00:00.000Z', end: '2026-07-01T23:00:00.000Z',
    });
    expect(monthBoundsInZone(2026, 0, 'Europe/Lisbon')).toEqual({
      start: '2026-01-01T00:00:00.000Z', end: '2026-02-01T00:00:00.000Z',
    });
  });
  it('dia da mudança de hora tem 23 horas', () => {
    const { start, end } = dayBoundsInZone('2026-03-29', 'Europe/Lisbon');
    expect((Date.parse(end) - Date.parse(start)) / 3_600_000).toBe(23);
    expect(zonedToUtc(2026, 3, 29, 12, 0, 'Europe/Lisbon').toISOString()).toBe('2026-03-29T11:00:00.000Z');
  });
});

describe('summarizeClientDocs', () => {
  it('marca OK sem documentos ou só válidos', () => {
    expect(summarizeClientDocs([])).toMatchObject({ docsOk: true, docsLabel: 'OK', pending: 0 });
    expect(summarizeClientDocs(['valid'])).toMatchObject({ docsOk: true, pending: 0 });
  });
  it('prioriza expired e conta pendências', () => {
    expect(summarizeClientDocs(['expiring', 'expired'])).toMatchObject({
      docsOk: false, docsLabel: 'Expirado', docsIssueCount: 2, pending: 2,
    });
  });
});

describe('computeDayStates — no fuso', () => {
  it('marcação às 00:30 de Lisboa cai no dia certo', () => {
    const s = computeDayStates(2026, 6, [{ starts_at: '2026-06-30T23:30:00Z', status: 'confirmed' }], [], 'Europe/Lisbon');
    expect(s.get(1)).toBe('booked');
  });
  it('marcadores têm prioridade', () => {
    const s = computeDayStates(2026, 6, [{ starts_at: '2026-07-02T10:00:00Z', status: 'confirmed' }],
      [{ date: '2026-07-02', marker: 'holiday', title: null }], 'Europe/Lisbon');
    expect(s.get(2)).toBe('holiday');
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
