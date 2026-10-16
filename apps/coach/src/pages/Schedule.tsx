import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addToWaitlist, BookingConflictError, computeDayStates, createAvailabilitySlot, createBooking, createDayMarker,
  dayInZone, deleteAvailabilitySlot, deleteDayMarker, fetchClientsLite, fetchAvailability, fetchMonthBookings,
  fetchMonthMarkers, fetchWaitlist, setBookingStatus, setWaitlistStatus, timeInZone, toast, wallClock, zonedToUtc,
  type ClientLite, type AvailabilitySlot, type Booking, type BookingType, type DayMarker, type DayMarkerType,
  type DayState, type NewBookingInput, type WaitlistEntry,
} from '@luna/core';
import { Link, useSearchParams } from 'react-router-dom';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { t, vocab } from '../lib/vocab';

const P1 = vocab.pessoa({ maiuscula: true });
const p1 = vocab.pessoa();
import { ProtoModal } from '../app/ProtoModal';
import { Svg } from '../app/Svg';
import { getSupabaseClient } from '../lib/supabase';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAY_DB = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const TYPE_LABELS: Record<BookingType, string> = {
  training: t('sessao', { maiuscula: true }), consultation: 'Consulta',
  class: t('aula', { maiuscula: true }), assessment: 'Avaliação', other: 'Outro',
};
const MARKER_LABELS: Record<DayMarkerType, string> = {
  unavailable: 'Indisponível', holiday: 'Feriado', off: 'Folga',
  vacation: 'Férias', competition: 'Competição', travel: 'Viagem',
};
const BOOKING_STATUS_LABEL: Record<string, string> = {
  pending: 'Por confirmar', confirmed: 'Confirmada', completed: 'Concluída',
  cancelled: 'Cancelada', no_show: 'Faltou', waitlisted: 'Em espera',
};

const STATE_META: Record<DayState, { label: string; color: string }> = {
  available: { label: 'Disponível', color: 'var(--cal-available)' },
  booked: { label: 'Confirmado', color: 'var(--cal-confirmed)' },
  pending: { label: 'Pendente', color: 'var(--cal-pending)' },
  blocked: { label: 'Indisponível', color: 'var(--cal-unavailable)' },
  holiday: { label: 'Feriado', color: 'var(--cal-holiday)' },
  dayoff: { label: 'Folga', color: 'var(--cal-off)' },
  vacation: { label: 'Férias', color: 'var(--cal-vacation)' },
  competition: { label: 'Competição', color: 'var(--cal-competition)' },
  travel: { label: 'Viagem', color: 'var(--cal-travel)' },
};
const STATE_CLASS: Record<DayState, string> = {
  available: 'available', booked: 'confirmed', pending: 'pending', blocked: 'unavailable',
  holiday: 'holiday', dayoff: 'off', vacation: 'vacation', competition: 'competition', travel: 'travel',
};
const TYPE_CAL: Record<string, { cls: string; icon: string }> = {
  training: { cls: 'training', icon: 'play' },
  consultation: { cls: 'consult', icon: 'user' },
  class: { cls: 'training', icon: 'users' },
  assessment: { cls: 'evaluation', icon: 'clipboard' },
  other: { cls: 'training', icon: 'cal' },
};
const typeCal = (t: string) => TYPE_CAL[t] ?? TYPE_CAL.other;
const TYPE_FILTERS: [string, string][] = [
  ['all', 'Todos'], ['training', t('sessao', { plural: true, maiuscula: true })], ['consultation', 'Consultas'],
  ['class', t('aula', { plural: true, maiuscula: true })], ['assessment', 'Aval.'],
];
const VIEW_SEG: [string, string][] = [['month', 'Mês'], ['week', 'Semana'], ['day', 'Dia'], ['agenda', 'Agenda']];

/** Datas sempre no fuso da organização, nunca no do aparelho. */
let TZ = 'Europe/Lisbon';
function hhmm(iso: string): string {
  return timeInZone(iso, TZ);
}
function localDayNum(iso: string): number {
  return Number(dayInZone(iso, TZ).slice(8, 10));
}
/** 'YYYY-MM-DD' + 'HH:MM' no fuso da organização → ISO UTC. */
function zonedIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  return zonedToUtc(y, m, d, h, mi, TZ).toISOString();
}
function fmtLocal(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString('pt-PT', { ...opts, timeZone: TZ });
}
function firstWeekdayOffset(year: number, month0: number): number {
  return (new Date(year, month0, 1).getDay() + 6) % 7;
}
function bookingLabel(b: Booking): string {
  return b.title ?? TYPE_LABELS[b.type as BookingType];
}

/** Horário (G-09): a minha agenda no fuso da organização. */
export function Schedule() {
  const scope = useScope();
  TZ = scope.timezone;
  const nowWall = wallClock(new Date(), scope.timezone);
  const now = { getFullYear: () => nowWall.year, getMonth: () => nowWall.month - 1, getDate: () => nowWall.day };
  const [year, setYear] = useState(nowWall.year);
  const [month0, setMonth0] = useState(nowWall.month - 1);
  const [tab, setTab] = useState<'calendar' | 'availability' | 'waitlist'>('calendar');
  const [view, setView] = useState('month');
  const [typeFilter, setTypeFilter] = useState('all');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [markers, setMarkers] = useState<DayMarker[]>([]);
  const [athletes, setAthletes] = useState<ClientLite[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Botão + (G-00): /schedule?nova=1 abre logo a nova marcação
  const [modalOpen, setModalOpen] = useState(searchParams.get('nova') === '1');
  useEffect(() => {
    if (searchParams.get('nova') === '1') { setModalOpen(true); setSearchParams({}, { replace: true }); }
  }, [searchParams, setSearchParams]);
  const [markerOpen, setMarkerOpen] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [availOpen, setAvailOpen] = useState(false);
  const [detail, setDetail] = useState<Booking | null>(null);

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetchMonthBookings(client, scope, year, month0),
      fetchMonthMarkers(client, scope, year, month0),
      fetchClientsLite(client, scope),
      fetchWaitlist(client, scope),
      fetchAvailability(client, scope),
    ]).then(([b, m, a, w, av]) => {
      if (cancelled) return;
      setBookings(b); setMarkers(m); setAthletes(a); setWaitlist(w); setAvailability(av); setError(null);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar o horário');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, year, month0]);

  useEffect(() => load(), [load]);

  const dayStates = useMemo(
    () => computeDayStates(year, month0, bookings, markers, scope.timezone),
    [year, month0, bookings, markers, scope.timezone],
  );
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const offset = firstWeekdayOffset(year, month0);
  const athleteName = useMemo(() => new Map(athletes.map((a) => [a.id, a.name])), [athletes]);
  const markerByDay = useMemo(() => {
    const map = new Map<number, DayMarker>();
    for (const m of markers) map.set(new Date(`${m.date}T00:00:00Z`).getUTCDate(), m);
    return map;
  }, [markers]);
  const selectedMarker = selectedDay == null ? undefined : markerByDay.get(selectedDay);

  const bookingsByDay = useMemo(() => {
    const map = new Map<number, Booking[]>();
    for (const b of bookings) {
      const d = localDayNum(b.starts_at);
      (map.get(d) ?? map.set(d, []).get(d)!).push(b);
    }
    return map;
  }, [bookings]);

  const selectedDateBookings = selectedDay == null ? [] : (bookingsByDay.get(selectedDay) ?? []);

  const goPrev = () => { setSelectedDay(null); if (month0 === 0) { setYear(year - 1); setMonth0(11); } else setMonth0(month0 - 1); };
  const goNext = () => { setSelectedDay(null); if (month0 === 11) { setYear(year + 1); setMonth0(0); } else setMonth0(month0 + 1); };
  const onCreated = () => { setModalOpen(false); load(); };

  async function changeStatus(id: string, status: 'confirmed' | 'cancelled') {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await setBookingStatus(client, scope, id, status);
      toast({
        variant: status === 'confirmed' ? 'success' : 'info',
        title: status === 'confirmed' ? 'Marcação confirmada' : 'Marcação cancelada',
        description: status === 'cancelled' ? 'Se houver lista de espera para o horário, é promovida automaticamente.' : undefined,
      });
      setDetail(null); load();
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha na operação', description: e instanceof Error ? e.message : undefined });
    }
  }

  async function removeMarker(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await deleteDayMarker(client, scope, id);
      toast({ variant: 'info', title: 'Marcador removido' });
      load();
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha ao remover', description: e instanceof Error ? e.message : undefined });
    }
  }

  async function cancelWaitlist(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await setWaitlistStatus(client, scope, id, 'cancelled');
      toast({ variant: 'info', title: 'Removido da lista de espera' });
      load();
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha na operação', description: e instanceof Error ? e.message : undefined });
    }
  }

  async function removeAvailability(id: string) {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      await deleteAvailabilitySlot(client, scope, id);
      toast({ variant: 'info', title: 'Horário removido' });
      load();
    } catch (e) {
      toast({ variant: 'danger', title: 'Falha ao remover', description: e instanceof Error ? e.message : undefined });
    }
  }

  const filterEvs = (list: Booking[]) => (typeFilter === 'all' ? list : list.filter((b) => b.type === typeFilter));

  const evCard = (b: Booking) => {
    const tc = typeCal(b.type);
    return (
      <div key={b.id} className={`cal-evcard tr-${tc.cls}`} role="button" tabIndex={0}
        onClick={() => setDetail(b)} onKeyDown={(e) => { if (e.key === 'Enter') setDetail(b); }}>
        <div className="cal-evcard-ic"><Svg name={tc.icon} /></div>
        <div className="cal-evcard-body">
          <div className="cal-evcard-name">{b.link_id ? athleteName.get(b.link_id) ?? P1 : bookingLabel(b)}</div>
          <div className="cal-evcard-meta">{TYPE_LABELS[b.type as BookingType]}{b.status === 'pending' ? ' · pendente' : b.status === 'cancelled' ? ' · cancelada' : ''}</div>
        </div>
        <div className="cal-evcard-time">{hhmm(b.starts_at)}</div>
      </div>
    );
  };

  const isCurrentMonth = year === now.getFullYear() && month0 === now.getMonth();
  const monthView = (
    <div className="cal-grid-wrap">
      <div className="cal-weekdays">{WEEKDAYS.map((w) => <div key={w} className="cal-weekday">{w}</div>)}</div>
      <div className="cal-grid" role="grid" aria-label={`Calendário ${MONTHS[month0]} ${year}`}>
        {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} className="cal-cell out" aria-hidden />)}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const st = (dayStates.get(day) ?? 'available') as DayState;
          const evs = filterEvs(bookingsByDay.get(day) ?? []);
          const isToday = isCurrentMonth && day === now.getDate();
          return (
            <div key={day} role="button" tabIndex={0}
              className={`cal-cell s-${STATE_CLASS[st]}${isToday ? ' today' : ''}${selectedDay === day ? ' sel' : ''}`}
              onClick={() => setSelectedDay(day)} onKeyDown={(e) => { if (e.key === 'Enter') setSelectedDay(day); }}>
              <div className="cal-daynum">{day}{evs.length ? <span className="cal-count">{evs.length}</span> : null}</div>
              <div className="cal-evs">
                {evs.slice(0, 2).map((e) => (
                  <div key={e.id} className={`cal-ev t-${typeCal(e.type).cls}`}>{hhmm(e.starts_at)} {bookingLabel(e)}</div>
                ))}
                {evs.length > 2 ? <div className="cal-ev-more">+{evs.length - 2} mais</div> : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="cal-legend">
        {Object.values(STATE_META).map((m) => (
          <div key={m.label} className="cal-leg"><i style={{ background: m.color }} />{m.label}</div>
        ))}
      </div>
      {selectedDay != null && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <div className="cal-day-head">
            <h2>{selectedDay} de {MONTHS[month0]}</h2>
            {selectedMarker
              ? <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  <span className="cal-stpill sp-cancelled">{MARKER_LABELS[selectedMarker.marker]}{selectedMarker.title ? ` · ${selectedMarker.title}` : ''}</span>
                  <button className="btn ghost small" onClick={() => selectedMarker.id && void removeMarker(selectedMarker.id)}>Remover</button>
                </span>
              : <button className="btn secondary small" onClick={() => setMarkerOpen(true)}>Marcar dia (folga/férias…)</button>}
          </div>
          {selectedDateBookings.length === 0
            ? <p style={{ color: 'var(--muted)', fontSize: '.82rem' }}>Sem marcações neste dia. Usa <b>+ Novo evento</b> para criar.</p>
            : <div style={{ display: 'grid', gap: 8 }}>{selectedDateBookings.map(evCard)}</div>}
        </div>
      )}
    </div>
  );

  const agendaView = (() => {
    const list = filterEvs([...bookings]).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    const byDay = new Map<string, Booking[]>();
    for (const b of list) {
      const key = fmtLocal(b.starts_at, { weekday: 'long', day: '2-digit', month: 'long' });
      (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(b);
    }
    return (
      <div className="cal-grid-wrap">
        {list.length === 0
          ? <div className="cal-empty"><div className="cal-empty-ico"><Svg name="list" /></div><h4>Sem marcações este mês</h4><p>Cria a primeira em + Novo evento ou muda o filtro.</p></div>
          : <div className="cal-agenda">
              {[...byDay.entries()].map(([dayLabel, evs]) => (
                <div key={dayLabel}>
                  <div className="cal-agenda-day">{dayLabel}</div>
                  {evs.map(evCard)}
                </div>
              ))}
            </div>}
      </div>
    );
  })();

  const weekView = (() => {
    const base = selectedDay ?? now.getDate();
    const ref = new Date(year, month0, base);
    const monday = new Date(ref); monday.setDate(ref.getDate() - ((ref.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }).map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d; });
    return (
      <div className="cal-grid-wrap">
        <div className="cal-week">
          {days.map((d) => {
            const inMonth = d.getMonth() === month0;
            const dayBookings = inMonth ? filterEvs(bookingsByDay.get(d.getDate()) ?? []) : [];
            const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
            return (
              <div key={d.toISOString()} className={`cal-wcol${isToday ? ' today' : ''}`}>
                <div className="cal-wcol-h">
                  <div className="cal-wcol-day">{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
                  <div className="cal-wcol-num" style={inMonth ? undefined : { opacity: 0.4 }}>{d.getDate()}</div>
                </div>
                <div className="cal-wcol-body">
                  {dayBookings.length === 0
                    ? <div style={{ fontSize: '.66rem', color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>{inMonth ? 'livre' : ''}</div>
                    : dayBookings.map((b) => (
                        <button key={b.id} className={`cal-wev t-${typeCal(b.type).cls}`} onClick={() => setDetail(b)}>
                          <div className="tm">{hhmm(b.starts_at)}</div>{bookingLabel(b)}
                        </button>
                      ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  const focusDay = selectedDay ?? now.getDate();
  const focusDate = new Date(year, month0, focusDay);
  const focusWeekday = focusDate.getDay();
  const dayAvailability = availability.filter((a) => a.weekday === focusWeekday && a.isAvailable);
  const focusBookings = [...(bookingsByDay.get(focusDay) ?? [])].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );

  const dayBookingsFiltered = filterEvs(focusBookings);
  const dayMarker = markerByDay.get(focusDay);
  const dayView = (
    <div className="cal-grid-wrap">
      <div className="cal-day-head">
        <div>
          <h2>{focusDate.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
          {dayMarker && <div style={{ fontSize: '.8rem', color: 'var(--muted-hi)', marginTop: 3 }}>{MARKER_LABELS[dayMarker.marker]}{dayMarker.title ? ` · ${dayMarker.title}` : ''}</div>}
        </div>
        <button className="btn primary small" onClick={() => { setSelectedDay(focusDay); setModalOpen(true); }}>+ Novo evento</button>
      </div>
      {dayAvailability.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {dayAvailability.map((a) => <span key={a.id} className="cal-stpill sp-available">Livre {a.startTime}–{a.endTime}</span>)}
        </div>
      )}
      {dayBookingsFiltered.length === 0
        ? <div className="cal-empty"><div className="cal-empty-ico"><Svg name="cal" /></div><h4>Sem eventos neste dia</h4><p>Seleciona outro dia no Mês ou cria um evento.</p></div>
        : <div className="cal-day-tl">
            {Array.from({ length: 13 }).map((_, i) => {
              const h = 8 + i;
              const hh = `${String(h).padStart(2, '0')}:00`;
              const inHour = dayBookingsFiltered.filter((b) => wallClock(b.starts_at, TZ).hour === h);
              return (
                <div key={h} className="cal-tl-row">
                  <div className="cal-tl-time">{hh}</div>
                  <div className="cal-tl-slot">{inHour.map(evCard)}</div>
                </div>
              );
            })}
          </div>}
    </div>
  );

  const availabilityView = (
    <div className="cal-grid-wrap">
      <div className="cal-day-head">
        <div>
          <h2>Disponibilidade semanal</h2>
          <div style={{ fontSize: '.8rem', color: 'var(--muted-hi)', marginTop: 3 }}>Horários recorrentes — base para saber quando estás disponível.</div>
        </div>
        <button className="btn primary small" onClick={() => setAvailOpen(true)}>+ Adicionar horário</button>
      </div>
      {availability.length === 0
        ? <div className="cal-empty"><div className="cal-empty-ico"><Svg name="clock" /></div><h4>Sem horários definidos</h4><p>Adiciona blocos (ex.: Seg–Sex 08:00–19:00).</p></div>
        : <div style={{ display: 'grid', gap: 8 }}>
            {WEEKDAY_ORDER.map((wd) => {
              const slots = availability.filter((a) => a.weekday === wd);
              if (slots.length === 0) return null;
              return (
                <div key={wd}>
                  <div className="cal-agenda-day">{WEEKDAY_DB[wd]}</div>
                  {slots.map((s) => (
                    <div key={s.id} className="cal-evcard tr-physio" style={{ cursor: 'default' }}>
                      <div className="cal-evcard-ic"><Svg name="clock" /></div>
                      <div className="cal-evcard-body">
                        <div className="cal-evcard-name">{s.startTime} – {s.endTime}</div>
                        <div className="cal-evcard-meta">{s.isAvailable ? 'Disponível' : 'Indisponível'}</div>
                      </div>
                      <button className="btn ghost small" onClick={() => void removeAvailability(s.id)}>Remover</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>}
    </div>
  );

  const waitlistView = (
    <div className="cal-grid-wrap">
      <div className="cal-day-head">
        <div>
          <h2>Lista de espera</h2>
          <div style={{ fontSize: '.8rem', color: 'var(--muted-hi)', marginTop: 3 }}>Ao cancelar uma marcação cheia, o 1.º da lista é promovido automaticamente.</div>
        </div>
        <button className="btn primary small" onClick={() => setWaitlistOpen(true)}>+ Adicionar à lista</button>
      </div>
      {waitlist.length === 0
        ? <div className="cal-empty"><div className="cal-empty-ico"><Svg name="users" /></div><h4>Lista de espera vazia</h4><p>Adiciona um {p1} para um horário concorrido.</p></div>
        : <div style={{ display: 'grid', gap: 8 }}>
            {waitlist.map((w) => (
              <div key={w.id} className="cal-evcard" style={{ cursor: 'default' }}>
                <div className="cal-evcard-ic"><Svg name="user" /></div>
                <div className="cal-evcard-body">
                  <div className="cal-evcard-name">{athleteName.get(w.clientId) ?? P1}</div>
                  <div className="cal-evcard-meta">
                    {w.requestedStartsAt
                      ? fmtLocal(w.requestedStartsAt, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : 'Qualquer horário'} · prioridade {w.priority}
                  </div>
                </div>
                {w.status === 'promoted'
                  ? <span className="cal-stpill sp-available">Promovido</span>
                  : <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <span className="cal-stpill sp-pending">Em espera</span>
                      <button className="btn ghost small" onClick={() => void cancelWaitlist(w.id)}>Remover</button>
                    </span>}
              </div>
            ))}
          </div>}
    </div>
  );

  const waitingCount = waitlist.filter((w) => w.status === 'waiting').length;
  const calBody = tab === 'availability' ? availabilityView
    : tab === 'waitlist' ? waitlistView
      : view === 'week' ? weekView
        : view === 'day' ? dayView
          : view === 'agenda' ? agendaView
            : monthView;

  const content = (
    <div className="cal-root">
      <div className="cal-head">
        <div className="cal-head-l">
          <div className="cal-head-icon"><Svg name="cal" /></div>
          <div style={{ minWidth: 0 }}>
            <div className="cal-kicker">Horário</div>
            <div className="cal-title">Agenda &amp; Marcações</div>
            <div className="cal-head-sub">Sessões, consultas, férias e lista de espera — tudo num sítio.</div>
          </div>
        </div>
        <div className="cal-head-r">
          <button className="cal-icob" title={`Marcação de ${p1}`} aria-label={`Marcação de ${p1}`} onClick={() => setModalOpen(true)}><Svg name="user" /></button>
          <button className="cal-icob" title="Notificações"><Svg name="bell" /></button>
          <button className="btn primary" onClick={() => setModalOpen(true)}>+ Novo evento</button>
        </div>
      </div>

      <div className="cal-tabs">
        <button className={`cal-tab${tab === 'calendar' ? ' on' : ''}`} onClick={() => setTab('calendar')}><Svg name="grid" />Agenda</button>
        <button className={`cal-tab${tab === 'availability' ? ' on' : ''}`} onClick={() => setTab('availability')}><Svg name="clock" />Disponibilidade</button>
        <button className={`cal-tab${tab === 'waitlist' ? ' on' : ''}`} onClick={() => setTab('waitlist')}><Svg name="users" />Lista de espera{waitingCount ? <span className="cnt">{waitingCount}</span> : null}</button>
      </div>

      {tab === 'calendar' && (
        <>
          <div className="cal-nav">
            <div className="cal-nav-l">
              <button className="cal-navbtn" onClick={goPrev} aria-label="Mês anterior"><Svg name="chevL" /></button>
              <div className="cal-month">{MONTHS[month0]} {year}</div>
              <button className="cal-navbtn" onClick={goNext} aria-label="Mês seguinte"><Svg name="chevR" /></button>
              <button className="cal-today-btn" onClick={() => { setYear(now.getFullYear()); setMonth0(now.getMonth()); setSelectedDay(now.getDate()); }}>Hoje</button>
            </div>
            <div className="cal-viewseg">
              {VIEW_SEG.map(([v, l]) => (
                <button key={v} className={`cal-viewbtn${view === v ? ' on' : ''}`} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>
          </div>
          <div className="cal-typefilter" style={{ marginBottom: 13 }}>
            {TYPE_FILTERS.map(([id, l]) => (
              <button key={id} className={`chip${typeFilter === id ? ' on' : ''}`} onClick={() => setTypeFilter(id)}>{l}</button>
            ))}
          </div>
        </>
      )}

      {error && <div className="cal-empty"><div className="cal-empty-ico"><Svg name="alert" /></div><h4>Erro ao carregar</h4><p>{error}</p></div>}
      {loading
        ? <div className="cal-empty"><div className="cal-empty-ico"><Svg name="clock" /></div><h4>A carregar…</h4></div>
        : calBody}
    </div>
  );

  return (
    <>
      <CoachShell
        headStrong="Horário"
        headSub="Marcações, disponibilidade e lista de espera."
      >
        {content}
      </CoachShell>
      <NewBookingModal open={modalOpen} onClose={() => setModalOpen(false)} onCreated={onCreated}
        defaultDay={selectedDay} year={year} month0={month0} athletes={athletes} />
      <BookingDetailModal booking={detail} athleteName={athleteName} onClose={() => setDetail(null)}
        onConfirm={(id) => void changeStatus(id, 'confirmed')} onCancel={(id) => void changeStatus(id, 'cancelled')} />
      <DayMarkerModal open={markerOpen} onClose={() => setMarkerOpen(false)} onSaved={() => { setMarkerOpen(false); load(); }}
        day={selectedDay} year={year} month0={month0} />
      <WaitlistAddModal open={waitlistOpen} onClose={() => setWaitlistOpen(false)} onSaved={() => { setWaitlistOpen(false); load(); }}
        athletes={athletes} />
      <AvailabilityAddModal open={availOpen} onClose={() => setAvailOpen(false)} onSaved={() => { setAvailOpen(false); load(); }} />
    </>
  );
}

function DayMarkerModal({ open, onClose, onSaved, day, year, month0 }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  day: number | null; year: number; month0: number;
}) {
  const scope = useScope();
  const [marker, setMarker] = useState<DayMarkerType>('off');
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setMarker('off'); setTitle(''); setErr(null); } }, [open]);

  const dateStr = day == null ? '' : `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client || !dateStr) { setErr('Seleciona um dia primeiro.'); return; }
    setBusy(true); setErr(null);
    try {
      await createDayMarker(client, scope, { date: dateStr, marker, title: title || null });
      toast({ variant: 'success', title: 'Dia marcado', description: MARKER_LABELS[marker] });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao marcar dia');
    } finally {
      setBusy(false);
    }
  };

  const dateLabel = dateStr
    ? new Date(`${dateStr}T12:00:00`).toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short' })
    : '';

  return (
    <ProtoModal
      open={open}
      onClose={onClose}
      title={dateLabel ? `Marcar ${dateLabel}` : 'Marcar dia'}
      sub="Folga, férias, feriado ou indisponibilidade."
      size="sm"
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
      </>}
    >
      <div className="proto-form">
        <div className="field">
          <label htmlFor="dm-type">Tipo de marcador</label>
          <select id="dm-type" value={marker} onChange={(e) => setMarker(e.target.value as DayMarkerType)}>
            {Object.entries(MARKER_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dm-note">Nota (opcional)</label>
          <input id="dm-note" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Feriado nacional, viagem…" />
        </div>
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}

function WaitlistAddModal({ open, onClose, onSaved, athletes }: {
  open: boolean; onClose: () => void; onSaved: () => void; athletes: ClientLite[];
}) {
  const scope = useScope();
  const [athleteId, setAthleteId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState('100');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setAthleteId(''); setDate(''); setTime(''); setPriority('100'); setErr(null); } }, [open]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão Supabase.'); return; }
    if (!athleteId) { setErr(`Escolhe um ${p1}.`); return; }
    if (!date || !time) { setErr('Escolhe o dia e a hora pretendidos.'); return; }
    setBusy(true); setErr(null);
    try {
      const requestedStartsAt = zonedIso(date, time);
      await addToWaitlist(client, scope, { clientId: athleteId, requestedStartsAt, priority: Number(priority) || 100 });
      toast({ variant: 'success', title: 'Adicionado à lista de espera' });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao adicionar à lista');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal
      open={open}
      onClose={onClose}
      title="Adicionar à lista de espera"
      sub="Promove automaticamente quando uma vaga fica livre."
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'A adicionar…' : 'Adicionar'}</button>
      </>}
    >
      <div className="proto-form">
        <div className="field">
          <label htmlFor="wl-athlete">{P1}</label>
          <select id="wl-athlete" value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
            <option value="">— Escolher {p1} —</option>
            {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="wl-date">Data pretendida (opcional)</label>
            <input id="wl-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="wl-time">Hora (opcional)</label>
            <input id="wl-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="wl-priority">Prioridade</label>
          <input id="wl-priority" className="input" type="number" min={1} step={1} value={priority} onChange={(e) => setPriority(e.target.value)} />
          <p className="board-sub" style={{ marginTop: 6 }}>Menor número = maior prioridade na promoção.</p>
        </div>
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}

/** Tipos de marcação que abrem uma sessão Live. */
const LIVE_TYPES = new Set<string>(['training', 'class', 'assessment']);

function BookingDetailModal({ booking, athleteName, onClose, onConfirm, onCancel }: {
  booking: Booking | null; athleteName: Map<string, string>;
  onClose: () => void; onConfirm: (id: string) => void; onCancel: (id: string) => void;
}) {
  if (!booking) return null;
  const who = booking.link_id ? athleteName.get(booking.link_id) ?? P1 : (booking.title ?? '—');
  const statusLabel = BOOKING_STATUS_LABEL[booking.status] ?? booking.status;
  return (
    <ProtoModal
      open={!!booking}
      onClose={onClose}
      title="Detalhe da marcação"
      sub={`${TYPE_LABELS[booking.type as BookingType]} · ${statusLabel}`}
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        {booking.status !== 'cancelled' && (
          <button type="button" className="btn secondary" onClick={() => onCancel(booking.id)}>Cancelar marcação</button>
        )}
        {booking.status === 'pending' && (
          <button type="button" className="btn primary" onClick={() => onConfirm(booking.id)}>Confirmar</button>
        )}
        {booking.status === 'confirmed' && LIVE_TYPES.has(booking.type) && (
          <Link className="btn primary" to={`/live/${booking.id}`}>Iniciar treino</Link>
        )}
      </>}
    >
      <div className="proto-form">
        <div className="mini-row"><span>Quem</span><b>{who}</b></div>
        <div className="mini-row"><span>Tipo</span><b>{TYPE_LABELS[booking.type as BookingType]}</b></div>
        <div className="mini-row"><span>Início</span><b>{fmtLocal(booking.starts_at, { dateStyle: 'medium', timeStyle: 'short' })}</b></div>
        <div className="mini-row"><span>Fim</span><b>{fmtLocal(booking.ends_at, { dateStyle: 'medium', timeStyle: 'short' })}</b></div>
        <div className="mini-row"><span>Estado</span><b>{statusLabel}</b></div>
        {booking.type === 'class' && booking.capacity != null && (
          <div className="mini-row"><span>Lotação</span><b>{booking.capacity} lugares</b></div>
        )}
      </div>
    </ProtoModal>
  );
}

function NewBookingModal({ open, onClose, onCreated, defaultDay, year, month0, athletes }: {
  open: boolean; onClose: () => void; onCreated: () => void;
  defaultDay: number | null; year: number; month0: number; athletes: ClientLite[];
}) {
  const scope = useScope();
  const day = defaultDay ?? 1;
  const dateStr = `${year}-${String(month0 + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const [date, setDate] = useState(dateStr);
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState('60');
  const [type, setType] = useState<BookingType>('training');
  const [athleteId, setAthleteId] = useState('');
  const [title, setTitle] = useState('');
  const [capacity, setCapacity] = useState('12');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setDate(dateStr); setErr(null); } }, [open, dateStr]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão Supabase.'); return; }
    setBusy(true); setErr(null);
    try {
      const startsAt = zonedIso(date, time);
      const endsAt = new Date(new Date(startsAt).getTime() + Number(duration) * 60_000).toISOString();
      const input: NewBookingInput = {
        clientId: athleteId || null, type, title: title || null, startsAt, endsAt,
        capacity: type === 'class' ? Number(capacity) || null : null,
      };
      await createBooking(client, scope, input);
      toast({ variant: 'success', title: 'Marcação criada', description: 'Fica pendente até confirmares.' });
      onCreated();
    } catch (e) {
      if (e instanceof BookingConflictError) setErr(e.message);
      else setErr(e instanceof Error ? e.message : 'Erro ao criar marcação');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal
      open={open}
      onClose={onClose}
      title="Nova marcação"
      sub="Fica pendente até confirmares. Conflitos de horário são bloqueados."
      size="lg"
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'A criar…' : 'Criar marcação'}</button>
      </>}
    >
      <div className="proto-form">
        <div className="field">
          <label htmlFor="bk-date">Data</label>
          <input id="bk-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="bk-time">Hora</label>
            <input id="bk-time" className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="bk-duration">Duração (min)</label>
            <input id="bk-duration" className="input" type="number" min={15} step={15} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="bk-type">Tipo</label>
            <select id="bk-type" value={type} onChange={(e) => setType(e.target.value as BookingType)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="bk-athlete">{P1} (opcional)</label>
            <select id="bk-athlete" value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
              <option value="">— Sem {p1} —</option>
              {athletes.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        {type === 'class' && (
          <div className="field">
            <label htmlFor="bk-capacity">Lotação da aula</label>
            <input id="bk-capacity" className="input" type="number" min={1} step={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            <p className="board-sub" style={{ marginTop: 6 }}>Aulas permitem várias inscrições no mesmo horário.</p>
          </div>
        )}
        <div className="field">
          <label htmlFor="bk-title">Título (opcional)</label>
          <input id="bk-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Avaliação inicial" />
        </div>
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}

function AvailabilityAddModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const scope = useScope();
  const [weekday, setWeekday] = useState('1');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('19:00');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setWeekday('1'); setStartTime('08:00'); setEndTime('19:00'); setErr(null); } }, [open]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão Supabase.'); return; }
    if (startTime >= endTime) { setErr('A hora de fim tem de ser depois do início.'); return; }
    setBusy(true); setErr(null);
    try {
      await createAvailabilitySlot(client, scope, {
        weekday: Number(weekday), startTime, endTime,
      });
      toast({ variant: 'success', title: 'Horário adicionado' });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao guardar horário');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal
      open={open}
      onClose={onClose}
      title="Adicionar horário semanal"
      sub="Repete todas as semanas. Usa vários blocos se tiveres pausa ao almoço."
      size="sm"
      footer={<>
        <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'A guardar…' : 'Guardar'}</button>
      </>}
    >
      <div className="proto-form">
        <div className="field">
          <label htmlFor="av-day">Dia da semana</label>
          <select id="av-day" value={weekday} onChange={(e) => setWeekday(e.target.value)}>
            {WEEKDAY_ORDER.map((wd) => <option key={wd} value={wd}>{WEEKDAY_DB[wd]}</option>)}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="av-start">Início</label>
            <input id="av-start" className="input" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="av-end">Fim</label>
            <input id="av-end" className="input" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}
