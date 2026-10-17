import { assiduidade, recordesNovos, terminarTreino, treinosPorEnviar, type TreinoFeito } from '../api/treinoApp';

class Memoria implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const treino = (id: string): TreinoFeito => ({
  id, link_id: null, workout_id: null, nome: 'Força A', started_at: '2026-10-17T10:00:00Z', ended_at: '2026-10-17T11:00:00Z', rpe: 7, nota: '', trocas: [],
  exercicios: [{ exercise_id: 'e1', nome: 'Agachamento', series: 2, sets: [
    { n: 1, reps: 8, carga: 60, rpe: 7, feito: true, em: '' }, { n: 2, reps: 8, carga: 62.5, rpe: 8, feito: true, em: '' }] }],
});

describe('treino na app (C-10, C-11, C-16)', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = new Memoria(); });

  it('sem rede, o treino fica na fila e não se perde', async () => {
    expect(await terminarTreino(null, treino('a'))).toBe(1);
    expect(await terminarTreino(null, treino('a'))).toBe(1);   // repetir não duplica
    expect(treinosPorEnviar().map((t) => t.id)).toEqual(['a']);
  });

  it('com rede, sai da fila; se falhar, fica', async () => {
    await terminarTreino(null, treino('a'));
    const ok = { rpc: async () => ({ error: null }) } as never;
    const falha = { rpc: async () => ({ error: new Error('sem rede') }) } as never;
    expect(await terminarTreino(falha, treino('b'))).toBe(2);
    expect(await terminarTreino(ok, treino('c'))).toBe(0);
  });

  it('assiduidade das 8 semanas, mais recente no fim', () => {
    const agora = new Date('2026-10-17T12:00:00Z');
    const s = assiduidade([{ id: '1', em: '2026-10-16T10:00:00Z', nome: '', minutos: 0, series: 0, rpe: null },
      { id: '2', em: '2026-10-08T10:00:00Z', nome: '', minutos: 0, series: 0, rpe: null }], agora);
    expect(s).toEqual([0, 0, 0, 0, 0, 0, 1, 1]);
  });

  it('recorde novo só quando passa o melhor anterior', () => {
    expect(recordesNovos(treino('x'), [{ exercicio: 'Agachamento', carga: 60, reps: 8, em: '' }])).toEqual([{ exercicio: 'Agachamento', carga: 62.5 }]);
    expect(recordesNovos(treino('x'), [{ exercicio: 'Agachamento', carga: 70, reps: 5, em: '' }])).toEqual([]);
  });
});
