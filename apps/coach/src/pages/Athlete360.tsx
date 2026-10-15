import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchAthleteProfile, useAuthStore, type AthleteDetail } from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { getSupabaseClient } from '../lib/supabase';

const STATUS_META: Record<string, { label: string; tone: string }> = {
  active: { label: 'Ativo', tone: 'bsuccess' },
  blocked: { label: 'Bloqueado', tone: 'bdanger' },
  return_to_play: { label: 'RTP', tone: 'bt' },
  injured: { label: 'Lesionado', tone: 'bwarn' },
  inactive: { label: 'Inativo', tone: 'bm' },
  archived: { label: 'Arquivado', tone: 'bm' },
};
const SEVERITY_LABEL: Record<string, string> = { critical: 'Crítica', severe: 'Grave', moderate: 'Moderada', mild: 'Ligeira' };
const DOC_STATUS_LABEL: Record<string, string> = { valid: 'Válido', expiring: 'A expirar', expired: 'Expirado', missing: 'Em falta', pending: 'Pendente' };
const BOOKING_TYPE_LABEL: Record<string, string> = { training: 'Treino', assessment: 'Avaliação', consultation: 'Consulta', competition: 'Competição', class: 'Aula', other: 'Outro' };
const BOOKING_STATUS_LABEL: Record<string, string> = { pending: 'Pendente', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado', no_show: 'Faltou', waitlisted: 'Em espera' };
const ASSIGN_STATUS_LABEL: Record<string, string> = { active: 'Ativo', scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' };

type TabId = 'principal' | 'saude' | 'analitica' | 'forms' | 'sessoes' | 'metricas' | 'timeline';
type HealthSubTab = 'resumo' | 'lesoes' | 'consultas' | 'relatorios' | 'exames' | 'cirurgias' | 'tratamentos' | 'alergias';

const HEALTH_SUBTABS: { id: HealthSubTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'lesoes', label: 'Lesões' },
  { id: 'consultas', label: 'Consultas' },
  { id: 'relatorios', label: 'Relatórios' },
  { id: 'exames', label: 'Exames' },
  { id: 'cirurgias', label: 'Cirurgias' },
  { id: 'tratamentos', label: 'Tratamentos' },
  { id: 'alergias', label: 'Alergias' },
];

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function SectionHead({ title, sub, source }: { title: string; sub: string; source: string }) {
  return (
    <div className="athlete360-section-head">
      <div><h2>{title}</h2><p>{sub}</p></div>
      <span className="source-pill">{source}</span>
    </div>
  );
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return <div className="athlete360-empty"><b>{title}</b><p style={{ marginTop: 6, fontSize: '.78rem' }}>{hint}</p></div>;
}

function buildAlerts(d: AthleteDetail) {
  const alerts: { icon: string; title: string; desc: string; source: string; date: string }[] = [];
  for (const al of d.allergies.filter((a) => a.severity === 'severe' || a.severity === 'critical')) {
    alerts.push({
      icon: '⚠',
      title: `Alergia ${SEVERITY_LABEL[al.severity] ?? al.severity}: ${al.allergen}`,
      desc: al.reaction ?? 'Rever antes de sessões e prescrições.',
      source: 'Saúde',
      date: '—',
    });
  }
  for (const doc of d.documents.filter((x) => x.status !== 'valid')) {
    alerts.push({
      icon: '▤',
      title: doc.name,
      desc: `${DOC_STATUS_LABEL[doc.status] ?? doc.status}${doc.expiresOn ? ` · expira ${fmtDate(doc.expiresOn)}` : ''}`,
      source: 'Documentos',
      date: doc.expiresOn ? fmtDate(doc.expiresOn) : '—',
    });
  }
  if (d.profile.statusNote && (d.profile.status === 'blocked' || d.profile.status === 'injured')) {
    alerts.push({
      icon: '⌁',
      title: STATUS_META[d.profile.status]?.label ?? d.profile.status,
      desc: d.profile.statusNote,
      source: 'Perfil',
      date: fmtDate(d.profile.updatedAt),
    });
  }
  return alerts;
}

function healthCounts(d: AthleteDetail) {
  return {
    resumo: null as number | null,
    lesoes: d.profile.status === 'injured' || d.profile.status === 'return_to_play' ? 1 : 0,
    consultas: 0,
    relatorios: 0,
    exames: d.documents.length,
    cirurgias: 0,
    tratamentos: 0,
    alergias: d.allergies.length,
  };
}

function Athlete360Board({ d, tab }: { d: AthleteDetail; tab: TabId }) {
  const p = d.profile;
  const alerts = buildAlerts(d);
  const badDocs = d.documents.filter((x) => x.status !== 'valid').length;
  const nextBooking = d.bookings.filter((b) => new Date(b.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  return (
    <>
      <div className="board-card">
        <div className="a360-board-kicker">Atleta 360</div>
        <div className="board-title">{p.name}</div>
        <div className="board-sub">{[p.sport, p.groupName].filter(Boolean).join(' · ') || '—'}</div>
        <div style={{ marginTop: 8 }}>
          <span className={`badge ${STATUS_META[p.status]?.tone ?? 'bm'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
        </div>
      </div>

      {tab === 'saude' && (
        <div className="board-card">
          <div className="a360-board-kicker">Contexto da aba</div>
          <div className="board-title">Saúde</div>
          <div className="mini-row"><span>Alergias</span><b>{d.allergies.length}</b></div>
          <div className="mini-row"><span>Documentos</span><b>{d.documents.length}</b></div>
          <div className="mini-row"><span>Por resolver</span><b>{badDocs}</b></div>
          <div className="mini-row"><span>Estado clínico</span><b>{STATUS_META[p.status]?.label ?? p.status}</b></div>
          <div className="a360-board-pill">Saúde</div>
          <div className="a360-board-pill">Perfil 360</div>
        </div>
      )}

      <div className="board-card">
        <div className="board-title">Atenção</div>
        {alerts.length === 0 ? (
          <p className="board-sub" style={{ marginTop: 6 }}>Sem alertas clínicos registados.</p>
        ) : alerts.slice(0, 4).map((al) => (
          <div key={`${al.title}-${al.date}`} className="a360-board-alert">
            <b>{al.title}</b>
            <p>{al.desc}</p>
          </div>
        ))}
      </div>

      <div className="board-card">
        <div className="board-title">Leitura rápida</div>
        <div className="mini-row"><span>Plano</span><b>{p.planName ?? 'Sem plano'}</b></div>
        <div className="mini-row"><span>Docs pendentes</span><b>{badDocs}</b></div>
        <div className="mini-row"><span>Métricas</span><b>{d.metrics.length}</b></div>
        <div className="mini-row"><span>Próxima sessão</span><b>{nextBooking ? fmtDateTime(nextBooking.startsAt) : '—'}</b></div>
      </div>
    </>
  );
}

export function Athlete360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const [data, setData] = useState<AthleteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('principal');
  const [healthSub, setHealthSub] = useState<HealthSubTab>('resumo');

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !userId || !id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetchAthleteProfile(client, userId, id)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar atleta'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, id]);

  useEffect(() => load(), [load]);

  const p = data?.profile;
  const alerts = useMemo(() => (data ? buildAlerts(data) : []), [data]);
  const hCounts = useMemo(() => (data ? healthCounts(data) : null), [data]);

  const tabs: { id: TabId; label: string; count: number | null }[] = useMemo(() => {
    if (!data) return [];
    const healthTotal = data.allergies.length + data.documents.length;
    return [
      { id: 'principal', label: 'Principal', count: null },
      { id: 'saude', label: 'Saúde', count: healthTotal || null },
      { id: 'analitica', label: 'Analítica', count: null },
      { id: 'forms', label: 'Forms', count: null },
      { id: 'sessoes', label: 'Sessões', count: data.bookings.length || null },
      { id: 'metricas', label: 'Métricas', count: data.metrics.length || null },
      { id: 'timeline', label: 'Timeline', count: null },
    ];
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return [];
    const p2 = data.profile;
    const badDocs = data.documents.filter((x) => x.status !== 'valid').length;
    const injured = p2.status === 'injured' || p2.status === 'return_to_play' ? 1 : 0;
    const next = data.bookings.filter((b) => new Date(b.startsAt) >= new Date()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    const latestMetric = data.metrics[0];
    return [
      { k: 'Estado', v: STATUS_META[p2.status]?.label ?? p2.status, s: p2.statusNote ?? 'Operacional', tone: STATUS_META[p2.status]?.tone ?? 'bm' },
      { k: 'Lesões / RTP', v: String(injured), s: injured ? 'Requer acompanhamento' : 'Sem registo activo', tone: injured ? 'bdanger' : 'bsuccess' },
      { k: 'Docs pendentes', v: String(badDocs), s: badDocs ? 'Renovar ou validar' : 'Documentação OK', tone: badDocs ? 'bwarn' : 'bsuccess' },
      { k: 'Última métrica', v: latestMetric?.value != null ? String(latestMetric.value) : (latestMetric?.textValue ?? '—'), s: latestMetric?.metricKey ?? 'Sem registos', tone: 'bt' },
      { k: 'Próxima sessão', v: next ? fmtDate(next.startsAt) : '—', s: next ? (BOOKING_TYPE_LABEL[next.type] ?? next.type) : 'Sem marcações', tone: 'bt' },
      { k: 'Atribuições', v: String(data.assignments.length), s: p2.planName ?? 'Sem plano', tone: 'bt' },
    ];
  }, [data]);

  const clinicalNote = useMemo(() => {
    if (!data) return null;
    const severe = data.allergies.find((a) => a.severity === 'severe' || a.severity === 'critical');
    if (severe) return `Alergia ${SEVERITY_LABEL[severe.severity]?.toLowerCase() ?? severe.severity}: ${severe.allergen}. ${severe.reaction ?? 'Rever antes de prescrições.'}`;
    const badDoc = data.documents.find((d) => d.status !== 'valid');
    if (badDoc) return `Documento «${badDoc.name}»: ${DOC_STATUS_LABEL[badDoc.status] ?? badDoc.status}.`;
    if (data.profile.statusNote) return data.profile.statusNote;
    return null;
  }, [data]);

  const boardPanel = data ? <Athlete360Board d={data} tab={tab} /> : null;

  return (
    <CoachShell
      headStrong="Atleta 360"
      headSub={p ? `${p.name} · dossier de consulta` : 'A carregar…'}
      layoutClassName="athlete-mode"
      board={boardPanel}
    >
      <div className="athlete360-main">
        {loading && <div className="empty"><b>A carregar…</b></div>}
        {error && <div className="empty"><b>Erro ao carregar</b><p>{error}</p></div>}

        {p && data && !loading && (
          <>
            <div className="a360-dossier">
              <div className="athlete360-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="a360-breadcrumb">
                    <button type="button" className="a360-bc-link" onClick={() => navigate('/athletes')}>Plantel</button>
                    <span>›</span>
                    <span>{p.groupName ?? 'Sem grupo'}</span>
                    <span>›</span>
                    <b>{p.name}</b>
                  </div>
                  <div className="athlete360-title">
                    {p.avatarUrl
                      ? <img className="avatar" src={p.avatarUrl} alt={p.name} />
                      : <div className="avatar initials" style={{ width: 76, height: 76, borderRadius: 24, fontSize: '1.6rem' }}>{initials(p.name)}</div>}
                    <div style={{ minWidth: 0 }}>
                      <div className="athlete360-kicker">Ficha do atleta</div>
                      <div className="athlete360-name">{p.name}</div>
                      <div className="athlete360-meta">
                        <span className={`badge ${STATUS_META[p.status]?.tone ?? 'bm'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
                        {p.sport && <span>{p.sport}</span>}
                        {p.groupName && <span>· {p.groupName}</span>}
                        <span>· {p.planName ?? 'Sem plano'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="athlete360-actions">
                  <button type="button" className="athlete360-back" onClick={() => navigate('/athletes')}>← Voltar</button>
                </div>
              </div>

              {clinicalNote && (
                <div className="clinical-note">
                  <b>Nota clínica</b>
                  <span>{clinicalNote}</span>
                </div>
              )}

              <div className="stats athlete360-stats">
                {stats.map((st) => (
                  <div key={st.k} className={`stat athlete360-stat ${st.tone}`}>
                    <div className="stat-k">{st.k}</div>
                    <div className="stat-v">{st.v}</div>
                    <div className="stat-s">{st.s}</div>
                  </div>
                ))}
              </div>

              <div className="a360-tabs2-wrap">
                <div className="a360-tabs2">
                  {tabs.map((t) => (
                    <button key={t.id} type="button" className={`a360-tab2${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
                      {t.label}{t.count != null && t.count > 0 && <span className="cnt">{t.count}</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="athlete360-shell">
              <aside className="a360-left">
                <div className="a360-left-card">
                  <h4>Identificação</h4>
                  <div className="a360-info-table">
                    {[['Email', p.email ?? '—'], ['Telefone', p.phone ?? '—'], ['Modalidade', p.sport ?? '—'], ['Grupo', p.groupName ?? '—'], ['Plano', p.planName ?? 'Sem plano'], ['Nascimento', fmtDate(p.birthDate)], ['Altura', p.heightCm ? `${p.heightCm} cm` : '—'], ['Peso', p.weightKg ? `${p.weightKg} kg` : '—']].map(([k, v]) => (
                      <div key={k} className="a360-info-row"><span>{k}</span><b>{v}</b></div>
                    ))}
                  </div>
                </div>
                <div className="a360-left-card">
                  <h4>Alertas activos <b style={{ float: 'right', color: 'var(--white)' }}>{alerts.length}</b></h4>
                  {alerts.length === 0 ? (
                    <div className="a360-info-table"><p style={{ fontSize: '.74rem', color: 'var(--muted-hi)', padding: '8px 0' }}>Sem alertas.</p></div>
                  ) : alerts.map((al) => (
                    <div key={`${al.title}-${al.source}`} className="a360-alert-card">
                      <div className="a360-alert-ico">{al.icon}</div>
                      <div>
                        <b>{al.title}</b>
                        <p>{al.desc}</p>
                        <div className="source-dot">• Fonte: {al.source}</div>
                      </div>
                      <div className="a360-date">{al.date}</div>
                    </div>
                  ))}
                </div>
              </aside>

              <section className="athlete360-content">
                <div className="athlete360-body">
                  {tab === 'principal' && <PrincipalTab d={data} />}
                  {tab === 'saude' && <SaudeTab d={data} sub={healthSub} onSub={setHealthSub} counts={hCounts!} />}
                  {tab === 'analitica' && <ModulePlaceholder title="Analítica" module="Data.OS + Live Command" hint="Gráficos e relatórios analíticos entram quando o módulo Analítica estiver ligado." />}
                  {tab === 'forms' && <ModulePlaceholder title="Forms" module="Form Center" hint="Respostas e questionários aparecem quando Forms.OS estiver activo." />}
                  {tab === 'sessoes' && <SessoesTab d={data} />}
                  {tab === 'metricas' && <MetricasTab d={data} />}
                  {tab === 'timeline' && <TimelineTab d={data} />}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </CoachShell>
  );
}

function ModulePlaceholder({ title, module, hint }: { title: string; module: string; hint: string }) {
  return (
    <>
      <SectionHead title={title} sub={hint} source={module} />
      <EmptyCard title={`${title} — módulo próprio`} hint="Sem dados mock. Esta secção será preenchida quando o módulo correspondente estiver implementado." />
    </>
  );
}

function PrincipalTab({ d }: { d: AthleteDetail }) {
  const p = d.profile;
  return (
    <>
      <SectionHead title="Principal" sub="Visão em 30 segundos: estado, contacto, plano e indicadores reais." source="Perfil + Saúde + Calendário" />
      <div className="athlete360-grid-3">
        <div className="athlete360-card a360-title-card">
          <h5>Estado actual</h5>
          <span className={`badge ${STATUS_META[p.status]?.tone ?? 'bm'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
          {p.statusNote && <p style={{ marginTop: 10 }}>{p.statusNote}</p>}
          <div className="mini-row"><span>Desde</span><b>{fmtDate(p.createdAt)}</b></div>
          <div className="mini-row"><span>Última actualização</span><b>{fmtDate(p.updatedAt)}</b></div>
        </div>
        <div className="athlete360-card a360-title-card">
          <h5>Contacto</h5>
          <div className="mini-row"><span>Email</span><b>{p.email ?? '—'}</b></div>
          <div className="mini-row"><span>Telefone</span><b>{p.phone ?? '—'}</b></div>
          <div className="mini-row"><span>Grupo</span><b>{p.groupName ?? '—'}</b></div>
        </div>
        <div className="athlete360-card a360-title-card">
          <h5>Dados físicos</h5>
          <div className="mini-row"><span>Modalidade</span><b>{p.sport ?? '—'}</b></div>
          <div className="mini-row"><span>Sexo</span><b>{p.sex ?? '—'}</b></div>
          <div className="mini-row"><span>Nascimento</span><b>{fmtDate(p.birthDate)}</b></div>
          <div className="mini-row"><span>Altura / Peso</span><b>{p.heightCm ? `${p.heightCm} cm` : '—'} · {p.weightKg ? `${p.weightKg} kg` : '—'}</b></div>
        </div>
        <div className="athlete360-card">
          <h5>Plano actual</h5>
          <div className="mini-row"><span>Plano</span><b>{p.planName ?? 'Sem plano'}</b></div>
          <div className="mini-row"><span>Atribuições</span><b>{d.assignments.length}</b></div>
          <div className="mini-row"><span>Próximas sessões</span><b>{d.bookings.filter((b) => new Date(b.startsAt) >= new Date()).length}</b></div>
        </div>
        <div className="athlete360-card">
          <h5>Saúde</h5>
          <div className="mini-row"><span>Alergias</span><b>{d.allergies.length}</b></div>
          <div className="mini-row"><span>Documentos</span><b>{d.documents.length}</b></div>
          <div className="mini-row"><span>Por resolver</span><b>{d.documents.filter((x) => x.status !== 'valid').length}</b></div>
        </div>
        {p.notes && (
          <div className="athlete360-card athlete360-wide">
            <h5>Notas</h5>
            <p>{p.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}

function SaudeTab({ d, sub, onSub, counts }: { d: AthleteDetail; sub: HealthSubTab; onSub: (s: HealthSubTab) => void; counts: Record<HealthSubTab, number | null> }) {
  const showModuleEmpty = ['lesoes', 'consultas', 'relatorios', 'cirurgias', 'tratamentos'].includes(sub)
    && (counts[sub] === 0 || counts[sub] === null);

  return (
    <>
      <SectionHead title="Saúde" sub="Dossier clínico por tipo. Dados reais de alergias e documentos; restantes secções quando o módulo Saúde estiver activo." source="Saúde / Documentos" />

      <div className="a360-healthbar">
        <div className="a360-subtabs">
          {HEALTH_SUBTABS.map(({ id, label }) => (
            <button key={id} type="button" className={`a360-subtab${sub === id ? ' on' : ''}`} onClick={() => onSub(id)}>
              {label}
              {id !== 'resumo' && counts[id] != null && counts[id]! > 0 && <span className="cnt">{counts[id]}</span>}
            </button>
          ))}
        </div>
      </div>

      {sub === 'resumo' && (
        <div className="athlete360-grid">
          <div className="athlete360-card a360-title-card">
            <h5>Resumo clínico</h5>
            <div className="mini-row"><span>Estado</span><b>{STATUS_META[d.profile.status]?.label ?? d.profile.status}</b></div>
            <div className="mini-row"><span>Alergias</span><b>{d.allergies.length}</b></div>
            <div className="mini-row"><span>Documentos</span><b>{d.documents.length}</b></div>
            <div className="mini-row"><span>Por validar</span><b>{d.documents.filter((x) => x.status !== 'valid').length}</b></div>
          </div>
          <div className="athlete360-card a360-title-card">
            <h5>Últimos registos</h5>
            {d.documents[0] ? (
              <>
                <div className="mini-row"><span>Último documento</span><b>{d.documents[0].name}</b></div>
                <div className="mini-row"><span>Estado</span><b>{DOC_STATUS_LABEL[d.documents[0].status] ?? d.documents[0].status}</b></div>
              </>
            ) : <p>Sem documentos registados.</p>}
            {d.allergies[0] && (
              <div className="mini-row"><span>Alergia principal</span><b>{d.allergies[0].allergen}</b></div>
            )}
          </div>
        </div>
      )}

      {sub === 'alergias' && (
        <div className="athlete360-grid">
          {d.allergies.length === 0 ? (
            <EmptyCard title="Sem alergias" hint="Nenhuma alergia registada neste perfil." />
          ) : d.allergies.map((al) => (
            <div key={al.id} className="athlete360-card a360-clincard">
              <div className="cc-head">
                <div><div className="cc-title">{al.allergen}</div><div className="cc-sub">{al.reaction ?? '—'}</div></div>
                <span className={`badge ${al.severity === 'severe' || al.severity === 'critical' ? 'bdanger' : 'bwarn'}`}>{SEVERITY_LABEL[al.severity] ?? al.severity}</span>
              </div>
              {al.notes && <p style={{ marginTop: 8 }}>{al.notes}</p>}
            </div>
          ))}
        </div>
      )}

      {sub === 'exames' && (
        <div className="athlete360-grid">
          {d.documents.length === 0 ? (
            <EmptyCard title="Sem exames/documentos" hint="Nenhum documento clínico registado." />
          ) : d.documents.map((doc) => (
            <div key={doc.id} className="athlete360-card a360-clincard">
              <div className="cc-head">
                <div><div className="cc-title">{doc.name}</div><div className="cc-sub">{doc.docType ?? 'Documento'}</div></div>
                <span className={`badge ${doc.status === 'valid' ? 'bsuccess' : 'bwarn'}`}>{DOC_STATUS_LABEL[doc.status] ?? doc.status}</span>
              </div>
              <div className="cc-row"><span>Validade</span><b>{doc.expiresOn ? fmtDate(doc.expiresOn) : '—'}</b></div>
            </div>
          ))}
        </div>
      )}

      {showModuleEmpty && (
        <EmptyCard
          title={`${HEALTH_SUBTABS.find((x) => x.id === sub)?.label ?? sub} — sem registos`}
          hint="Esta secção será preenchida pelo módulo Saúde quando existirem dados na base."
        />
      )}
    </>
  );
}

function MetricasTab({ d }: { d: AthleteDetail }) {
  return (
    <>
      <SectionHead title="Métricas" sub="Registos métricos reais do atleta." source="Data.OS" />
      {d.metrics.length === 0 ? (
        <EmptyCard title="Sem métricas" hint="Ainda não há registos métricos para este atleta." />
      ) : (
        <div className="timeline-list">
          {d.metrics.map((m) => (
            <div key={m.id} className="metric-priority">
              <div className="metric-index"><small>Key</small>{m.metricKey.slice(0, 3).toUpperCase()}</div>
              <div>
                <b>{m.metricKey}</b>
                <p>{fmtDate(m.recordedAt)} · {m.source}</p>
              </div>
              <div>
                <b>{m.value != null ? `${m.value}${m.unit ? ` ${m.unit}` : ''}` : (m.textValue ?? '—')}</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SessoesTab({ d }: { d: AthleteDetail }) {
  const upcoming = d.bookings.filter((b) => new Date(b.startsAt) >= new Date());
  const past = d.bookings.filter((b) => new Date(b.startsAt) < new Date());
  return (
    <>
      <SectionHead title="Sessões" sub="Marcações reais deste atleta." source="Calendário.OS" />
      <div className="athlete360-grid">
        <div className="athlete360-card session-card">
          <h5>Próximas</h5>
          {upcoming.length === 0 ? <p>Sem marcações futuras.</p> : upcoming.map((b) => (
            <div key={b.id} className="mini-row"><span>{b.title ?? BOOKING_TYPE_LABEL[b.type] ?? b.type} · {fmtDateTime(b.startsAt)}</span><b>{BOOKING_STATUS_LABEL[b.status] ?? b.status}</b></div>
          ))}
        </div>
        <div className="athlete360-card session-card">
          <h5>Histórico</h5>
          {past.length === 0 ? <p>Sem marcações anteriores.</p> : past.slice(0, 20).map((b) => (
            <div key={b.id} className="mini-row"><span>{b.title ?? BOOKING_TYPE_LABEL[b.type] ?? b.type} · {fmtDateTime(b.startsAt)}</span><b>{BOOKING_STATUS_LABEL[b.status] ?? b.status}</b></div>
          ))}
        </div>
      </div>
    </>
  );
}

function TimelineTab({ d }: { d: AthleteDetail }) {
  const events = useMemo(() => {
    const items: { id: string; date: string; type: string; title: string; desc: string; source: string }[] = [];
    for (const b of d.bookings.slice(0, 15)) {
      items.push({
        id: `b-${b.id}`,
        date: fmtDateTime(b.startsAt),
        type: 'Sessões',
        title: b.title ?? BOOKING_TYPE_LABEL[b.type] ?? b.type,
        desc: BOOKING_STATUS_LABEL[b.status] ?? b.status,
        source: 'Calendário.OS',
      });
    }
    for (const doc of d.documents) {
      items.push({
        id: `d-${doc.id}`,
        date: doc.expiresOn ? fmtDate(doc.expiresOn) : '—',
        type: 'Saúde',
        title: doc.name,
        desc: DOC_STATUS_LABEL[doc.status] ?? doc.status,
        source: 'Documentos',
      });
    }
    for (const as of d.assignments.slice(0, 10)) {
      items.push({
        id: `a-${as.id}`,
        date: as.startsOn ? fmtDate(as.startsOn) : '—',
        type: 'Atribuições',
        title: as.planName ?? 'Plano',
        desc: ASSIGN_STATUS_LABEL[as.status] ?? as.status,
        source: 'Plans.OS',
      });
    }
    return items;
  }, [d]);

  return (
    <>
      <SectionHead title="Timeline" sub="Eventos reais agregados de calendário, documentos e atribuições." source="Módulos ligados" />
      {events.length === 0 ? (
        <EmptyCard title="Timeline vazia" hint="Sem eventos registados para este atleta." />
      ) : (
        <div className="timeline-list">
          {events.map((ev) => (
            <div key={ev.id} className="timeline-item">
              <div className="timeline-ico">•</div>
              <time>{ev.date}</time>
              <div>
                <span className="badge bt">{ev.type}</span>
                <b style={{ display: 'block', marginTop: 5 }}>{ev.title}</b>
                <p>{ev.desc}</p>
              </div>
              <span className="source-pill">{ev.source}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
