import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Camada extra: nenhum componente do ui usa hex/!important (Guia §14). */
const HEX = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/;
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return /\.(tsx?|css)$/.test(f) ? [p] : [];
  });
}
describe('tokens-only (@luna/ui)', () => {
  it('0 hex e 0 !important nos componentes', () => {
    for (const f of files(join(__dirname, '..'))) {
      const src = readFileSync(f, 'utf8');
      expect(HEX.test(src), `${f} tem hex`).toBe(false);
      expect(src.includes('!important'), `${f} tem !important`).toBe(false);
    }
  });
});
