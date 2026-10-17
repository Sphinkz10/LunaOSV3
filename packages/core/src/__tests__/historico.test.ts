import { Historico } from '../api/treinoAntigas';

describe('desfazer e refazer (30 passos)', () => {
  it('desfaz, refaz e guarda no máximo 30', () => {
    const h = new Historico<number>(30);
    for (let i = 0; i < 40; i++) h.registar(i);
    let atual = 40;
    let n = 0;
    while (h.podeDesfazer) { atual = h.desfazer(atual)!; n++; }
    expect(n).toBe(30);
    expect(atual).toBe(10);
    expect(h.refazer(atual)).toBe(11);
  });
  it('mudar depois de desfazer apaga o refazer', () => {
    const h = new Historico<string>();
    h.registar('a');
    expect(h.desfazer('b')).toBe('a');
    h.registar('a');
    expect(h.podeRefazer).toBe(false);
  });
});
