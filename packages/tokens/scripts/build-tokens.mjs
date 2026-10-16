// LunaOS · gera os tokens v3 a partir de design/tokens/*.tokens.json (W3C DTCG)
// com Style Dictionary. Três saídas, sempre do mesmo JSON:
//   src/v3/tokens.css        — igual a design/css/tokens.css (data-tema="…")
//   src/v3/tokens.ts         — objeto tipado para a web
//   src/v3/tokens.native.ts  — tema React Native (números em vez de px)
// Uso: node scripts/build-tokens.mjs [--check]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import StyleDictionary from 'style-dictionary';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SOURCE = resolve(HERE, '../../../design/tokens');
export const DEFAULT_OUT = resolve(HERE, '../src/v3');

/** Temas por ordem; o primeiro também é o :root. color-scheme vive só na CSS. */
export const TEMAS = [
  { id: 'oceano', scheme: 'light' },
  { id: 'ouro', scheme: 'light' },
  { id: 'limao', scheme: 'dark' },
  { id: 'esboco', scheme: 'light' },
];

const HEADER = '/* Gerado a partir de design/tokens (Figma: coleção "6 · Temas LunaOS"). Não editar à mão. */';
const GENERIC_FONTS = new Set(['system-ui', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'ui-sans-serif']);

const fontCss = (v) => (Array.isArray(v) ? v : [v]).map((f) => (GENERIC_FONTS.has(f) ? f : `'${f}'`)).join(',');
const px = (v) => (typeof v === 'string' && v.endsWith('px') ? Number(v.slice(0, -2)) : v);

/** Lê os tokens resolvidos (referências {…} já substituídas) com o Style Dictionary. */
async function resolveTokens(sourceDir, tema) {
  const sd = new StyleDictionary({
    source: [resolve(sourceDir, 'base.tokens.json'), resolve(sourceDir, `tema.${tema}.tokens.json`)],
    log: { verbosity: 'silent', warnings: 'disabled' },
    platforms: { luna: { transforms: ['name/kebab'] } },
  });
  const dict = await sd.getPlatformTokens('luna');
  return dict.allTokens.map((t) => ({
    name: t.name,
    path: t.path,
    type: t.$type ?? t.type,
    value: t.$value ?? t.value,
  }));
}

const isBase = (t) => !['cor', 'estado', 'dado'].includes(t.path[0]);

function setPath(obj, path, value) {
  let o = obj;
  for (const k of path.slice(0, -1)) o = o[k] ??= {};
  o[path.at(-1)] = value;
}

export async function buildTokens({ sourceDir = DEFAULT_SOURCE } = {}) {
  const porTema = {};
  for (const t of TEMAS) porTema[t.id] = await resolveTokens(sourceDir, t.id);
  const base = porTema[TEMAS[0].id].filter(isBase);

  // ── CSS ──
  const baseCss = base
    .filter((t) => t.type === 'dimension' || t.type === 'fontFamily')
    .map((t) => `  --${t.name}:${t.type === 'fontFamily' ? fontCss(t.value) : t.value};`);
  const temasCss = TEMAS.map((t, i) => {
    const sel = i === 0 ? `:root,[data-tema="${t.id}"]` : `[data-tema="${t.id}"]`;
    const vars = porTema[t.id].filter((x) => !isBase(x)).map((x) => `  --${x.name}:${x.value};`);
    return `${sel}{\n  color-scheme:${t.scheme};\n${vars.join('\n')}\n}`;
  });
  const css = `${HEADER}\n:root{\n${baseCss.join('\n')}\n}\n${temasCss.join('\n')}\n`;

  // ── TypeScript (web) ──
  const baseObj = {};
  for (const t of base) setPath(baseObj, t.path, t.type === 'fontFamily' ? fontCss(t.value) : t.value);
  const temasObj = {};
  for (const t of TEMAS) {
    const o = { colorScheme: t.scheme };
    for (const x of porTema[t.id].filter((y) => !isBase(y))) setPath(o, x.path, x.value);
    temasObj[t.id] = o;
  }
  const ts = `// Gerado por packages/tokens/scripts/build-tokens.mjs a partir de design/tokens. Não editar à mão.
export const base = ${JSON.stringify(baseObj, null, 2)} as const;

export const temas = ${JSON.stringify(temasObj, null, 2)} as const;

export type TemaId = keyof typeof temas;
export type Tema = (typeof temas)[TemaId];
export const TEMA_IDS = ${JSON.stringify(TEMAS.map((t) => t.id))} as const;
`;

  // ── React Native ──
  const nativeBase = {};
  for (const t of base) {
    if (t.type === 'typography') {
      const v = t.value;
      const ff = Array.isArray(v.fontFamily) ? v.fontFamily[0] : String(v.fontFamily).split(',')[0].replace(/'/g, '');
      const fs = px(v.fontSize);
      setPath(nativeBase, t.path, {
        fontFamily: ff, fontWeight: String(v.fontWeight), fontSize: fs,
        lineHeight: Math.round(fs * Number(v.lineHeight)),
        letterSpacing: typeof v.letterSpacing === 'string' && v.letterSpacing.endsWith('em')
          ? Math.round(fs * Number(v.letterSpacing.slice(0, -2)) * 100) / 100 : px(v.letterSpacing),
      });
    } else if (t.type === 'fontFamily') {
      setPath(nativeBase, t.path, Array.isArray(t.value) ? t.value[0] : t.value);
    } else {
      setPath(nativeBase, t.path, px(t.value));
    }
  }
  const native = `// Gerado por packages/tokens/scripts/build-tokens.mjs a partir de design/tokens. Não editar à mão.
// Tema React Native: dimensões em números (dp), tipografia já em valores absolutos.
export const nativeBase = ${JSON.stringify(nativeBase, null, 2)} as const;

export const nativeTemas = ${JSON.stringify(temasObj, null, 2)} as const;
`;

  return { css, ts, native };
}

const FILES = { css: 'tokens.css', ts: 'tokens.ts', native: 'tokens.native.ts' };

async function main() {
  const check = process.argv.includes('--check');
  const out = await buildTokens();
  if (!existsSync(DEFAULT_OUT)) mkdirSync(DEFAULT_OUT, { recursive: true });
  let stale = [];
  for (const [k, file] of Object.entries(FILES)) {
    const p = resolve(DEFAULT_OUT, file);
    const cur = existsSync(p) ? readFileSync(p, 'utf8') : null;
    if (cur !== out[k]) {
      if (check) stale.push(file);
      else writeFileSync(p, out[k]);
    }
  }
  if (check && stale.length) {
    console.error(`❌ tokens desatualizados: ${stale.join(', ')} — corre pnpm --filter @luna/tokens build`);
    process.exit(1);
  }
  console.log(check ? '✅ tokens v3 atualizados' : `✅ tokens v3 gerados em ${DEFAULT_OUT}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
