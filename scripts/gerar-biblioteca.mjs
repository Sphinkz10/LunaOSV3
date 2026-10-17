// Gera supabase/migrations/0014_biblioteca_base_v1.sql a partir de
// packages/modalidades/src/fitness/biblioteca-v1.json (tarefa 27).
// Correr depois de mudar o conteúdo: node scripts/gerar-biblioteca.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const b = JSON.parse(readFileSync(join(raiz, 'packages/modalidades/src/fitness/biblioteca-v1.json'), 'utf8'));
const q = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const arr = (a) => `array[${(a ?? []).map(q).join(',')}]::text[]`;

const linhas = [
  '-- GERADO por scripts/gerar-biblioteca.mjs a partir de packages/modalidades/src/fitness/biblioteca-v1.json. Não editar à mão.',
  `-- Biblioteca base do LunaOS · ${b.modalidade} · versão ${b.versao} · ${b.exercicios.length} exercícios`,
];
for (const l of b.licencas ?? []) {
  linhas.push(`insert into public.media_licenses (url, owner, license, source, valid_until) values (${q(l.url)}, ${q(l.dono)}, ${q(l.licenca)}, ${q(l.fonte)}, ${q(l.valida_ate)}) on conflict (url) do nothing;`);
}
linhas.push('insert into public.library_exercises (key, version, sport, name, category, muscles, pattern, equipment, level, instructions, record_fields, alternatives, video_url, image_url) values');
linhas.push(b.exercicios.map((e) => `  (${q(e.chave)}, ${b.versao}, ${q(b.modalidade)}, ${q(e.nome)}, ${q(e.categoria)}, ${arr(e.musculos)}, ${q(e.padrao)}, ${arr(e.material)}, ${q(e.nivel)}, ${q(e.instrucoes)}, ${arr(e.registar)}, ${arr(e.alternativas)}, ${q(e.video)}, ${q(e.imagem)})`).join(',\n') + '\non conflict (key, version) do nothing;');
writeFileSync(join(raiz, 'supabase/migrations/0014_biblioteca_base_v1.sql'), linhas.join('\n') + '\n');
console.log(`✅ biblioteca v${b.versao}: ${b.exercicios.length} exercícios`);
