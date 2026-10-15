import type { LunaClient } from './client';
import type { Booking, EnumOf } from '../types/database';

export type DayState =
  | 'available' | 'booked' | 'pending' | 'blocked'
  | 'holiday' | 'dayoff' | 'vacation' | 'competition' | 'travel';

export type BookingType = EnumOf<'booking_type'>;
export type BookingStatus = EnumOf<'booking_status'>;
export type DayMarkerType = EnumOf<'day_marker_type'>;
export type WaitlistStatus = EnumOf<'waitlist_status'>;

export interface DayMarker {
  id?: string;
  date: string;
  marker: DayMarkerType;
  title: string | null;
}

export interface NewBookingInput {
  athleteId?: string | null;
  type: BookingType;
  title?: string | null;
  startsAt: string; // ISO
  endsAt: string;   // ISO
  /** Lotacao da aula (ignorado fora de type=class). */
  capacity?: number | null;
}

/** marcador → estado do dia (precede marcações). */
const MARKER_STATE: Record<DayMarkerType, DayState> = {
  unavailable: 'blocked',
  holiday: 'holiday',
  off: 'dayoff',
  vacation: 'vacation',
  competition: 'competition',
  travel: 'travel',
};

export function monthBounds(year: number, month0: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month0 + 1, 0, 23, 59, 59, 999));
  return { start: start.toISOString(), end: end.toISOString() };
}

export function isoDay(d: string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Marcações do mês (coach_id explícito; limite seguro). */
export async function fetchMonthBookings(
  client: LunaClient, coachId: string, year: number, month0: number,
): Promise<Booking[]> {
  const { start, end } = monthBounds(year, month0);
  const { data, error } = await client.from('bookings')
    .select('*')
    .eq('coach_id', coachId)
    .gte('starts_at', start)
    .lte('starts_at', end)
    .order('starts_at', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as Booking[];
}

export async function fetchMonthMarkers(
  client: LunaClient, coachId: string, year: number, month0: number,
): Promise<DayMarker[]> {
  const { start, end } = monthBounds(year, month0);
  const { data, error } = await client.from('day_markers')
    .select('id,date,marker,title')
    .eq('coach_id', coachId)
    .gte('date', start.slice(0, 10))
    .lte('date', end.slice(0, 10))
    .limit(200);
  if (error) throw error;
  return (data ?? []) as DayMarker[];
}

export interface NewDayMarkerInput {
  date: string; // YYYY-MM-DD
  marker: DayMarkerType;
  title?: string | null;
}

/** Marca um dia (feriado/folga/férias/competição/viagem/indisponível). */
export async function createDayMarker(
  client: LunaClient, coachId: string, input: NewDayMarkerInput,
): Promise<DayMarker> {
  const { data, error } = await client.from('day_markers').insert({
    coach_id: coachId, date: input.date, marker: input.marker, title: input.title ?? null,
  }).select('id,date,marker,title').single();
  if (error) throw error;
  return data as DayMarker;
}

export async function deleteDayMarker(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('day_markers').delete().eq('id', id);
  if (error) throw error;
}

/** Estado de cada dia do mês: marcador > confirmada > pendente > disponível. */
export function computeDayStates(
  year: number, month0: number, bookings: Booking[], markers: DayMarker[],
): Map<number, DayState> {
  const states = new Map<number, DayState>();
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) states.set(d, 'available');

  for (const b of bookings) {
    const day = new Date(b.starts_at).getUTCDate();
    const cur = states.get(day);
    if (b.status === 'confirmed' || b.status === 'completed') states.set(day, 'booked');
    else if ((b.status === 'pending' || b.status === 'waitlisted') && cur === 'available') states.set(day, 'pending');
  }
  // marcadores têm prioridade visual
  for (const m of markers) {
    const day = new Date(`${m.date}T00:00:00Z`).getUTCDate();
    states.set(day, MARKER_STATE[m.marker]);
  }
  return states;
}

/** Espelha a regra SQL has_booking_conflict (EXCLUDE de sobreposição). */
export async function hasConflict(
  client: LunaClient, coachId: string, startsAt: string, endsAt: string, ignoreId?: string,
): Promise<boolean> {
  const { data, error } = await client.rpc('has_booking_conflict', {
    _coach: coachId, _starts: startsAt, _ends: endsAt, _ignore: ignoreId,
  });
  if (error) throw error;
  return data === true;
}

export class BookingConflictError extends Error {
  constructor() { super('Conflito: já existe uma marcação que se sobrepõe a este horário.'); this.name = 'BookingConflictError'; }
}

/** Cria marcação após verificar conflito (defense-in-depth com a guarda SQL). */
export async function createBooking(
  client: LunaClient, coachId: string, input: NewBookingInput,
): Promise<Booking> {
  if (await hasConflict(client, coachId, input.startsAt, input.endsAt)) {
    throw new BookingConflictError();
  }
  const { data, error } = await client.from('bookings').insert({
    coach_id: coachId,
    athlete_id: input.athleteId ?? null,
    type: input.type,
    title: input.title ?? null,
    status: 'pending',
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    capacity: input.type === 'class' ? (input.capacity ?? null) : null,
    source: 'manual',
  }).select('*').single();
  if (error) throw error;
  return data as Booking;
}

export async function setBookingStatus(
  client: LunaClient, bookingId: string, status: BookingStatus,
): Promise<void> {
  const { error } = await client.from('bookings').update({ status }).eq('id', bookingId);
  if (error) throw error;
}

export interface AthleteLite { id: string; name: string }

/** Atletas do coach para seletores (id+nome, ativos primeiro). */
export async function fetchAthletesLite(client: LunaClient, coachId: string): Promise<AthleteLite[]> {
  const { data, error } = await client.from('athletes')
    .select('id,name,status')
    .eq('coach_id', coachId)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return (data ?? []).map((a: { id: string; name: string }) => ({ id: a.id, name: a.name }));
}

// ---------------------------------------------------------------------------
// Lista de espera (auto-promoção: o trigger SQL promove o 1º ao cancelar a aula)
// ---------------------------------------------------------------------------

export interface WaitlistEntry {
  id: string;
  athleteId: string;
  requestedStartsAt: string | null;
  priority: number;
  status: WaitlistStatus;
  promotedBookingId: string | null;
  createdAt: string;
}

export interface NewWaitlistInput {
  athleteId: string;
  requestedStartsAt?: string | null;
  priority?: number;
}

/** Entradas em espera + recém-promovidas (prioridade asc, depois antiguidade). */
export async function fetchWaitlist(client: LunaClient, coachId: string): Promise<WaitlistEntry[]> {
  const { data, error } = await client.from('waitlist')
    .select('id,athlete_id,requested_starts_at,priority,status,promoted_booking_id,created_at')
    .eq('coach_id', coachId)
    .in('status', ['waiting', 'promoted'])
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r: {
    id: string; athlete_id: string; requested_starts_at: string | null;
    priority: number; status: WaitlistStatus; promoted_booking_id: string | null; created_at: string;
  }) => ({
    id: r.id, athleteId: r.athlete_id, requestedStartsAt: r.requested_starts_at,
    priority: r.priority, status: r.status, promotedBookingId: r.promoted_booking_id, createdAt: r.created_at,
  }));
}

export async function addToWaitlist(
  client: LunaClient, coachId: string, input: NewWaitlistInput,
): Promise<void> {
  const { error } = await client.from('waitlist').insert({
    coach_id: coachId,
    athlete_id: input.athleteId,
    requested_starts_at: input.requestedStartsAt ?? null,
    priority: input.priority ?? 100,
    status: 'waiting',
  });
  if (error) throw error;
}

export async function setWaitlistStatus(
  client: LunaClient, id: string, status: WaitlistStatus,
): Promise<void> {
  const { error } = await client.from('waitlist').update({ status }).eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Disponibilidade semanal recorrente (tabela availability)
// weekday: 0=Dom … 6=Sáb (igual à BD)
// ---------------------------------------------------------------------------

export interface AvailabilitySlot {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface NewAvailabilityInput {
  weekday: number;
  startTime: string; // HH:MM
  endTime: string;
  isAvailable?: boolean;
}

function mapAvailabilityRow(r: {
  id: string; weekday: number; start_time: string; end_time: string; is_available: boolean;
}): AvailabilitySlot {
  return {
    id: r.id, weekday: r.weekday,
    startTime: r.start_time.slice(0, 5), endTime: r.end_time.slice(0, 5),
    isAvailable: r.is_available,
  };
}

export async function fetchAvailability(client: LunaClient, coachId: string): Promise<AvailabilitySlot[]> {
  const { data, error } = await client.from('availability')
    .select('id,weekday,start_time,end_time,is_available')
    .eq('coach_id', coachId)
    .order('weekday', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(mapAvailabilityRow);
}

export async function createAvailabilitySlot(
  client: LunaClient, coachId: string, input: NewAvailabilityInput,
): Promise<AvailabilitySlot> {
  const { data, error } = await client.from('availability').insert({
    coach_id: coachId,
    weekday: input.weekday,
    start_time: input.startTime,
    end_time: input.endTime,
    is_available: input.isAvailable ?? true,
  }).select('id,weekday,start_time,end_time,is_available').single();
  if (error) throw error;
  return mapAvailabilityRow(data);
}

export async function deleteAvailabilitySlot(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('availability').delete().eq('id', id);
  if (error) throw error;
}

/** Conta inscrições confirmadas/pendentes numa aula (mesmo horário + tipo class). */
export async function countClassEnrollments(
  client: LunaClient, coachId: string, startsAt: string, endsAt: string,
): Promise<number> {
  const { count, error } = await client.from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .eq('type', 'class')
    .eq('starts_at', startsAt)
    .eq('ends_at', endsAt)
    .in('status', ['pending', 'confirmed']);
  if (error) throw error;
  return count ?? 0;
}
