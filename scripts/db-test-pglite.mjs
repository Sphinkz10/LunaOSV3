#!/usr/bin/env node
// LunaOS · corre as migrações, as provas SQL e as seeds num PostgreSQL em
// memória (PGlite), sem Docker nem psql. Espelha scripts/db-setup.sh.
// O CI continua a usar PostgreSQL 16 a sério; isto serve para correr no PC.
// Uso: node scripts/db-test-pglite.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = join(ROOT, 'supabase');

/** Tira os comandos do psql (\set …), que o PGlite não conhece. */
const ler = (f) => readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('\\')).join('\n');

async function correr(db, nome, sql) {
  const t0 = Date.now();
  try {
    await db.exec(sql);
    console.log(`  ✓ ${nome} (${Date.now() - t0} ms)`);
  } catch (e) {
    console.error(`  ✗ ${nome}\n    ${e.message}${e.where ? `\n    onde: ${e.where}` : ''}${e.position ? `\n    posição: ${e.position}` : ''}`);
    if (e.position) {
      const pos = Number(e.position);
      console.error(`    …${sql.slice(Math.max(0, pos - 160), pos + 80).replace(/\n/g, '\n    ')}…`);
    }
    process.exitCode = 1;
    throw e;
  }
}

const db = await PGlite.create({ extensions: { btree_gist } });
const { rows } = await db.query('select version() as v');
console.log(`PGlite · ${rows[0].v.split(' on ')[0]}`);

try {
  await correr(db, 'tests/auth_shim.sql', ler(join(SUPA, 'tests/auth_shim.sql')));
  for (const f of readdirSync(join(SUPA, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) {
    await correr(db, `migrations/${f}`, ler(join(SUPA, 'migrations', f)));
  }
  await correr(db, 'tests/rls_asserts.sql', ler(join(SUPA, 'tests/rls_asserts.sql')));
  await correr(db, 'tests/conta_asserts.sql', ler(join(SUPA, 'tests/conta_asserts.sql')));
  await correr(db, 'tests/equipa_asserts.sql', ler(join(SUPA, 'tests/equipa_asserts.sql')));
  await correr(db, 'tests/dia_asserts.sql', ler(join(SUPA, 'tests/dia_asserts.sql')));
  await correr(db, 'tests/app_asserts.sql', ler(join(SUPA, 'tests/app_asserts.sql')));
  await correr(db, 'tests/clientes_asserts.sql', ler(join(SUPA, 'tests/clientes_asserts.sql')));
  await correr(db, 'tests/ficha_asserts.sql', ler(join(SUPA, 'tests/ficha_asserts.sql')));
  await correr(db, 'tests/definicoes_asserts.sql', ler(join(SUPA, 'tests/definicoes_asserts.sql')));
  await correr(db, 'tests/biblioteca_asserts.sql', ler(join(SUPA, 'tests/biblioteca_asserts.sql')));
  await correr(db, 'tests/treino_asserts.sql', ler(join(SUPA, 'tests/treino_asserts.sql')));
  await correr(db, 'tests/treino2_asserts.sql', ler(join(SUPA, 'tests/treino2_asserts.sql')));
  await correr(db, 'tests/horario_asserts.sql', ler(join(SUPA, 'tests/horario_asserts.sql')));
  await correr(db, 'tests/packs_asserts.sql', ler(join(SUPA, 'tests/packs_asserts.sql')));
  await correr(db, 'tests/pt_asserts.sql', ler(join(SUPA, 'tests/pt_asserts.sql')));
  await correr(db, 'tests/ao_vivo_asserts.sql', ler(join(SUPA, 'tests/ao_vivo_asserts.sql')));
  await correr(db, 'tests/horario2_asserts.sql', ler(join(SUPA, 'tests/horario2_asserts.sql')));
  await correr(db, 'tests/metricas_asserts.sql', ler(join(SUPA, 'tests/metricas_asserts.sql')));
  await correr(db, 'tests/avaliacao_asserts.sql', ler(join(SUPA, 'tests/avaliacao_asserts.sql')));
  await correr(db, 'tests/grupos_asserts.sql', ler(join(SUPA, 'tests/grupos_asserts.sql')));
  await correr(db, 'tests/mensagens_asserts.sql', ler(join(SUPA, 'tests/mensagens_asserts.sql')));
  await correr(db, 'tests/solo_asserts.sql', ler(join(SUPA, 'tests/solo_asserts.sql')));
  await correr(db, 'tests/pagamentos_asserts.sql', ler(join(SUPA, 'tests/pagamentos_asserts.sql')));
  await correr(db, 'seed.sql', ler(join(SUPA, 'seed.sql')));
  const c = await db.query("select (select count(*) from public.organizations)::int as orgs, (select count(*) from public.links)::int as links");
  console.log(`✅ Migrações, provas SQL e seeds OK · ${c.rows[0].orgs} organizações, ${c.rows[0].links} ligações`);
} catch {
  console.error('❌ Falhou (ver acima)');
} finally {
  await db.close();
}
