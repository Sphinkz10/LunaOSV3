import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  addGroupMembers, assignPlanToGroup, fetchClients, fetchGroupProfile, fetchPlans,
  removeGroupMember, toast,
  type ClientRow, type GroupDetail, type GroupMemberRow, type PlanLite,
} from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { vocab } from '../lib/vocab';

const p1 = vocab.pessoa();
const pp = vocab.pessoa({ plural: true });
import { ProtoModal } from '../app/ProtoModal';
import { getSupabaseClient } from '../lib/supabase';

const STATUS_META: Record<string, { label: string; tone: string }> = {
  active: { label: 'Ativo', tone: 'bsuccess' },
  blocked: { label: 'Bloqueado', tone: 'bdanger' },
  return_to_play: { label: 'RTP', tone: 'bt' },
  injured: { label: 'Lesionado', tone: 'bwarn' },
  inactive: { label: 'Inativo', tone: 'bm' },
  archived: { label: 'Arquivado', tone: 'bm' },
};
const ASSIGN_STATUS: Record<string, string> = { active: 'Ativo', scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' };

type TabId = 'resumo' | 'membros' | 'atribuicoes';

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}
function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function Group360() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [data, setData] = useState<GroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('resumo');
  const [memberQuery, setMemberQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !id) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetchGroupProfile(client, scope, id)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar grupo'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope, id]);

  useEffect(() => load(), [load]);

  const agg = useMemo(() => {
    const m = data?.members ?? [];
    return {
      total: m.length,
      active: m.filter((x) => x.status === 'active').length,
      attention: m.filter((x) => x.status === 'blocked' || x.status === 'injured').length,
      noPlan: m.filter((x) => !x.hasPlan).length,
      assignments: data?.assignments.length ?? 0,
    };
  }, [data]);

  const tabs: { id: TabId; label: string; count: number | null }[] = [
    { id: 'resumo', label: 'Resumo', count: null },
    { id: 'membros', label: 'Membros', count: agg.total },
    { id: 'atribuicoes', label: 'Atribuições', count: agg.assignments },
  ];

  const filteredMembers = useMemo(() => {
    const q = memberQuery.toLowerCase().trim();
    if (!q || !data) return data?.members ?? [];
    return data.members.filter((m) => [m.name, STATUS_META[m.status]?.label].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [data, memberQuery]);

  const p = data?.profile;

  return (
    <CoachShell headStrong="Grupo 360" headSub={p ? `${p.name} · consulta coletiva` : 'A carregar…'}>
      <div className="group360">
        {loading && <div className="empty"><b>A carregar…</b></div>}
        {error && <div className="empty"><b>Erro ao carregar</b><p>{error}</p></div>}

        {p && !loading && (
          <>
            <div className="group360-head">
              <div className="group360-title">
                <div className="group360-icon" style={p.color ? { background: p.color, color: 'rgba(255,255,255,.96)' } : undefined}>⊞</div>
                <div style={{ minWidth: 0 }}>
                  <button className="group360-back" onClick={() => navigate('/groups')}>← Voltar aos grupos</button>
                  <div className="group360-kicker">Grupo 360 · Consulta coletiva</div>
                  <div className="group360-name">{p.name}</div>
                  <div className="group360-meta">
                    <span>{agg.total} {pp}</span>
                    <span>· Criado {fmtDate(p.createdAt)}</span>
                    <span>· Atual. {fmtDate(p.updatedAt)}</span>
                  </div>
                </div>
              </div>
              <div className="group360-actions">
                <button className="btn secondary small" onClick={() => setAddOpen(true)}>+ Membros</button>
                <button className="btn primary small" onClick={() => setAssignOpen(true)} disabled={agg.total === 0}>Atribuir plano</button>
              </div>
            </div>

            <div className="group360-stats">
              <div className="group360-stat"><div className="stat-k">Membros</div><div className="stat-v">{agg.total}</div></div>
              <div className="group360-stat"><div className="stat-k">Ativos</div><div className="stat-v">{agg.active}</div></div>
              <div className="group360-stat"><div className="stat-k">Sem plano</div><div className="stat-v">{agg.noPlan}</div></div>
              <div className="group360-stat"><div className="stat-k">Atenção</div><div className="stat-v">{agg.attention}</div></div>
            </div>

            <div className="group360-main">
              <div className="group360-tabs">
                {tabs.map((t) => (
                  <button key={t.id} className={`group360-tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
                    {t.label}{t.count != null && <span className="cnt">{t.count}</span>}
                  </button>
                ))}
              </div>
              <div className="group360-body">
                {tab === 'resumo' && (
                  <div className="group360-grid">
                    <div className="group360-panel">
                      <h3>Estado coletivo</h3>
                      <div className="mini-row"><span>Membros</span><b>{agg.total}</b></div>
                      <div className="mini-row"><span>Ativos</span><b>{agg.active}</b></div>
                      <div className="mini-row"><span>Sem plano</span><b>{agg.noPlan}</b></div>
                      <div className="mini-row"><span>Bloqueados / lesionados</span><b>{agg.attention}</b></div>
                    </div>
                    <div className="group360-panel">
                      <h3>Atribuições</h3>
                      <div className="mini-row"><span>Total registadas</span><b>{agg.assignments}</b></div>
                      <div className="mini-row"><span>Ativas</span><b>{data.assignments.filter((a) => a.status === 'active').length}</b></div>
                    </div>
                    <div className="group360-panel group360-wide">
                      <h3>Descrição / regra</h3>
                      <p style={{ fontSize: '.78rem', color: 'var(--muted-hi)', lineHeight: 1.45, margin: 0 }}>
                        {p.description || 'Grupo manual: escolhido pela equipa.'}
                      </p>
                    </div>
                    {agg.noPlan > 0 && (
                      <div className="group360-note group360-wide">
                        <b>{agg.noPlan} membro(s) sem plano.</b> Usa <strong>Atribuir plano</strong> para atribuir conteúdo a todo o grupo de uma vez.
                      </div>
                    )}
                  </div>
                )}

                {tab === 'membros' && (
                  <>
                    <div className="group360-searchbar">
                      <label className="group-member-search">⌕<input value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} type="search" placeholder="Procurar membro, modalidade, estado..." aria-label="Procurar membro" /></label>
                      <button className="btn secondary small" onClick={() => setAddOpen(true)}>+ Adicionar</button>
                    </div>
                    {filteredMembers.length === 0
                      ? <div className="group360-note"><b>Sem membros visíveis.</b> Adiciona {pp} ao grupo para agir em escala.</div>
                      : (
                        <div className="group-member-list">
                          {filteredMembers.map((m) => (
                            <MemberRow key={m.id} member={m} groupId={p.id} onRemoved={load} onOpen={() => navigate(`/clients/${m.id}`)} />
                          ))}
                        </div>
                      )}
                  </>
                )}

                {tab === 'atribuicoes' && (
                  <>
                    <div className="group360-note" style={{ marginBottom: 12 }}>
                      Atribuições reais dos membros deste grupo (Plans.OS). Para atribuir a todos: <strong>Atribuir plano</strong> no topo.
                    </div>
                    {data.assignments.length === 0
                      ? <div className="group360-panel"><p style={{ margin: 0, fontSize: '.78rem', color: 'var(--muted-hi)' }}>Ainda não há atribuições para os membros deste grupo.</p></div>
                      : data.assignments.map((a) => (
                        <div key={a.id} className="group-member-row" style={{ marginBottom: 7 }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <b>{a.planName ?? 'Atribuição'}</b>
                            <span>{a.startsOn ? fmtDate(a.startsOn) : '—'} · {ASSIGN_STATUS[a.status] ?? a.status}</span>
                          </div>
                        </div>
                      ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {id && p && (
        <>
          <AddMembersModal open={addOpen} onClose={() => setAddOpen(false)} groupId={id} existing={data?.members ?? []} onAdded={() => { setAddOpen(false); load(); }} />
          <AssignGroupModal open={assignOpen} onClose={() => setAssignOpen(false)} groupId={id} groupName={p.name} memberCount={agg.total} onDone={() => { setAssignOpen(false); load(); }} />
        </>
      )}
    </CoachShell>
  );
}

function MemberRow({ member, groupId, onRemoved, onOpen }: { member: GroupMemberRow; groupId: string; onRemoved: () => void; onOpen: () => void }) {
  const scope = useScope();
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[member.status] ?? STATUS_META.active;

  const remove = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setBusy(true);
    try {
      await removeGroupMember(client, scope, groupId, member.id);
      toast({ variant: 'info', title: 'Membro removido', description: member.name });
      onRemoved();
    } catch (e) {
      toast({ variant: 'danger', title: 'Erro', description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="group-member-row">
      {member.avatarUrl
        ? <img className="avatar" src={member.avatarUrl} alt={member.name} style={{ width: 32, height: 32, borderRadius: 10 }} />
        : <div className="avatar initials" style={{ width: 32, height: 32, borderRadius: 10 }}>{initials(member.name)}</div>}
      <div style={{ minWidth: 0, flex: 1 }}>
        <b>{member.name}</b>
        <span>{[meta.label, member.hasPlan ? 'Com plano' : 'Sem plano'].filter(Boolean).join(' · ')}</span>
      </div>
      <button className="btn ghost small" onClick={onOpen}>Abrir</button>
      <button className="btn ghost small" onClick={() => void remove()} disabled={busy}>Remover</button>
    </div>
  );
}

function AddMembersModal({ open, onClose, groupId, existing, onAdded }: {
  open: boolean; onClose: () => void; groupId: string; existing: GroupMemberRow[]; onAdded: () => void;
}) {
  const scope = useScope();
  const [all, setAll] = useState<ClientRow[]>([]);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPicked(new Set()); setQuery(''); setErr(null);
    const client = getSupabaseClient();
    if (!client) return;
    setLoading(true);
    void fetchClients(client, scope)
      .then(setAll)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoading(false));
  }, [open, scope]);

  const existingIds = useMemo(() => new Set(existing.map((m) => m.id)), [existing]);
  const visible = useMemo(() => {
    const q = query.toLowerCase().trim();
    return all
      .filter((a) => !existingIds.has(a.id))
      .filter((a) => !q || [a.name, a.responsibleName, a.groupName].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [all, existingIds, query]);

  const toggle = (id: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão.'); return; }
    if (picked.size === 0) { setErr(`Seleciona pelo menos um ${p1}.`); return; }
    setBusy(true); setErr(null);
    try {
      const n = await addGroupMembers(client, scope, groupId, [...picked]);
      toast({ variant: 'success', title: 'Membros adicionados', description: `${n} ${pp} adicionados ao grupo.` });
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao adicionar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal open={open} onClose={onClose} title="Adicionar membros" sub={`Escolhe ${pp} para juntar ao grupo.`} size="lg"
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || picked.size === 0}>{busy ? 'A adicionar…' : `Adicionar ${picked.size || ''}`}</button>
      </>}>
      <div className="proto-form">
        <label className="group-member-search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} type="search" placeholder={`Procurar ${p1}…`} /></label>
        {loading && <p style={{ margin: 0, color: 'var(--muted-hi)', fontSize: '.78rem' }}>A carregar {pp}…</p>}
        {err && <p className="proto-error">{err}</p>}
        <div className="group-wizard-members" style={{ maxHeight: 280, display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 7, overflow: 'auto', padding: 8, borderRadius: 14, border: '1px solid rgba(255,255,255,.07)', background: 'rgba(255,255,255,.035)' }}>
          {visible.length === 0 && !loading
            ? <div className="groups-empty" style={{ gridColumn: '1/-1', margin: 0 }}><b>Nenhum {p1} disponível</b></div>
            : visible.map((a) => (
              <label key={a.id} className="member-choice" aria-label={a.name}>
                <input type="checkbox" checked={picked.has(a.id)} onChange={() => toggle(a.id)} />
                <div><strong>{a.name}</strong><small>{[a.responsibleName, STATUS_META[a.status]?.label].filter(Boolean).join(' · ')}</small></div>
              </label>
            ))}
        </div>
      </div>
    </ProtoModal>
  );
}

function AssignGroupModal({ open, onClose, groupId, groupName, memberCount, onDone }: {
  open: boolean; onClose: () => void; groupId: string; groupName: string; memberCount: number; onDone: () => void;
}) {
  const scope = useScope();
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [planId, setPlanId] = useState('');
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null); setPlanId('');
    const client = getSupabaseClient();
    if (!client) return;
    setLoadingPlans(true);
    void fetchPlans(client, scope)
      .then((p) => { setPlans(p); setPlanId(p[0]?.id ?? ''); })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoadingPlans(false));
  }, [open, scope]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão.'); return; }
    if (!planId) { setErr('Escolhe um plano.'); return; }
    setBusy(true); setErr(null);
    try {
      const n = (await assignPlanToGroup(client, scope, groupId, planId)).created;
      toast({ variant: 'success', title: 'Plano atribuído', description: `${n} membro(s) de ${groupName}.` });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao atribuir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal open={open} onClose={onClose} title="Atribuir plano ao grupo" sub={`${groupName} · ${memberCount} membro(s)`}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || loadingPlans || !planId || memberCount === 0}>{busy ? 'A atribuir…' : 'Atribuir a todos'}</button>
      </>}>
      <div className="proto-form">
        <div className="field">
          <label htmlFor="group-plan">Plano a atribuir</label>
          {loadingPlans
            ? <select id="group-plan" disabled><option>A carregar…</option></select>
            : plans.length === 0
              ? <p className="proto-error">Ainda não há planos na biblioteca.</p>
              : <select id="group-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        </div>
        {memberCount === 0 && <p className="proto-error">Este grupo ainda não tem membros.</p>}
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}
