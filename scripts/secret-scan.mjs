#!/usr/bin/env node
// LUNA.OS — procura chaves secretas do Supabase nos ficheiros do repo.
// Procura valores, não a palavra: a guarda em packages/core fala de
// service_role e não pode fazer o scan falhar (AUD-74).
//   - chaves novas sb_secret_…
//   - JWT cujo payload diz "role":"service_role"
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f && !f.endsWith('pnpm-lock.yaml') && !/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip)$/i.test(f));

const SB_SECRET = /sb_secret_[A-Za-z0-9_-]{20,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]+/g;

const hits = [];
for (const file of files) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const m of text.matchAll(SB_SECRET)) hits.push(`${file}: chave sb_secret_ (${m[0].slice(0, 14)}…)`);
  for (const m of text.matchAll(JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(m[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') hits.push(`${file}: JWT service_role`);
    } catch {
      // não é um JWT válido
    }
  }
}

if (hits.length) {
  console.error('❌ Segredos encontrados no repo:\n' + hits.join('\n'));
  process.exit(1);
}
console.log(`✅ secret-scan — ${files.length} ficheiros, 0 segredos`);
