import { describe, expect, it } from 'vitest';
import { eFeminino, g, novo } from '../index';

describe('género do termo', () => {
  it('concorda no singular e no plural', () => {
    expect(eFeminino('sessão')).toBe(true);
    expect(eFeminino('sessões')).toBe(true);
    expect(eFeminino('aulas')).toBe(true);
    expect(eFeminino('treino')).toBe(false);
    expect(eFeminino('treinos')).toBe(false);
  });
  it('escolhe a palavra certa antes do termo', () => {
    expect(g('treino', 'Próxima', 'Próximo')).toBe('Próximo treino');
    expect(g('sessões', 'as', 'os')).toBe('as sessões');
    expect(novo('treino')).toBe('Novo treino');
    expect(novo('sessão')).toBe('Nova sessão');
  });
});
