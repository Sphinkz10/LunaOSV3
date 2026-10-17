import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchClientProfile, type ClientDetail, type Section } from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const PP = vocab.pessoa({ plural: true, maiuscula: true });
const p1 = vocab.pessoa();

const STATUS_META: Record<string, { label: string; tone: string }> = {
  active: { label: 'Ativo', tone: 'bsuccess' },
  blocked: { label: 'Bloqueado', tone: 'bdanger' },
  return_to_play: { label: 'Regresso ao treino', tone: 'bt' },
  injured: { label: 'Lesionado', tone: 'bwarn' },
  inactive: { label: 'Inativo', tone: 'bm' },
};
const SEVERITY_LABEL: Record<string, string> = { critical: 'Crítica', severe: 'Grave', moderate: 'Moderada', mild: 'Ligeira' };
const DOC_STATUS_LABEL: Record<string, string> = { valid: 'Válido', expiring: 'A expirar', expired: 'Expirado', missing: 'Em falta', pending: 'Pendente' };
const BOOKING_TYPE_LABEL: Record<string, string> = {
  training: vocab.sessao({ maiuscula: true }), assessment: 'Avaliação', consultation: 'Consulta', class: 'Aula', other: 'Outro',
};
const BOOKING_STATUS_LABEL: Record<string, string> = { pending: 'Por confirmar', confirmed: 'Confirmada', completed: 'Concluída', cancelled: 'Cancelada', no_show: 'Faltou', waitlisted: 'Em espera' };
const ASSIGN_STATUS_LABEL: Record<string, string> = { active: 'Ativo', scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' };

type TabId = 'principal' | 'saude' | 'sessoes' | 'metricas' | 'cronologia';
type HealthSubTab = 'resumo' | 'alergias' | 'documentos';

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

/** Formatos de data no fuso da organização. */
function useFmt() {
  const { timezone } = useScope();
  return useMemo(() => ({
    date: (iso: string | null) => (iso
      ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: timezone })
      : '—'),
    dateTime: (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: timezone }),
  }), [timezone]);
}

function SectionHead({ title, sub }: { title: string; sub: string }) {
  return <div className="athlete360-section-head"><div><h2>{title}</h2><p>{sub}</p></div></div>;
}

function EmptyCard({ title, hint }: { title: string; hint: string }) {
  return <div className="athlete360-empty"><b>{title}</b><p style={{ marginTop: 6, fontSize: '.78rem' }}>{hint}</p></div>;
}

/**
 * Uma secção que pode falhar sozinha (X-02). Em falta nunca é zero:
 * sem permissão, não partilhado e erro mostram-se como tal.
 */
function SectionView<T>({ s, what, onRetry, children }: {
  s: Section<T>; what: string; onRetry: () => void; children: (data: T) => ReactNode;
}) {
  if (s.state === 'ok') return <>{children(s.data)}</>;
  if (s.state === 'no_permission') return <EmptyCard title="Sem permissão" hint={`O teu papel não dá acesso a ${what}.`} />;
  if (s.state === 'not_shared') return <EmptyCard title="Não partilhado" hint={`O ${p1} não partilhou ${what} com a organização.`} />;
  return (
    <div className="athlete360-empty" role="alert">
      <b>Não foi possível carregar {what}</b>
      <p style={{ marginTop: 6, fontSize: '.78rem' }}>{s.message}</p>
      <button type="button" className="btn ghost small" onClick={onRetry}>Tentar de novo</button>
    </div>
  );
}

/** Contagem só quando a secção carregou; senão um traço, nunca um zero falso. */
const countOf = <T,>(s: Section<T[]>) => (s.state === 'ok' ? s.data.length : null);
const show = (n: number | null) => (n == null ? '—' : String(n));

function buildAlerts(d: ClientDetail, fmtDate: (iso: string | null) => string) {
  const alerts: { icon: string; title: string; desc: string; source: string; date: string }[] = [];
  if (d.allergies.state === 'ok') {
    for (const al of d.allergies.data.filter((a) => a.severity === 'severe' || a.severity === 'critical')) {
      alerts.push({ icon: '⚠', title: `Alergia ${SEVERITY_LABEL[al.severity] ?? al.severity}: ${al.allergen}`,
        desc: al.reaction ?? 'Rever antes de sessões e prescrições.', source: 'Saúde', date: '—' });
    }
  }
  if (d.documents.state === 'ok') {
    for (const doc of d.documents.data.filter((x) => x.status !== 'valid')) {
      alerts.push({ icon: '▤', title: doc.name,
        desc: `${DOC_STATUS_LABEL[doc.status] ?? doc.status}${doc.expiresOn ? ` · expira ${fmtDate(doc.expiresOn)}` : ''}`,
        source: 'Documentos', date: doc.expiresOn ? fmtDate(doc.expiresOn) : '—' });
    }
  }
  if (d.profile.statusNote && (d.profile.status === 'blocked' || d.profile.status === 'injured')) {
    alerts.push({ icon: '⌁', title: STATUS_META[d.profile.status]?.label ?? d.profile.status, desc: d.profile.statusNote,
      source: 'Perfil', date: fmtDate(d.profile.updatedAt) });
  }
  return alerts;
}

function upcoming(d: ClientDetail) {
  if (d.bookings.state !== 'ok') return null;
  const now = Date.now();
  return d.bookings.data.filter((b) => Date.parse(b.startsAt) >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

function ClientBoard({ d }: { d: ClientDetail }) {
  const fmt = useFmt();
  const p = d.profile;
  const alerts = buildAlerts(d, fmt.date);
  const badDocs = d.documents.state === 'ok' ? d.documents.data.filter((x) => x.status !== 'valid').length : null;
  const next = upcoming(d)?.[0];
  return (
    <>
      <div className="board-card">
        <div className="a360-board-kicker">Ficha do {p1}</div>
        <div className="board-title">{p.name}</div>
        <div className="board-sub">{p.groupName ?? '—'}</div>
        <div style={{ marginTop: 8 }}>
          <span className={`badge ${STATUS_META[p.status]?.tone ?? 'bm'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Atenção</div>
        {alerts.length === 0 ? <p className="board-sub" style={{ marginTop: 6 }}>Sem alertas registados.</p>
          : alerts.slice(0, 4).map((al) => (
            <div key={`${al.title}-${al.date}`} className="a360-board-alert"><b>{al.title}</b><p>{al.desc}</p></div>
          ))}
      </div>
      <div className="board-card">
        <div className="board-title">Leitura rápida</div>
        <div className="mini-row"><span>Plano</span><b>{p.planName ?? 'Sem plano'}</b></div>
        <div className="mini-row"><span>Docs pendentes</span><b>{show(badDocs)}</b></div>
        <div className="mini-row"><span>Medidas</span><b>{show(countOf(d.metrics))}</b></div>
        <div className="mini-row"><span>Próxima {vocab.sessao()}</span><b>{next ? fmt.dateTime(next.startsAt) : '—'}</b></div>
      </div>
    </>
  );
}

/** Ficha do cliente (G-06). */
export function Client360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const fmt = useFmt();
  const [data, setData] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('principal');
  const [healthSub, setHealthSub] = useState<HealthSubTab>('resumo');

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !id) return;
    let cancelled = false;
    setLoading(true);
    void fetchClientProfile(client, scope, id)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : `Erro ao carregar o ${p1}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, id]);

  useEffect(() => load(), [load]);

  const p = data?.profile;
  const alerts = useMemo(() => (data ? buildAlerts(data, fmt.date) : []), [data, fmt]);

  const tabs: { id: TabId; label: string; count: number | null }[] = useMemo(() => {
    if (!data) return [];
    return [
      { id: 'principal', label: 'Principal', count: null },
      { id: 'saude', label: 'Saúde', count: countOf(data.allergies) },
      { id: 'sessoes', label: vocab.sessao({ plural: true, maiuscula: true }), count: countOf(data.bookings) },
      { id: 'metricas', label: 'Medidas', count: countOf(data.metrics) },
      { id: 'cronologia', label: 'Cronologia', count: null },
    ];
  }, [data]);

  const stats = useMemo(() => {
    if (!data) return [];
    const p2 = data.profile;
    const badDocs = data.documents.state === 'ok' ? data.documents.data.filter((x) => x.status !== 'valid').length : null;
    const next = upcoming(data)?.[0];
    const latest = data.metrics.state === 'ok' ? data.metrics.data[0] : undefined;
    return [
      { k: 'Estado', v: STATUS_META[p2.status]?.label ?? p2.status, s: p2.statusNote ?? 'Operacional', tone: STATUS_META[p2.status]?.tone ?? 'bm' },
      { k: 'Docs pendentes', v: show(badDocs), s: badDocs == null ? 'Indisponível' : badDocs ? 'Renovar ou validar' : 'Documentação OK', tone: badDocs ? 'bwarn' : 'bsuccess' },
      { k: 'Última medida', v: latest ? (latest.value != null ? String(latest.value) : latest.textValue ?? '—') : '—',
        s: latest?.metricKey ?? (data.metrics.state === 'ok' ? 'Sem registos' : 'Indisponível'), tone: 'bt' },
      { k: `Próxima ${vocab.sessao()}`, v: next ? fmt.date(next.startsAt) : '—', s: next ? (BOOKING_TYPE_LABEL[next.type] ?? next.type) : 'Sem marcações', tone: 'bt' },
      { k: 'Atribuições', v: show(countOf(data.assignments)), s: p2.planName ?? 'Sem plano', tone: 'bt' },
    ];
  }, [data, fmt]);

  const clinicalNote = useMemo(() => {
    if (!data) return null;
    if (data.allergies.state === 'ok') {
      const severe = data.allergies.data.find((a) => a.severity === 'severe' || a.severity === 'critical');
      if (severe) return `Alergia ${SEVERITY_LABEL[severe.severity]?.toLowerCase() ?? severe.severity}: ${severe.allergen}. ${severe.reaction ?? 'Rever antes de prescrições.'}`;
    }
    if (data.documents.state === 'ok') {
      const badDoc = data.documents.data.find((d) => d.status !== 'valid');
      if (badDoc) return `Documento «${badDoc.name}»: ${DOC_STATUS_LABEL[badDoc.status] ?? badDoc.status}.`;
    }
    return data.profile.statusNote ?? null;
  }, [data]);

  return (
    <CoachShell
      headStrong={`Ficha do ${p1}`}
      headSub={p ? p.name : 'A carregar…'}
      layoutClassName="athlete-mode"
      board={data ? <ClientBoard d={data} /> : null}
    >
      <div className="athlete360-main">
        {loading && !data && <div className="empty" aria-busy="true"><b>A carregar…</b></div>}
        {error && (
          <div className="empty" role="alert"><b>Não foi possível carregar a ficha</b><p>{error}</p>
            <button type="button" className="btn ghost small" onClick={load}>Tentar de novo</button></div>
        )}

        {p && data && (
          <>
            <div className="a360-dossier">
              <div className="athlete360-head">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="a360-breadcrumb">
                    <button type="button" className="a360-bc-link" onClick={() => navigate('/clients')}>{PP}</button>
                    <span>›</span>
                    <b>{p.name}</b>
                  </div>
                  <div className="athlete360-title">
                    {p.avatarUrl
                      ? <img className="avatar" src={p.avatarUrl} alt="" />
                      : <div className="avatar initials" aria-hidden style={{ width: 76, height: 76, borderRadius: 24, fontSize: '1.6rem' }}>{initials(p.name)}</div>}
                    <div style={{ minWidth: 0 }}>
                      <div className="athlete360-kicker">Ficha do {p1}</div>
                      <h1 className="athlete360-name">{p.name}</h1>
                      <div className="athlete360-meta">
                        <span className={`badge ${STATUS_META[p.status]?.tone ?? 'bm'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
                        {p.groupName && <span>· {p.groupName}</span>}
                        <span>· {p.planName ?? 'Sem plano'}</span>
                        <span>· {p.hasAccount ? 'Usa a app' : 'Sem conta na app'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="athlete360-actions">
                  <button type="button" className="athlete360-back" onClick={() => navigate(`/clients/${p.id}/aptidao`)}>Restrição e aptidão</button>
                  <button type="button" className="athlete360-back" onClick={() => navigate('/clients')}>← Voltar</button>
                </div>
              </div>

              {clinicalNote && <div className="clinical-note"><b>Nota</b><span>{clinicalNote}</span></div>}

              <div className="stats athlete360-stats">
                {stats.map((st) => (
                  <div key={st.k} className={`stat athlete360-stat ${st.tone}`}>
                    <div className="stat-k">{st.k}</div><div className="stat-v">{st.v}</div><div className="stat-s">{st.s}</div>
                  </div>
                ))}
              </div>

              <div className="a360-tabs2-wrap">
                <div className="a360-tabs2" role="tablist">
                  {tabs.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`a360-tab2${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
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
                    {[['Email', p.email ?? '—'], ['Telefone', p.phone ?? '—'], ['Grupo', p.groupName ?? '—'], ['Plano', p.planName ?? 'Sem plano'], ['Nascimento', fmt.date(p.birthDate)]].map(([k, v]) => (
                      <div key={k} className="a360-info-row"><span>{k}</span><b>{v}</b></div>
                    ))}
                  </div>
                </div>
                <div className="a360-left-card">
                  <h4>Alertas ativos <b style={{ float: 'right', color: 'var(--white)' }}>{alerts.length}</b></h4>
                  {alerts.length === 0 ? (
                    <div className="a360-info-table"><p style={{ fontSize: '.74rem', color: 'var(--muted-hi)', padding: '8px 0' }}>Sem alertas.</p></div>
                  ) : alerts.map((al) => (
                    <div key={`${al.title}-${al.source}`} className="a360-alert-card">
                      <div className="a360-alert-ico" aria-hidden>{al.icon}</div>
                      <div><b>{al.title}</b><p>{al.desc}</p><div className="source-dot">• Fonte: {al.source}</div></div>
                      <div className="a360-date">{al.date}</div>
                    </div>
                  ))}
                </div>
              </aside>

              <section className="athlete360-content">
                <div className="athlete360-body">
                  {tab === 'principal' && <PrincipalTab d={data} />}
                  {tab === 'saude' && <SaudeTab d={data} sub={healthSub} onSub={setHealthSub} onRetry={load} />}
                  {tab === 'sessoes' && <SessoesTab d={data} onRetry={load} />}
                  {tab === 'metricas' && <MetricasTab d={data} onRetry={load} />}
                  {tab === 'cronologia' && <CronologiaTab d={data} />}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </CoachShell>
  );
}

function PrincipalTab({ d }: { d: ClientDetail }) {
  const fmt = useFmt();
  const p = d.profile;
  const next = upcoming(d);
  return (
    <>
      <SectionHead title="Principal" sub="Estado, contacto e plano num relance." />
      <div className="athlete360-grid-3">
        <div className="athlete360-card a360-title-card">
          <h5>Estado atual</h5>
          <span className={`badge ${STATUS_META[p.status]?.tone ?? 'bm'}`}>{STATUS_META[p.status]?.label ?? p.status}</span>
          {p.statusNote && <p style={{ marginTop: 10 }}>{p.statusNote}</p>}
          <div className="mini-row"><span>Desde</span><b>{fmt.date(p.createdAt)}</b></div>
          <div className="mini-row"><span>Última atualização</span><b>{fmt.date(p.updatedAt)}</b></div>
        </div>
        <div className="athlete360-card a360-title-card">
          <h5>Contacto</h5>
          <div className="mini-row"><span>Email</span><b>{p.email ?? '—'}</b></div>
          <div className="mini-row"><span>Telefone</span><b>{p.phone ?? '—'}</b></div>
          <div className="mini-row"><span>Grupo</span><b>{p.groupName ?? '—'}</b></div>
        </div>
        <div className="athlete360-card">
          <h5>Plano atual</h5>
          <div className="mini-row"><span>Plano</span><b>{p.planName ?? 'Sem plano'}</b></div>
          <div className="mini-row"><span>Atribuições</span><b>{show(countOf(d.assignments))}</b></div>
          <div className="mini-row"><span>Próximas {vocab.sessao({ plural: true })}</span><b>{show(next ? next.length : null)}</b></div>
        </div>
      </div>
    </>
  );
}

function SaudeTab({ d, sub, onSub, onRetry }: { d: ClientDetail; sub: HealthSubTab; onSub: (s: HealthSubTab) => void; onRetry: () => void }) {
  const fmt = useFmt();
  const subtabs: { id: HealthSubTab; label: string; count: number | null }[] = [
    { id: 'resumo', label: 'Resumo', count: null },
    { id: 'alergias', label: 'Alergias', count: countOf(d.allergies) },
    { id: 'documentos', label: 'Documentos', count: countOf(d.documents) },
  ];
  return (
    <>
      <SectionHead title="Saúde" sub="Só para papéis clínicos e com a partilha do cliente. Cada leitura fica registada." />
      <div className="a360-healthbar">
        <div className="a360-subtabs" role="tablist">
          {subtabs.map(({ id, label, count }) => (
            <button key={id} type="button" role="tab" aria-selected={sub === id} className={`a360-subtab${sub === id ? ' on' : ''}`} onClick={() => onSub(id)}>
              {label}{count != null && count > 0 && <span className="cnt">{count}</span>}
            </button>
          ))}
        </div>
      </div>

      {sub === 'resumo' && (
        <div className="athlete360-grid">
          <div className="athlete360-card a360-title-card">
            <h5>Resumo</h5>
            <div className="mini-row"><span>Estado</span><b>{STATUS_META[d.profile.status]?.label ?? d.profile.status}</b></div>
            <div className="mini-row"><span>Alergias</span><b>{d.allergies.state === 'ok' ? d.allergies.data.length : d.allergies.state === 'not_shared' ? 'Não partilhado' : d.allergies.state === 'no_permission' ? 'Sem permissão' : 'Indisponível'}</b></div>
            <div className="mini-row"><span>Documentos</span><b>{show(countOf(d.documents))}</b></div>
          </div>
        </div>
      )}

      {sub === 'alergias' && (
        <SectionView s={d.allergies} what="os dados de saúde" onRetry={onRetry}>
          {(items) => (
            <div className="athlete360-grid">
              {items.length === 0 ? <EmptyCard title="Sem alergias registadas" hint={`O ${p1} não tem alergias registadas.`} /> : items.map((al) => (
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
        </SectionView>
      )}

      {sub === 'documentos' && (
        <SectionView s={d.documents} what="os documentos" onRetry={onRetry}>
          {(docs) => (
            <div className="athlete360-grid">
              {docs.length === 0 ? <EmptyCard title="Sem documentos" hint="Nenhum documento registado." /> : docs.map((doc) => (
                <div key={doc.id} className="athlete360-card a360-clincard">
                  <div className="cc-head">
                    <div><div className="cc-title">{doc.name}</div><div className="cc-sub">{doc.docType ?? 'Documento'}</div></div>
                    <span className={`badge ${doc.status === 'valid' ? 'bsuccess' : 'bwarn'}`}>{DOC_STATUS_LABEL[doc.status] ?? doc.status}</span>
                  </div>
                  <div className="cc-row"><span>Validade</span><b>{doc.expiresOn ? fmt.date(doc.expiresOn) : '—'}</b></div>
                </div>
              ))}
            </div>
          )}
        </SectionView>
      )}
    </>
  );
}

function MetricasTab({ d, onRetry }: { d: ClientDetail; onRetry: () => void }) {
  const fmt = useFmt();
  return (
    <>
      <SectionHead title="Medidas" sub={`Registos do ${p1}, visíveis enquanto os partilhar.`} />
      <SectionView s={d.metrics} what="as medidas" onRetry={onRetry}>
        {(metrics) => metrics.length === 0 ? <EmptyCard title="Sem medidas" hint="Ainda não há registos." /> : (
          <div className="timeline-list">
            {metrics.map((m) => (
              <div key={m.id} className="metric-priority">
                <div className="metric-index" aria-hidden><small>Key</small>{m.metricKey.slice(0, 3).toUpperCase()}</div>
                <div><b>{m.metricKey}</b><p>{fmt.date(m.recordedAt)} · {m.source}</p></div>
                <div><b>{m.value != null ? `${m.value}${m.unit ? ` ${m.unit}` : ''}` : (m.textValue ?? '—')}</b></div>
              </div>
            ))}
          </div>
        )}
      </SectionView>
    </>
  );
}

function SessoesTab({ d, onRetry }: { d: ClientDetail; onRetry: () => void }) {
  const fmt = useFmt();
  return (
    <>
      <SectionHead title={vocab.sessao({ plural: true, maiuscula: true })} sub={`Marcações deste ${p1}.`} />
      <SectionView s={d.bookings} what="as marcações" onRetry={onRetry}>
        {(bookings) => {
          const now = Date.now();
          const next = bookings.filter((b) => Date.parse(b.startsAt) >= now);
          const past = bookings.filter((b) => Date.parse(b.startsAt) < now);
          const row = (b: typeof bookings[number]) => (
            <div key={b.id} className="mini-row"><span>{b.title ?? BOOKING_TYPE_LABEL[b.type] ?? b.type} · {fmt.dateTime(b.startsAt)}</span><b>{BOOKING_STATUS_LABEL[b.status] ?? b.status}</b></div>
          );
          return (
            <div className="athlete360-grid">
              <div className="athlete360-card session-card"><h5>Próximas</h5>{next.length === 0 ? <p>Sem marcações futuras.</p> : next.map(row)}</div>
              <div className="athlete360-card session-card"><h5>Histórico</h5>{past.length === 0 ? <p>Sem marcações anteriores.</p> : past.slice(0, 20).map(row)}</div>
            </div>
          );
        }}
      </SectionView>
    </>
  );
}

function CronologiaTab({ d }: { d: ClientDetail }) {
  const fmt = useFmt();
  const events = useMemo(() => {
    const items: { id: string; date: string; type: string; title: string; desc: string }[] = [];
    if (d.bookings.state === 'ok') for (const b of d.bookings.data.slice(0, 15)) {
      items.push({ id: `b-${b.id}`, date: fmt.dateTime(b.startsAt), type: vocab.sessao({ plural: true, maiuscula: true }),
        title: b.title ?? BOOKING_TYPE_LABEL[b.type] ?? b.type, desc: BOOKING_STATUS_LABEL[b.status] ?? b.status });
    }
    if (d.documents.state === 'ok') for (const doc of d.documents.data) {
      items.push({ id: `d-${doc.id}`, date: doc.expiresOn ? fmt.date(doc.expiresOn) : '—', type: 'Documentos',
        title: doc.name, desc: DOC_STATUS_LABEL[doc.status] ?? doc.status });
    }
    if (d.assignments.state === 'ok') for (const as of d.assignments.data.slice(0, 10)) {
      items.push({ id: `a-${as.id}`, date: as.startsOn ? fmt.date(as.startsOn) : '—', type: 'Atribuições',
        title: as.planName ?? 'Plano', desc: ASSIGN_STATUS_LABEL[as.status] ?? as.status });
    }
    return items;
  }, [d, fmt]);
  const partial = [d.bookings, d.documents, d.assignments].some((s) => s.state === 'error');

  return (
    <>
      <SectionHead title="Cronologia" sub="Marcações, documentos e atribuições." />
      {partial && <p role="status" className="board-sub">Algumas partes não carregaram; a cronologia pode estar incompleta.</p>}
      {events.length === 0 ? <EmptyCard title="Sem eventos" hint={`Sem eventos registados para este ${p1}.`} /> : (
        <div className="timeline-list">
          {events.map((ev) => (
            <div key={ev.id} className="timeline-item">
              <div className="timeline-ico" aria-hidden>•</div>
              <time>{ev.date}</time>
              <div><span className="badge bt">{ev.type}</span><b style={{ display: 'block', marginTop: 5 }}>{ev.title}</b><p>{ev.desc}</p></div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

