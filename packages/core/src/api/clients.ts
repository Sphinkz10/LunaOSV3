import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { ClientViewRow, EnumOf, Json } from '../types/database';
import { fetchAllPages } from './orgQuery';

/**
 * Clientes (Link + Person). O nome no ecrã vem do vocabulário da modalidade;
 * no código é "client". Todas as consultas levam o org_id da organização ativa;
 * o RLS decide se o PT vê a carteira toda ou só os seus.
 */
export type ClientStatus = EnumOf<'client_status'>;
export type DocumentStatus = EnumOf<'document_status'>;

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  valid: 'OK',
  expiring: 'A expirar',
  expired: 'Expirado',
  missing: 'Em falta',
  pending: 'Pendente',
};

type DocIssue = Exclude<DocumentStatus, 'valid'>;
const DOC_ISSUE_PRIORITY: DocIssue[] = ['expired', 'missing', 'pending', 'expiring'];

/** Resume documental de um cliente (a partir dos estados na BD). */
export function summarizeClientDocs(statuses: DocumentStatus[]): {
  docsOk: boolean; docsLabel: string; docsIssueCount: number; pending: number;
} {
  const issues = statuses.filter((s): s is DocIssue => s !== 'valid');
  if (issues.length === 0) return { docsOk: true, docsLabel: 'OK', docsIssueCount: 0, pending: 0 };
  const worst = DOC_ISSUE_PRIORITY.find((s) => issues.includes(s)) ?? issues[0];
  return { docsOk: false, docsLabel: DOC_STATUS_LABEL[worst] ?? worst, docsIssueCount: issues.length, pending: issues.length };
}

/** Resultado de uma secção que pode falhar sozinha (X-02: falha parcial; em falta ≠ zero). */
export type Section<T> =
  | { state: 'ok'; data: T }
  | { state: 'no_permission' }
  | { state: 'not_shared' }
  | { state: 'error'; message: string };

const errMsg = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : 'Erro desconhecido';
const isDenied = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: string }).code === '42501';

async function section<T>(run: () => Promise<T>): Promise<Section<T>> {
  try {
    return { state: 'ok', data: await run() };
  } catch (e) {
    return isDenied(e) ? { state: 'no_permission' } : { state: 'error', message: errMsg(e) };
  }
}

/** Cliente enriquecido para a lista (grupo + plano + documentos). */
export interface ClientRow {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  status: ClientStatus;
  statusNote: string | null;
  avatarUrl: string | null;
  hasAccount: boolean;
  responsibleMembershipId: string | null;
  /** Nome do responsável (PT) — útil para quem vê a carteira toda. */
  responsibleName: string | null;
  hasPlan: boolean;
  planName: string | null;
  groupName: string | null;
  updatedAt: string;
  docsOk: boolean;
  docsLabel: string;
  docsIssueCount: number;
  pending: number;
}

export interface NewClientInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  birthDate?: string | null;
  responsibleMembershipId?: string | null;
}

const CLIENT_COLUMNS = 'id,person_id,full_name,email,client_status,status_note,avatar_url,has_account,responsible_membership_id,current_plan_id,updated_at';
type ClientListRow = Pick<ClientViewRow, 'id' | 'person_id' | 'full_name' | 'email' | 'client_status' | 'status_note' |
  'avatar_url' | 'has_account' | 'responsible_membership_id' | 'current_plan_id' | 'updated_at'>;

/** Carteira visível (todas as páginas). */
export async function fetchClients(client: LunaClient, scope: OrgScope): Promise<ClientRow[]> {
  const rows = await fetchAllPages<ClientListRow>((from, to) => client.from('clients')
    .select(CLIENT_COLUMNS)
    .eq('org_id', scope.orgId)
    .is('archived_at', null)
    .neq('status', 'ended')
    .order('full_name', { ascending: true })
    .range(from, to));

  const [groups, members, docs, staff] = await Promise.all([
    fetchAllPages<{ id: string; name: string }>((f, t) => client.from('groups').select('id,name')
      .eq('org_id', scope.orgId).range(f, t)),
    fetchAllPages<{ link_id: string; group_id: string }>((f, t) => client.from('group_members').select('link_id,group_id')
      .eq('org_id', scope.orgId).range(f, t)),
    fetchAllPages<{ link_id: string; status: DocumentStatus }>((f, t) => client.from('client_documents').select('link_id,status')
      .eq('org_id', scope.orgId).range(f, t)),
    fetchStaff(client, scope),
  ]);
  const staffNames = new Map(staff.map((m) => [m.id, m.name]));
  const groupNames = new Map(groups.map((g) => [g.id, g.name]));
  const groupByClient = new Map<string, string>();
  for (const m of members) {
    const name = groupNames.get(m.group_id);
    if (name && !groupByClient.has(m.link_id)) groupByClient.set(m.link_id, name);
  }
  const docsByClient = new Map<string, DocumentStatus[]>();
  for (const d of docs) docsByClient.set(d.link_id, [...(docsByClient.get(d.link_id) ?? []), d.status]);

  const planNames = await fetchPlanNames(client, scope, rows.map((r) => r.current_plan_id));

  return rows.map((r) => ({
    id: r.id,
    personId: r.person_id,
    name: r.full_name,
    email: r.email,
    status: r.client_status,
    statusNote: r.status_note,
    avatarUrl: r.avatar_url,
    hasAccount: r.has_account,
    responsibleMembershipId: r.responsible_membership_id,
    responsibleName: r.responsible_membership_id ? staffNames.get(r.responsible_membership_id) ?? null : null,
    hasPlan: Boolean(r.current_plan_id),
    planName: r.current_plan_id ? planNames.get(r.current_plan_id) ?? null : null,
    groupName: groupByClient.get(r.id) ?? null,
    updatedAt: r.updated_at,
    ...summarizeClientDocs(docsByClient.get(r.id) ?? []),
  }));
}

/** Última vez e assiduidade das últimas 8 semanas (G-03), por cliente. */
export interface Assiduidade { ultimaVez: string | null; semanas: number[] }
export async function fetchAssiduidade(client: LunaClient, scope: OrgScope): Promise<Map<string, Assiduidade>> {
  const { data, error } = await client.rpc('clients_overview', { _org: scope.orgId });
  if (error) throw error;
  return new Map((data ?? []).map((r) => [r.link_id, { ultimaVez: r.last_training, semanas: r.weeks }]));
}

/** Arquivados (ex-clientes): saem da lista, mas o histórico fica e podem voltar. */
export interface ClienteArquivado { id: string; name: string; avatarUrl: string | null; archivedAt: string; reason: string | null }
export async function fetchArchivedClients(client: LunaClient, scope: OrgScope): Promise<ClienteArquivado[]> {
  const { data, error } = await client.from('clients').select('id,full_name,avatar_url,archived_at,archived_reason')
    .eq('org_id', scope.orgId).not('archived_at', 'is', null).order('archived_at', { ascending: false }).limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({ id: r.id, name: r.full_name, avatarUrl: r.avatar_url, archivedAt: r.archived_at as string, reason: r.archived_reason }));
}

async function fetchPlanNames(client: LunaClient, scope: OrgScope, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  if (!unique.length) return new Map();
  const { data, error } = await client.from('plans').select('id,name').eq('org_id', scope.orgId).in('id', unique);
  if (error) throw error;
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export async function updateClientStatus(client: LunaClient, scope: OrgScope, linkId: string, status: ClientStatus): Promise<void> {
  const { error } = await client.from('links').update({ client_status: status })
    .eq('org_id', scope.orgId).eq('id', linkId);
  if (error) throw error;
}

/** Arquiva (reversível, com motivo): sai da lista sem perder dados. */
export async function archiveClient(client: LunaClient, scope: OrgScope, linkId: string, reason?: string | null): Promise<void> {
  const { error } = await client.from('links')
    .update({ archived_at: new Date().toISOString(), archived_reason: reason ?? null })
    .eq('org_id', scope.orgId).eq('id', linkId);
  if (error) throw error;
}

export async function unarchiveClient(client: LunaClient, scope: OrgScope, linkId: string): Promise<void> {
  const { error } = await client.from('links').update({ archived_at: null, archived_reason: null })
    .eq('org_id', scope.orgId).eq('id', linkId);
  if (error) throw error;
}

export class DuplicateClientError extends Error {
  constructor() { super('Já existe um cliente com este email.'); this.name = 'DuplicateClientError'; }
}

/** Acrescenta um cliente (pessoa gerida pela organização até ter conta). Devolve o id da ligação. */
export async function addClient(client: LunaClient, scope: OrgScope, input: NewClientInput): Promise<string> {
  const { data, error } = await client.rpc('add_client', {
    _org: scope.orgId,
    _full_name: input.name,
    _email: input.email || null,
    _phone: input.phone || null,
    _birth_date: input.birthDate || null,
    _responsible: input.responsibleMembershipId ?? null,
  });
  if (error) {
    if (error.message?.includes('duplicate_client')) throw new DuplicateClientError();
    throw error;
  }
  return data as string;
}

/* ── Grupos ─────────────────────────────────────────────────────────────── */

export interface GroupRow {
  id: string; name: string; color: string | null; description: string | null; memberCount: number; updatedAt: string;
}

export async function fetchGroups(client: LunaClient, scope: OrgScope): Promise<GroupRow[]> {
  const [rows, members] = await Promise.all([
    fetchAllPages<{ id: string; name: string; color: string | null; description: string | null; updated_at: string }>((f, t) =>
      client.from('groups').select('id,name,color,description,updated_at')
        .eq('org_id', scope.orgId).is('archived_at', null).order('name', { ascending: true }).range(f, t)),
    fetchAllPages<{ group_id: string }>((f, t) => client.from('group_members').select('group_id')
      .eq('org_id', scope.orgId).range(f, t)),
  ]);
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  return rows.map((g) => ({
    id: g.id, name: g.name, color: g.color, description: g.description,
    memberCount: counts.get(g.id) ?? 0, updatedAt: g.updated_at,
  }));
}

export interface NewGroupInput { name: string; description?: string | null; color?: string | null }

export async function createGroup(client: LunaClient, scope: OrgScope, input: NewGroupInput): Promise<string> {
  const { data, error } = await client.from('groups')
    .insert({ org_id: scope.orgId, name: input.name, description: input.description ?? null, color: input.color ?? null })
    .select('id').single();
  if (error) throw error;
  return data.id;
}

/* ── Ficha do cliente (G-06) ────────────────────────────────────────────── */

export interface ClientProfile {
  id: string; personId: string; name: string; email: string | null; phone: string | null; birthDate: string | null;
  status: ClientStatus; statusNote: string | null; avatarUrl: string | null; hasAccount: boolean;
  responsibleMembershipId: string | null; createdAt: string; updatedAt: string;
  groupName: string | null; planName: string | null;
}

export interface AllergyItem { id: string; allergen: string; severity: string; reaction: string | null; notes: string | null }
export interface DocumentItem { id: string; name: string; docType: string | null; status: string; expiresOn: string | null }
export interface MetricItem { id: string; metricKey: string; value: number | null; textValue: string | null; unit: string | null; source: string; recordedAt: string }
export interface ClientBookingItem { id: string; type: string; status: string; title: string | null; startsAt: string; endsAt: string; location: string | null }
export interface ClientAssignmentItem { id: string; status: string; planName: string | null; startsOn: string | null; endsOn: string | null; notes: string | null }

export interface ClientDetail {
  profile: ClientProfile;
  /** Saúde: só com papel clínico e partilha do cliente; cada leitura fica registada. */
  allergies: Section<AllergyItem[]>;
  documents: Section<DocumentItem[]>;
  metrics: Section<MetricItem[]>;
  bookings: Section<ClientBookingItem[]>;
  assignments: Section<ClientAssignmentItem[]>;
}

export async function fetchClientProfile(client: LunaClient, scope: OrgScope, linkId: string): Promise<ClientDetail> {
  const { data: row, error } = await client.from('clients').select('*')
    .eq('org_id', scope.orgId).eq('id', linkId).single();
  if (error) throw error;

  const [planNames, group] = await Promise.all([
    fetchPlanNames(client, scope, [row.current_plan_id]),
    client.from('group_members').select('group_id').eq('org_id', scope.orgId).eq('link_id', linkId).limit(1),
  ]);
  if (group.error) throw group.error;
  let groupName: string | null = null;
  const groupId = group.data?.[0]?.group_id;
  if (groupId) {
    const { data: g, error: ge } = await client.from('groups').select('name').eq('org_id', scope.orgId).eq('id', groupId).maybeSingle();
    if (ge) throw ge;
    groupName = g?.name ?? null;
  }

  const [allergies, documents, metrics, bookings, assignments] = await Promise.all([
    fetchClientHealth(client, scope, linkId),
    section(async () => {
      const { data, error: e } = await client.from('client_documents').select('id,name,doc_type,status,expires_on')
        .eq('org_id', scope.orgId).eq('link_id', linkId).order('updated_at', { ascending: false });
      if (e) throw e;
      return (data ?? []).map((x) => ({ id: x.id, name: x.name, docType: x.doc_type, status: x.status, expiresOn: x.expires_on }));
    }),
    fetchClientMetrics(client, scope, row.person_id),
    section(async () => {
      const { data, error: e } = await client.from('bookings').select('id,type,status,title,starts_at,ends_at,location')
        .eq('org_id', scope.orgId).eq('link_id', linkId).order('starts_at', { ascending: false }).limit(40);
      if (e) throw e;
      return (data ?? []).map((x) => ({ id: x.id, type: x.type, status: x.status, title: x.title, startsAt: x.starts_at, endsAt: x.ends_at, location: x.location }));
    }),
    section(async () => {
      const { data, error: e } = await client.from('assignments').select('id,status,plan_id,starts_on,ends_on,notes')
        .eq('org_id', scope.orgId).eq('link_id', linkId).order('updated_at', { ascending: false }).limit(40);
      if (e) throw e;
      const names = await fetchPlanNames(client, scope, (data ?? []).map((x) => x.plan_id));
      return (data ?? []).map((x) => ({
        id: x.id, status: x.status, planName: x.plan_id ? names.get(x.plan_id) ?? null : null,
        startsOn: x.starts_on, endsOn: x.ends_on, notes: x.notes,
      }));
    }),
  ]);

  return {
    profile: {
      id: row.id, personId: row.person_id, name: row.full_name, email: row.email, phone: row.phone,
      birthDate: row.birth_date, status: row.client_status, statusNote: row.status_note, avatarUrl: row.avatar_url,
      hasAccount: row.has_account, responsibleMembershipId: row.responsible_membership_id,
      createdAt: row.created_at, updatedAt: row.updated_at, groupName,
      planName: row.current_plan_id ? planNames.get(row.current_plan_id) ?? null : null,
    },
    allergies, documents, metrics, bookings, assignments,
  };
}

/** Saúde pela função que verifica papel + partilha e regista a leitura. */
export async function fetchClientHealth(client: LunaClient, scope: OrgScope, linkId: string): Promise<Section<AllergyItem[]>> {
  if (!scope.permissions.includes('health.read')) return { state: 'no_permission' };
  const { data, error } = await client.rpc('get_person_health', { _link: linkId });
  if (error) {
    // Com papel clínico, a recusa só pode ser falta de partilha do cliente
    return isDenied(error) ? { state: 'not_shared' } : { state: 'error', message: errMsg(error) };
  }
  const items = ((data as { allergies?: Json[] } | null)?.allergies ?? []) as unknown as AllergyItem[];
  return { state: 'ok', data: items };
}

/** Medidas da pessoa: o RLS só devolve linhas com ligação ativa e partilha. */
async function fetchClientMetrics(client: LunaClient, scope: OrgScope, personId: string): Promise<Section<MetricItem[]>> {
  const shared = await client.from('link_shares').select('id').eq('org_id', scope.orgId)
    .eq('person_id', personId).eq('category', 'measurements').is('revoked_at', null).limit(1);
  if (shared.error) return { state: 'error', message: errMsg(shared.error) };
  if (!shared.data?.length) return { state: 'not_shared' };
  return section(async () => {
    const { data, error } = await client.from('measurements').select('id,metric_key,value,text_value,unit,source,recorded_at')
      .eq('person_id', personId).order('recorded_at', { ascending: false }).limit(40);
    if (error) throw error;
    return (data ?? []).map((x) => ({
      id: x.id, metricKey: x.metric_key, value: x.value == null ? null : Number(x.value), textValue: x.text_value,
      unit: x.unit, source: x.source, recordedAt: x.recorded_at,
    }));
  });
}

/* ── Planos e atribuições ───────────────────────────────────────────────── */

export interface PlanLite { id: string; name: string }

export async function fetchPlans(client: LunaClient, scope: OrgScope): Promise<PlanLite[]> {
  return fetchAllPages<PlanLite>((f, t) => client.from('plans').select('id,name')
    .eq('org_id', scope.orgId).is('archived_at', null).order('name', { ascending: true }).range(f, t));
}

export interface AssignResult { created: number; alreadyActive: number; skippedRestricted: number }

/**
 * Atribui um plano a vários clientes. Não duplica a atribuição ativa (auditoria, Alto)
 * e salta quem está bloqueado (restrição).
 */
export async function assignPlanToClients(
  client: LunaClient, scope: OrgScope, planId: string, linkIds: string[],
): Promise<AssignResult> {
  if (linkIds.length === 0) return { created: 0, alreadyActive: 0, skippedRestricted: 0 };
  const [existing, restricted] = await Promise.all([
    client.from('assignments').select('link_id').eq('org_id', scope.orgId).eq('plan_id', planId)
      .in('status', ['active', 'scheduled']).in('link_id', linkIds),
    client.from('links').select('id').eq('org_id', scope.orgId).eq('client_status', 'blocked').in('id', linkIds),
  ]);
  if (existing.error) throw existing.error;
  if (restricted.error) throw restricted.error;
  const active = new Set((existing.data ?? []).map((r) => r.link_id));
  const blocked = new Set((restricted.data ?? []).map((r) => r.id));
  const targets = linkIds.filter((id) => !active.has(id) && !blocked.has(id));
  if (targets.length) {
    const { error } = await client.from('assignments').insert(targets.map((linkId) => ({
      org_id: scope.orgId, target: 'client' as const, link_id: linkId, plan_id: planId,
      status: 'active' as const, assigned_by: scope.membershipId,
    })));
    if (error) throw error;
    const { error: e2 } = await client.from('links').update({ current_plan_id: planId })
      .eq('org_id', scope.orgId).in('id', targets);
    if (e2) throw e2;
  }
  return {
    created: targets.length,
    alreadyActive: linkIds.filter((id) => active.has(id)).length,
    skippedRestricted: linkIds.filter((id) => blocked.has(id) && !active.has(id)).length,
  };
}

/* ── Grupo (detalhe e membros) ──────────────────────────────────────────── */

export interface GroupMemberRow { id: string; name: string; status: ClientStatus; avatarUrl: string | null; hasPlan: boolean }
export interface GroupProfile { id: string; name: string; color: string | null; description: string | null; createdAt: string; updatedAt: string }
export interface GroupDetail { profile: GroupProfile; members: GroupMemberRow[]; assignments: ClientAssignmentItem[] }

export async function fetchGroupProfile(client: LunaClient, scope: OrgScope, groupId: string): Promise<GroupDetail> {
  const { data: g, error } = await client.from('groups').select('id,name,color,description,created_at,updated_at')
    .eq('org_id', scope.orgId).eq('id', groupId).single();
  if (error) throw error;
  const linkIds = await fetchGroupMemberIds(client, scope, groupId);

  let members: GroupMemberRow[] = [];
  let assignments: ClientAssignmentItem[] = [];
  if (linkIds.length) {
    const [cl, asg] = await Promise.all([
      client.from('clients').select('id,full_name,client_status,avatar_url,current_plan_id')
        .eq('org_id', scope.orgId).in('id', linkIds).order('full_name', { ascending: true }),
      client.from('assignments').select('id,status,plan_id,starts_on,ends_on,notes')
        .eq('org_id', scope.orgId).in('link_id', linkIds).order('updated_at', { ascending: false }).limit(80),
    ]);
    if (cl.error) throw cl.error;
    if (asg.error) throw asg.error;
    members = (cl.data ?? []).map((a) => ({
      id: a.id, name: a.full_name, status: a.client_status, avatarUrl: a.avatar_url, hasPlan: Boolean(a.current_plan_id),
    }));
    const names = await fetchPlanNames(client, scope, (asg.data ?? []).map((x) => x.plan_id));
    assignments = (asg.data ?? []).map((x) => ({
      id: x.id, status: x.status, planName: x.plan_id ? names.get(x.plan_id) ?? null : null,
      startsOn: x.starts_on, endsOn: x.ends_on, notes: x.notes,
    }));
  }
  return {
    profile: { id: g.id, name: g.name, color: g.color, description: g.description, createdAt: g.created_at, updatedAt: g.updated_at },
    members, assignments,
  };
}

export async function fetchGroupMemberIds(client: LunaClient, scope: OrgScope, groupId: string): Promise<string[]> {
  const rows = await fetchAllPages<{ link_id: string }>((f, t) => client.from('group_members').select('link_id')
    .eq('org_id', scope.orgId).eq('group_id', groupId).range(f, t));
  return rows.map((m) => m.link_id);
}

/** Acrescenta clientes a um grupo (ignora quem já lá está). */
export async function addGroupMembers(client: LunaClient, scope: OrgScope, groupId: string, linkIds: string[]): Promise<number> {
  if (linkIds.length === 0) return 0;
  const existing = new Set(await fetchGroupMemberIds(client, scope, groupId));
  const toAdd = linkIds.filter((id) => !existing.has(id));
  if (toAdd.length === 0) return 0;
  const { error } = await client.from('group_members')
    .insert(toAdd.map((linkId) => ({ org_id: scope.orgId, group_id: groupId, link_id: linkId })));
  if (error) throw error;
  return toAdd.length;
}

export async function removeGroupMember(client: LunaClient, scope: OrgScope, groupId: string, linkId: string): Promise<void> {
  const { error } = await client.from('group_members').delete()
    .eq('org_id', scope.orgId).eq('group_id', groupId).eq('link_id', linkId);
  if (error) throw error;
}

export async function assignPlanToGroup(client: LunaClient, scope: OrgScope, groupId: string, planId: string): Promise<AssignResult> {
  return assignPlanToClients(client, scope, planId, await fetchGroupMemberIds(client, scope, groupId));
}

/* ── Equipa (para escolher o responsável) ───────────────────────────────── */

export interface StaffLite { id: string; name: string }

export async function fetchStaff(client: LunaClient, scope: OrgScope): Promise<StaffLite[]> {
  const { data, error } = await client.from('staff').select('id,full_name')
    .eq('org_id', scope.orgId).eq('status', 'active').order('full_name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({ id: s.id, name: s.full_name }));
}
