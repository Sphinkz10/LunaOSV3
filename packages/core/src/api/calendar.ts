import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { BookingRow, EnumOf } from '../types/database';
import { fetchAllPages } from './orgQuery';
import { dayInZone, monthBoundsInZone } from '../time';

/**
 * Horário (G-09, G-10, G-11). Datas sempre no fuso da organização/unidade.
 * A agenda mostrada é a do membro ativo (membershipId) — quem tem
 * schedule.read_all pode pedir a de outro membro.
 */
export type DayState =
  | 'available' | 'booked' | 'pending' | 'blocked'
  | 'holiday' | 'dayoff' | 'vacation' | 'competition' | 'travel';

export type BookingType = EnumOf<'booking_type'>;
export type BookingStatus = EnumOf<'booking_status'>;
export type DayMarkerType = EnumOf<'day_marker_type'>;
export type WaitlistStatus = EnumOf<'waitlist_status'>;
export type Booking = BookingRow;

export interface DayMarker { id?: string; date: string; marker: DayMarkerType; title: string | null }

export interface NewBookingInput {
  clientId?: string | null;
  type: BookingType;
  /** Tipo de sessão da modalidade (pt_individual, …). */
  sessionType?: string | null;
  title?: string | null;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  /** Lotação da aula (ignorado fora de type=class). */
  capacity?: number | null;
  /** Por omissão, o membro ativo. */
  membershipId?: string;
}

const MARKER_STATE: Record<DayMarkerType, DayState> = {
  unavailable: 'blocked', holiday: 'holiday', off: 'dayoff', vacation: 'vacation',
  competition: 'competition', travel: 'travel',
};

/** Marcações do mês do membro (no fuso da organização). */
export async function fetchMonthBookings(
  client: LunaClient, scope: OrgScope, year: number, month0: number, membershipId = scope.membershipId,
): Promise<Booking[]> {
  const { start, end } = monthBoundsInZone(year, month0, scope.timezone);
  return fetchAllPages<Booking>((f, t) => client.from('bookings').select('*')
    .eq('org_id', scope.orgId)
    .eq('membership_id', membershipId)
    .gte('starts_at', start).lt('starts_at', end)
    .order('starts_at', { ascending: true })
    .range(f, t));
}

export async function fetchMonthMarkers(
  client: LunaClient, scope: OrgScope, year: number, month0: number, membershipId = scope.membershipId,
): Promise<DayMarker[]> {
  const first = `${year}-${String(month0 + 1).padStart(2, '0')}-01`;
  const last = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()).padStart(2, '0')}`;
  const { data, error } = await client.from('day_markers').select('id,date,marker,title')
    .eq('org_id', scope.orgId)
    .or(`membership_id.eq.${membershipId},membership_id.is.null`)
    .gte('date', first).lte('date', last)
    .limit(500);
  if (error) throw error;
  return (data ?? []) as DayMarker[];
}

export interface NewDayMarkerInput { date: string; marker: DayMarkerType; title?: string | null }

export async function createDayMarker(client: LunaClient, scope: OrgScope, input: NewDayMarkerInput): Promise<DayMarker> {
  const { data, error } = await client.from('day_markers').insert({
    org_id: scope.orgId, membership_id: scope.membershipId,
    date: input.date, marker: input.marker, title: input.title ?? null,
  }).select('id,date,marker,title').single();
  if (error) throw error;
  return data as DayMarker;
}

export async function deleteDayMarker(client: LunaClient, scope: OrgScope, id: string): Promise<void> {
  const { error } = await client.from('day_markers').delete().eq('org_id', scope.orgId).eq('id', id);
  if (error) throw error;
}

/** Estado de cada dia do mês (no fuso): marcador > confirmada > pendente > disponível. */
export function computeDayStates(
  year: number, month0: number, bookings: Pick<Booking, 'starts_at' | 'status'>[], markers: DayMarker[], tz: string,
): Map<number, DayState> {
  const states = new Map<number, DayState>();
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) states.set(d, 'available');
  const prefix = `${year}-${String(month0 + 1).padStart(2, '0')}-`;

  for (const b of bookings) {
    const local = dayInZone(b.starts_at, tz);
    if (!local.startsWith(prefix)) continue;
    const day = Number(local.slice(8, 10));
    const cur = states.get(day);
    if (b.status === 'confirmed' || b.status === 'completed') states.set(day, 'booked');
    else if ((b.status === 'pending' || b.status === 'waitlisted') && cur === 'available') states.set(day, 'pending');
  }
  for (const m of markers) {
    if (!m.date.startsWith(prefix)) continue;
    states.set(Number(m.date.slice(8, 10)), MARKER_STATE[m.marker]);
  }
  return states;
}

/** Espelha o EXCLUDE de sobreposição (só dentro da própria organização). */
export async function hasConflict(
  client: LunaClient, scope: OrgScope, startsAt: string, endsAt: string, ignoreId?: string,
  membershipId = scope.membershipId,
): Promise<boolean> {
  const { data, error } = await client.rpc('has_booking_conflict', {
    _org: scope.orgId, _membership: membershipId, _starts: startsAt, _ends: endsAt, _ignore: ignoreId ?? null,
  });
  if (error) throw error;
  return data === true;
}

export class BookingConflictError extends Error {
  constructor() { super('Conflito: já existe uma marcação que se sobrepõe a este horário.'); this.name = 'BookingConflictError'; }
}

/** Cria marcação após verificar conflito (o EXCLUDE no servidor é a garantia). */
export async function createBooking(client: LunaClient, scope: OrgScope, input: NewBookingInput): Promise<Booking> {
  const membershipId = input.membershipId ?? scope.membershipId;
  if (input.type !== 'class' && await hasConflict(client, scope, input.startsAt, input.endsAt, undefined, membershipId)) {
    throw new BookingConflictError();
  }
  const { data, error } = await client.from('bookings').insert({
    org_id: scope.orgId,
    membership_id: membershipId,
    link_id: input.clientId ?? null,
    type: input.type,
    session_type: input.sessionType ?? null,
    title: input.title ?? null,
    status: 'pending',
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    capacity: input.type === 'class' ? (input.capacity ?? null) : null,
    source: 'manual',
  }).select('*').single();
  if (error) {
    if ((error as { code?: string }).code === '23P01') throw new BookingConflictError();
    throw error;
  }
  return data;
}

export async function setBookingStatus(
  client: LunaClient, scope: OrgScope, bookingId: string, status: BookingStatus, cancelReason?: string | null,
): Promise<void> {
  const patch = status === 'cancelled' ? { status, cancel_reason: cancelReason ?? null } : { status };
  const { error } = await client.from('bookings').update(patch).eq('org_id', scope.orgId).eq('id', bookingId);
  if (error) throw error;
}

export interface ClientLite { id: string; name: string }

/** Clientes visíveis para seletores (id + nome). */
export async function fetchClientsLite(client: LunaClient, scope: OrgScope): Promise<ClientLite[]> {
  const rows = await fetchAllPages<{ id: string; full_name: string }>((f, t) => client.from('clients').select('id,full_name')
    .eq('org_id', scope.orgId).eq('status', 'active').is('archived_at', null)
    .order('full_name', { ascending: true }).range(f, t));
  return rows.map((a) => ({ id: a.id, name: a.full_name }));
}

/* ── Lista de espera (o trigger promove o primeiro do MESMO horário) ───── */

export interface WaitlistEntry {
  id: string; clientId: string; requestedStartsAt: string; priority: number; status: WaitlistStatus;
  promotedBookingId: string | null; createdAt: string;
}

export interface NewWaitlistInput { clientId: string; requestedStartsAt: string; priority?: number; classId?: string | null }

export async function fetchWaitlist(client: LunaClient, scope: OrgScope): Promise<WaitlistEntry[]> {
  const { data, error } = await client.from('waitlist')
    .select('id,link_id,requested_starts_at,priority,status,promoted_booking_id,created_at')
    .eq('org_id', scope.orgId)
    .in('status', ['waiting', 'promoted'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id, clientId: r.link_id, requestedStartsAt: r.requested_starts_at, priority: r.priority, status: r.status,
    promotedBookingId: r.promoted_booking_id, createdAt: r.created_at,
  }));
}

export async function addToWaitlist(client: LunaClient, scope: OrgScope, input: NewWaitlistInput): Promise<void> {
  const { error } = await client.from('waitlist').insert({
    org_id: scope.orgId,
    link_id: input.clientId,
    class_id: input.classId ?? null,
    membership_id: input.classId ? null : scope.membershipId,
    requested_starts_at: input.requestedStartsAt,
    priority: input.priority ?? 100,
    status: 'waiting',
  });
  if (error) throw error;
}

export async function setWaitlistStatus(client: LunaClient, scope: OrgScope, id: string, status: WaitlistStatus): Promise<void> {
  const { error } = await client.from('waitlist').update({ status }).eq('org_id', scope.orgId).eq('id', id);
  if (error) throw error;
}

/* ── Disponibilidade semanal (weekday: 0=Dom … 6=Sáb) ───────────────────── */

export interface AvailabilitySlot { id: string; weekday: number; startTime: string; endTime: string; isAvailable: boolean }
export interface NewAvailabilityInput { weekday: number; startTime: string; endTime: string; isAvailable?: boolean }

function mapAvailabilityRow(r: { id: string; weekday: number; start_time: string; end_time: string; is_available: boolean }): AvailabilitySlot {
  return { id: r.id, weekday: r.weekday, startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5), isAvailable: r.is_available };
}

export async function fetchAvailability(client: LunaClient, scope: OrgScope, membershipId = scope.membershipId): Promise<AvailabilitySlot[]> {
  const { data, error } = await client.from('availability').select('id,weekday,start_time,end_time,is_available')
    .eq('org_id', scope.orgId).eq('membership_id', membershipId)
    .order('weekday', { ascending: true }).order('start_time', { ascending: true }).limit(200);
  if (error) throw error;
  return (data ?? []).map(mapAvailabilityRow);
}

export async function createAvailabilitySlot(client: LunaClient, scope: OrgScope, input: NewAvailabilityInput): Promise<AvailabilitySlot> {
  const { data, error } = await client.from('availability').insert({
    org_id: scope.orgId, membership_id: scope.membershipId,
    weekday: input.weekday, start_time: input.startTime, end_time: input.endTime, is_available: input.isAvailable ?? true,
  }).select('id,weekday,start_time,end_time,is_available').single();
  if (error) throw error;
  return mapAvailabilityRow(data);
}

export async function deleteAvailabilitySlot(client: LunaClient, scope: OrgScope, id: string): Promise<void> {
  const { error } = await client.from('availability').delete().eq('org_id', scope.orgId).eq('id', id);
  if (error) throw error;
}

/** Inscrições ativas numa aula (mesmo horário). */
export async function countClassEnrollments(client: LunaClient, scope: OrgScope, startsAt: string, endsAt: string): Promise<number> {
  const { count, error } = await client.from('bookings').select('id', { count: 'exact', head: true })
    .eq('org_id', scope.orgId).eq('type', 'class')
    .eq('starts_at', startsAt).eq('ends_at', endsAt)
    .not('link_id', 'is', null)
    .in('status', ['pending', 'confirmed']);
  if (error) throw error;
  return count ?? 0;
}
