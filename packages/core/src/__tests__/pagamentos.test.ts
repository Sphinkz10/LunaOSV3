import { lerEuros, paraCsv, pagoEm, type PagamentoRegistado } from '../api/pagamentos';

describe('pagamentos registados (P-14)', () => {
  it('lê euros como se escrevem em Portugal', () => {
    expect(lerEuros('150')).toBe(15000);
    expect(lerEuros('150,5')).toBe(15050);
    expect(lerEuros('1.250,00 €')).toBe(125000);
    expect(lerEuros('abc')).toBeNull();
  });

  it('o pago conta só os registos atuais (o corrigido substitui o original)', () => {
    const p = (valor: number, atual: boolean): PagamentoRegistado => ({ id: String(valor), tipo: 'pack', alvo: 'Pack 10', periodo: null, valorCent: valor, pagoEm: '2026-10-02', metodo: 'mbway', fatura: null, nota: null, corrige: null, motivo: null, atual, quem: null, em: '' });
    expect(pagoEm([p(15000, false), p(12000, true), p(3000, true)], (x) => x.alvo === 'Pack 10')).toBe(15000);
  });

  it('exporta CSV com aspas e ponto e vírgula', () => {
    expect(paraCsv([{ nome: 'Ana "Costa"', valor: 10 }])).toBe('nome;valor\n"Ana ""Costa""";"10"');
  });
});
