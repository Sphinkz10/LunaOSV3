import { apagarRascunho, diferencas, erroDeRede, gravarSemRepetir, guardarRascunho, lerRascunho, useGravacoesIncertas } from '../estados';

class Memoria implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

describe('rascunhos (X-02)', () => {
  beforeAll(() => { (globalThis as { localStorage?: Storage }).localStorage = new Memoria(); });

  it('guarda e lê dentro de 7 dias; depois apaga', () => {
    guardarRascunho('ficha:1', { nome: 'Rita' }, 0);
    expect(lerRascunho('ficha:1', 6 * 86_400_000)).toEqual({ nome: 'Rita' });
    expect(lerRascunho('ficha:1', 8 * 86_400_000)).toBeNull();
    expect(lerRascunho('ficha:1', 0)).toBeNull();
  });

  it('apagar tira o rascunho', () => {
    guardarRascunho('x', 1);
    apagarRascunho('x');
    expect(lerRascunho('x')).toBeNull();
  });
});

describe('alterado por outra pessoa', () => {
  const original = { lotacao: 16, sala: 'Sala 1', nome: 'Pilates' };

  it('só mostra campos que os dois mudaram para valores diferentes', () => {
    const meu = { lotacao: 18, sala: 'Sala 3', nome: 'Pilates' };
    const servidor = { lotacao: 20, sala: 'Sala 2', nome: 'Pilates Base' };
    expect(diferencas(original, meu, servidor, { lotacao: 'Lotação' })).toEqual([
      { campo: 'lotacao', rotulo: 'Lotação', deles: 20, meu: 18 },
      { campo: 'sala', rotulo: 'sala', deles: 'Sala 2', meu: 'Sala 3' },
    ]);
  });

  it('sem colisão quando cada um mudou um campo diferente', () => {
    expect(diferencas(original, { lotacao: 18 }, { ...original, sala: 'Sala 2' })).toEqual([]);
  });

  it('sem colisão quando os dois escolheram o mesmo valor', () => {
    expect(diferencas(original, { lotacao: 20 }, { ...original, lotacao: 20 })).toEqual([]);
  });
});

describe('gravação por confirmar', () => {
  it('reconhece falhas de rede', () => {
    expect(erroDeRede(new TypeError('Failed to fetch'))).toBe(true);
    expect(erroDeRede(new Error('permission denied'))).toBe(false);
  });

  it('não repete às cegas: verifica no servidor antes de gravar outra vez', async () => {
    let gravacoes = 0;
    let chegou = false;
    const gravar = async () => { gravacoes++; if (gravacoes === 1) { chegou = true; throw new TypeError('Failed to fetch'); } };
    expect(await gravarSemRepetir('aula', gravar, async () => chegou)).toBe('por-confirmar');
    const [item] = useGravacoesIncertas.getState().itens;
    await item.retomar();
    expect(gravacoes).toBe(1);
  });

  it('grava outra vez se o servidor não recebeu', async () => {
    useGravacoesIncertas.setState({ itens: [] });
    let gravacoes = 0;
    const gravar = async () => { gravacoes++; if (gravacoes === 1) throw new TypeError('Failed to fetch'); };
    await gravarSemRepetir('aula', gravar, async () => false);
    await useGravacoesIncertas.getState().itens[0].retomar();
    expect(gravacoes).toBe(2);
  });

  it('erros do servidor sobem sem ficar por confirmar', async () => {
    useGravacoesIncertas.setState({ itens: [] });
    await expect(gravarSemRepetir('aula', async () => { throw new Error('sem permissão'); }, async () => false)).rejects.toThrow('sem permissão');
    expect(useGravacoesIncertas.getState().itens).toHaveLength(0);
  });
});
