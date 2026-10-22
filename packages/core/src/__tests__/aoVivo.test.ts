import {
  alternativasPara, antesDeFechar, comecarSessao, estadoDaSessao, contarPorEnviar, enviarSessao, mudar, payloadSync, porEnviar, segundosDecorridos, sessaoLocal,
  type Preparacao, type SessaoLocal,
} from '../api/aoVivo';
import type { LunaClient } from '../api/client';

class Memoria implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const prep: Preparacao = {
  booking_id: 'b1', group_id: 'b1', inicio: '2026-10-22T18:00:00Z', fim: '2026-10-22T19:00:00Z', titulo: null, local: null, submetida_em: null,
  participantes: [
    { booking_id: 'b1', link_id: 'rita', nome: 'Rita', avatar: null, estado_marcacao: 'confirmed', presenca: null, entrada_sem_reserva: false,
      aptidao: 'ok', zonas: [], pack: { nome: 'Pack 10', restam: 7, total: 10 }, sessoes_semana: 2, sessao_id: null,
      treino: { workout_id: 'w1', nome: 'Força', versao: 2, trocas: [], blocos: [{ rotulo: 'A', modo: null, voltas: null, minutos: null, exercicios: [
        { exercise_id: 'e1', nome: 'Kettlebell swing', series: 3, reps: '10', carga: '16 kg', rpe: 7, descanso: 60, notas: null, alternativas: [{ exercise_id: 'e2', nome: 'Goblet squat', semelhanca: 'igual', articulacoes: ['anca'] }, { exercise_id: 'e3', nome: 'Saltos para a caixa', semelhanca: null, articulacoes: ['joelho'] }] }] }] } },
    { booking_id: 'b2', link_id: 'joana', nome: 'Joana', avatar: null, estado_marcacao: 'confirmed', presenca: null, entrada_sem_reserva: false,
      aptidao: 'nao_pode', zonas: [], pack: null, sessoes_semana: 0, sessao_id: null, treino: null },
  ],
};

/** Um servidor de mentira com o mesmo contrato do sync_live: upsert pelos ids. */
function servidor() {
  const sets = new Map<string, unknown>();
  let rede = true;
  const client = {
    rpc: async (_f: string, args: { _p: ReturnType<typeof payloadSync> }) => {
      if (!rede) return { data: null, error: { message: 'Failed to fetch' } };
      for (const p of args._p.participantes as { exercicios: { sets: { id: string }[] }[] }[]) {
        for (const e of p.exercicios) for (const s of e.sets) sets.set(s.id, s);
      }
      return { data: { submetida: false }, error: null };
    },
  } as unknown as LunaClient;
  return { client, sets, semRede: () => { rede = false; }, comRede: () => { rede = true; } };
}

describe('sessão ao vivo (T08)', () => {
  beforeEach(() => { (globalThis as { localStorage?: Storage }).localStorage = new Memoria(); });

  it('começa com o treino do dia e quem não pode treinar fica de fora', () => {
    const s = comecarSessao(prep, new Date('2026-10-22T18:02:00Z'));
    expect(s.participantes[0].exercicios.map((e) => e.nome)).toEqual(['Kettlebell swing']);
    expect(s.participantes[1].presenca).toBe('nao_treina');
    expect(s.participantes[1].exercicios).toEqual([]);
  });

  it('o relógio não conta as pausas', () => {
    let s = comecarSessao(prep, new Date('2026-10-22T18:00:00Z'));
    s = mudar.pausar(new Date('2026-10-22T18:10:00Z'))(s);
    expect(segundosDecorridos(s, new Date('2026-10-22T18:30:00Z'))).toBe(600);
    s = mudar.retomar(new Date('2026-10-22T18:15:00Z'))(s);
    expect(segundosDecorridos(s, new Date('2026-10-22T18:20:00Z'))).toBe(900);
  });

  it('corrigir uma série mantém o id (o servidor atualiza, não duplica)', () => {
    let s = comecarSessao(prep);
    const ex = s.participantes[0].exercicios[0].id;
    s = mudar.serie('rita', ex, { reps: 10, carga: 16, rpe: 6 })(s);
    const id = s.participantes[0].exercicios[0].sets[0].id;
    s = mudar.serie('rita', ex, { reps: 12, carga: 16, rpe: 6 }, 1)(s);
    expect(s.participantes[0].exercicios[0].sets).toHaveLength(1);
    expect(s.participantes[0].exercicios[0].sets[0]).toMatchObject({ id, reps: 12 });
    expect(s.participantes[0].presenca).toBe('presente');
  });

  it('sem rede a meio, fechar e reabrir, voltar a ter rede: nenhuma série perdida nem duplicada', async () => {
    const srv = servidor();
    let s = comecarSessao(prep);
    const ex = s.participantes[0].exercicios[0].id;
    s = mudar.serie('rita', ex, { reps: 10, carga: 16, rpe: 6 })(s); sessaoLocal.guardar(s);
    s = await enviarSessao(srv.client, s);
    expect(porEnviar(s)).toBe(false);
    srv.semRede();
    s = mudar.serie('rita', ex, { reps: 10, carga: 16, rpe: 7 })(s); sessaoLocal.guardar(s);
    s = await enviarSessao(srv.client, s);
    s = mudar.serie('rita', ex, { reps: 10, carga: 20, rpe: 8 })(s); sessaoLocal.guardar(s);
    expect(contarPorEnviar()).toBe(1);
    // A app fecha: só sobra o que está no aparelho
    const reaberta = sessaoLocal.ler('b1') as SessaoLocal;
    expect(reaberta.participantes[0].exercicios[0].sets).toHaveLength(3);
    srv.comRede();
    const final = await enviarSessao(srv.client, reaberta);
    await enviarSessao(srv.client, { ...final, versao: final.versao + 1 });   // reenvio repetido
    expect(srv.sets.size).toBe(3);
    expect(contarPorEnviar()).toBe(0);
  });

  it('antes de fechar avisa quem falta marcar e quantos créditos descontam', () => {
    const grupo = { ...prep, participantes: [prep.participantes[0], { ...prep.participantes[0], booking_id: 'b3', link_id: 'ana', nome: 'Ana' }] };
    let s = comecarSessao(grupo);
    s = mudar.presenca('rita', 'presente')(s);
    const r = antesDeFechar(s);
    expect(r.semPresenca).toEqual(['Ana']);
    expect(r.semResultados).toEqual(['Rita']);
    expect(r.creditos).toBe(1);
  });

  it('quem falta não abre sessão no servidor', () => {
    let s = comecarSessao(prep);
    s = mudar.presenca('rita', 'faltou')(s);
    const p = payloadSync(s).participantes as { sessao_id: string | null }[];
    expect(p[0].sessao_id).toBeNull();
    expect(p[1].sessao_id).toBeNull();
  });

  it('trocar mostra as alternativas bloqueadas com motivo e troca só hoje', () => {
    let s = comecarSessao(prep);
    const e = s.participantes[0].exercicios[0];
    const alts = alternativasPara(e, ['joelho']);
    expect(alts.map((x) => [x.alt.nome, x.bloqueada])).toEqual([['Goblet squat', null], ['Saltos para a caixa', 'Não pode · joelho']]);
    s = mudar.trocar('rita', e.id, { exerciseId: 'e2', nome: 'Goblet squat' })(s);
    expect(s.participantes[0].exercicios[0]).toMatchObject({ id: e.id, nome: 'Goblet squat', trocadoDe: 'Kettlebell swing' });
    s = mudar.serie('rita', e.id, { reps: 10, carga: 16, rpe: 6 })(s);
    s = mudar.trocar('rita', e.id, { exerciseId: 'e1', nome: 'Kettlebell swing' })(s);
    expect(s.participantes[0].exercicios).toHaveLength(2);
    expect(estadoDaSessao(s.participantes[0])).toEqual({ feitos: 0, total: 2, series: 1 });
  });
});
