import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchDashboardKpis, fetchTodayBookings, useAuthStore, type DashboardBooking, type DashboardKpis } from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { Svg } from '../app/Svg';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import { captureEvent } from '../lib/observability';

const TYPE_LABEL: Record<string, string> = {
  training: 'Treino', consultation: 'Consulta', competition: 'Competição',
  class: 'Aula', assessment: 'Avaliação', other: 'Marcação',
};

const WD_LONG = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WD_MINI = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

function greeting(h: number) { return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }

function bkClass(b: DashboardBooking) {
  if (b.type === 'competition') return 'st-competition';
  if (b.status === 'pending' || b.status === 'waitlisted') return 'st-urgent';
  if (b.status === 'completed') return 'st-completed';
  if (b.status === 'cancelled' || b.status === 'no_show') return 'st-pending';
  return 'st-confirmed';
}

export function Dashboard() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [bookings, setBookings] = useState<DashboardBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setLoading(false);
      setError('Supabase não ligado — reinicia o dev server (pnpm dev) após configurar .env.');
      return;
    }
    if (!userId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void Promise.all([fetchDashboardKpis(client, userId), fetchTodayBookings(client, userId)])
      .then(([k, b]) => {
        if (cancelled) return;
        setKpis(k); setBookings(b); setError(null);
        captureEvent('dashboard_loaded', { today: k.today, pending: k.pending });
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId]);

  const now = new Date();
  const dateStr = `${WD_LONG[now.getDay()]}, ${now.getDate()} de ${MONTHS[now.getMonth()]}`;
  const pendingCount = kpis?.pending ?? 0;
  const urgent = bookings.filter((b) => b.status === 'pending' || b.status === 'waitlisted').length;

  const filtered = useMemo(() => {
    if (filter === 'all') return bookings;
    if (filter === 'urgent') return bookings.filter((b) => b.status === 'pending' || b.status === 'waitlisted');
    return bookings.filter((b) => b.type === filter);
  }, [bookings, filter]);

  const miniCal = useMemo(() => {
    const y = now.getFullYear(); const m = now.getMonth();
    const dim = new Date(y, m + 1, 0).getDate();
    const fw = (new Date(y, m, 1).getDay() + 6) % 7;
    const cells: (number | null)[] = [];
    for (let i = 0; i < fw; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);
    return cells;
  }, [now]);

  const stats = [
    { k: 'today', v: kpis?.today ?? 0, l: 'Marcações hoje', ic: 'cal', act: () => navigate('/calendar') },
    { k: 'pending', v: kpis?.pending ?? 0, l: 'Pendentes', ic: 'clock', act: () => setFilter('urgent') },
    { k: 'urgent', v: urgent, l: 'Urgente', ic: 'alert', act: () => setFilter('urgent') },
    { k: 'athletes', v: kpis?.athletes ?? 0, l: 'Atletas ativos', ic: 'users', act: () => navigate('/athletes') },
  ];

  const filters: [string, string][] = [
    ['all', 'Todas'], ['training', 'Treinos'], ['consultation', 'Consultas'], ['competition', 'Comp.'], ['urgent', 'Urgentes'],
  ];

  const bkBtn = (b: DashboardBooking) => {
    if (b.status === 'completed') return <button className="dash-bk-btn done" onClick={() => navigate('/calendar')}><Svg name="check" /></button>;
    if (b.status === 'pending') return <button className="dash-bk-btn ok" onClick={() => navigate('/calendar')}><Svg name="check" /> OK</button>;
    if (b.type === 'training' && b.status === 'confirmed') return <button className="dash-bk-btn live" onClick={() => navigate('/live')}><Svg name="play" /> LIVE</button>;
    return <button className="dash-bk-btn see" onClick={() => navigate('/calendar')}>Ver</button>;
  };

  const boardContent = (
    <>
      <div className="board-card">
        <div className="board-title">{MONTHS[now.getMonth()][0].toUpperCase() + MONTHS[now.getMonth()].slice(1)}</div>
        <div className="dash-mini-cal" style={{ marginTop: 10 }}>
          {WD_MINI.map((w, i) => <div key={`wd-${i}`} className="dash-mc-wd">{w}</div>)}
          {miniCal.map((d, i) => d == null
            ? <div key={`o-${i}`} className="dash-mc-d out" />
            : <div key={`d-${d}`} className={`dash-mc-d${d === now.getDate() ? ' today' : ''}`} onClick={() => navigate('/calendar')}>{d}</div>)}
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Alertas</div>
        {urgent > 0 && (
          <div className="dash-alert urgent" style={{ marginTop: 8 }}>
            <div className="dash-alert-ic"><Svg name="alert" /></div>
            <div className="dash-alert-b"><div className="dash-alert-t">{urgent} por confirmar hoje</div><div className="dash-alert-d">Marcações à espera de aprovação</div></div>
            <button className="dash-alert-go" onClick={() => navigate('/calendar')}>Ver</button>
          </div>
        )}
        {pendingCount > 0 && (
          <div className="dash-alert warn">
            <div className="dash-alert-ic"><Svg name="clock" /></div>
            <div className="dash-alert-b"><div className="dash-alert-t">{pendingCount} pendente(s)</div><div className="dash-alert-d">No total da carteira</div></div>
            <button className="dash-alert-go" onClick={() => navigate('/calendar')}>Ver</button>
          </div>
        )}
        {urgent === 0 && pendingCount === 0 && (
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
      headStrong="Início · Centro de comando"
      headSub="O teu dia num relance — e ações a um toque."
      topActions={<button className="btn primary" onClick={() => navigate('/calendar')}>+ Agendar</button>}
      board={boardContent}
    >
      <div className="dash-root">
        {/* Cabeçalho / saudação */}
        <div className="dash-head">
          <div className="dash-head-l">
            <div className="dash-head-icon"><Svg name="home" /></div>
            <div style={{ minWidth: 0 }}>
              <div className="dash-kicker">Início · Centro de comando</div>
              <div className="dash-title">{greeting(now.getHours())}, Treinador</div>
              <div className="dash-head-sub">{dateStr}</div>
            </div>
          </div>
          <div className="dash-head-r">
            <button className="dash-icob" title="Calendário" onClick={() => navigate('/calendar')}><Svg name="cal" /></button>
            <button className="dash-icob" title="Notificações" onClick={() => navigate('/calendar')}>
              <Svg name="bell" />{pendingCount > 0 && <span className="nb">{pendingCount}</span>}
            </button>
            <button className="btn primary" onClick={() => navigate('/calendar')}>+ Agendar</button>
          </div>
        </div>

        {!isSupabaseConfigured() && (
          <div className="dash-empty"><Svg name="alert" /><h4>Configuração em falta</h4><p>Cria .env na raiz com VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY e reinicia.</p></div>
        )}
        {error && <div className="dash-empty"><Svg name="alert" /><h4>Erro ao carregar</h4><p>{error}</p></div>}

        {/* Quick stats */}
        <div className="dash-stats">
          {stats.map((s) => (
            <div key={s.k} className={`dash-stat s-${s.k}`} onClick={s.act} role="button" tabIndex={0}>
              <div className="dash-stat-top"><div className="dash-stat-ic"><Svg name={s.ic} /></div></div>
              <div className="dash-stat-v">{loading ? '…' : s.v}</div>
              <div className="dash-stat-l">{s.l}</div>
            </div>
          ))}
        </div>

        {/* Ações rápidas */}
        <div className="dash-qa">
          <button className="dash-qabtn qa-new" onClick={() => navigate('/athletes')}><span className="dash-qa-ic"><Svg name="plus" /></span> Novo Atleta</button>
          <button className="dash-qabtn qa-book" onClick={() => navigate('/calendar')}><span className="dash-qa-ic"><Svg name="cal" /></span> Agendar</button>
          <button className="dash-qabtn qa-live" onClick={() => navigate('/live')}><span className="dash-qa-ic"><Svg name="play" /></span> Live Session</button>
        </div>

        {/* Próximas marcações */}
        <div className="dash-sec">
          <h3>Próximas marcações</h3>
          <span className="cnt">{filtered.length}</span>
          <button className="dash-sec-act" onClick={() => navigate('/calendar')}>Ver calendário →</button>
        </div>
        <div className="dash-filters">
          {filters.map(([id, label]) => (
            <button key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
        <div className="dash-list">
          {loading
            ? <div className="dash-empty"><Svg name="clock" /><h4>A carregar…</h4></div>
            : filtered.length === 0
              ? <div className="dash-empty"><Svg name="cal" /><h4>Sem marcações {filter === 'all' ? 'hoje' : 'neste filtro'}</h4><p>Usa «Agendar» para criar uma sessão ou muda o filtro.</p></div>
              : filtered.map((b) => (
                <div key={b.id} className="dash-bk">
                  <div className={`dash-bk-card ${bkClass(b)}`}>
                    <div className="dash-bk-time"><b>{b.time}</b><span>início</span></div>
                    <div className="dash-bk-body">
                      <div className="dash-bk-name">{b.athlete}</div>
                      <div className="dash-bk-sub"><span>{TYPE_LABEL[b.type] ?? b.type}</span><span>· {b.status}</span></div>
                    </div>
                    <div className="dash-bk-r">{bkBtn(b)}<button className="dash-bk-more" onClick={() => navigate('/calendar')}><Svg name="dots" /></button></div>
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
