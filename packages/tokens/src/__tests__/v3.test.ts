import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error módulo .mjs do gerador, sem tipos
import { buildTokens, DEFAULT_SOURCE } from '../../scripts/build-tokens.mjs';
import { temas, type TemaId } from '../v3/tokens';
import { nativeBase } from '../v3/tokens.native';
import { contrast } from '../v3/contrast';

type Out = { css: string; ts: string; native: string };

describe('tokens v3 · gerados do JSON com Style Dictionary', () => {
  it('a CSS gerada é igual a design/css/tokens.css', async () => {
    const out: Out = await buildTokens();
    const ref = readFileSync(resolve(DEFAULT_SOURCE, '../css/tokens.css'), 'utf8').replace(/\r\n/g, '\n');
    expect(out.css).toBe(ref);
  });

  it('as saídas no repositório estão atualizadas', async () => {
    const out: Out = await buildTokens();
    const dir = resolve(__dirname, '../v3');
    // Sem diferenças de fim de linha (checkouts em Windows usam CRLF)
    const read = (f: string) => readFileSync(join(dir, f), 'utf8').replace(/
/g, '
');
    expect(read('tokens.css')).toBe(out.css);
    expect(read('tokens.ts')).toBe(out.ts);
    expect(read('tokens.native.ts')).toBe(out.native);
  });

  it('mudar um valor e regenerar muda as três saídas', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'luna-tokens-'));
    cpSync(DEFAULT_SOURCE, tmp, { recursive: true });
    const before: Out = await buildTokens({ sourceDir: tmp });

    const file = join(tmp, 'tema.ouro.tokens.json');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    json.cor.acao.$value = '#123456';
    const baseFile = join(tmp, 'base.tokens.json');
    const base = JSON.parse(readFileSync(baseFile, 'utf8'));
    base.raio.cartao.$value = '28px';
    writeFileSync(file, JSON.stringify(json));
    writeFileSync(baseFile, JSON.stringify(base));

    const after: Out = await buildTokens({ sourceDir: tmp });
    expect(after.css).toContain('--cor-acao:#123456;');
    expect(after.ts).toContain('"acao": "#123456"');
    expect(after.native).toContain('"acao": "#123456"');
    expect(after.css).toContain('--raio-cartao:28px;');
    expect(after.native).toContain('"cartao": 28');
    for (const k of ['css', 'ts', 'native'] as const) expect(after[k]).not.toBe(before[k]);
  });

  it('o tema nativo usa números e tipografia absoluta', () => {
    expect(nativeBase.espaco['16']).toBe(16);
    expect(nativeBase.tipo['titulo-ecra']).toMatchObject({ fontFamily: 'Outfit', fontSize: 28, lineHeight: 29 });
  });
});

/** Pares de docs/02-design-system.md (texto sobre fundo, ≥ 4,5:1). */
const PARES: [string, string][] = [
  ['texto', 'fundo'], ['texto', 'superficie'], ['texto-secundario', 'superficie'],
  ['sobre-principal', 'principal'], ['sobre-acao', 'acao'], ['sobre-destaque', 'destaque'],
  ['sobre-acao-no-destaque', 'acao-no-destaque'], ['sobre-cartao-suave', 'cartao-suave'],
  ['sobre-cartao-numero', 'cartao-numero'], ['sobre-navegacao', 'navegacao'], ['sobre-avatar', 'avatar'],
];

/** Rácios publicados no design system, para confirmar que o cálculo bate certo. */
const PUBLICADOS: Partial<Record<TemaId, number[]>> = {
  oceano: [10.97, 11.74, 5.64, 8.34, 5.62, 8.71, 5.62, 10.23, 10.37, 11.74, 8.23],
  ouro: [14.5, 15.97, 6.18, 15.97, 7.9, 15.97, 7.9, 15.97, 13.61, 21.0, 7.9],
  limao: [18.1, 14.91, 6.34, 13.03, 13.03, 13.03, 13.03, 12.4, 13.03, 8.93, 13.03],
};

describe('contraste WCAG 2.2 AA nos temas de cor', () => {
  for (const tema of ['oceano', 'ouro', 'limao'] as const) {
    it(`${tema}: todos os pares ≥ 4,5:1`, () => {
      const cor = temas[tema].cor as Record<string, string>;
      PARES.forEach(([fg, bg], i) => {
        const r = contrast(cor[fg], cor[bg]);
        expect(r, `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(Math.abs(r - PUBLICADOS[tema]![i]), `${fg} sobre ${bg}`).toBeLessThan(0.05);
      });
    });
  }
});
