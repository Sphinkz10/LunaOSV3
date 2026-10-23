import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { EnumOf } from '../types/database';
import { dayBoundsInZone, timeInZone, todayInZone } from '../time';

/** Hoje (G-01): números e sessões do dia, no fuso da organização. */
export interface DashboardKpis { today: number; pending: number; clients: number }

export interface DashboardBooking {
  id: string;
  linkId: string | null;
  /** estudio, casa_cliente, parque ou online */
  local: string | null;
  client: string | null;
  title: string | null;
  time: string;
  type: string;
  status: EnumOf<'booking_status'>;
}

/** Contagens reais do membro ativo (as minhas sessões; carteira que vejo). */
export async function fetchDashboardKpis(client: LunaClient, scope: OrgScope, now = new Date()): Promise<DashboardKpis> {
  const { start, end } = dayBoundsInZone(todayInZone(scope.timezone, now), scope.timezone);
  const [todayRes, pendingRes, clientsRes] = await Promise.all([
    client.from('bookings').select('id', { count: 'exact', head: true })
      .eq('org_id', scope.orgId).eq('membership_id', scope.membershipId)
      .gte('starts_at', start).lt('starts_at', end).in('status', ['pending', 'confirmed', 'completed']),
    client.from('bookings').select('id', { count: 'exact', head: true })
      .eq('org_id', scope.orgId).eq('membership_id', scope.membershipId).eq('status', 'pending')
      .gte('starts_at', now.toISOString()),
    client.from('clients').select('id', { count: 'exact', head: true })
      .eq('org_id', scope.orgId).eq('status', 'active').eq('client_status', 'active').is('archived_at', null),
  ]);
  if (todayRes.error) throw todayRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (clientsRes.error) throw clientsRes.error;
  return { today: todayRes.count ?? 0, pending: pendingRes.count ?? 0, clients: clientsRes.count ?? 0 };
}

/** Sessões de hoje do membro ativo. */
export async function fetchTodayBookings(client: LunaClient, scope: OrgScope, now = new Date()): Promise<DashboardBooking[]> {
  const { start, end } = dayBoundsInZone(todayInZone(scope.timezone, now), scope.timezone);
  const { data, error } = await client.from('bookings')
    .select('id,link_id,title,starts_at,type,status,location_kind')
    .eq('org_id', scope.orgId).eq('membership_id', scope.membershipId)
    .gte('starts_at', start).lt('starts_at', end)
    .neq('status', 'cancelled')
    .order('starts_at', { ascending: true })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  const ids = [...new Set(rows.map((b) => b.link_id).filter((v): v is string => !!v))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: cl, error: e2 } = await client.from('clients').select('id,full_name').eq('org_id', scope.orgId).in('id', ids);
    if (e2) throw e2;
    for (const c of cl ?? []) names.set(c.id, c.full_name);
  }
  return rows.map((b) => ({
    id: b.id,
    linkId: b.link_id ?? null,
    local: (b as { location_kind?: string | null }).location_kind ?? null,
    client: b.link_id ? names.get(b.link_id) ?? null : null,
    title: b.title,
    time: timeInZone(b.starts_at, scope.timezone),
    type: b.type,
    status: b.status,
  }));
}
