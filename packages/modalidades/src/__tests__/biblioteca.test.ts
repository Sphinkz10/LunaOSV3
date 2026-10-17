import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import biblioteca from '../fitness/biblioteca-v1.json';
import fitness from '../fitness/v1.json';

describe('biblioteca base fitness (tarefa 27)', () => {
  const chaves = biblioteca.exercicios.map((e) => e.chave);

  it('chaves únicas e em kebab-case', () => {
    expect(new Set(chaves).size).toBe(chaves.length);
    for (const k of chaves) expect(k).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('categorias, níveis e campos a registar existem na modalidade', () => {
    const metricas = new Set(fitness.metricas.map((m) => m.id));
    for (const e of biblioteca.exercicios) {
      expect(fitness.categorias_biblioteca).toContain(e.categoria);
      expect(['iniciante', 'intermedio', 'avancado']).toContain(e.nivel);
      for (const r of e.registar) expect(metricas.has(r)).toBe(true);
    }
  });

  it('alternativas apontam para exercícios que existem', () => {
    for (const e of biblioteca.exercicios) for (const a of e.alternativas) expect(chaves).toContain(a);
  });

  it('vídeos e imagens só com licença registada', () => {
    const urls = new Set((biblioteca.licencas as { url: string }[]).map((l) => l.url));
    for (const e of biblioteca.exercicios as { video?: string; imagem?: string }[]) {
      if (e.video) expect(urls.has(e.video)).toBe(true);
      if (e.imagem) expect(urls.has(e.imagem)).toBe(true);
    }
  });

  it('a migração gerada está atualizada', () => {
    const sql = readFileSync(join(__dirname, '../../../../supabase/migrations/0014_biblioteca_base_v1.sql'), 'utf8');
    for (const k of chaves) expect(sql).toContain(`'${k}'`);
  });
});
