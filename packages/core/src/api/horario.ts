import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { AvailabilityRow, BookingRow, BookingRulesRow, EnumOf } from '../types/database';
import { zonedToUtc } from '../time';

/**
 * Horário (tarefa 07, F1a): semana por PT e sala (G-09), criar e editar sem
 * conflitos (G-10), disponibilidade da equipa (G-11) e marcar com o PT na app (C-06).
 */
export interface MarcacaoSemana {
  id: string; inicio: string; fim: string; titulo: string; tipo: EnumOf<'booking_type'>; estado: EnumOf<'booking_status'>;
  clienteId: string | null; cliente: string | null; membershipId: string | null; pt: string | null; salaId: string | null; sala: string | null;
  serieId: string | null; notas: string | null;
  confirmarAte: string | null; motivoCancelar: string | null; grupoId: string | null; origem: string;
}

export async function fetchSemana(client: LunaClient, scope: OrgScope, inicio: Date, dias = 7, incluirCanceladas = false): Promise<MarcacaoSemana[]> {
  const fim = new Date(inicio.getTime() + dias * 86_400_000);
  let q = client.from('bookings').select('*').eq('org_id', scope.orgId).neq('type', 'class')
    .gte('starts_at', inicio.toISOString()).lt('starts_at', fim.toISOString());
  if (!incluirCanceladas) q = q.neq('status', 'cancelled');
  const { data, error } = await q.order('starts_at').limit(2000);
  if (error) throw error;
  const rows = (data ?? []) as BookingRow[];
  const links = [...new Set(rows.map((r) => r.link_id).filter((x): x is string => !!x))];
  const membros = [...new Set(rows.map((r) => r.membership_id).filter((x): x is string => !!x))];
  const salas = [...new Set(rows.map((r) => r.room_id).filter((x): x is string => !!x))];
  const [c, m, s] = await Promise.all([
    links.length ? client.from('clients').select('id,full_name').in('id', links) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    membros.length ? client.from('staff').select('id,full_name').in('id', membros) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    salas.length ? client.from('rooms').select('id,name').in('id', salas) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  return rows.map((r) => ({
    id: r.id, inicio: r.starts_at, fim: r.ends_at, titulo: r.title ?? '', tipo: r.type, estado: r.status,
    clienteId: r.link_id, cliente: c.data?.find((x) => x.id === r.link_id)?.full_name ?? null,
    membershipId: r.membership_id, pt: m.data?.find((x) => x.id === r.membership_id)?.full_name ?? null,
    salaId: r.room_id, sala: s.data?.find((x) => x.id === r.room_id)?.name ?? null, serieId: r.series_id, notas: r.notes,
    confirmarAte: r.confirm_by, motivoCancelar: r.cancel_reason, grupoId: r.group_id, origem: r.source,
  }));
}

export async function conflitosAntes(client: LunaClient, scope: OrgScope, membershipId: string | null, salaId: string | null, inicio: string, fim: string, ignorar?: string | null): Promise<string[]> {
  const { data, error } = await client.rpc('schedule_conflicts', { _org: scope.orgId, _membership: membershipId, _room: salaId, _starts: inicio, _ends: fim, _ignore: ignorar ?? null });
  if (error) throw error;
  return (data ?? []).map((x) => x.motivo);
}

export interface MarcacaoEditavel {
  id?: string; membershipId: string; clienteId: string | null; salaId: string | null; tipo: EnumOf<'booking_type'>; titulo: string;
  dia: string; hora: string; minutos: number; notas: string; repetirAte?: string | null;
  /** Onde (locais do PT, T29A); undefined deixa como está. */
  local?: { tipo: 'estudio' | 'casa_cliente' | 'parque' | 'online'; texto: string | null } | null;
}

/** Hora local da organização → instante. */
export function instante(dia: string, hora: string, tz: string): Date {
  const [a, m, d] = dia.split('-').map(Number); const [h, mi] = hora.split(':').map(Number);
  return zonedToUtc(a, m, d, h, mi, tz);
}

export async function guardarMarcacao(client: LunaClient, scope: OrgScope, e: MarcacaoEditavel): Promise<number> {
  const ini = instante(e.dia, e.hora, scope.timezone);
  const fim = new Date(ini.getTime() + e.minutos * 60_000);
  const conflitos = await conflitosAntes(client, scope, e.membershipId, e.salaId, ini.toISOString(), fim.toISOString(), e.id);
  if (conflitos.length) throw new Error(conflitos[0]);
  if (!e.id && e.repetirAte) {
    const { data, error } = await client.rpc('create_booking_series', {
      _org: scope.orgId, _membership: e.membershipId, _link: e.clienteId, _room: e.salaId, _type: e.tipo, _title: e.titulo || null,
      _first: ini.toISOString(), _minutes: e.minutos, _until: e.repetirAte,
    });
    if (error) throw new Error(/conflito a/.test(error.message) ? `Uma das repetições tem conflito (${error.message.replace('conflito a ', '')}).` : error.message);
    return data as number;
  }
  const linha = {
    org_id: scope.orgId, membership_id: e.membershipId, link_id: e.clienteId, room_id: e.salaId, type: e.tipo, title: e.titulo || null,
    starts_at: ini.toISOString(), ends_at: fim.toISOString(), notes: e.notas || null,
    ...(e.local !== undefined ? { location_kind: e.local?.tipo ?? null, location: e.local?.texto ?? null } : {}),
  };
  const { error } = e.id ? await client.from('bookings').update(linha).eq('id', e.id)
    : await client.from('bookings').insert({ ...linha, status: 'confirmed', source: 'manual' });
  if (error) {
    if ((error as { code?: string }).code === '23P01') throw new Error('Conflito: a sala ou o PT já estão ocupados nessa hora.');
    throw error;
  }
  return 1;
}

/* ── Disponibilidade da equipa (G-11) ───────────────────────────────────── */
export interface DisponibilidadeMembro {
  membershipId: string; nome: string; papel: string;
  janelas: Pick<AvailabilityRow, 'id' | 'weekday' | 'start_time' | 'end_time' | 'kind'>[];
  ausencias: { id: string; data: string; tipo: EnumOf<'day_marker_type'> }[];
}
export async function fetchDisponibilidade(client: LunaClient, scope: OrgScope, de: string, ate: string): Promise<DisponibilidadeMembro[]> {
  const [st, av, dm] = await Promise.all([
    client.from('staff').select('id,full_name,title,status').eq('org_id', scope.orgId).eq('status', 'active').order('full_name'),
    client.from('availability').select('id,membership_id,weekday,start_time,end_time,kind,is_available').eq('org_id', scope.orgId).eq('is_available', true),
    client.from('day_markers').select('id,membership_id,date,marker').eq('org_id', scope.orgId).gte('date', de).lte('date', ate),
  ]);
  if (st.error) throw st.error;
  return (st.data ?? []).map((m) => ({
    membershipId: m.id, nome: m.full_name, papel: m.title ?? '',
    janelas: (av.data ?? []).filter((a) => a.membership_id === m.id).map((a) => ({ id: a.id, weekday: a.weekday, start_time: a.start_time.slice(0, 5), end_time: a.end_time.slice(0, 5), kind: a.kind })),
    ausencias: (dm.data ?? []).filter((d) => d.membership_id === m.id).map((d) => ({ id: d.id, data: d.date, tipo: d.marker })),
  }));
}
export async function juntarJanela(client: LunaClient, scope: OrgScope, membershipId: string, dia: number, de: string, ate: string, kind: 'turno' | 'marcacoes'): Promise<void> {
  const { error } = await client.from('availability').insert({ org_id: scope.orgId, membership_id: membershipId, weekday: dia, start_time: de, end_time: ate, kind });
  if (error) throw error;
}
export async function tirarJanela(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('availability').delete().eq('id', id);
  if (error) throw error;
}
/** Férias ou folga: bloqueia marcações e diz quantas já há nesses dias. */
export async function marcarAusencia(client: LunaClient, scope: OrgScope, membershipId: string, de: string, ate: string, tipo: 'vacation' | 'off'): Promise<number> {
  const dias: string[] = [];
  for (let d = new Date(`${de}T12:00:00Z`); d <= new Date(`${ate}T12:00:00Z`); d = new Date(d.getTime() + 86_400_000)) dias.push(d.toISOString().slice(0, 10));
  const { error } = await client.from('day_markers').insert(dias.map((date) => ({ org_id: scope.orgId, membership_id: membershipId, date, marker: tipo })));
  if (error) throw error;
  const { count } = await client.from('bookings').select('id', { count: 'exact', head: true }).eq('membership_id', membershipId)
    .in('status', ['pending', 'confirmed']).gte('starts_at', `${de}T00:00:00Z`).lte('starts_at', `${ate}T23:59:59Z`);
  return count ?? 0;
}

export interface SalaAgora { id: string; nome: string; lotacao: number | null; ocupadaAte: string | null; com: string | null }
export async function salasAgora(client: LunaClient, scope: OrgScope): Promise<SalaAgora[]> {
  const agora = new Date().toISOString();
  const [r, b] = await Promise.all([
    client.from('rooms').select('id,name,capacity').eq('org_id', scope.orgId).is('archived_at', null).order('name'),
    client.from('bookings').select('room_id,ends_at,title').eq('org_id', scope.orgId).in('status', ['pending', 'confirmed']).lte('starts_at', agora).gt('ends_at', agora).not('room_id', 'is', null),
  ]);
  if (r.error) throw r.error;
  return (r.data ?? []).map((s) => {
    const o = b.data?.find((x) => x.room_id === s.id);
    return { id: s.id, nome: s.name, lotacao: s.capacity, ocupadaAte: o?.ends_at ?? null, com: o?.title ?? null };
  });
}

export type RegrasMarcacao = Omit<BookingRulesRow, 'org_id' | 'updated_at'>;
export const REGRAS_PADRAO: RegrasMarcacao = {
  slot_minutes: 60, min_notice_hours: 12, cancel_hours: 24, auto_confirm: false, horizon_days: 21,
  no_show_counts: true, max_per_week: null, client_can_book: true, remind_24h: true, remind_2h: true, remind_sms: false, notify_pt: true,
};
export async function fetchRegras(client: LunaClient, scope: OrgScope): Promise<RegrasMarcacao> {
  const { data } = await client.from('booking_rules').select('slot_minutes,min_notice_hours,cancel_hours,auto_confirm,horizon_days,no_show_counts,max_per_week,client_can_book,remind_24h,remind_2h,remind_sms,notify_pt').eq('org_id', scope.orgId).maybeSingle();
  return data ?? REGRAS_PADRAO;
}
export async function guardarRegras(client: LunaClient, scope: OrgScope, r: RegrasMarcacao): Promise<void> {
  const { error } = await client.from('booking_rules').upsert({ org_id: scope.orgId, ...r, updated_at: new Date().toISOString() });
  if (error) throw error;
}

/* ── App do cliente: marcar com o meu PT (C-06) ─────────────────────────── */
export async function horasLivres(client: LunaClient, linkId: string, de: string, dias = 7): Promise<{ inicio: string; fim: string }[]> {
  const { data, error } = await client.rpc('my_pt_slots', { _link: linkId, _from: de, _days: dias });
  if (error) throw error;
  return data ?? [];
}
export async function marcarComPT(client: LunaClient, linkId: string, inicio: string): Promise<string> {
  const { data, error } = await client.rpc('book_my_pt', { _link: linkId, _starts: inicio });
  if (error) throw new Error(/já não está livre/.test(error.message) ? 'Esta hora acabou de ficar ocupada. Escolhe outra.' : error.message);
  return data as string;
}
export async function desmarcar(client: LunaClient, bookingId: string): Promise<'dentro_prazo' | 'conta'> {
  const { data, error } = await client.rpc('cancel_my_booking', { _booking: bookingId });
  if (error) throw error;
  return data as 'dentro_prazo' | 'conta';
}
export interface MinhaMarcacao { id: string; inicio: string; fim: string; titulo: string; estado: string; com: string | null; semContar: boolean; desmarcarAte: string; local: string | null }
export async function minhasMarcacoes(client: LunaClient): Promise<MinhaMarcacao[]> {
  const { data, error } = await client.rpc('my_bookings', {});
  if (error) throw error;
  return (data ?? []).map((b) => ({ id: b.id, inicio: b.inicio, fim: b.fim, titulo: b.titulo, estado: b.estado, com: b.com, semContar: b.pode_desmarcar_sem_contar, desmarcarAte: b.desmarcar_ate, local: b.local }));
}

/* ── App: avisos do cliente (lembretes e horas de silêncio) ─────────────── */
export interface MeusAvisos { lembretes: boolean; silencioDe: string; silencioAte: string }
export async function fetchMeusAvisos(client: LunaClient, userId: string): Promise<MeusAvisos> {
  const { data, error } = await client.from('user_settings').select('reminders_on,quiet_hours_start,quiet_hours_end').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return { lembretes: data?.reminders_on ?? true, silencioDe: (data?.quiet_hours_start ?? '22:00').slice(0, 5), silencioAte: (data?.quiet_hours_end ?? '08:00').slice(0, 5) };
}
export async function guardarMeusAvisos(client: LunaClient, userId: string, a: MeusAvisos): Promise<void> {
  const { error } = await client.from('user_settings').update({ reminders_on: a.lembretes, quiet_hours_start: a.silencioDe, quiet_hours_end: a.silencioAte }).eq('user_id', userId);
  if (error) throw error;
}

/* ── Funções antigas do horário (T24): prazo, cancelar com motivo, histórico ── */
/** Liberta as marcações por confirmar que passaram do prazo (também corre no agendador). */
export async function expirarPorConfirmar(client: LunaClient, scope: OrgScope): Promise<number> {
  const { data, error } = await client.rpc('expire_pending', { _org: scope.orgId });
  if (error) throw error;
  return (data as number) ?? 0;
}
export const MOTIVOS_CANCELAR = ['PT indisponível', 'Sala', 'Pedido do cliente', 'Outro'];
export async function cancelarMarcacao(client: LunaClient, scope: OrgScope, id: string, motivo: string, nota = ''): Promise<void> {
  const m = [motivo.trim(), nota.trim()].filter(Boolean).join(' · ');
  if (!m) throw new Error('Escolhe o motivo.');
  const { error } = await client.from('bookings').update({ status: 'cancelled', cancel_reason: m }).eq('org_id', scope.orgId).eq('id', id);
  if (error) throw error;
}
export interface EventoMarcacao { em: string; quem: string | null; oque: string; antes: string | null; depois: string | null; motivo: string | null }
export async function historicoMarcacao(client: LunaClient, bookingId: string): Promise<EventoMarcacao[]> {
  const { data, error } = await client.rpc('booking_history', { _booking: bookingId });
  if (error) throw error;
  return (data ?? []).map((e) => ({ em: e.em, quem: e.quem, oque: e.what, antes: e.before, depois: e.after, motivo: e.reason }));
}

/** Diferença à UTC (minutos) de um fuso numa data. */
export function desvioMinutos(instante: Date, tz: string): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(instante).reduce<Record<string, string>>((a, x) => ({ ...a, [x.type]: x.value }), {});
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return Math.round((local - instante.getTime()) / 60000);
}
/** O dia em que a hora muda neste intervalo (aaaa-mm-dd), ou null. */
export function mudancaDeHora(tz: string, de: Date, dias: number): string | null {
  let antes = desvioMinutos(new Date(de.getTime() + 12 * 3_600_000), tz);
  for (let i = 1; i <= dias; i++) {
    const d = new Date(de.getTime() + i * 86_400_000 + 12 * 3_600_000);
    const agora = desvioMinutos(d, tz);
    if (agora !== antes) return d.toISOString().slice(0, 10);
    antes = agora;
  }
  return null;
}

/** Vista Mês: quantas por dia e se há alguma por confirmar. */
export function contarPorDia(lista: MarcacaoSemana[], tz: string): Map<string, { n: number; porConfirmar: boolean }> {
  const m = new Map<string, { n: number; porConfirmar: boolean }>();
  for (const b of lista) {
    if (b.estado === 'cancelled') continue;
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(b.inicio));
    const x = m.get(p) ?? { n: 0, porConfirmar: false };
    m.set(p, { n: x.n + 1, porConfirmar: x.porConfirmar || b.estado === 'pending' });
  }
  return m;
}

/** Vista Lista: pesquisa por sessão, PT ou cliente e filtro por estado. */
export type FiltroLista = 'todas' | 'pending' | 'cancelled' | 'confirmed';
export function filtrarLista(lista: MarcacaoSemana[], q: string, estado: FiltroLista, clienteId: string | null): MarcacaoSemana[] {
  const t = q.trim().toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const n = (s: string | null) => (s ?? '').toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return lista.filter((b) => (estado === 'todas' ? true : b.estado === estado)
    && (!clienteId || b.clienteId === clienteId)
    && (!t || n(b.titulo).includes(t) || n(b.cliente).includes(t) || n(b.pt).includes(t) || n(b.sala).includes(t)));
}
