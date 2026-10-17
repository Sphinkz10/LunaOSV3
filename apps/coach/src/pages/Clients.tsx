import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  archiveClient, assignPlanToClients, confirmarDestrutivo, addClient, DuplicateClientError, fetchClients, fetchPlans, fetchStaff, toast, updateClientStatus,
  type ClientRow, type ClientStatus, type PlanLite, type StaffLite,
} from '@luna/core';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { vocab } from '../lib/vocab';

// Nomes da modalidade (regra 4): nunca "atleta" escrito à mão
const P1 = vocab.pessoa({ maiuscula: true });
const p1 = vocab.pessoa();
const PP = vocab.pessoa({ plural: true, maiuscula: true });
const pp = vocab.pessoa({ plural: true });
const RESP = vocab.responsavel();
import { ProtoDrawer } from '../app/ProtoDrawer';
import { ProtoModal } from '../app/ProtoModal';
import { useMediaQuery } from '../app/useMediaQuery';
import { getSupabaseClient } from '../lib/supabase';

const STATUS_META: Record<ClientStatus, { label: string; tone: string }> = {
  active: { label: 'Ativo', tone: 'bsuccess' },
  blocked: { label: 'Bloqueado', tone: 'bdanger' },
  return_to_play: { label: 'RTP', tone: 'bt' },
  injured: { label: 'Lesionado', tone: 'bwarn' },
  inactive: { label: 'Inativo', tone: 'bm' },
};

interface AdvFilters { status: 'all' | ClientStatus; plan: 'all' | 'with' | 'without'; responsible: string; group: string }
const DEFAULT_ADV: AdvFilters = { status: 'all', plan: 'all', responsible: '', group: '' };
const SAVED_VIEWS_KEY = 'lunaSavedClientViews';

interface SavedView {
  id: string;
  name: string;
  filter: string;
  query: string;
  sort: string;
  advanced: AdvFilters;
}

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch {
    return [];
  }
}

function storeSavedViews(list: SavedView[]) {
  try {
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(list.slice(0, 8)));
  } catch { /* ignore */ }
}

function stubModuleAction(label: string) {
  toast({ variant: 'info', title: 'Em breve', description: `${label} ficará disponível no módulo próprio.` });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function formatLast(iso: string) {
  return new Date(iso).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
}

function phase3ViewLabel(filter: string) {
  const map: Record<string, string> = {
    all: 'Todos', attention: 'Atenção', noplan: 'Sem plano', pending: 'Pendentes',
    blocked: 'Bloqueados', onboarding: 'Onboarding', rtp: 'RTP', selected: 'Selecionados',
    forms: 'Forms pendentes', docs: 'Docs pendentes', advanced: 'Mais filtros',
  };
  return map[filter] ?? 'Vista atual';
}

function phase3Counts(rows: ClientRow[]) {
  return {
    total: rows.length,
    noplan: rows.filter((a) => !a.hasPlan).length,
    pending: rows.reduce((s, a) => s + a.pending, 0),
    blocked: rows.filter((a) => a.status === 'blocked').length,
    rtp: rows.filter((a) => a.status === 'return_to_play').length,
    forms: 0,
    docs: rows.filter((a) => !a.docsOk).length,
  };
}

function phase3Problem(a: ClientRow) {
  if (a.status === 'blocked') {
    return { label: 'Bloqueio ativo', tone: 'bdanger', detail: a.statusNote || 'Impede novas atribuições.' };
  }
  if (!a.docsOk) {
    return { label: 'Documento pendente', tone: 'bwarn', detail: `Docs ${a.docsLabel}` };
  }
  if (!a.hasPlan) return { label: 'Sem plano ativo', tone: 'bwarn', detail: 'Precisa de conteúdo base.' };
  if (a.status === 'return_to_play') return { label: 'RTP em curso', tone: 'bm', detail: 'Validar progressão antes da próxima carga.' };
  if (a.status === 'injured') return { label: 'Lesionado', tone: 'bwarn', detail: a.statusNote || 'Rever antes de nova carga.' };
  if (a.status === 'inactive') return { label: 'Inativo', tone: 'bm', detail: a.statusNote || 'Sem atividade recente.' };
  if (a.pending > 0) return { label: 'Pendências abertas', tone: 'bwarn', detail: `${a.pending} item(ns) a fechar` };
  return { label: 'Operacional', tone: 'bsuccess', detail: 'Sem bloqueios críticos.' };
}

function phase3Content(a: ClientRow) {
  if (!a.hasPlan) return { main: 'Sem plano', sub: 'Atribuição recomendada' };
  const parts: string[] = [];
  if (!a.docsOk) parts.push(`Docs ${a.docsLabel}`);
  if (a.pending > 0) parts.push(`${a.pending} pend.`);
  return { main: a.planName ?? 'Plano ativo', sub: parts.length ? parts.join(' · ') : 'Conteúdo ativo' };
}

function phase3Action(a: ClientRow) {
  if (a.status === 'blocked') return { label: 'Rever bloqueio', action: 'review-block' as const };
  if (!a.docsOk) return { label: 'Pedir doc', action: 'request-doc' as const };
  if (!a.hasPlan) return { label: 'Atribuir plano', action: 'assign' as const };
  return { label: 'Abrir 360', action: 'open-athlete' as const };
}

function rowIssueMain(a: ClientRow, p: ReturnType<typeof phase3Problem>) {
  if (a.statusNote) return a.statusNote;
  if (!a.docsOk) return `Documento ${a.docsLabel.toLowerCase()}`;
  return p.label;
}

function recommend(a: ClientRow) {
  if (a.status === 'blocked') return `Resolver bloqueios antes de novas atribuições. Começa por documentos e ${RESP} responsável.`;
  if (!a.docsOk) return 'Pedir renovação ou upload antes de novas atribuições.';
  if (a.status === 'return_to_play') return 'Rever aprovação do fisio antes de atribuir sessões RTP.';
  if (a.status === 'inactive') return `Enviar follow-up e reativar o ${p1} se necessário.`;
  if (!a.hasPlan) return 'Atribuir conteúdo base antes de novas cargas.';
  return 'Tudo em dia. Podes atribuir novo conteúdo ou abrir perfil.';
}

function ClientAvatar({ a }: { a: ClientRow }) {
  if (a.avatarUrl) return <img className="avatar" src={a.avatarUrl} alt="" loading="lazy" />;
  return <div className="avatar initials">{initials(a.name)}</div>;
}

function mobileActionLabel(a: ClientRow): string {
  const pa = phase3Action(a);
  if (pa.action === 'review-block') return 'Rever';
  if (pa.action === 'request-doc') return 'Doc';
  if (pa.action === 'assign') return 'Atribuir';
  return 'Abrir';
}

function ClientRowDetailModal({
  athlete, onClose, onPrimary,
}: {
  athlete: ClientRow | null;
  onClose: () => void;
  onPrimary: (a: ClientRow) => void;
}) {
  if (!athlete) return null;
  const p = phase3Problem(athlete);
  const content = phase3Content(athlete);
  const pa = phase3Action(athlete);
  const issueMain = rowIssueMain(athlete, p);
  return (
    <ProtoModal
      open={!!athlete}
      onClose={onClose}
      title={athlete.name}
      sub={[athlete.groupName, athlete.responsibleName].filter(Boolean).join(' · ') || '—'}
      size="sm"
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
          <button type="button" className="btn primary" onClick={() => { onPrimary(athlete); onClose(); }}>{pa.label}</button>
        </>
      )}
    >
      <div className="proto-form" style={{ gap: 10 }}>
        <div className="phase3-selected-status"><span className={`badge ${p.tone}`}>{p.label}</span></div>
        <div className="mini-row"><span>Estado</span><b>{p.detail}</b></div>
        <div className="mini-row"><span>Problema</span><b>{issueMain}</b></div>
        <div className="mini-row"><span>Recomendação</span><b style={{ whiteSpace: 'normal', textAlign: 'right', lineHeight: 1.35 }}>{recommend(athlete)}</b></div>
        <div className="mini-row"><span>Conteúdo</span><b>{content.main}</b></div>
        <div className="mini-row"><span>Subtexto</span><b>{content.sub}</b></div>
      </div>
    </ProtoModal>
  );
}

function ClientsBoardPanel({
  rows, selList, hasSelection, savedViews, onAssign, onClear, onFilter, onOpen360, onNavigateGroups, onSaveView, onLoadView, onRowAction, onArchive,
}: {
  rows: ClientRow[];
  selList: ClientRow[];
  hasSelection: boolean;
  savedViews: SavedView[];
  onAssign: () => void;
  onClear: () => void;
  onFilter: (id: string) => void;
  onOpen360: (a: ClientRow) => void;
  onNavigateGroups: () => void;
  onSaveView: () => void;
  onLoadView: (view: SavedView) => void;
  onRowAction: (a: ClientRow) => void;
  onArchive: (targets: ClientRow[]) => void;
}) {
  const c = phase3Counts(rows);

  if (!hasSelection) {
    const alerts: [string, number, string, string][] = [
      ['Sem plano', c.noplan, 'noplan', 'Atribuir conteúdo base'],
      ['Bloqueados', c.blocked, 'blocked', 'Rever antes de nova carga'],
      ['Forms pendentes', c.forms, 'forms', 'Enviar lembrete'],
      ['Docs pendentes', c.docs, 'docs', 'Pedir renovação'],
    ];
    return (
      <>
        <div className="board-card phase3-board-priority">
          <div className="board-title">Hoje exige atenção</div>
          <div className="board-sub">Prioridades calculadas a partir da carteira atual.</div>
          {alerts.map(([label, count, filter, sub]) => (
            <button key={filter} type="button" className="phase3-priority-row" onClick={() => onFilter(filter)}>
              <span><b>{count}</b> {label}</span>
              <small>{sub}</small>
            </button>
          ))}
        </div>
        <div className="board-card">
          <div className="board-title">Ações rápidas</div>
          <div className="board-sub">Escolhe uma fila operacional ou começa pela pesquisa.</div>
          <div className="board-actions">
            <button type="button" className="btn secondary" onClick={() => onFilter('noplan')}>Ver sem plano</button>
            <button type="button" className="btn secondary" onClick={() => onFilter('blocked')}>Ver bloqueios</button>
            <button type="button" className="btn secondary" onClick={() => onFilter('forms')}>Ver forms pendentes</button>
            <button type="button" className="btn ghost" onClick={onSaveView}>Guardar vista atual</button>
          </div>
        </div>
        <div className="board-card">
          <div className="board-title">Vistas guardadas</div>
          {savedViews.length > 0 ? (
            savedViews.slice(0, 5).map((v) => (
              <div key={v.id} className="mini-row">
                <span>{v.name}</span>
                <button type="button" className="btn ghost small" onClick={() => onLoadView(v)}>Abrir</button>
              </div>
            ))
          ) : (
            <div className="board-sub" style={{ marginTop: 6 }}>Ainda não guardaste vistas. Cria uma vista para regressar rapidamente aos teus filtros.</div>
          )}
        </div>
        <div className="board-card">
          <div className="board-title">Conteúdos disponíveis para atribuição</div>
          <div className="mini-row"><span>Planos</span><b>origem externa</b></div>
          <div className="mini-row"><span>Treinos / aulas</span><b>origem externa</b></div>
          <div className="mini-row"><span>Forms</span><b>origem externa</b></div>
          <div className="mini-row"><span>Relatórios</span><b>origem externa</b></div>
        </div>
      </>
    );
  }

  if (selList.length === 1) {
    const a = selList[0];
    const p = phase3Problem(a);
    const pa = phase3Action(a);
    const content = phase3Content(a);
    return (
      <>
        <div className="board-card phase3-selected-athlete">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <ClientAvatar a={a} />
            <div style={{ minWidth: 0 }}>
              <div className="board-title">{a.name}</div>
              <div className="board-sub">{[a.responsibleName, a.groupName].filter(Boolean).join(' · ') || '—'}</div>
            </div>
          </div>
          <div className="phase3-selected-status"><span className={`badge ${p.tone}`}>{p.label}</span></div>
          <div className="mini-row"><span>Problema</span><b>{p.detail}</b></div>
          <div className="mini-row"><span>Conteúdo</span><b>{content.main}</b></div>
          <div className="mini-row"><span>Última atividade</span><b>{formatLast(a.updatedAt)}</b></div>
        </div>
        <div className="board-card">
          <div className="board-title">Próxima ação</div>
          <p className="board-sub" style={{ marginTop: 6 }}>{recommend(a)}</p>
          <div className="board-actions">
            <button type="button" className="btn primary" onClick={() => {
              if (pa.action === 'assign') onAssign();
              else if (pa.action === 'open-athlete') onOpen360(a);
              else onRowAction(a);
            }}>
              {pa.label}
            </button>
            <button type="button" className="btn secondary" onClick={() => onOpen360(a)}>Abrir ficha</button>
            <button type="button" className="btn ghost" onClick={onAssign}>Atribuir conteúdo</button>
          </div>
        </div>
        <div className="board-card">
          <div className="board-title">Ações rápidas</div>
          <div className="split-actions">
            <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Pedir documento')}>Pedir documento</button>
            <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Enviar form')}>Enviar form</button>
            <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Atribuir coach')}>Atribuir coach</button>
            <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Criar tarefa')}>Criar tarefa</button>
            <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Mensagem')}>Mensagem</button>
            <button type="button" className="btn secondary small" onClick={onClear}>Limpar</button>
          </div>
        </div>
        <div className="board-card board-danger">
          <div className="board-title">Zona de risco</div>
          <p className="board-sub" style={{ marginTop: 6 }}>Arquivar remove o {p1} da lista (reversível); os dados ficam guardados.</p>
          <div className="board-actions">
            <button type="button" className="btn danger" onClick={() => onArchive([a])}>Arquivar {p1}…</button>
          </div>
        </div>
      </>
    );
  }

  const summary = {
    noplan: selList.filter((a) => !a.hasPlan).length,
    docs: selList.filter((a) => !a.docsOk).length,
    forms: 0,
    blocks: selList.filter((a) => a.status === 'blocked').length,
    pending: selList.reduce((s, a) => s + a.pending, 0),
  };

  return (
    <>
      <div className="board-card">
        <div className="board-title">{selList.length} {pp} selecionados</div>
        <div className="board-sub">Antes de publicar qualquer ação, revê impacto e exceções.</div>
        <div className="phase3-impact-grid">
          <div><b>{summary.noplan}</b><span>sem plano</span></div>
          <div><b>{summary.docs}</b><span>docs</span></div>
          <div><b>{summary.forms}</b><span>forms</span></div>
          <div><b>{summary.blocks}</b><span>bloqueios</span></div>
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Pré-visualização da ação</div>
        <div className="mini-row"><span>Alvos</span><b>{selList.length}</b></div>
        <div className="mini-row"><span>Possíveis exclusões</span><b>{summary.blocks + summary.docs}</b></div>
        <div className="mini-row"><span>Pendências totais</span><b>{summary.pending}</b></div>
        <div className="board-sub" style={{ marginTop: 8 }}>Atribuições em massa devem excluir bloqueados ou docs pendentes quando fizer sentido.</div>
      </div>
      <div className="board-card">
        <div className="board-title">Ações principais</div>
        <div className="board-actions">
          <button type="button" className="btn primary" onClick={onAssign}>Atribuir conteúdo</button>
          <button type="button" className="btn secondary" onClick={() => stubModuleAction('Pedir documentos')}>Pedir documentos</button>
          <button type="button" className="btn secondary" onClick={() => stubModuleAction('Enviar form')}>Enviar form</button>
          <button type="button" className="btn ghost" onClick={() => stubModuleAction('Criar tarefa')}>Criar tarefa</button>
        </div>
      </div>
      <div className="board-card">
        <div className="board-title">Gerir seleção</div>
        <div className="split-actions">
          <button type="button" className="btn secondary small" onClick={onNavigateGroups}>Criar grupo</button>
          <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Atribuir coach')}>Atribuir coach</button>
          <button type="button" className="btn secondary small" onClick={() => stubModuleAction('Exportar')}>Exportar</button>
          <button type="button" className="btn secondary small" onClick={onClear}>Limpar</button>
        </div>
      </div>
      <div className="board-card board-danger">
        <div className="board-title">Zona de risco</div>
        <p className="board-sub" style={{ marginTop: 6 }}>Arquivar {selList.length} {pp}: saem da lista, reversível.</p>
        <div className="board-actions">
          <button type="button" className="btn danger" onClick={() => onArchive(selList)}>Arquivar selecionados…</button>
        </div>
      </div>
    </>
  );
}

/** Clientes (G-03): a carteira do PT ou da organização, conforme o papel. */
export function Clients() {
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 960px)');
  const scope = useScope();
  const [boardOpen, setBoardOpen] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Filtros no endereço: "Voltar a…" a partir da ficha repõe-nos (G-00)
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [sort, setSort] = useState(searchParams.get('ordem') ?? 'priority');
  const [filter, setFilter] = useState(searchParams.get('filtro') ?? 'all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (sort !== 'priority') p.set('ordem', sort);
    if (filter !== 'all') p.set('filtro', filter);
    setSearchParams(p, { replace: true });
  }, [query, sort, filter, setSearchParams]);
  const abrirFicha = (id: string) => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (sort !== 'priority') p.set('ordem', sort);
    if (filter !== 'all') p.set('filtro', filter);
    const qs = p.toString();
    navigate(`/clients/${id}`, { state: { voltar: { rotulo: vocab.pessoa({ plural: true, maiuscula: true }), href: `/clients${qs ? `?${qs}` : ''}` } } });
  };
  // Botão + (G-00): /clients?novo=1 abre logo o novo cliente
  const [createOpen, setCreateOpen] = useState(searchParams.get('novo') === '1');
  useEffect(() => {
    if (searchParams.get('novo') === '1') { setCreateOpen(true); setSearchParams((p) => { p.delete('novo'); return p; }, { replace: true }); }
  }, [searchParams, setSearchParams]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTargets, setAssignTargets] = useState<ClientRow[]>([]);
  const [advOpen, setAdvOpen] = useState(false);
  const [adv, setAdv] = useState<AdvFilters>(DEFAULT_ADV);
  const [rowAction, setRowAction] = useState<ClientRow | null>(null);
  const [detailClient, setDetailClient] = useState<ClientRow | null>(null);
  /** Arquivar (reversível, com motivo) usa a confirmação comum (P-01). */
  const pedirArquivo = async (targets: ClientRow[]) => {
    const client = getSupabaseClient();
    if (!client || targets.length === 0) return;
    const many = targets.length > 1;
    const comPlano = targets.filter((t) => t.hasPlan).length;
    const ok = await confirmarDestrutivo({
      titulo: many ? `Arquivar ${targets.length} ${pp}?` : `Arquivar ${targets[0].name}?`,
      texto: 'Deixa de aparecer nas listas. O histórico fica e podes voltar a ativar.',
      efeitos: [
        `${targets.length} ${many ? pp : p1} saem da carteira ativa`,
        ...(comPlano ? [`${comPlano} com plano ativo: o plano fica guardado`] : []),
      ],
      verbo: 'Arquivar', manter: 'Cancelar',
      motivo: { rotulo: 'Motivo (opcional)', placeholder: 'Ex.: mudou de cidade' },
      acao: async (motivo) => { for (const a of targets) await archiveClient(client, scope, a.id, motivo ?? null); },
    });
    if (ok) {
      toast({ variant: 'success', title: many ? `${targets.length} ${pp} arquivados` : `${P1} arquivado`, description: many ? undefined : targets[0].name });
      setSelected(new Set()); load();
    }
  };
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews());
  const [saveViewOpen, setSaveViewOpen] = useState(false);

  const advActive = adv.status !== 'all' || adv.plan !== 'all' || adv.responsible.trim() !== '' || adv.group.trim() !== '';

  useEffect(() => {
    document.body.classList.add('phase3-athletes-active');
    return () => document.body.classList.remove('phase3-athletes-active');
  }, []);

  const load = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    void fetchClients(client, scope)
      .then((a) => { if (!cancelled) { setRows(a); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : `Erro ao carregar ${pp}`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scope]);

  useEffect(() => load(), [load]);

  const counts = useMemo(() => phase3Counts(rows), [rows]);

  const stats: { id: string; k: string; v: number; s: string }[] = [
    { id: 'all', k: 'Total', v: counts.total, s: 'Limpar filtros' },
    { id: 'noplan', k: 'Sem plano', v: counts.noplan, s: 'Atribuir conteúdo' },
    { id: 'pending', k: 'Pendências', v: counts.pending, s: 'Forms, docs e tarefas' },
    { id: 'blocked', k: 'Bloqueios', v: counts.blocked, s: 'Requer revisão' },
    { id: 'rtp', k: 'RTP', v: counts.rtp, s: 'Retorno à prática' },
  ];

  const filters: [string, string][] = [
    ['all', 'Todos'],
    ['attention', 'Atenção'],
    ['noplan', 'Sem plano'],
    ['pending', 'Pendentes'],
    ['blocked', 'Bloqueados'],
    ['forms', 'Forms'],
    ['docs', 'Docs'],
    ['onboarding', 'Onboarding/Trial'],
    ['rtp', 'RTP'],
    ['selected', `Selecionados ${selected.size}`],
    ['advanced', 'Mais filtros'],
  ];

  const NO_DATA_FILTERS = useMemo(() => {
    const s = new Set<string>(['forms', 'onboarding']);
    if (!rows.some((a) => a.pending > 0)) s.add('pending');
    if (!rows.some((a) => !a.docsOk)) s.add('docs');
    return s;
  }, [rows]);

  const filtered = useMemo(() => {
    let list = rows.slice();
    const q = query.toLowerCase().trim();
    if (q) {
      list = list.filter((a) => [
        a.name, a.responsibleName, a.groupName, a.planName, STATUS_META[a.status].label, a.statusNote,
        a.hasPlan ? (a.planName ?? 'Plano ativo') : 'Sem plano',
        !a.docsOk ? `Docs ${a.docsLabel}` : 'Docs OK',
        '—',
      ].filter(Boolean).join(' ').toLowerCase().includes(q));
    }
    if (filter === 'attention') {
      list = list.filter((a) => a.status === 'blocked' || a.status === 'injured' || a.status === 'return_to_play' || !a.hasPlan || a.pending > 0);
    } else if (filter === 'noplan') list = list.filter((a) => !a.hasPlan);
    else if (filter === 'pending') list = list.filter((a) => a.pending > 0);
    else if (filter === 'blocked') list = list.filter((a) => a.status === 'blocked');
    else if (filter === 'forms') list = [];
    else if (filter === 'docs') list = list.filter((a) => !a.docsOk);
    else if (filter === 'onboarding') list = [];
    else if (filter === 'rtp') list = list.filter((a) => a.status === 'return_to_play');
    else if (filter === 'selected') list = list.filter((a) => selected.has(a.id));
    else if (filter === 'advanced') { /* keep list; advanced modal handles */ }

    if (adv.status !== 'all') list = list.filter((a) => a.status === adv.status);
    if (adv.plan === 'with') list = list.filter((a) => a.hasPlan);
    else if (adv.plan === 'without') list = list.filter((a) => !a.hasPlan);
    if (adv.responsible.trim()) list = list.filter((a) => (a.responsibleName ?? '').toLowerCase().includes(adv.responsible.toLowerCase().trim()));
    if (adv.group.trim()) list = list.filter((a) => (a.groupName ?? '').toLowerCase().includes(adv.group.toLowerCase().trim()));

    const rank = (a: ClientRow) => (a.status === 'blocked' ? 0 : a.status === 'injured' ? 1 : a.status === 'return_to_play' ? 2 : !a.hasPlan ? 3 : 5);
    list.sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'activity') return b.updatedAt.localeCompare(a.updatedAt);
      if (sort === 'pending') return rank(a) - rank(b);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
    return list;
  }, [rows, query, filter, sort, selected, adv]);

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const selList = rows.filter((a) => selected.has(a.id));

  const openAssign = (targets?: ClientRow[]) => {
    const list = targets ?? selList;
    if (list.length === 0) {
      toast({ variant: 'info', title: `Seleciona ${pp}`, description: `Escolhe pelo menos um ${p1} para atribuir.` });
      return;
    }
    setAssignTargets(list);
    setAssignOpen(true);
  };

  const handleRowAction = (a: ClientRow) => {
    const pa = phase3Action(a);
    if (pa.action === 'open-athlete') { abrirFicha(a.id); return; }
    if (pa.action === 'assign') { openAssign([a]); return; }
    if (pa.action === 'request-doc') {
      abrirFicha(a.id);
      toast({ variant: 'info', title: 'Documentos', description: 'Consulta e gere documentos na ficha.' });
      return;
    }
    setRowAction(a);
  };

  const handleFilterChip = (id: string) => {
    if (id === 'advanced') { setAdvOpen(true); return; }
    setFilter(id);
  };

  const saveView = () => setSaveViewOpen(true);

  const persistView = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: SavedView = {
      id: `view_${Date.now()}`,
      name: trimmed,
      filter,
      query,
      sort,
      advanced: { ...adv },
    };
    const list = savedViews.filter((v) => v.name !== trimmed);
    list.unshift(next);
    const capped = list.slice(0, 8);
    storeSavedViews(capped);
    setSavedViews(capped);
    setSaveViewOpen(false);
    toast({ variant: 'success', title: 'Vista guardada', description: trimmed });
  };

  const applySavedView = (view: SavedView) => {
    setFilter(view.filter);
    setQuery(view.query);
    setSort(view.sort);
    setAdv(view.advanced);
    setBoardOpen(false);
    toast({ variant: 'success', title: 'Vista aplicada', description: view.name });
  };

  const boardPanel = (
    <ClientsBoardPanel
      rows={rows}
      selList={selList}
      hasSelection={selList.length > 0}
      savedViews={savedViews}
      onAssign={() => { setBoardOpen(false); openAssign(); }}
      onClear={() => setSelected(new Set())}
      onFilter={(id) => { setFilter(id); setBoardOpen(false); }}
      onOpen360={(a) => { setBoardOpen(false); abrirFicha(a.id); }}
      onNavigateGroups={() => { setBoardOpen(false); navigate('/groups'); }}
      onSaveView={saveView}
      onLoadView={applySavedView}
      onRowAction={(a) => { setBoardOpen(false); setRowAction(a); }}
      onArchive={(targets) => { setBoardOpen(false); void pedirArquivo(targets); }}
    />
  );

  const mobileAssign = () => {
    if (selList.length === 0) {
      setBoardOpen(true);
      toast({ variant: 'info', title: `Seleciona ${pp}`, description: `Marca ${pp} na lista ou usa o painel de ações.` });
      return;
    }
    openAssign();
  };

  const viewLabel = phase3ViewLabel(filter);

  return (
    <CoachShell
      headStrong={PP}
      headSub={scope.canSeeAllClients ? "A carteira da organização" : "A tua carteira"}
      topActions={<button type="button" className="btn primary hide-mobile" onClick={() => setCreateOpen(true)}>+ {P1}</button>}
      board={boardPanel}
      mainClassName={isMobile ? 'has-page-actions' : undefined}
      pageActions={isMobile ? (
        <div className="mobile-actions">
          <button type="button" className="btn secondary" onClick={() => setBoardOpen(true)}>
            {selected.size > 0 ? `${selected.size} selecionado(s)` : 'Ações'}
          </button>
          <button type="button" className="btn primary" onClick={mobileAssign}>
            {selected.size > 0 ? `Atribuir a ${selected.size}` : 'Atribuir conteúdo'}
          </button>
        </div>
      ) : undefined}
    >
      <div className="athletes-page" style={{ display: 'grid', gap: 12 }}>
        <div className="page-head phase3-athletes-head">
          <div>
            <div className="kicker">{PP}</div>
            <h1 className="phase3-head-title">
              Quem precisa de atenção?
              {isMobile && (
                <span className="info-dot phase3-head-info" role="note" aria-label="Ajuda sobre esta área">
                  i
                  <span className="tip">
                    Consulta, seleciona, atribui e resolve sem sair da carteira.
                    {' '}Esta página serve para decidir quem precisa de ação, gerir seleção e abrir o 360 quando é preciso profundidade.
                  </span>
                </span>
              )}
            </h1>
            <p className="phase3-head-desc">
              Consulta, seleciona, atribui e resolve sem sair da carteira.
              {' '}
              <span className="info-dot phase3-head-desc-info" role="note" aria-label="Ajuda sobre esta área">
                i
                <span className="tip">Esta página serve para decidir quem precisa de ação, gerir seleção e abrir o 360 quando é preciso profundidade.</span>
              </span>
            </p>
            <div className="phase3-current-view">
              Vista atual: <b>{viewLabel}</b>
              {query ? <> · pesquisa: <b>{query}</b></> : null}
            </div>
          </div>
          <div className="head-actions">
            <button type="button" className="btn ghost" onClick={saveView}>Guardar vista</button>
            <button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>+ {P1}</button>
            <button type="button" className="btn secondary" onClick={() => openAssign()}>Atribuir conteúdo</button>
          </div>
        </div>

        <div className="stats phase3-stats">
          {stats.map((st) => (
            <button
              key={st.id}
              type="button"
              className={`stat phase3-stat${filter === st.id ? ' on' : ''}`}
              aria-pressed={filter === st.id}
              onClick={() => setFilter(st.id)}
            >
              <div className="stat-k">{st.k}</div>
              <div className="stat-v">{loading ? '…' : st.v}</div>
              <div className="stat-s">{st.s}</div>
              <div className="phase3-stat-hint">Filtrar</div>
            </button>
          ))}
        </div>

        <div className="toolbar phase3-toolbar">
          <div className="toolbar-top">
            <label className="search">
              ⌕
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                type="search"
                aria-label="Procurar"
                placeholder={`Pesquisar ${p1}, grupo, ${RESP}, estado ou plano…`}
              />
            </label>
            <div className="phase3-toolbar-inline">
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">
                <option value="priority">Ordenar: Prioridade</option>
                <option value="name">Nome A-Z</option>
                <option value="activity">Última atividade</option>
                <option value="pending">Mais pendências</option>
              </select>
              <button
                type="button"
                className={`advanced-search-btn${advActive ? ' on' : ''}`}
                onClick={() => setAdvOpen(true)}
              >
                Mais filtros
              </button>
              {advActive && (
                <button type="button" className="advanced-search-btn hide-mobile" onClick={() => setAdv(DEFAULT_ADV)}>Limpar filtros</button>
              )}
              <button type="button" className="gear-btn hide-mobile" title="Mais filtros" aria-label="Mais filtros" onClick={() => setAdvOpen(true)}>⚙</button>
            </div>
            {selected.size > 0 && (
              <button type="button" className="btn secondary small" onClick={() => setSelected(new Set())}>Limpar seleção</button>
            )}
          </div>
          <div className="toolbar-advanced hide-mobile">
            <button
              type="button"
              className={`advanced-search-btn${advActive ? ' on' : ''}`}
              onClick={() => setAdvOpen(true)}
            >
              Mais filtros
            </button>
            {advActive && (
              <button type="button" className="advanced-search-btn" onClick={() => setAdv(DEFAULT_ADV)}>Limpar filtros</button>
            )}
          </div>
          <div className="filter-row" role="tablist" aria-label="Filtrar plantel">
            {filters.filter(([id]) => !(isMobile && id === 'advanced')).map(([id, l]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                disabled={NO_DATA_FILTERS.has(id)}
                title={NO_DATA_FILTERS.has(id) ? 'Sem dados nesta carteira (módulo próprio)' : undefined}
                className={`chip${filter === id ? ' on' : ''}${id === 'blocked' ? ' danger' : ''}${NO_DATA_FILTERS.has(id) ? ' disabled' : ''}`}
                onClick={() => handleFilterChip(id)}
              >
                {l}
              </button>
            ))}
          </div>
          {savedViews.length > 0 && (
            <div className="phase3-saved-row">
              <span>Vistas guardadas</span>
              {savedViews.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className="chip phase3-view-chip"
                  onClick={() => applySavedView(v)}
                >
                  ★ {v.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <div className="empty"><b>Erro ao carregar</b><p>{error}</p></div>}

        <div className="list-card phase3-list-card">
          {!isMobile && (
            <div className="list-head phase3-list-head">
              <div /><div>{P1}</div><div>Estado</div><div className="phase3-col-narrow-hide">Problema principal</div><div className="phase3-col-narrow-hide">Conteúdo ativo</div><div>Ação</div>
            </div>
          )}
          <div className="phase3-list-summary">
            <b>{loading ? '…' : filtered.length}</b> {pp} nesta vista <span>· {viewLabel}</span>
          </div>
          <div className="ath-list">
            {loading ? (
              <div className="empty"><b>A carregar…</b></div>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <b>Nenhum {p1} encontrado</b>
                <p style={{ fontSize: '.78rem', marginTop: 5 }}>Ajusta a pesquisa ou os filtros.</p>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button type="button" className="btn secondary small" onClick={() => setFilter('all')}>Limpar filtros</button>
                  <button type="button" className="btn primary small" onClick={() => setCreateOpen(true)}>+ Criar {p1}</button>
                </div>
              </div>
            ) : (
              filtered.map((a) => {
                const meta = STATUS_META[a.status];
                const p = phase3Problem(a);
                const content = phase3Content(a);
                const pa = phase3Action(a);
                const subLine = [a.groupName || '—', a.responsibleName || '—', '—'].join(' · ');
                const issueMain = rowIssueMain(a, p);
                return (
                  <div
                    key={a.id}
                    className={`ath-row phase3-ath-row${selected.has(a.id) ? ' selected' : ''}`}
                  >
                    <div className="phase3-check-wrap">
                      <input
                        className="check"
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggle(a.id)}
                        aria-label={`Selecionar ${a.name}`}
                      />
                    </div>
                    <div
                      className="ath-main"
                      role="link"
                      tabIndex={0}
                      onClick={() => abrirFicha(a.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirFicha(a.id); } }}
                      aria-label={`Abrir perfil de ${a.name}`}
                    >
                      <ClientAvatar a={a} />
                      <div className="phase3-ath-ident">
                        <div className="ath-name">{a.name}</div>
                        <div className="ath-sub">{subLine}</div>
                        <div className="phase3-mini-badges">
                          <span>{meta.label}</span>
                          <span>{a.pending} pend.</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="phase3-row-info-btn phase3-row-chip-btn"
                        aria-label={`Ver detalhes de ${a.name}`}
                        onClick={(e) => { e.stopPropagation(); setDetailClient(a); }}
                      >
                        i
                      </button>
                    </div>
                    <div className="status-cell phase3-status-cell">
                      <span className={`badge ${p.tone}`}>{p.label}</span>
                      <div className="issue">{p.detail}</div>
                    </div>
                    <div className="phase3-problem-cell phase3-col-narrow-hide">
                      <b>{issueMain}</b>
                      <span>{recommend(a)}</span>
                    </div>
                    <div className="assign-cell phase3-col-narrow-hide">
                      <b>{content.main}</b>
                      <span>{content.sub}</span>
                    </div>
                    <div className="phase3-row-action-wrap">
                      <button type="button" className="row-action phase3-row-action phase3-row-chip-btn" onClick={() => handleRowAction(a)}>
                        {isMobile ? mobileActionLabel(a) : pa.label}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <ProtoDrawer
        open={isMobile && boardOpen}
        onClose={() => setBoardOpen(false)}
        title={selList.length > 0 ? `${selList.length} selecionado(s)` : 'Hoje exige atenção'}
        sub={selList.length > 0 ? 'Atribuir, agrupar ou limpar seleção.' : 'Prioridades e atalhos da carteira.'}
      >
        {boardPanel}
      </ProtoDrawer>

      <NewClientModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); load(); }} />
      <AssignModal open={assignOpen} onClose={() => setAssignOpen(false)} targets={assignTargets}
        onDone={() => { setAssignOpen(false); setSelected(new Set()); load(); }} />
      <AdvancedSearchModal open={advOpen} onClose={() => setAdvOpen(false)} value={adv} onApply={(v) => { setAdv(v); setAdvOpen(false); setFilter('advanced'); }} />
      <RowActionModal
        athlete={rowAction}
        onClose={() => setRowAction(null)}
        onOpen360={(a) => { setRowAction(null); abrirFicha(a.id); }}
        onAssign={(a) => { setRowAction(null); openAssign([a]); }}
        onChanged={() => { setRowAction(null); load(); }}
      />
      <ClientRowDetailModal
        athlete={detailClient}
        onClose={() => setDetailClient(null)}
        onPrimary={handleRowAction}
      />
      <SaveViewModal
        open={saveViewOpen}
        defaultName={phase3ViewLabel(filter)}
        onClose={() => setSaveViewOpen(false)}
        onSave={persistView}
      />
    </CoachShell>
  );
}

function SaveViewModal({ open, onClose, defaultName, onSave }: {
  open: boolean; onClose: () => void; defaultName: string; onSave: (name: string) => void;
}) {
  const [name, setName] = useState(defaultName);
  useEffect(() => { if (open) setName(defaultName); }, [open, defaultName]);
  return (
    <ProtoModal
      open={open}
      onClose={onClose}
      title="Guardar vista"
      sub="Regressa rapidamente a estes filtros e pesquisa."
      size="sm"
      footer={(
        <>
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn primary" onClick={() => onSave(name)} disabled={!name.trim()}>Guardar</button>
        </>
      )}
    >
      <div className="proto-form">
        <div className="field">
          <label htmlFor="view-name">Nome da vista</label>
          <input id="view-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Bloqueados urgentes" />
        </div>
      </div>
    </ProtoModal>
  );
}

function AdvancedSearchModal({ open, onClose, value, onApply }: {
  open: boolean; onClose: () => void; value: AdvFilters; onApply: (v: AdvFilters) => void;
}) {
  const [draft, setDraft] = useState<AdvFilters>(value);
  useEffect(() => { if (open) setDraft(value); }, [open, value]);
  return (
    <ProtoModal open={open} onClose={onClose} title="Mais filtros" sub="Combina critérios para afinar a lista."
      footer={<>
        <button className="btn ghost" onClick={() => onApply(DEFAULT_ADV)}>Limpar</button>
        <button className="btn primary" onClick={() => onApply(draft)}>Aplicar</button>
      </>}>
      <div className="proto-form">
        <div className="field-row">
          <div className="field"><label htmlFor="adv-status">Estado</label>
            <select id="adv-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as AdvFilters['status'] })}>
              <option value="all">Qualquer</option>
              {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="adv-plan">Plano</label>
            <select id="adv-plan" value={draft.plan} onChange={(e) => setDraft({ ...draft, plan: e.target.value as AdvFilters['plan'] })}>
              <option value="all">Qualquer</option>
              <option value="with">Com plano</option>
              <option value="without">Sem plano</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field"><label htmlFor="adv-resp">{RESP} contém</label><input id="adv-resp" className="input" value={draft.responsible} onChange={(e) => setDraft({ ...draft, responsible: e.target.value })} placeholder="Nome" /></div>
          <div className="field"><label htmlFor="adv-group">Grupo contém</label><input id="adv-group" className="input" value={draft.group} onChange={(e) => setDraft({ ...draft, group: e.target.value })} placeholder="Ex.: Reentrada" /></div>
        </div>
      </div>
    </ProtoModal>
  );
}

function RowActionModal({ athlete, onClose, onOpen360, onAssign, onChanged }: {
  athlete: ClientRow | null; onClose: () => void;
  onOpen360: (a: ClientRow) => void; onAssign: (a: ClientRow) => void; onChanged: () => void;
}) {
  const scope = useScope();
  const [status, setStatus] = useState<ClientStatus>('active');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (athlete) { setStatus(athlete.status); setErr(null); } }, [athlete]);

  const saveStatus = async () => {
    const client = getSupabaseClient();
    if (!client || !athlete) return;
    if (status === athlete.status) { onChanged(); return; }
    setBusy(true); setErr(null);
    try {
      await updateClientStatus(client, scope, athlete.id, status);
      toast({ variant: 'success', title: 'Estado atualizado', description: `${athlete.name} · ${STATUS_META[status].label}` });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao atualizar');
    } finally {
      setBusy(false);
    }
  };

  if (!athlete) return null;

  return (
    <ProtoModal open={!!athlete} onClose={onClose} title={`Ações — ${athlete.name}`} sub={STATUS_META[athlete.status].label} size="sm"
      footer={<button className="btn ghost" onClick={onClose}>Fechar</button>}>
      <div className="proto-form">
        <div className="action-list">
          <button className="btn secondary" onClick={() => onOpen360(athlete)}>Abrir perfil 360</button>
          <button className="btn secondary" onClick={() => onAssign(athlete)}>Atribuir plano</button>
        </div>
        <div className="field"><label htmlFor="row-status">Alterar estado</label>
          <select id="row-status" value={status} onChange={(e) => setStatus(e.target.value as ClientStatus)}>
            {Object.entries(STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
        </div>
        {err && <p className="proto-error">{err}</p>}
        <button className="btn primary" onClick={() => void saveStatus()} disabled={busy}>{busy ? 'A guardar…' : 'Guardar estado'}</button>
      </div>
    </ProtoModal>
  );
}

function AssignModal({ open, onClose, targets, onDone }: { open: boolean; onClose: () => void; targets: ClientRow[]; onDone: () => void }) {
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
      .catch((e) => setErr(e instanceof Error ? e.message : 'Erro ao carregar planos'))
      .finally(() => setLoadingPlans(false));
  }, [open, scope]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) { setErr('Sem sessão Supabase.'); return; }
    if (!planId) { setErr('Escolhe um plano.'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await assignPlanToClients(client, scope, planId, targets.map((t) => t.id));
      const skipped = [r.alreadyActive && `${r.alreadyActive} já tinham este plano`, r.skippedRestricted && `${r.skippedRestricted} com restrição`]
        .filter(Boolean).join(' · ');
      toast({ variant: 'success', title: 'Plano atribuído', description: `${r.created} ${r.created === 1 ? p1 : pp}${skipped ? ` · ${skipped}` : ''}` });
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erro ao atribuir');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal open={open} onClose={onClose} title="Atribuir conteúdo" sub={`${targets.length} ${targets.length === 1 ? p1 : pp} selecionado(s)`}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy || loadingPlans || !planId}>{busy ? 'A atribuir…' : 'Atribuir'}</button>
      </>}>
      <div className="proto-form">
        <div className="selected-list">
          {targets.slice(0, 6).map((a) => (
            <div key={a.id} className="selected-pill">
              <div className="avatar initials" style={{ width: 32, height: 32, borderRadius: 10 }}>{initials(a.name)}</div>
              <div><b>{a.name}</b><span>{STATUS_META[a.status].label}{a.responsibleName ? ` · ${a.responsibleName}` : ''}</span></div>
            </div>
          ))}
          {targets.length > 6 && <div className="board-sub">+ {targets.length - 6} restantes</div>}
        </div>
        <div className="field">
          <label htmlFor="assign-plan">Plano a atribuir</label>
          {loadingPlans ? (
            <select id="assign-plan" disabled><option>A carregar…</option></select>
          ) : plans.length === 0 ? (
            <p className="proto-error">Ainda não há planos criados na biblioteca.</p>
          ) : (
            <select value={planId} onChange={(e) => setPlanId(e.target.value)}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          )}
        </div>
        {err && <p className="proto-error">{err}</p>}
      </div>
    </ProtoModal>
  );
}

function NewClientModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const scope = useScope();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [responsible, setResponsible] = useState<string>(scope.membershipId);
  const [staff, setStaff] = useState<StaffLite[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(''); setEmail(''); setPhone(''); setResponsible(scope.membershipId); setErr(null);
    // Só quem vê a carteira toda escolhe o responsável; um PT fica com os que cria
    const client = getSupabaseClient();
    if (client && scope.canSeeAllClients) {
      void fetchStaff(client, scope).then(setStaff).catch(() => setStaff([]));
    }
  }, [open, scope]);

  const submit = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    if (!name.trim()) { setErr('O nome é obrigatório.'); return; }
    setBusy(true); setErr(null);
    try {
      await addClient(client, scope, { name: name.trim(), email: email || null, phone: phone || null, responsibleMembershipId: responsible });
      toast({ variant: 'success', title: `${P1} criado`, description: name.trim() });
      onCreated();
    } catch (e) {
      setErr(e instanceof DuplicateClientError
        ? `Já existe um ${p1} com este email nesta organização.`
        : e instanceof Error ? e.message : `Erro ao criar ${p1}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtoModal open={open} onClose={onClose} title={`Novo ${p1}`} sub={`Acrescenta um ${p1} à carteira. Pode ter conta na app mais tarde.`}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => void submit()} disabled={busy}>{busy ? 'A criar…' : `Criar ${p1}`}</button>
      </>}>
      <div className="proto-form">
        <div className="field"><label htmlFor="nc-name">Nome</label><input id="nc-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" /></div>
        <div className="field-row">
          <div className="field"><label htmlFor="nc-email">Email (opcional)</label><input id="nc-email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
          <div className="field"><label htmlFor="nc-phone">Telefone (opcional)</label><input id="nc-phone" className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+351…" /></div>
        </div>
        {scope.canSeeAllClients && staff.length > 1 && (
          <div className="field"><label htmlFor="nc-resp">{RESP} responsável</label>
            <select id="nc-resp" value={responsible} onChange={(e) => setResponsible(e.target.value)}>
              {staff.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
        {err && <p className="proto-error" role="alert">{err}</p>}
      </div>
    </ProtoModal>
  );
}
