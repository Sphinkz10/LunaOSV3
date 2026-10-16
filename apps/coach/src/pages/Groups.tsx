import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  assignPlanToGroup, createGroup, fetchGroupMemberIds, fetchGroups, fetchPlans, toast,
  type GroupRow, type PlanLite,
} from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { vocab } from '../lib/vocab';

const pp = vocab.pessoa({ plural: true });
import { ProtoModal } from '../app/ProtoModal';
import { getSupabaseClient } from '../lib/supabase';

export function Groups() {
  const navigate = useNavigate();
  const scope = useScope();
  const [rows, setRows] = useState<GroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('name');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignGroup, setAssignGroup] = useState<GroupRow | null>(null);

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetchGroups(client, scope)
      .then((g) => { if (!cancelled) { setRows(g); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Erro ao carregar grupos'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope]);

  useEffect(() => load(), [load]);

  const totalMembers = useMemo(() => rows.reduce((s, g) => s + g.memberCount, 0), [rows]);
  const empties = useMemo(() => rows.filter((g) => g.memberCount === 0).length, [rows]);
  const withMembers = useMemo(() => rows.filter((g) => g.memberCount > 0).length, [rows]);

  const stats = [
    { id: 'all', k: 'Grupos', v: rows.length, s: 'Total de grupos' },
    { id: 'with', k: 'Com membros', v: withMembers, s: 'Grupos ativos' },
    { id: 'empty', k: 'Vazios', v: empties, s: `Sem ${pp}` },
    { id: 'members', k: 'Membros', v: totalMembers, s: 'Em todos os grupos' },
  ];

  const filters: [string, string][] = [
    ['all', 'Todos'], ['with', 'Com membros'], ['empty', 'Vazios'],
    ['selected', `Selecionados ${selected.size}`],
  ];

  const filtered = useMemo(() => {
    let list = rows.slice();
    const q = query.toLowerCase().trim();
    if (q) list = list.filter((g) => [g.name, g.description].filter(Boolean).join(' ').toLowerCase().includes(q));
    if (filter === 'with') list = list.filter((g) => g.memberCount > 0);
    else if (filter === 'empty') list = list.filter((g) => g.memberCount === 0);
    else if (filter === 'selected') list = list.filter((g) => selected.has(g.id));
    list.sort((a, b) => sort === 'members' ? b.memberCount - a.memberCount : sort === 'recent' ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name));
    return list;
  }, [rows, query, sort, filter, selected]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selList = rows.filter((g) => selected.has(g.id));

  const openAssign = (g: GroupRow) => {
    if (g.memberCount === 0) { toast({ variant: 'info', title: 'Grupo vazio', description: 'Adiciona membros antes de atribuir.' }); return; }
    setAssignGroup(g);
    setAssignOpen(true);
  };

  const board = selList.length === 0 ? (
    <>
      <div className="board-card">
        <div className="board-title">Painel de Grupos</div>
        <div className="board-sub">Cria grupos para agir em escala e atribuir conteúdos a vários {pp}.</div>
        <div className="board-actions">
          <button className="btn primary" onClick={() => setCreateOpen(true)}>+ Criar Grupo</button>
          <button className="btn secondary" onClick={() => setFilter('empty')}>Ver vazios</button>
          <button className="btn secondary" onClick={() => navigate('/clients')}>Ver {pp}</button>
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Resumo</div>
        <div className="mini-row"><span>Grupos</span><b>{rows.length}</b></div>
        <div className="mini-row"><span>Membros (total)</span><b>{totalMembers}</b></div>
        <div className="mini-row"><span>Grupos vazios</span><b>{empties}</b></div>
      </div>
    </>
  ) : (
    <>
      <div className="board-card">
        <div className="board-title">{selList.length} selecionado(s)</div>
        <div className="board-sub">Ações sobre a seleção.</div>
        <div className="selected-list">
          {selList.slice(0, 5).map((g) => (
            <div key={g.id} className="selected-pill">
              <div className="group-icon" style={{ width: 32, height: 32, borderRadius: 10, fontSize: '.9rem' }}>⊞</div>
              <div><b>{g.name}</b><span>{g.memberCount} membro(s)</span></div>
            </div>
          ))}
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Ações principais</div>
        <div className="board-actions">
          {selList.length === 1 && (
            <>
              <button className="btn primary" onClick={() => navigate(`/groups/${selList[0].id}`)}>Abrir grupo</button>
              <button className="btn secondary" onClick={() => openAssign(selList[0])}>Atribuir plano</button>
            </>
          )}
          <button className="btn ghost" onClick={() => setSelected(new Set())}>Limpar seleção</button>
        </div>
      </div>
    </>
  );

  return (
    <CoachShell
      headStrong="Grupos"
      headSub="Grupos para agir em escala."
      topActions={<button className="btn primary" onClick={() => setCreateOpen(true)}>+ Criar Grupo</button>}
      board={board}
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="page-head">
          <div>
            <div className="kicker">Grupos</div>
            <h1>Grupos para agir em escala e consultar em profundidade.</h1>
            <p>Cria grupos, junta {pp} e atribui conteúdos a vários de uma só vez.</p>
          </div>
          <div className="head-actions">
            <button className="btn primary" onClick={() => setCreateOpen(true)}>+ Criar Grupo</button>
          </div>
        </div>

        <div className="stats">
          {stats.map((st) => (
            <button key={st.id} className={`stat${filter === st.id ? ' on' : ''}`} onClick={() => setFilter(st.id === 'members' ? 'all' : st.id)}>
              <div className="stat-k">{st.k}</div>
              <div className="stat-v">{loading ? '…' : st.v}</div>
              <div className="stat-s">{st.s}</div>
            </button>
          ))}
        </div>

        <div className="toolbar">
          <div className="toolbar-top">
            <label className="search">⌕<input value={query} onChange={(e) => setQuery(e.target.value)} type="search" aria-label="Procurar grupo" placeholder="Pesquisar grupo ou descrição..." /></label>
            <select className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="name">Nome A-Z</option>
              <option value="members">Mais membros</option>
              <option value="recent">Mais recente</option>
            </select>
            {selected.size > 0 && <button className="btn secondary small" onClick={() => setSelected(new Set())}>Limpar seleção</button>}
          </div>
          <div className="filter-row">
            {filters.map(([id, l]) => (
              <button key={id} className={`chip${filter === id ? ' on' : ''}`} onClick={() => setFilter(id)}>{l}</button>
            ))}
          </div>
        </div>

        {error && <div className="empty"><b>Erro ao carregar</b><p>{error}</p></div>}

        <div className="list-card">
          {loading
            ? <div className="empty"><b>A carregar…</b></div>
            : filtered.length === 0
              ? <div className="groups-empty"><b>Nenhum grupo encontrado</b><p style={{ fontSize: '.78rem', marginTop: 5 }}>Ajusta a pesquisa ou cria um novo grupo.</p><button className="btn primary small" style={{ marginTop: 12 }} onClick={() => setCreateOpen(true)}>+ Criar Grupo</button></div>
              : (
                <div className="groups-grid">
                  {filtered.map((g) => (
                    <article
                      key={g.id}
                      className={`group-card${selected.has(g.id) ? ' selected' : ''}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`Grupo ${g.name}`}
                      onClick={() => navigate(`/groups/${g.id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/groups/${g.id}`); }}
                    >
                      <input
                        className="group-check"
                        type="checkbox"
                        checked={selected.has(g.id)}
                        onChange={() => toggle(g.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Selecionar ${g.name}`}
                      />
                      <div className="group-top">
                        <div className="group-icon" style={g.color ? { background: g.color, color: 'rgba(255,255,255,.96)' } : undefined}>⊞</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="group-name">{g.name}</div>
                          <div className="group-meta">{g.memberCount} {pp}</div>
                        </div>
                      </div>
                      <div className="group-kpis">
                        <div className="group-kpi"><b>{g.memberCount}</b><span>{vocab.pessoa({ plural: true, maiuscula: true })}</span></div>
                        <div className="group-kpi"><b>{new Date(g.updatedAt).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' })}</b><span>Atual.</span></div>
                      </div>
                      <div className="group-rule"><p>{g.description || 'Grupo manual: escolhido pela equipa.'}</p></div>
                      <div className="group-footer">
                        <button className="btn secondary small" onClick={(e) => { e.stopPropagation(); navigate(`/groups/${g.id}`); }}>Abrir</button>
                        <button className="btn ghost small" onClick={(e) => { e.stopPropagation(); openAssign(g); }}>Atribuir</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
        </div>
      </div>

      <NewGroupModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      {assignGroup && (
        <AssignGroupModal
          open={assignOpen}
          onClose={() => { setAssignOpen(false); setAssignGroup(null); }}
          group={assignGroup}
          onDone={() => { setAssignOpen(false); setAssignGroup(null); load(); }}
        />
      )}
    </CoachShell>
  );
}

function NewGroupModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const scope = useScope();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (open) { setName(''); setDescription(''); setErr(null); } }, [open]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão Supabase.'); return; }
    if (!name.trim()) { setErr('O nome é obrigatório.'); return; }
    setBusy(true); setErr(null);
    try {
      await createGroup(client, scope, { name: name.trim(), description: description || null });
      toast({ variant: 'success', title: 'Grupo criado', description: name.trim() });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao criar grupo');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal open={open} onClose={onClose} title="Novo Grupo" sub="Cria um grupo para agir em escala."
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'A criar…' : 'Criar grupo'}</button>
      </>}>
      <div className="proto-form">
        <div className="field"><label>Nome</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Equipa Principal" /></div>
        <div className="field"><label>Descrição (opcional)</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Critério ou objetivo do grupo" /></div>
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}

function AssignGroupModal({ open, onClose, group, onDone }: {
  open: boolean; onClose: () => void; group: GroupRow; onDone: () => void;
}) {
  const scope = useScope();
  const [plans, setPlans] = useState<PlanLite[]>([]);
  const [planId, setPlanId] = useState('');
  const [memberCount, setMemberCount] = useState(group.memberCount);
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null); setPlanId('');
    const client = getSupabaseClient();
    if (!client) return;
    setLoadingPlans(true);
    void Promise.all([
      fetchPlans(client, scope),
      fetchGroupMemberIds(client, scope, group.id),
    ])
      .then(([p, ids]) => { setPlans(p); setPlanId(p[0]?.id ?? ''); setMemberCount(ids.length); })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro'))
      .finally(() => setLoadingPlans(false));
  }, [open, scope, group.id]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão.'); return; }
    if (!planId) { setErr('Escolhe um plano.'); return; }
    setBusy(true); setErr(null);
    try {
      const n = (await assignPlanToGroup(client, scope, group.id, planId)).created;
      toast({ variant: 'success', title: 'Plano atribuído', description: `${n} membro(s) de ${group.name}.` });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao atribuir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal open={open} onClose={onClose} title="Atribuir plano ao grupo" sub={`${group.name} · ${memberCount} membro(s)`}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || loadingPlans || !planId || memberCount === 0}>{busy ? 'A atribuir…' : 'Atribuir'}</button>
      </>}>
      <div className="proto-form">
        <div className="field">
          <label>Plano a atribuir</label>
          {loadingPlans
            ? <select disabled><option>A carregar…</option></select>
            : plans.length === 0
              ? <p className="proto-error">Ainda não há planos. Cria planos no Plans.OS (fase própria).</p>
              : <select value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        </div>
        {memberCount === 0 && <p className="proto-error">Este grupo ainda não tem membros.</p>}
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}
