import type { LunaClient } from './client';
import { coachQuery } from './coachQuery';
import type { Booking } from '../types/database';

export interface DashboardKpis {
  today: number;
  pending: number;
  athletes: number;
}

export interface DashboardBooking {
  id: string;
  athlete: string;
  time: string;
  type: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed' | 'no_show' | 'waitlisted';
}

function todayBounds(): { start: string; end: string } {
  const d = new Date();
  const iso = d.toISOString().slice(0, 10);
  return { start: `${iso}T00:00:00`, end: `${iso}T23:59:59.999` };
}

/** P2.11 — KPIs reais do dashboard (coach_id explícito + contagens). */
export async function fetchDashboardKpis(client: LunaClient, coachId: string): Promise<DashboardKpis> {
  const { start, end } = todayBounds();
  const [todayRes, pendingRes, athletesRes] = await Promise.all([
    client.from('bookings').select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId).gte('starts_at', start).lte('starts_at', end),
    client.from('bookings').select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId).eq('status', 'pending'),
    client.from('athletes').select('*', { count: 'exact', head: true })
      .eq('coach_id', coachId).eq('status', 'active'),
  ]);
  if (todayRes.error) throw todayRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (athletesRes.error) throw athletesRes.error;
  return {
    today: todayRes.count ?? 0,
    pending: pendingRes.count ?? 0,
    athletes: athletesRes.count ?? 0,
  };
}

/** Marcações de hoje (lista curta para o dashboard). */
export async function fetchTodayBookings(client: LunaClient, coachId: string): Promise<DashboardBooking[]> {
  const { start, end } = todayBounds();
  const { data, error } = await coachQuery(client, 'bookings', coachId, {
    limit: 10,
    order: { column: 'starts_at', ascending: true },
  }).gte('starts_at', start).lte('starts_at', end);
  if (error) throw error;
  const rows = (data ?? []) as Booking[];
  const athleteIds = [...new Set(rows.map((b: Booking) => b.athlete_id).filter(Boolean))] as string[];
  let names = new Map<string, string>();
  if (athleteIds.length) {
    const { data: athletes } = await client.from('athletes').select('id,name').in('id', athleteIds);
    names = new Map((athletes ?? []).map((a: { id: string; name: string }) => [a.id, a.name]));
  }
  return rows.map((b: Booking) => ({
    id: b.id,
    athlete: b.athlete_id ? names.get(b.athlete_id) ?? 'Atleta' : b.title ?? 'Aula',
    time: new Date(b.starts_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }),
    type: b.type,
    status: b.status,
  }));
}
