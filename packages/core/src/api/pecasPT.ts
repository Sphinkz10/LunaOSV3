// Peças do PT (tarefa 29 parte A): locais, calendário iCal, resumo partilhado,
// passar clientes, primeiros passos (G-01) e lembrete .ics na app.
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { PtLocationRow } from '../types/database';

export type TipoLocal = PtLocationRow['kind'];
export const TIPOS_LOCAL: { id: TipoLocal; rotulo: string }[] = [
  { id: 'estudio', rotulo: 'Estúdio' }, { id: 'casa_cliente', rotulo: 'Casa do cliente' },
  { id: 'parque', rotulo: 'Parque' }, { id: 'online', rotulo: 'Online' },
];
export interface LocalPT { id: string; membershipId: string; tipo: TipoLocal; nome: string; morada: string | null }

export async function fetchLocais(client: LunaClient, scope: OrgScope, membershipId?: string): Promise<LocalPT[]> {
  let q = client.from('pt_locations').select('id,membership_id,kind,label,address').eq('org_id', scope.orgId).is('archived_at', null);
  if (membershipId) q = q.eq('membership_id', membershipId);
  const { data, error } = await q.order('label');
  if (error) throw error;
  return (data ?? []).map((l) => ({ id: l.id, membershipId: l.membership_id, tipo: l.kind, nome: l.label, morada: l.address }));
}
export async function guardarLocal(client: LunaClient, scope: OrgScope, l: Omit<LocalPT, 'id'> & { id?: string }): Promise<void> {
  const row = { org_id: scope.orgId, membership_id: l.membershipId, kind: l.tipo, label: l.nome.trim(), address: l.morada?.trim() || null };
  const { error } = l.id
    ? await client.from('pt_locations').update(row).eq('id', l.id)
    : await client.from('pt_locations').insert(row);
  if (error) throw error;
}
export async function arquivarLocal(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('pt_locations').update({ archived_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

/* ── Calendário iCal (só de leitura) ────────────────────────────────────── */
export interface EstadoCalendario { ativo: boolean; desde: string | null; mostrarNomes: boolean }
export async function fetchCalendario(client: LunaClient, membershipId: string): Promise<EstadoCalendario> {
  const { data, error } = await client.from('calendar_feeds').select('show_names,created_at').eq('membership_id', membershipId).maybeSingle();
  if (error) throw error;
  return { ativo: !!data, desde: data?.created_at ?? null, mostrarNomes: data?.show_names ?? false };
}
/** Gera um código novo (o anterior deixa de funcionar) e devolve o endereço completo. Só se vê uma vez. */
export async function novaLigacaoCalendario(client: LunaClient, scope: OrgScope, baseUrl: string, mostrarNomes: boolean): Promise<string> {
  const { data, error } = await client.rpc('new_calendar_feed', { _org: scope.orgId, _show_names: mostrarNomes });
  if (error) throw error;
  return `${baseUrl.replace(/\/$/, '')}/functions/v1/ical?t=${data as string}`;
}

/* ── G-14: partilhar o resumo da sessão com o cliente ───────────────────── */
export async function partilharResumo(client: LunaClient, sessaoId: string, nota: string): Promise<void> {
  const texto = nota.trim();
  if (!texto) throw new Error('Escreve uma linha para o cliente.');
  const { error } = await client.rpc('share_session_summary', { _session: sessaoId, _note: texto });
  if (error) throw error;
}

/* ── G-46: passar os clientes de um PT que sai ──────────────────────────── */
export async function contarClientesDe(client: LunaClient, scope: OrgScope, membershipId: string): Promise<number> {
  const { count, error } = await client.from('links').select('id', { count: 'exact', head: true })
    .eq('org_id', scope.orgId).eq('responsible_membership_id', membershipId).is('archived_at', null);
  if (error) throw error;
  return count ?? 0;
}
export async function passarClientes(client: LunaClient, scope: OrgScope, de: string, para: string, links?: string[] | null): Promise<number> {
  if (de === para) throw new Error('Escolhe outra pessoa da equipa.');
  const { data, error } = await client.rpc('transfer_clients', { _org: scope.orgId, _from: de, _to: para, _links: links ?? null });
  if (error) throw error;
  return data as number;
}

/* ── G-01: Para começar ─────────────────────────────────────────────────── */
export type PassoInicio = 'clientes' | 'pack' | 'treino' | 'calendario' | 'convite';
export interface ProgressoInicio { feitos: PassoInicio[]; total: number }
export const PASSOS_INICIO: { id: PassoInicio; titulo: string; texto: string; rota: string }[] = [
  { id: 'clientes', titulo: 'Trazer os teus clientes', texto: 'Importa a lista do Excel ou junta um a um.', rota: '/clients/importar' },
  { id: 'pack', titulo: 'Criar um pack de sessões', texto: 'Por exemplo 10 sessões válidas 3 meses.', rota: '/business/packs' },
  { id: 'treino', titulo: 'Atribuir um treino', texto: 'Escolhe da biblioteca e entrega a um cliente.', rota: '/training/biblioteca' },
  { id: 'calendario', titulo: 'Ligar o teu calendário', texto: 'Vê as sessões no Google ou no iPhone.', rota: '/schedule/regras' },
  { id: 'convite', titulo: 'Convidar um cliente para a app', texto: 'Ele marca, treina e vê o progresso.', rota: '/clients' },
];
export async function fetchProgressoInicio(client: LunaClient, scope: OrgScope, membershipId: string): Promise<ProgressoInicio> {
  const n = (r: { count: number | null }) => (r.count ?? 0) > 0;
  const [c, p, t, k, v] = await Promise.all([
    client.from('links').select('id', { count: 'exact', head: true }).eq('org_id', scope.orgId),
    client.from('pack_products').select('id', { count: 'exact', head: true }).eq('org_id', scope.orgId),
    client.from('assignments').select('id', { count: 'exact', head: true }).eq('org_id', scope.orgId),
    client.from('calendar_feeds').select('membership_id', { count: 'exact', head: true }).eq('membership_id', membershipId),
    client.from('links').select('id', { count: 'exact', head: true }).eq('org_id', scope.orgId).neq('origin', 'manual'),
  ]).then((r) => r.map(n));
  const feitos = ([['clientes', c], ['pack', p], ['treino', t], ['calendario', k], ['convite', v]] as [PassoInicio, boolean][]).filter(([, f]) => f).map(([id]) => id);
  return { feitos, total: PASSOS_INICIO.length };
}

/* ── App: "Adicionar ao calendário" (.ics de uma marcação) ──────────────── */
export function icsDeMarcacao(m: { id: string; inicio: string; fim: string; titulo: string; local?: string | null }): string {
  const dt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LunaOS//App//PT', 'BEGIN:VEVENT',
    `UID:${m.id}@lunaos`, `DTSTAMP:${dt(new Date().toISOString())}`, `DTSTART:${dt(m.inicio)}`, `DTEND:${dt(m.fim)}`,
    `SUMMARY:${esc(m.titulo)}`, ...(m.local ? [`LOCATION:${esc(m.local)}`] : []),
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(m.titulo)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}

/* ── G-06: notas privadas e documentos do cliente ───────────────────────── */
export interface NotaPrivada { id: string; texto: string; em: string; editadaEm: string; autorId: string | null }
export async function fetchNotas(client: LunaClient, linkId: string): Promise<NotaPrivada[]> {
  const { data, error } = await client.from('client_notes').select('id,body,created_at,updated_at,author_membership_id').eq('link_id', linkId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((n) => ({ id: n.id, texto: n.body, em: n.created_at, editadaEm: n.updated_at, autorId: n.author_membership_id }));
}
export async function guardarNota(client: LunaClient, scope: OrgScope, linkId: string, texto: string, id?: string): Promise<void> {
  const body = texto.trim();
  if (!body) throw new Error('A nota está vazia.');
  const { error } = id
    ? await client.from('client_notes').update({ body, updated_at: new Date().toISOString() }).eq('id', id)
    : await client.from('client_notes').insert({ org_id: scope.orgId, link_id: linkId, body, author_membership_id: scope.membershipId });
  if (error) throw error;
}
export async function apagarNota(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('client_notes').delete().eq('id', id);
  if (error) throw error;
}

export type TipoDocumento = 'atestado' | 'termo' | 'consentimento_fotos' | 'outro';
export const TIPOS_DOCUMENTO: { id: TipoDocumento; rotulo: string; validadeMeses: number | null }[] = [
  { id: 'atestado', rotulo: 'Atestado médico', validadeMeses: 12 },
  { id: 'termo', rotulo: 'Termo de responsabilidade', validadeMeses: null },
  { id: 'consentimento_fotos', rotulo: 'Consentimento de fotografias', validadeMeses: null },
  { id: 'outro', rotulo: 'Outro', validadeMeses: null },
];
/** Válido, a expirar (30 dias) ou expirado, a partir da data; sem data fica válido. */
export function estadoDocumento(expiraEm: string | null, hoje = new Date().toISOString().slice(0, 10)): 'valid' | 'expiring' | 'expired' {
  if (!expiraEm) return 'valid';
  if (expiraEm < hoje) return 'expired';
  const limite = new Date(`${hoje}T00:00:00Z`); limite.setUTCDate(limite.getUTCDate() + 30);
  return expiraEm <= limite.toISOString().slice(0, 10) ? 'expiring' : 'valid';
}
export function validadePorOmissao(tipo: TipoDocumento, emitido: string): string | null {
  const m = TIPOS_DOCUMENTO.find((x) => x.id === tipo)?.validadeMeses;
  if (!m || !emitido) return null;
  const d = new Date(`${emitido}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
}
export interface NovoDocumento { id?: string; tipo: TipoDocumento; nome: string; emitidoEm: string | null; expiraEm: string | null }
export async function guardarDocumento(client: LunaClient, scope: OrgScope, linkId: string, d: NovoDocumento): Promise<void> {
  const row = {
    org_id: scope.orgId, link_id: linkId, name: d.nome.trim() || (TIPOS_DOCUMENTO.find((x) => x.id === d.tipo)?.rotulo ?? 'Documento'),
    doc_type: d.tipo, issued_on: d.emitidoEm, expires_on: d.expiraEm, status: estadoDocumento(d.expiraEm), updated_at: new Date().toISOString(),
  };
  const { error } = d.id ? await client.from('client_documents').update(row).eq('id', d.id) : await client.from('client_documents').insert(row);
  if (error) throw error;
}
export async function apagarDocumento(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('client_documents').delete().eq('id', id);
  if (error) throw error;
}
