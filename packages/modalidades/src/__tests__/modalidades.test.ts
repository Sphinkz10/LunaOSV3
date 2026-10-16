import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { modalidadeSchema } from '@luna/contracts';
import { fitnessV1, getModalidade, termo, unidadeDe } from '../index';

describe('modalidades', () => {
  const fitness = getModalidade('fitness');

  it('fitness cumpre o esquema', () => {
    expect(modalidadeSchema.safeParse(fitnessV1).success).toBe(true);
  });

  it('modalidade desconhecida cai na configuração genérica (J35)', () => {
    expect(getModalidade('futebol').id).toBe('fitness');
  });

  it('dá os termos no singular, plural e com maiúscula', () => {
    expect(termo(fitness, 'pessoa')).toBe('cliente');
    expect(termo(fitness, 'pessoa', { plural: true, maiuscula: true })).toBe('Clientes');
    expect(termo(fitness, 'responsavel', { plural: true })).toBe('PT');
  });

  it('ajustes da organização mudam os nomes, nunca os dados', () => {
    expect(termo(fitness, 'pessoa', { maiuscula: true }, { pessoa: 'aluno' })).toBe('Aluno');
  });

  it('unidades vêm da modalidade', () => {
    expect(unidadeDe(fitness, 'carga')).toBe('kg');
    expect(unidadeDe(fitness, 'inexistente')).toBeNull();
  });

  it('a migração 0005 tem exatamente a mesma configuração', () => {
    const sql = readFileSync(resolve(__dirname, '../../../../supabase/migrations/0005_modalidades.sql'), 'utf8');
    const json = sql.split('$json$')[1];
    expect(JSON.parse(json)).toEqual(fitnessV1);
  });
});
