import type { LunaClient } from './client';
import type { Athlete } from '../types/database';

export type AthleteStatus = Athlete['status'];
export type DocumentStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'pending';

const DOC_STATUS_LABEL: Record<DocumentStatus, string> = {
  valid: 'OK',
  expiring: 'A expirar',
  expired: 'Expirado',
  missing: 'Em falta',
  pending: 'Pendente',
};

type DocIssue = Exclude<DocumentStatus, 'valid'>;

const DOC_ISSUE_PRIORITY: DocIssue[] = ['expired', 'missing', 'pending', 'expiring'];

/** Resume documental de um atleta (a partir dos status na BD). */
export function summarizeAthleteDocs(statuses: DocumentStatus[]): {
  docsOk: boolean;
  docsLabel: string;
  docsIssueCount: number;
  pending: number;
} {
  if (statuses.length === 0) {
    return { docsOk: true, docsLabel: 'OK', docsIssueCount: 0, pending: 0 };
  }
  const issues = statuses.filter((s): s is DocIssue => s !== 'valid');
  if (issues.length === 0) {
    return { docsOk: true, docsLabel: 'OK', docsIssueCount: 0, pending: 0 };
  }
  const worst = DOC_ISSUE_PRIORITY.find((s) => issues.includes(s)) ?? issues[0];
  return {
    docsOk: false,
    docsLabel: DOC_STATUS_LABEL[worst] ?? worst,
    docsIssueCount: issues.length,
    pending: issues.length,
  };
}

/** Atleta enriquecido para a Central de Atletas (dados reais + grupo + plano + docs). */
export interface AthleteRow {
  id: string;
  name: string;
  sport: string | null;
  status: AthleteStatus;
  statusNote: string | null;
  avatarUrl: string | null;
  hasPlan: boolean;
  planName: string | null;
  groupName: string | null;
  updatedAt: string;
  /** true quando todos os documentos estão válidos (ou não há documentos). */
  docsOk: boolean;
  /** 'OK' ou rótulo do problema mais grave (Expirado, Em falta, …). */
  docsLabel: string;
  docsIssueCount: number;
  /** Pendências abertas (docs + forms; forms=0 até Forms.OS). */
  pending: number;
}

export interface NewAthleteInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  sport?: string | null;
  status?: AthleteStatus;
}

/** Lista completa de atletas do coach + nome do 1.º grupo de cada um. */
export async function fetchAthletes(client: LunaClient, coachId: string): Promise<AthleteRow[]> {
  const { data, error } = await client.from('athletes')
    .select('id,name,sport,status,status_note,avatar_url,current_plan_id,updated_at')
    .eq('coach_id', coachId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(1000);
  if (error) throw error;
  const rows = (data ?? []) as Array<Pick<Athlete, 'id' | 'name' | 'sport' | 'status' | 'status_note' | 'avatar_url' | 'current_plan_id' | 'updated_at'>>;

  const groupNames = new Map<string, string>();
  const { data: groupsData } = await client.from('groups')
    .select('id,name')
    .eq('coach_id', coachId);
  for (const g of (groupsData ?? []) as Array<{ id: string; name: string }>) groupNames.set(g.id, g.name);

  const groupByAthlete = new Map<string, string>();
  const { data: members } = await client.from('group_members')
    .select('athlete_id,group_id')
    .eq('coach_id', coachId);
  for (const m of (members ?? []) as Array<{ athlete_id: string; group_id: string }>) {
    if (groupByAthlete.has(m.athlete_id)) continue;
    const name = groupNames.get(m.group_id);
    if (name) groupByAthlete.set(m.athlete_id, name);
  }

  const planIds = [...new Set(rows.map((a) => a.current_plan_id).filter(Boolean))] as string[];
  const planNames = new Map<string, string>();
  if (planIds.length > 0) {
    const { data: plansData } = await client.from('plans')
      .select('id,name')
      .eq('coach_id', coachId)
      .in('id', planIds);
    for (const p of (plansData ?? []) as Array<{ id: string; name: string }>) {
      planNames.set(p.id, p.name);
    }
  }

  const docsByAthlete = new Map<string, DocumentStatus[]>();
  const { data: docsData } = await client.from('athlete_documents')
    .select('athlete_id,status')
    .eq('coach_id', coachId);
  for (const d of (docsData ?? []) as Array<{ athlete_id: string; status: DocumentStatus }>) {
    const list = docsByAthlete.get(d.athlete_id) ?? [];
    list.push(d.status);
    docsByAthlete.set(d.athlete_id, list);
  }

  return rows.map((a) => {
    const docSummary = summarizeAthleteDocs(docsByAthlete.get(a.id) ?? []);
    return {
      id: a.id,
      name: a.name,
      sport: a.sport,
      status: a.status,
      statusNote: a.status_note,
      avatarUrl: a.avatar_url,
      hasPlan: Boolean(a.current_plan_id),
      planName: a.current_plan_id ? (planNames.get(a.current_plan_id) ?? null) : null,
      groupName: groupByAthlete.get(a.id) ?? null,
      updatedAt: a.updated_at,
      ...docSummary,
    };
  });
}

/** Atualiza o estado de um atleta. */
export async function updateAthleteStatus(client: LunaClient, coachId: string, athleteId: string, status: AthleteStatus): Promise<void> {
  const { error } = await client.from('athletes')
    .update({ status })
    .eq('id', athleteId)
    .eq('coach_id', coachId);
  if (error) throw error;
}

/**
 * Arquiva um atleta (soft-delete reversível): marca `archived_at` e estado `archived`.
 * O `fetchAthletes` já exclui atletas com `archived_at` preenchido — saem da lista sem perder dados.
 */
export async function archiveAthlete(client: LunaClient, coachId: string, athleteId: string): Promise<void> {
  const { error } = await client.from('athletes')
    .update({ archived_at: new Date().toISOString(), status: 'archived' })
    .eq('id', athleteId)
    .eq('coach_id', coachId);
  if (error) throw error;
}

/** Reverte o arquivo de um atleta: limpa `archived_at` e devolve-o ao estado ativo. */
export async function unarchiveAthlete(client: LunaClient, coachId: string, athleteId: string): Promise<void> {
  const { error } = await client.from('athletes')
    .update({ archived_at: null, status: 'active' })
    .eq('id', athleteId)
    .eq('coach_id', coachId);
  if (error) throw error;
}

/** Cria um atleta novo (fica com o coach autenticado). */
export async function createAthlete(client: LunaClient, coachId: string, input: NewAthleteInput): Promise<string> {
  const { data, error } = await client.from('athletes')
    .insert({
      coach_id: coachId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      sport: input.sport ?? null,
      status: input.status ?? 'active',
    })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export interface GroupRow {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  memberCount: number;
  updatedAt: string;
}

/** Grupos do coach + contagem de membros (contada no cliente). */
export async function fetchGroups(client: LunaClient, coachId: string): Promise<GroupRow[]> {
  const { data, error } = await client.from('groups')
    .select('id,name,color,description,updated_at')
    .eq('coach_id', coachId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; name: string; color: string | null; description: string | null; updated_at: string }>;

  const counts = new Map<string, number>();
  const { data: members } = await client.from('group_members')
    .select('group_id')
    .eq('coach_id', coachId);
  for (const m of (members ?? []) as Array<{ group_id: string }>) {
    counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1);
  }

  return rows.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    description: g.description,
    memberCount: counts.get(g.id) ?? 0,
    updatedAt: g.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// Perfil 360 do atleta (dados reais agregados)
// ---------------------------------------------------------------------------

export interface AthleteProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  sport: string | null;
  sex: string | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  status: AthleteStatus;
  statusNote: string | null;
  avatarUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  groupName: string | null;
  planName: string | null;
}

export interface AllergyRow { id: string; allergen: string; severity: string; reaction: string | null; notes: string | null }
export interface DocumentRow { id: string; name: string; docType: string | null; status: string; expiresOn: string | null }
export interface MetricRow { id: string; metricKey: string; value: number | null; textValue: string | null; unit: string | null; source: string; recordedAt: string }
export interface AthleteBookingRow { id: string; type: string; status: string; title: string | null; startsAt: string; endsAt: string; location: string | null }
export interface AthleteAssignmentRow { id: string; status: string; planName: string | null; startsOn: string | null; endsOn: string | null; notes: string | null }

export interface AthleteDetail {
  profile: AthleteProfile;
  allergies: AllergyRow[];
  documents: DocumentRow[];
  metrics: MetricRow[];
  bookings: AthleteBookingRow[];
  assignments: AthleteAssignmentRow[];
}

/** Dossier completo de um atleta, agregando dados reais de várias tabelas. */
export async function fetchAthleteProfile(client: LunaClient, coachId: string, athleteId: string): Promise<AthleteDetail> {
  const { data: a, error } = await client.from('athletes')
    .select('id,name,email,phone,sport,sex,birth_date,height_cm,weight_kg,status,status_note,avatar_url,current_plan_id,notes,created_at,updated_at')
    .eq('coach_id', coachId)
    .eq('id', athleteId)
    .single();
  if (error) throw error;
  const row = a as Athlete;

  let planName: string | null = null;
  if (row.current_plan_id) {
    const { data: plan } = await client.from('plans').select('name').eq('id', row.current_plan_id).maybeSingle();
    planName = (plan as { name: string } | null)?.name ?? null;
  }

  let groupName: string | null = null;
  const { data: gm } = await client.from('group_members').select('group_id').eq('athlete_id', athleteId).limit(1);
  const groupId = (gm ?? [])[0]?.group_id as string | undefined;
  if (groupId) {
    const { data: g } = await client.from('groups').select('name').eq('id', groupId).maybeSingle();
    groupName = (g as { name: string } | null)?.name ?? null;
  }

  const [allergiesRes, documentsRes, metricsRes, bookingsRes, assignmentsRes] = await Promise.all([
    client.from('athlete_allergies').select('id,allergen,severity,reaction,notes').eq('athlete_id', athleteId).order('severity', { ascending: true }),
    client.from('athlete_documents').select('id,name,doc_type,status,expires_on').eq('athlete_id', athleteId).order('updated_at', { ascending: false }),
    client.from('athlete_metrics').select('id,metric_key,value,text_value,unit,source,recorded_at').eq('athlete_id', athleteId).order('recorded_at', { ascending: false }).limit(40),
    client.from('bookings').select('id,type,status,title,starts_at,ends_at,location').eq('athlete_id', athleteId).order('starts_at', { ascending: false }).limit(40),
    client.from('assignments').select('id,status,plan_id,starts_on,ends_on,notes').eq('athlete_id', athleteId).order('updated_at', { ascending: false }).limit(40),
  ]);

  const planIds = [...new Set(((assignmentsRes.data ?? []) as Array<{ plan_id: string | null }>).map((x) => x.plan_id).filter(Boolean) as string[])];
  const planNames = new Map<string, string>();
  if (planIds.length) {
    const { data: plans } = await client.from('plans').select('id,name').in('id', planIds);
    for (const p of (plans ?? []) as Array<{ id: string; name: string }>) planNames.set(p.id, p.name);
  }

  return {
    profile: {
      id: row.id, name: row.name, email: row.email, phone: row.phone, sport: row.sport,
      sex: row.sex, birthDate: row.birth_date, heightCm: row.height_cm, weightKg: row.weight_kg,
      status: row.status, statusNote: row.status_note, avatarUrl: row.avatar_url, notes: row.notes,
      createdAt: row.created_at, updatedAt: row.updated_at, groupName, planName,
    },
    allergies: ((allergiesRes.data ?? []) as Array<{ id: string; allergen: string; severity: string; reaction: string | null; notes: string | null }>)
      .map((x) => ({ id: x.id, allergen: x.allergen, severity: x.severity, reaction: x.reaction, notes: x.notes })),
    documents: ((documentsRes.data ?? []) as Array<{ id: string; name: string; doc_type: string | null; status: string; expires_on: string | null }>)
      .map((x) => ({ id: x.id, name: x.name, docType: x.doc_type, status: x.status, expiresOn: x.expires_on })),
    metrics: ((metricsRes.data ?? []) as Array<{ id: string; metric_key: string; value: number | null; text_value: string | null; unit: string | null; source: string; recorded_at: string }>)
      .map((x) => ({ id: x.id, metricKey: x.metric_key, value: x.value, textValue: x.text_value, unit: x.unit, source: x.source, recordedAt: x.recorded_at })),
    bookings: ((bookingsRes.data ?? []) as Array<{ id: string; type: string; status: string; title: string | null; starts_at: string; ends_at: string; location: string | null }>)
      .map((x) => ({ id: x.id, type: x.type, status: x.status, title: x.title, startsAt: x.starts_at, endsAt: x.ends_at, location: x.location })),
    assignments: ((assignmentsRes.data ?? []) as Array<{ id: string; status: string; plan_id: string | null; starts_on: string | null; ends_on: string | null; notes: string | null }>)
      .map((x) => ({ id: x.id, status: x.status, planName: x.plan_id ? planNames.get(x.plan_id) ?? null : null, startsOn: x.starts_on, endsOn: x.ends_on, notes: x.notes })),
  };
}

export interface PlanLite { id: string; name: string }

/** Planos do coach para atribuição (id+nome). */
export async function fetchPlans(client: LunaClient, coachId: string): Promise<PlanLite[]> {
  const { data, error } = await client.from('plans')
    .select('id,name')
    .eq('coach_id', coachId)
    .is('archived_at', null)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string; name: string }>).map((p) => ({ id: p.id, name: p.name }));
}

/** Atribui um plano a vários atletas (uma assignment por atleta). Devolve o nº criado. */
export async function assignPlanToAthletes(client: LunaClient, coachId: string, planId: string, athleteIds: string[]): Promise<number> {
  if (athleteIds.length === 0) return 0;
  const rows = athleteIds.map((athleteId) => ({
    coach_id: coachId,
    target: 'athlete' as const,
    athlete_id: athleteId,
    plan_id: planId,
    status: 'active' as const,
  }));
  const { error } = await client.from('assignments').insert(rows);
  if (error) throw error;
  // Reflete o plano atual no atleta (best-effort).
  await client.from('athletes').update({ current_plan_id: planId }).in('id', athleteIds).eq('coach_id', coachId);
  return rows.length;
}

export interface NewGroupInput {
  name: string;
  description?: string | null;
  color?: string | null;
}

export async function createGroup(client: LunaClient, coachId: string, input: NewGroupInput): Promise<string> {
  const { data, error } = await client.from('groups')
    .insert({ coach_id: coachId, name: input.name, description: input.description ?? null, color: input.color ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

// ---------------------------------------------------------------------------
// Grupo 360 (dados reais agregados)
// ---------------------------------------------------------------------------

export interface GroupMemberRow {
  id: string;
  name: string;
  sport: string | null;
  status: AthleteStatus;
  avatarUrl: string | null;
  hasPlan: boolean;
}

export interface GroupProfile {
  id: string;
  name: string;
  color: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GroupDetail {
  profile: GroupProfile;
  members: GroupMemberRow[];
  assignments: AthleteAssignmentRow[];
}

/** Dossier coletivo de um grupo: perfil + membros + atribuições dos membros. */
export async function fetchGroupProfile(client: LunaClient, coachId: string, groupId: string): Promise<GroupDetail> {
  const { data: g, error } = await client.from('groups')
    .select('id,name,color,description,created_at,updated_at')
    .eq('coach_id', coachId)
    .eq('id', groupId)
    .single();
  if (error) throw error;
  const row = g as { id: string; name: string; color: string | null; description: string | null; created_at: string; updated_at: string };

  const { data: memberLinks } = await client.from('group_members')
    .select('athlete_id')
    .eq('coach_id', coachId)
    .eq('group_id', groupId);
  const athleteIds = ((memberLinks ?? []) as Array<{ athlete_id: string }>).map((m) => m.athlete_id);

  let members: GroupMemberRow[] = [];
  if (athleteIds.length) {
    const { data: athletesData } = await client.from('athletes')
      .select('id,name,sport,status,avatar_url,current_plan_id')
      .in('id', athleteIds)
      .eq('coach_id', coachId)
      .order('name', { ascending: true });
    members = ((athletesData ?? []) as Array<{ id: string; name: string; sport: string | null; status: AthleteStatus; avatar_url: string | null; current_plan_id: string | null }>)
      .map((a) => ({
        id: a.id,
        name: a.name,
        sport: a.sport,
        status: a.status,
        avatarUrl: a.avatar_url,
        hasPlan: Boolean(a.current_plan_id),
      }));
  }

  let assignments: AthleteAssignmentRow[] = [];
  if (athleteIds.length) {
    const { data: assignData } = await client.from('assignments')
      .select('id,status,plan_id,starts_on,ends_on,notes,athlete_id')
      .eq('coach_id', coachId)
      .in('athlete_id', athleteIds)
      .order('updated_at', { ascending: false })
      .limit(80);
    const planIds = [...new Set(((assignData ?? []) as Array<{ plan_id: string | null }>).map((x) => x.plan_id).filter(Boolean) as string[])];
    const planNames = new Map<string, string>();
    if (planIds.length) {
      const { data: plans } = await client.from('plans').select('id,name').in('id', planIds);
      for (const p of (plans ?? []) as Array<{ id: string; name: string }>) planNames.set(p.id, p.name);
    }
    assignments = ((assignData ?? []) as Array<{ id: string; status: string; plan_id: string | null; starts_on: string | null; ends_on: string | null; notes: string | null }>)
      .map((x) => ({
        id: x.id,
        status: x.status,
        planName: x.plan_id ? planNames.get(x.plan_id) ?? null : null,
        startsOn: x.starts_on,
        endsOn: x.ends_on,
        notes: x.notes,
      }));
  }

  return {
    profile: {
      id: row.id,
      name: row.name,
      color: row.color,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    members,
    assignments,
  };
}

/** IDs de atletas num grupo (para atribuição em massa). */
export async function fetchGroupMemberIds(client: LunaClient, coachId: string, groupId: string): Promise<string[]> {
  const { data, error } = await client.from('group_members')
    .select('athlete_id')
    .eq('coach_id', coachId)
    .eq('group_id', groupId);
  if (error) throw error;
  return ((data ?? []) as Array<{ athlete_id: string }>).map((m) => m.athlete_id);
}

/** Adiciona atletas a um grupo (ignora duplicados). */
export async function addGroupMembers(client: LunaClient, coachId: string, groupId: string, athleteIds: string[]): Promise<number> {
  if (athleteIds.length === 0) return 0;
  const existing = new Set(await fetchGroupMemberIds(client, coachId, groupId));
  const toAdd = athleteIds.filter((id) => !existing.has(id));
  if (toAdd.length === 0) return 0;
  const rows = toAdd.map((athleteId) => ({ coach_id: coachId, group_id: groupId, athlete_id: athleteId }));
  const { error } = await client.from('group_members').insert(rows);
  if (error) throw error;
  return rows.length;
}

/** Remove um atleta de um grupo. */
export async function removeGroupMember(client: LunaClient, coachId: string, groupId: string, athleteId: string): Promise<void> {
  const { error } = await client.from('group_members')
    .delete()
    .eq('coach_id', coachId)
    .eq('group_id', groupId)
    .eq('athlete_id', athleteId);
  if (error) throw error;
}

/** Atribui um plano a todos os membros do grupo. */
export async function assignPlanToGroup(client: LunaClient, coachId: string, groupId: string, planId: string): Promise<number> {
  const ids = await fetchGroupMemberIds(client, coachId, groupId);
  return assignPlanToAthletes(client, coachId, planId, ids);
}
