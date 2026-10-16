import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboardKpis, fetchTodayBookings, wallClock, type DashboardBooking, type DashboardKpis } from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { Svg } from '../app/Svg';
import { getSupabaseClient } from '../lib/supabase';
import { captureEvent } from '../lib/observability';
import { t, vocab } from '../lib/vocab';

const TYPE_LABEL: Record<string, string> = {
  training: t('sessao', { maiuscula: true }), consultation: 'Consulta',
  class: t('aula', { maiuscula: true }), assessment: 'Avaliação', other: 'Marcação',
};

const WD_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WD_MINI = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

const STATUS_LABEL: Record<DashboardBooking['status'], string> = {
  pending: 'por confirmar', confirmed: 'confirmada', cancelled: 'cancelada', completed: 'concluída',
  no_show: 'faltou', waitlisted: 'em espera',
};

function greeting(h: number) { return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }

function bkClass(b: DashboardBooking) {
  if (b.status === 'pending' || b.status === 'waitlisted') return 'st-urgent';
  if (b.status === 'completed') return 'st-completed';
  if (b.status === 'cancelled' || b.status === 'no_show') return 'st-pending';
  return 'st-confirmed';
}

/** Hoje (G-01, versão PT): as minhas sessões e a carteira num relance. */
export function Today() {
  const navigate = useNavigate();
  const scope = useScope();
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchDashboardKpis(client, scope), fetchTodayBookings(client, scope)])
      .then(([k, b]) => {
        if (cancelled) return;
        setKpis(k); setBookings(b); setError(null);
        captureEvent('dashboard_loaded', { today: k.today, pending: k.pending });
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar o dia'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope]);

  // Data e hora no fuso da organização, não no do aparelho
  const now = new Date();
  const wall = wallClock(now, scope.timezone);
  const localDay = new Date(Date.UTC(wall.year, wall.month - 1, wall.day));
  const dateStr = `${WD_LONG[localDay.getUTCDay()]}, ${wall.day} de ${MONTHS[wall.month - 1]}`;
  const pendingCount = kpis?.pending ?? 0;
  const urgent = bookings.filter((b) => b.status === 'pending' || b.status === 'waitlisted').length;

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    if (filter === 'urgent') return bookings.filter((b) => b.status === 'pending' || b.status === 'waitlisted');
    return bookings.filter((b) => b.type === filter);
  }, [bookings, filter]);

  const miniCal = useMemo(() => {
    const y = wall.year; const m = wall.month - 1;
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const fw = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < fw; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    return cells;
  }, [wall.year, wall.month]);

  const stats = [
    { k: 'today', v: kpis?.today, l: 'Marcações hoje', ic: 'cal', act: () => navigate('/schedule') },
    { k: 'pending', v: kpis?.pending, l: 'Por confirmar', ic: 'clock', act: () => setFilter('urgent') },
    { k: 'urgent', v: kpis ? urgent : undefined, l: 'Urgente', ic: 'alert', act: () => setFilter('urgent') },
    { k: 'athletes', v: kpis?.clients, l: `${vocab.pessoa({ plural: true, maiuscula: true })} ativos`, ic: 'users', act: () => navigate('/clients') },
  ];

  const filters: [string, string][] = [
    ['all', 'Todas'], ['training', t('sessao', { plural: true, maiuscula: true })], ['consultation', 'Consultas'], ['urgent', 'Urgentes'],
  ];

  const bkBtn = (b: DashboardBooking) => {
    if (b.status === 'completed') return <button className="dash-bk-btn done" aria-label="Concluída" onClick={() => navigate('/schedule')}><Svg name="check" /></button>;
    if (b.status === 'pending') return <button className="dash-bk-btn ok" onClick={() => navigate('/schedule')}><Svg name="check" /> OK</button>;
    if (b.type === 'training' && b.status === 'confirmed') return <button className="dash-bk-btn live" onClick={() => navigate(`/live/${b.id}`)}><Svg name="play" /> Iniciar</button>;
    return <button className="dash-bk-btn see" onClick={() => navigate('/schedule')}>Ver</button>;
  };

  const boardContent = (
    <>
      <div className="board-card">
        <div className="board-title">{MONTHS[wall.month - 1][0].toUpperCase() + MONTHS[wall.month - 1].slice(1)}</div>
        <div className="dash-mini-cal" style={{ marginTop: 10 }}>
          {WD_MINI.map((w, i) => <div key={`wd-${i}`} className="dash-mc-wd">{w}</div>)}
          {miniCal.map((d, i) => d == null
            ? <div key={`o-${i}`} className="dash-mc-d out" />
            : <button type="button" key={`d-${d}`} className={`dash-mc-d${d === wall.day ? ' today' : ''}`} aria-label={`Dia ${d}`} onClick={() => navigate('/schedule')}>{d}</button>)}
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Alertas</div>
        {urgent > 0 && (
          <div className="dash-alert urgent" style={{ marginTop: 8 }}>
            <div className="dash-alert-ic"><Svg name="alert" /></div>
            <div className="dash-alert-b"><div className="dash-alert-t">{urgent} por confirmar hoje</div><div className="dash-alert-d">Marcações à espera de aprovação</div></div>
            <button className="dash-alert-go" onClick={() => navigate('/schedule')}>Ver</button>
          </div>
        )}
        {pendingCount > 0 && (
          <div className="dash-alert warn">
            <div className="dash-alert-ic"><Svg name="clock" /></div>
            <div className="dash-alert-b"><div className="dash-alert-t">{pendingCount} por confirmar</div><div className="dash-alert-d">Nas tuas próximas marcações</div></div>
            <button className="dash-alert-go" onClick={() => navigate('/schedule')}>Ver</button>
          </div>
        )}
        {kpis && urgent === 0 && pendingCount === 0 && (
          <div className="dash-alert info">
            <div className="dash-alert-ic"><Svg name="check" /></div>
            <div className="dash-alert-b"><div className="dash-alert-t">Tudo em ordem</div><div className="dash-alert-d">Sem alertas neste momento</div></div>
          </div>
        )}
      </div>
    </>
  );

  return (
    <CoachShell
      headStrong="Hoje"
      headSub={`${scope.orgName} · o teu dia num relance`}
      topActions={<button className="btn primary" onClick={() => navigate('/schedule')}>+ Marcar</button>}
      board={boardContent}
    >
      <div className="dash-root">
        {/* Cabeçalho / saudação */}
        <div className="dash-head">
          <div className="dash-head-l">
            <div className="dash-head-icon"><Svg name="home" /></div>
            <div style={{ minWidth: 0 }}>
              <div className="dash-kicker">Hoje</div>
              <div className="dash-title">{greeting(wall.hour)}</div>
              <div className="dash-head-sub">{dateStr}</div>
            </div>
          </div>
          <div className="dash-head-r">
            <button className="dash-icob" title="Horário" aria-label="Horário" onClick={() => navigate('/schedule')}><Svg name="cal" /></button>
            <button className="btn primary" onClick={() => navigate('/schedule')}>+ Marcar</button>
          </div>
        </div>

        {error && (
          <div className="dash-empty" role="alert"><Svg name="alert" /><h4>Não foi possível carregar o dia</h4><p>{error}</p>
            <button className="btn ghost" onClick={() => window.location.reload()}>Tentar de novo</button></div>
        )}

        {/* Quick stats */}
        <div className="dash-stats">
          {stats.map((s) => (
            <div key={s.k} className={`dash-stat s-${s.k}`} onClick={s.act} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.act(); } }}>
              <div className="dash-stat-top"><div className="dash-stat-ic"><Svg name={s.ic} /></div></div>
              {/* Sem dados = traço, nunca um zero falso */}
              <div className="dash-stat-v">{loading ? '…' : s.v ?? '—'}</div>
              <div className="dash-stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Ações rápidas */}
        <div className="dash-qa">
          <button className="dash-qabtn qa-new" onClick={() => navigate('/clients?novo=1')}><span className="dash-qa-ic"><Svg name="plus" /></span> Novo {vocab.pessoa()}</button>
          <button className="dash-qabtn qa-book" onClick={() => navigate('/schedule')}><span className="dash-qa-ic"><Svg name="cal" /></span> Marcar</button>
          <button className="dash-qabtn qa-live" onClick={() => navigate('/live')}><span className="dash-qa-ic"><Svg name="play" /></span> Iniciar {vocab.sessao()}</button>
        </div>

        {/* Próximas marcações */}
        <div className="dash-sec">
          <h3>As minhas marcações de hoje</h3>
          <span className="cnt">{filtered.length}</span>
          <button className="dash-sec-act" onClick={() => navigate('/schedule')}>Ver horário →</button>
        </div>
        <div className="dash-filters">
          {filters.map(([id, label]) => (
            <button key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="dash-list">
          {loading
            ? <div className="dash-empty" aria-busy="true"><Svg name="clock" /><h4>A carregar…</h4></div>
            : error ? null : filtered.length === 0
              ? <div className="dash-empty"><Svg name="cal" /><h4>Sem marcações {filter === 'all' ? 'hoje' : 'neste filtro'}</h4><p>Usa «Marcar» para criar uma {vocab.sessao()} ou muda o filtro.</p></div>
              : filtered.map((b) => (
                <div key={b.id} className="dash-bk">
                  <div className={`dash-bk-card ${bkClass(b)}`}>
                    <div className="dash-bk-time"><b>{b.time}</b><span>início</span></div>
                    <div className="dash-bk-body">
                      <div className="dash-bk-name">{b.client ?? b.title ?? TYPE_LABEL[b.type]}</div>
                      <div className="dash-bk-sub"><span>{TYPE_LABEL[b.type] ?? b.type}</span><span>· {STATUS_LABEL[b.status]}</span></div>
                    </div>
                    <div className="dash-bk-r">{bkBtn(b)}<button className="dash-bk-more" aria-label="Mais opções" onClick={() => navigate('/schedule')}><Svg name="dots" /></button></div>
                  </div>
                </div>
              ))}
        </div>

        {/* Board em mobile (igual ao HTML: surge no fundo do conteúdo) */}
        <div className="dash-mobile-only">
          <div className="dash-sec" style={{ marginTop: 4 }}><h3>Resumo do dia</h3></div>
          {boardContent}
        </div>
      </div>
    </CoachShell>
  );
}
