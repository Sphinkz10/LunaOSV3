import { avisoSubscricao, diasAte, fornecedorFalso, lerSubscricao } from '../api/subscricao';

describe('subscrição por lugar (G-47)', () => {
  const agora = Date.parse('2026-10-22T12:00:00Z');

  it('conta os dias que faltam e nunca dá negativo', () => {
    expect(diasAte('2026-10-25T12:00:00Z', agora)).toBe(3);
    expect(diasAte('2026-10-20T12:00:00Z', agora)).toBe(0);
    expect(diasAte(null, agora)).toBeNull();
  });

  it('avisa no fim do experimental só sem pagamento e sempre em graça e só leitura', () => {
    const base = { gracaAte: null, temMetodo: false };
    expect(avisoSubscricao({ ...base, estado: 'trial', experimentalAte: '2026-11-20T12:00:00Z' }, agora)).toBeNull();
    expect(avisoSubscricao({ ...base, estado: 'trial', experimentalAte: '2026-10-25T12:00:00Z' }, agora)?.texto).toMatch(/3 dias/);
    expect(avisoSubscricao({ ...base, estado: 'trial', experimentalAte: '2026-10-25T12:00:00Z', temMetodo: true }, agora)).toBeNull();
    expect(avisoSubscricao({ ...base, estado: 'grace', experimentalAte: null, gracaAte: '2026-10-23T12:00:00Z' }, agora)?.tom).toBe('aviso');
    expect(avisoSubscricao({ ...base, estado: 'read_only', experimentalAte: null }, agora)?.texto).toMatch(/nada|continuam/);
    expect(avisoSubscricao({ ...base, estado: 'active', experimentalAte: null }, agora)).toBeNull();
  });

  it('lê o resumo da base de dados', () => {
    const s = lerSubscricao({ plano: 'treinador', estado: 'trial', lugares: 3, ocupados: 2, metodo: null, gere: true, clientes: 12,
      pessoas: [{ membership_id: 'm1', nome: 'Ana', papeis: ['Dono'], ocupa: true, dono: true }], convites: [], modulos: [{ modulo: 'entries', so_leitura: true }] });
    expect(s.temMetodo).toBe(false);
    expect(s.pessoas[0]).toMatchObject({ membershipId: 'm1', dono: true });
    expect(s.modulos[0].soLeitura).toBe(true);
    expect(s.historico).toEqual([]);
  });

  it('o fornecedor falso nunca cobra', () => {
    expect(fornecedorFalso.cobra).toBe(false);
  });
});
