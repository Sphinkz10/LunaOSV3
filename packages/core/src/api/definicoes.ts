import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Json, RoomRow, UnitRow } from '../types/database';

/**
 * Definições (tarefa 10): equipa e acessos (G-44), segurança e auditoria
 * (G-45), ginásio e preferências (G-46) e importar clientes (G-05).
 */

/* ── G-44: papéis, título profissional, diretor técnico ────────────────── */
export interface PapelCatalogo { id: string; key: string; nome: string; permissoes: string[] }

export async function fetchPapeis(client: LunaClient): Promise<PapelCatalogo[]> {
  const { data, error } = await client.from('roles').select('id,key,name,permissions').order('name');
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, key: r.key, nome: r.name, permissoes: r.permissions }));
}

/** O que cada papel pode ver e mudar, em palavras (matriz do G-44). */
export const AREAS_PERMISSAO: { area: string; ver: string[]; mudar: string[] }[] = [
  { area: 'Os seus clientes', ver: ['clients.read_own', 'clients.read_all'], mudar: ['clients.write'] },
  { area: 'Todos os clientes', ver: ['clients.read_all'], mudar: ['clients.read_all'] },
  { area: 'Saúde dos clientes', ver: ['health.read'], mudar: ['health.read'] },
  { area: 'Horário', ver: ['schedule.read_all', 'schedule.write'], mudar: ['schedule.write'] },
  { area: 'Treino', ver: ['training.write'], mudar: ['training.write'] },
  { area: 'Equipa', ver: ['team.manage'], mudar: ['team.manage'] },
  { area: 'Ginásio e faturação', ver: ['org.manage'], mudar: ['org.manage'] },
];

export async function mudarPapeis(client: LunaClient, scope: OrgScope, membershipId: string, atuais: string[], novos: string[]): Promise<void> {
  const papeis = await fetchPapeis(client);
  const id = (k: string) => papeis.find((p) => p.key === k)?.id;
  for (const k of novos.filter((x) => !atuais.includes(x))) {
    const { error } = await client.from('membership_roles').insert({ org_id: scope.orgId, membership_id: membershipId, role_id: id(k)! });
    if (error) throw error;
  }
  for (const k of atuais.filter((x) => !novos.includes(x))) {
    const { error } = await client.from('membership_roles').delete().eq('membership_id', membershipId).eq('role_id', id(k)!);
    if (error) throw error;
  }
}

export async function guardarTitulo(client: LunaClient, membershipId: string, titulo: string | null, validoAte: string | null): Promise<void> {
  const { error } = await client.from('memberships').update({ title: titulo || null, title_valid_until: validoAte || null }).eq('id', membershipId);
  if (error) throw error;
}

export interface TituloMembro { membershipId: string; titulo: string | null; validoAte: string | null }
export async function fetchTitulos(client: LunaClient, scope: OrgScope): Promise<TituloMembro[]> {
  const { data, error } = await client.from('memberships').select('id,title,title_valid_until').eq('org_id', scope.orgId);
  if (error) throw error;
  return (data ?? []).map((m) => ({ membershipId: m.id, titulo: m.title, validoAte: m.title_valid_until }));
}

/** Avisa a gerência 30 dias antes de um título expirar (idempotente). */
export async function sincronizarTitulos(client: LunaClient, scope: OrgScope): Promise<void> {
  await client.rpc('sync_title_alerts', { _org: scope.orgId });
}

/* ── G-45: segurança e auditoria ────────────────────────────────────────── */
export interface Acao { em: string; quem: string; acao: string; entidade: string; diff: Json }
export interface AcessoSaude { em: string; quem: string; cliente: string; motivo: string | null; foraDaCarteira: boolean }
export interface EntradaEquipa { em: string; quem: string; aparelho: string | null; sucesso: boolean }
export interface DoisFatoresMembro { membershipId: string; nome: string; obrigatorio: boolean; ativo: boolean }

export async function fetchSeguranca(client: LunaClient, scope: OrgScope): Promise<{
  acoes: Acao[]; saude: AcessoSaude[]; entradas: EntradaEquipa[]; doisFatores: DoisFatoresMembro[];
}> {
  const [a, h, l, f] = await Promise.all([
    client.rpc('org_audit', { _org: scope.orgId, _limit: 200 }),
    client.rpc('org_health_access', { _org: scope.orgId }),
    client.rpc('org_logins', { _org: scope.orgId }),
    client.rpc('org_two_factor', { _org: scope.orgId }),
  ]);
  if (a.error) throw a.error;
  return {
    acoes: (a.data ?? []).map((x) => ({ em: x.em, quem: x.quem, acao: x.acao, entidade: x.entidade, diff: x.diff })),
    saude: h.error ? [] : (h.data ?? []).map((x) => ({ em: x.em, quem: x.quem, cliente: x.cliente, motivo: x.motivo, foraDaCarteira: x.fora_da_carteira })),
    entradas: l.error ? [] : (l.data ?? []).map((x) => ({ em: x.em, quem: x.quem, aparelho: x.aparelho, sucesso: x.sucesso })),
    doisFatores: f.error ? [] : (f.data ?? []).map((x) => ({ membershipId: x.membership_id, nome: x.nome, obrigatorio: x.obrigatorio, ativo: x.ativo })),
  };
}

const ACAO: Record<string, string> = {
  INSERT: 'Criou', UPDATE: 'Mudou', DELETE: 'Apagou',
  'clientes.importar': 'Importou clientes', 'cliente.juntar': 'Juntou clientes', 'cliente.desfazer_juntar': 'Desfez a junção',
  'partilha.alterar': 'Mudou partilhas', 'pendencia.adiar': 'Adiou uma pendência', 'pendencia.atribuir': 'Atribuiu uma pendência',
};
const ENTIDADE: Record<string, string> = {
  links: 'cliente', bookings: 'marcação', memberships: 'equipa', membership_roles: 'papel', invites: 'convite', organizations: 'organização',
  client_documents: 'documento', allergies: 'alergia', link_shares: 'partilha', import_runs: 'importação', pendencias: 'pendência', integrations: 'integração',
};
export function descreverAcao(a: Pick<Acao, 'acao' | 'entidade'>): string {
  const verbo = ACAO[a.acao] ?? a.acao;
  return ACAO[a.acao] && !a.acao.includes('.') ? `${verbo} ${ENTIDADE[a.entidade] ?? a.entidade}` : verbo;
}

/* ── G-46: ginásio, unidades, salas e marca ─────────────────────────────── */
export type Unidade = Pick<UnitRow, 'id' | 'name' | 'address' | 'technical_director' | 'opening_hours'> & { salas: Pick<RoomRow, 'id' | 'name' | 'capacity'>[] };

export async function fetchUnidades(client: LunaClient, scope: OrgScope): Promise<Unidade[]> {
  const [u, r] = await Promise.all([
    client.from('units').select('id,name,address,technical_director,opening_hours').eq('org_id', scope.orgId).is('archived_at', null).order('name'),
    client.from('rooms').select('id,name,capacity,unit_id').eq('org_id', scope.orgId).is('archived_at', null).order('name'),
  ]);
  if (u.error) throw u.error;
  return (u.data ?? []).map((x) => ({ ...x, salas: (r.data ?? []).filter((s) => s.unit_id === x.id) }));
}

export async function guardarUnidade(client: LunaClient, scope: OrgScope, u: { id?: string; nome: string; morada?: string | null; horario?: Json }): Promise<void> {
  const linha = { org_id: scope.orgId, name: u.nome.trim(), address: u.morada || null, ...(u.horario ? { opening_hours: u.horario } : {}) };
  const { error } = u.id ? await client.from('units').update(linha).eq('id', u.id) : await client.from('units').insert(linha);
  if (error) throw error;
}

export async function definirDiretorTecnico(client: LunaClient, unidadeId: string, membershipId: string | null): Promise<void> {
  const { error } = await client.from('units').update({ technical_director: membershipId }).eq('id', unidadeId);
  if (error) throw error;
}

export async function guardarSala(client: LunaClient, scope: OrgScope, unidadeId: string, nome: string, lotacao: number | null): Promise<void> {
  const { error } = await client.from('rooms').insert({ org_id: scope.orgId, unit_id: unidadeId, name: nome.trim(), capacity: lotacao });
  if (error) throw error;
}

export async function arquivarSala(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('rooms').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export interface MarcaOrg { nome: string; tema: string; logotipo: string | null; capa: string | null; slug: string | null }
export async function fetchMarca(client: LunaClient, scope: OrgScope): Promise<MarcaOrg> {
  const { data, error } = await client.from('organizations').select('name,theme,brand,slug').eq('id', scope.orgId).single();
  if (error) throw error;
  const b = (data.brand ?? {}) as { logo_url?: string; cover_url?: string };
  return { nome: data.name, tema: data.theme, logotipo: b.logo_url ?? null, capa: b.cover_url ?? null, slug: data.slug };
}

export async function guardarMarca(client: LunaClient, scope: OrgScope, m: Partial<MarcaOrg>): Promise<void> {
  const atual = await fetchMarca(client, scope);
  const { error } = await client.from('organizations').update({
    ...(m.nome ? { name: m.nome } : {}),
    ...(m.tema ? { theme: m.tema } : {}),
    brand: { logo_url: m.logotipo !== undefined ? m.logotipo : atual.logotipo, cover_url: m.capa !== undefined ? m.capa : atual.capa },
  }).eq('id', scope.orgId);
  if (error) throw error;
}

/* ── G-05: importar clientes ────────────────────────────────────────────── */
export type CampoImport = 'nome' | 'telefone' | 'email' | 'nif' | 'nascimento' | 'ignorar';
export const CAMPOS_IMPORT: { id: CampoImport; rotulo: string }[] = [
  { id: 'nome', rotulo: 'Nome' }, { id: 'telefone', rotulo: 'Telemóvel' }, { id: 'email', rotulo: 'Email' },
  { id: 'nif', rotulo: 'NIF' }, { id: 'nascimento', rotulo: 'Data de nascimento' }, { id: 'ignorar', rotulo: 'Não importar' },
];

/** Lê CSV (vírgula ou ponto e vírgula, com aspas). Devolve cabeçalho e linhas. */
export function lerCsv(texto: string): { cabecalho: string[]; linhas: string[][] } {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? '';
  const sep = (primeira.match(/;/g)?.length ?? 0) > (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';
  const linhas: string[][] = [];
  let campo = ''; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(campo); campo = '';
      if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  linha.push(campo);
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
  const [cabecalho = [], ...resto] = linhas;
  return { cabecalho: cabecalho.map((h) => h.trim()), linhas: resto };
}

const normal = (s: string) => s.toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
/** Reconhece as colunas mais comuns sozinho; o resto escolhe-se na lista. */
export function reconhecerColuna(cabecalho: string): CampoImport {
  const h = normal(cabecalho);
  if (/^(nome|nomecompleto|name|fullname|cliente|socio|atleta)$/.test(h)) return 'nome';
  if (/(telemovel|telefone|telem|phone|mobile|tlm|contacto)/.test(h)) return 'telefone';
  if (/(email|mail)/.test(h)) return 'email';
  if (/^(nif|contribuinte|nifcliente|vat|taxid)$/.test(h)) return 'nif';
  if (/(nascimento|datanasc|datanascimento|birth|dob)/.test(h)) return 'nascimento';
  return 'ignorar';
}

/** dd/mm/aaaa, aaaa-mm-dd ou dd-mm-aaaa → aaaa-mm-dd; null se inválida. */
export function lerData(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let a: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  const pt = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (iso) { a = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else if (pt) { d = +pt[1]; m = +pt[2]; a = +pt[3]; }
  else return null;
  const dt = new Date(Date.UTC(a, m - 1, d));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export interface LinhaImport { linha: number; nome: string; telefone: string; email: string; nif: string; nascimento: string | null; erros: string[]; avisos: string[] }

/** Valida no aparelho: nada vai para o servidor antes do último passo. */
export function validarImport(linhas: string[][], mapa: CampoImport[]): LinhaImport[] {
  const col = (k: CampoImport) => mapa.indexOf(k);
  const v = (l: string[], k: CampoImport) => (col(k) >= 0 ? (l[col(k)] ?? '').trim() : '');
  return linhas.map((l, i) => {
    const nascBruto = v(l, 'nascimento');
    const nascimento = lerData(nascBruto);
    const email = v(l, 'email');
    const tel = v(l, 'telefone');
    const erros: string[] = []; const avisos: string[] = [];
    if (!v(l, 'nome')) erros.push('Falta o nome');
    if (nascBruto && !nascimento) erros.push('Data de nascimento inválida');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) avisos.push('Email com formato estranho');
    if (tel && tel.replace(/\D/g, '').length < 9) avisos.push('Telemóvel incompleto');
    if (!email && !tel) avisos.push('Sem email nem telemóvel: não dá para convidar');
    return { linha: i + 2, nome: v(l, 'nome'), telefone: tel, email, nif: v(l, 'nif'), nascimento, erros, avisos };
  });
}

export async function verificarDuplicadosImport(client: LunaClient, scope: OrgScope, linhas: LinhaImport[]): Promise<Map<number, string>> {
  const { data, error } = await client.rpc('import_check', {
    _org: scope.orgId, _rows: linhas.map((l) => ({ linha: l.linha, nome: l.nome, telefone: l.telefone, email: l.email, nif: l.nif })) as unknown as Json,
  });
  if (error) throw error;
  return new Map((data ?? []).map((d) => [d.linha, d.motivo]));
}

export interface ResultadoImport { id: string; total: number; ok: number; falhas: { linha: number; nome: string | null; motivo: string }[] }

export async function importarClientes(client: LunaClient, scope: OrgScope, ficheiro: string, linhas: LinhaImport[]): Promise<ResultadoImport> {
  const { data, error } = await client.rpc('import_clients', {
    _org: scope.orgId, _file: ficheiro,
    _rows: linhas.map((l) => ({ linha: l.linha, nome: l.nome, telefone: l.telefone, email: l.email, nif: l.nif, nascimento: l.nascimento })) as unknown as Json,
  });
  if (error) throw error;
  const { data: run, error: e2 } = await client.from('import_runs').select('id,total,ok,report').eq('id', data as string).single();
  if (e2) throw e2;
  return { id: run.id, total: run.total, ok: run.ok, falhas: (run.report as unknown as ResultadoImport['falhas']) ?? [] };
}

/** As linhas que falharam, em CSV, para corrigir e repetir. */
export function falhasEmCsv(falhas: ResultadoImport['falhas']): string {
  const q = (s: string | number | null) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  return ['linha;nome;motivo', ...falhas.map((f) => [q(f.linha), q(f.nome), q(f.motivo)].join(';'))].join('\n');
}
