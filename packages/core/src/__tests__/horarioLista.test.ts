import { contarPorDia, filtrarLista, mudancaDeHora, type MarcacaoSemana } from '../api/horario';

const m = (id: string, inicio: string, estado: MarcacaoSemana['estado'], cliente: string | null, pt = 'Tomás Reis'): MarcacaoSemana => ({
  id, inicio, fim: inicio, titulo: '', tipo: 'training', estado, clienteId: cliente ? `c-${cliente}` : null, cliente, membershipId: 'm1', pt,
  salaId: null, sala: null, serieId: null, notas: null, confirmarAte: null, motivoCancelar: null, grupoId: null, origem: 'manual', local: null, localTexto: null,
});

describe('horário: mês e lista (T24)', () => {
  it('conta por dia na hora da unidade e marca os por confirmar; canceladas não contam', () => {
    const c = contarPorDia([
      m('1', '2026-10-16T23:30:00Z', 'confirmed', 'Rita'),   // já é dia 17 em Lisboa (UTC+1)
      m('2', '2026-10-17T09:00:00Z', 'pending', 'João'),
      m('3', '2026-10-17T10:00:00Z', 'cancelled', 'Ana'),
    ], 'Europe/Lisbon');
    expect(c.get('2026-10-17')).toEqual({ n: 2, porConfirmar: true });
    expect(c.get('2026-10-16')).toBeUndefined();
  });

  it('sabe em que dia muda a hora', () => {
    expect(mudancaDeHora('Europe/Lisbon', new Date('2026-10-01T00:00:00Z'), 42)).toBe('2026-10-25');
    expect(mudancaDeHora('Europe/Lisbon', new Date('2026-11-02T00:00:00Z'), 28)).toBeNull();
  });

  it('a lista pesquisa por cliente ou PT, sem acentos, e filtra por estado', () => {
    const l = [m('1', '2026-10-17T09:00:00Z', 'pending', 'João Sá'), m('2', '2026-10-18T09:00:00Z', 'cancelled', 'Ana'), m('3', '2026-10-18T10:00:00Z', 'confirmed', 'Rita', 'Inês Pires')];
    expect(filtrarLista(l, 'joao', 'todas', null).map((x) => x.id)).toEqual(['1']);
    expect(filtrarLista(l, 'ines', 'todas', null).map((x) => x.id)).toEqual(['3']);
    expect(filtrarLista(l, '', 'cancelled', null).map((x) => x.id)).toEqual(['2']);
    expect(filtrarLista(l, '', 'todas', 'c-Rita').map((x) => x.id)).toEqual(['3']);
  });
});
