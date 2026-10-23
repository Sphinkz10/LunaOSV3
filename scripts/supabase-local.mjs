#!/usr/bin/env node
// LunaOS · Supabase local a fingir, para ver a app com dados no PC sem Docker.
// Corre as migrações e as seeds num PGlite em memória e responde ao que a app
// usa do Supabase: login com palavra-passe (Auth), tabelas e funções (REST).
// Sem Storage nem Realtime. Só para desenvolvimento: ouve só em 127.0.0.1.
// Uso: node scripts/supabase-local.mjs   e depois   pnpm --dir apps/coach dev:local
// Contas: as da seed (palavra-passe luna-dev-123) e as que se criarem no registo.
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, types } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUPA = join(ROOT, 'supabase');
const PORT = Number(process.env.PORT ?? 54321);
const SEGREDO = 'luna-local-so-para-desenvolvimento';
const PASSE_SEED = 'luna-dev-123';
const ler = (f) => readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => !l.startsWith('\\')).join('\n');

// Datas como o PostgREST as devolve (ISO 8601) e números como números
const iso = (v) => v.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00');
const db = await PGlite.create({
  extensions: { btree_gist },
  parsers: {
    [types.TIMESTAMPTZ]: iso, [types.TIMESTAMP]: (v) => v.replace(' ', 'T'), [types.DATE]: (v) => v, [types.TIME]: (v) => v,
    [types.INT8]: (v) => Number(v), [types.NUMERIC]: (v) => Number(v),
  },
});
console.log('A preparar a base de dados (migrações e seeds)…');
await db.exec(ler(join(SUPA, 'tests/auth_shim.sql')));
await db.exec(`alter table auth.users add column if not exists senha text;`);
for (const f of readdirSync(join(SUPA, 'migrations')).filter((x) => x.endsWith('.sql')).sort()) await db.exec(ler(join(SUPA, 'migrations', f)));
await db.exec(ler(join(SUPA, 'seed.sql')));
const demo = join(SUPA, 'seed-demo.sql');
if (existsSync(demo)) await db.exec(ler(demo));
await db.exec(`update auth.users set senha = '${PASSE_SEED}' where senha is null;`);
console.log('Base de dados pronta.');

// ── JWT (HS256) ────────────────────────────────────────────────────────────
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function assinar(payload) {
  const corpo = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}`;
  return `${corpo}.${createHmac('sha256', SEGREDO).update(corpo).digest('base64url')}`;
}
function verificar(token) {
  const [h, p, s] = (token ?? '').split('.');
  if (!s || createHmac('sha256', SEGREDO).update(`${h}.${p}`).digest('base64url') !== s) return null;
  const c = JSON.parse(Buffer.from(p, 'base64url').toString());
  return c.exp && c.exp * 1000 < Date.now() ? null : c;
}
const fatores = new Map(); // user id → [{ id, factor_type, status, friendly_name }]; dois fatores a fingir: qualquer código de 6 dígitos serve
function sessao(u, aal = 'aal1') {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const agora = Math.floor(Date.now() / 1000);
  const amr = [{ method: 'password', timestamp: agora }, ...(aal === 'aal2' ? [{ method: 'totp', timestamp: agora }] : [])];
  const access_token = assinar({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp, aal, amr, session_id: randomUUID() });
  // O refresh também é assinado: as sessões sobrevivem a reiniciar o servidor local
  const refresh_token = assinar({ sub: u.id, aal, typ: 'refresh', exp: agora + 30 * 86400, n: randomUUID() });
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token, user: utilizador(u) };
}
const utilizador = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.created_at,
  user_metadata: u.raw_user_meta_data ?? {}, app_metadata: { provider: 'email', providers: ['email'] },
  identities: [], factors: (fatores.get(u.id) ?? []).map((f) => ({ ...f, created_at: u.created_at, updated_at: u.created_at })), created_at: u.created_at, updated_at: u.created_at,
});
const buscarUser = async (where, v) => (await db.query(`select id, email, raw_user_meta_data, created_at, senha from auth.users where ${where} = $1`, [v])).rows[0];

// ── PostgREST (o que a app usa) ────────────────────────────────────────────
const id = (n) => `"${String(n).replace(/"/g, '""')}"`;
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };
const listaIn = (v) => v.replace(/^\(|\)$/g, '').split(',').map((x) => x.replace(/^"|"$/g, ''));

function condicao(col, expr, params) {
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const ponto = expr.indexOf('.');
  const op = expr.slice(0, ponto); const val = expr.slice(ponto + 1);
  let sql;
  if (op === 'is') sql = `${id(col)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
  else if (op === 'in') { params.push(listaIn(val)); sql = `${id(col)}::text = any($${params.length}::text[])`; }
  else if (op === 'cs') { params.push(val.startsWith('{') ? val : val); sql = `${id(col)} @> $${params.length}`; }
  else if (OPS[op]) { params.push(op.endsWith('like') ? val.replace(/\*/g, '%') : val === 'true' ? true : val === 'false' ? false : val); sql = `${id(col)} ${OPS[op]} $${params.length}`; }
  else throw Object.assign(new Error(`operador ${op} não suportado`), { status: 400 });
  return neg ? `not (${sql})` : sql;
}
function ouCondicao(expr, params) {
  // or=(a.eq.1,b.is.null)
  const partes = expr.replace(/^\(|\)$/g, '').split(/,(?![^(]*\))/);
  return `(${partes.map((p) => { const i = p.indexOf('.'); return condicao(p.slice(0, i), p.slice(i + 1), params); }).join(' or ')})`;
}
function filtros(q, params) {
  const w = [];
  for (const [k, v] of q) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k)) continue;
    w.push(k === 'or' ? ouCondicao(v, params) : condicao(k, v, params));
  }
  return w.length ? ` where ${w.join(' and ')}` : '';
}
function colunas(sel) {
  if (!sel || sel === '*') return '*';
  return sel.split(',').map((c) => c.trim()).filter(Boolean).map((c) => {
    const [a, b] = c.split(':');
    return b ? `${id(b.replace(/::.*/, ''))} as ${id(a)}` : id(c.replace(/::.*/, ''));
  }).join(', ');
}
function ordem(o) {
  if (!o) return '';
  return ` order by ${o.split(',').map((p) => {
    const [c, ...m] = p.split('.');
    return `${id(c)}${m.includes('desc') ? ' desc' : ' asc'}${m.includes('nullsfirst') ? ' nulls first' : m.includes('nullslast') ? ' nulls last' : ''}`;
  }).join(', ')}`;
}

const tiposFn = new Map();
async function assinatura(nome, chaves) {
  const k = `${nome}(${[...chaves].sort()})`;
  if (tiposFn.has(k)) return tiposFn.get(k);
  const { rows } = await db.query(`
    select p.proargnames as nomes, p.proargmodes as modos, p.proretset as conjunto, t.typtype as tipo, t.typname as ret,
           (select array_agg(format_type(x, null)) from unnest(p.proargtypes) x) as tipos
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.proname = $1`, [nome]);
  const ent = rows.map((r) => {
    const nomes = (r.nomes ?? []).filter((_, i) => !r.modos || ['i', 'b', 'v'].includes(r.modos[i]));
    return { ...r, nomes, tiposArg: Object.fromEntries(nomes.map((n, i) => [n, r.tipos?.[i]])) };
  }).find((r) => [...chaves].every((c) => r.nomes.includes(c)));
  if (!ent) throw Object.assign(new Error(`Could not find the function public.${nome}`), { status: 404, code: 'PGRST202' });
  tiposFn.set(k, ent);
  return ent;
}

async function comoUtilizador(claims, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${claims ? 'authenticated' : 'anon'}`);
    await tx.query(`select set_config('app.uid', $1, true), set_config('request.jwt.claims', $2, true)`, [claims?.sub ?? '', JSON.stringify(claims ?? {})]);
    return fn(tx);
  });
}

function erroPg(e) {
  const code = e.code ?? 'PGRST000';
  const status = e.status ?? (code === '42501' ? 403 : code === 'P0001' || /^2[23]/.test(code) ? 400 : 400);
  return { status, corpo: { code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null } };
}

async function rest(req, url, corpo, claims) {
  const partes = url.pathname.replace(/^\/rest\/v1\//, '').split('/');
  const q = [...url.searchParams.entries()];
  const prefer = req.headers.prefer ?? '';
  const objeto = (req.headers.accept ?? '').includes('vnd.pgrst.object');
  if (partes[0] === 'rpc') {
    const args = corpo && typeof corpo === 'object' ? corpo : Object.fromEntries(q);
    const f = await assinatura(partes[1], Object.keys(args));
    const params = []; const lista = Object.entries(args).map(([k, v]) => {
      const t = f.tiposArg[k] ?? 'text';
      params.push(v == null ? null : /json/.test(t) ? JSON.stringify(v) : Array.isArray(v) ? v : typeof v === 'object' ? JSON.stringify(v) : v);
      return `${id(k)} => $${params.length}::${t}`;
    });
    const chamada = `public.${id(partes[1])}(${lista.join(', ')})`;
    return comoUtilizador(claims, async (tx) => {
      if (f.conjunto || f.tipo === 'c') {
        const r = await tx.query(`select * from ${chamada}${filtros(q.filter(([k]) => !(k in args)), params)}${ordem(url.searchParams.get('order'))}`, params);
        return { status: 200, corpo: objeto ? r.rows[0] ?? null : r.rows };
      }
      const r = await tx.query(`select ${chamada} as v`, params);
      return { status: 200, corpo: f.ret === 'void' ? null : r.rows[0].v };
    });
  }
  const tabela = `public.${id(partes[0])}`;
  const params = [];
  const ret = prefer.includes('return=representation') ? ` returning ${colunas(url.searchParams.get('select'))}` : '';
  return comoUtilizador(claims, async (tx) => {
    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = filtros(q, params);
      let limite = url.searchParams.get('limit'); let desde = url.searchParams.get('offset') ?? '0';
      const range = req.headers.range?.match(/(\d+)-(\d+)/);
      if (range) { desde = range[1]; limite = String(Number(range[2]) - Number(range[1]) + 1); }
      const r = await tx.query(`select ${colunas(url.searchParams.get('select'))} from ${tabela}${where}${ordem(url.searchParams.get('order'))}${limite ? ` limit ${Number(limite)}` : ''} offset ${Number(desde)}`, params);
      const cab = {};
      if (prefer.includes('count=')) {
        const c = await tx.query(`select count(*)::int as n from ${tabela}${where}`, params);
        cab['Content-Range'] = `${desde}-${Number(desde) + Math.max(r.rows.length - 1, 0)}/${c.rows[0].n}`;
      }
      if (objeto && r.rows.length !== 1) return { status: 406, corpo: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${r.rows.length} rows`, hint: null } };
      return { status: 200, corpo: req.method === 'HEAD' ? null : objeto ? r.rows[0] : r.rows, cab };
    }
    if (req.method === 'POST') {
      const linhas = Array.isArray(corpo) ? corpo : [corpo];
      const cols = [...new Set(linhas.flatMap((l) => Object.keys(l)))];
      const vals = linhas.map((l) => `(${cols.map((c) => { if (!(c in l)) return 'default'; const v = l[c]; params.push(v != null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v); return `$${params.length}`; }).join(', ')})`);
      let conflito = '';
      const oc = url.searchParams.get('on_conflict');
      if (prefer.includes('resolution=merge-duplicates')) conflito = ` on conflict (${(oc ?? 'id').split(',').map(id).join(', ')}) do update set ${cols.map((c) => `${id(c)} = excluded.${id(c)}`).join(', ')}`;
      else if (prefer.includes('resolution=ignore-duplicates')) conflito = ' on conflict do nothing';
      const r = await tx.query(`insert into ${tabela} (${cols.map(id).join(', ')}) values ${vals.join(', ')}${conflito}${ret}`, params);
      return { status: 201, corpo: ret ? (objeto ? r.rows[0] : r.rows) : null };
    }
    if (req.method === 'PATCH') {
      const sets = Object.entries(corpo).map(([c, v]) => { params.push(v != null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v); return `${id(c)} = $${params.length}`; });
      const r = await tx.query(`update ${tabela} set ${sets.join(', ')}${filtros(q, params)}${ret}`, params);
      return { status: ret ? 200 : 204, corpo: ret ? (objeto ? r.rows[0] : r.rows) : null };
    }
    if (req.method === 'DELETE') {
      const r = await tx.query(`delete from ${tabela}${filtros(q, params)}${ret}`, params);
      return { status: ret ? 200 : 204, corpo: ret ? r.rows : null };
    }
    return { status: 405, corpo: { message: 'método não suportado' } };
  });
}

async function auth(req, url, corpo, claims) {
  const rota = url.pathname.replace(/^\/auth\/v1\//, '');
  const tipo = url.searchParams.get('grant_type');
  if (rota === 'token' && tipo === 'password') {
    const u = await buscarUser('lower(email)', String(corpo.email ?? '').toLowerCase());
    if (!u || u.senha !== corpo.password) return { status: 400, corpo: { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 'invalid_credentials', msg: 'Invalid login credentials' } };
    return { status: 200, corpo: sessao(u) };
  }
  if (rota === 'token' && tipo === 'refresh_token') {
    const c = verificar(corpo.refresh_token);
    const r = c?.typ === 'refresh' ? { uid: c.sub, aal: c.aal } : null;
    const u = r && await buscarUser('id', r.uid);
    if (!u) return { status: 400, corpo: { error: 'invalid_grant', code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' } };
    return { status: 200, corpo: sessao(u, r.aal) };
  }
  if (rota === 'signup') {
    if (await buscarUser('lower(email)', String(corpo.email ?? '').toLowerCase())) return { status: 422, corpo: { code: 'user_already_exists', msg: 'User already registered' } };
    const uid = randomUUID();
    await db.query('insert into auth.users (id, email, raw_user_meta_data, senha) values ($1, $2, $3, $4)', [uid, corpo.email, JSON.stringify(corpo.data ?? {}), corpo.password]);
    return { status: 200, corpo: sessao(await buscarUser('id', uid)) };
  }
  if (rota === 'user') {
    if (!claims) return { status: 401, corpo: { code: 'no_authorization', msg: 'sem sessão' } };
    if (req.method === 'PUT' && corpo?.password) await db.query('update auth.users set senha = $1 where id = $2', [corpo.password, claims.sub]);
    return { status: 200, corpo: utilizador(await buscarUser('id', claims.sub)) };
  }
  if (rota === 'logout') return { status: 204, corpo: null };
  if (rota.startsWith('factors')) {
    if (!claims) return { status: 401, corpo: { msg: 'sem sessão' } };
    const meus = fatores.get(claims.sub) ?? [];
    const [, fid, acao] = rota.split('/');
    if (!fid && req.method === 'POST') {
      const f = { id: randomUUID(), factor_type: 'totp', status: 'unverified', friendly_name: corpo?.friendly_name ?? 'LunaOS' };
      fatores.set(claims.sub, [...meus.filter((x) => x.status === 'verified'), f]);
      const svg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#fff"/><text x="80" y="85" font-size="12" text-anchor="middle">QR local</text></svg>');
      return { status: 200, corpo: { id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: { qr_code: `data:image/svg+xml;utf-8,${svg}`, secret: 'LOCALLUNAOS', uri: 'otpauth://totp/LunaOS:local?secret=LOCALLUNAOS' } } };
    }
    if (fid && acao === 'challenge') return { status: 200, corpo: { id: randomUUID(), type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 } };
    if (fid && acao === 'verify') {
      if (!/^\d{6}$/.test(String(corpo?.code ?? ''))) return { status: 422, corpo: { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' } };
      fatores.set(claims.sub, meus.map((f) => (f.id === fid ? { ...f, status: 'verified' } : f)));
      return { status: 200, corpo: sessao(await buscarUser('id', claims.sub), 'aal2') };
    }
    if (fid && req.method === 'DELETE') { fatores.set(claims.sub, meus.filter((f) => f.id !== fid)); return { status: 200, corpo: { id: fid } }; }
    return { status: 200, corpo: meus };
  }
  if (rota === 'recover' || rota === 'otp' || rota === 'resend') return { status: 200, corpo: {} };
  if (rota === 'settings') return { status: 200, corpo: { external: { email: true }, mailer_autoconfirm: true } };
  return { status: 404, corpo: { msg: `auth/${rota} não existe no servidor local` } };
}

createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin ?? '*', 'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
    'Access-Control-Expose-Headers': 'Content-Range, Range',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let texto = '';
  for await (const pedaco of req) texto += pedaco;
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { /* formulário */ }
  const claims = verificar((req.headers.authorization ?? '').replace(/^Bearer /i, ''));
  let r;
  try {
    if (url.pathname.startsWith('/rest/v1/')) r = await rest(req, url, corpo, claims?.role === 'authenticated' ? claims : null);
    else if (url.pathname.startsWith('/auth/v1/')) r = await auth(req, url, corpo, claims);
    else r = { status: 404, corpo: { message: 'Só há Auth e REST no servidor local (sem Storage, Realtime nem Functions).' } };
  } catch (e) {
    r = erroPg(e);
    if (process.env.DEBUG) console.error(req.method, url.pathname, e.message);
  }
  if (process.env.DEBUG) console.log(r.status, req.method, url.pathname + url.search);
  res.writeHead(r.status, { ...cors, ...(r.cab ?? {}), 'Content-Type': 'application/json' });
  res.end(r.corpo === null || r.status === 204 ? (r.status === 204 ? '' : 'null') : JSON.stringify(r.corpo));
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Supabase local em http://127.0.0.1:${PORT}`);
  console.log(`Contas da seed: rui@luna.dev, marta@luna.dev … (palavra-passe ${PASSE_SEED})`);
});
