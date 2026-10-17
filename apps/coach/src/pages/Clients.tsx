import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  addClient, apagarRascunhoServidor, arquivarCliente, assignPlanToClients, confirmarDestrutivo, DuplicateClientError, fetchArchivedClients,
  fetchAssiduidade, fetchClientesAtencao, fetchClients, fetchPlans, fetchStaff, guardarRascunhoServidor, lerRascunhoServidor, MOTIVO_ATENCAO,
  convidarParaApp, procurarDuplicados, reativarCliente, toast, useAuthStore,
  type Assiduidade, type Duplicado, type ClienteArquivado, type ClientRow, type ClientStatus, type PlanLite, type StaffLite,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { Plus } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { useMediaQuery } from '../app/useMediaQuery';
import { AvisoDuplicado, ConvidarApp, PreviaMassa, type ForaDeAlcance, type ParaConvidar } from '../app/ClientesP07';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

// Nomes da modalidade (regra 4): nunca "atleta" escrito à mão
const P1 = vocab.pessoa({ maiuscula: true });
const p1 = vocab.pessoa();
const PP = vocab.pessoa({ plural: true, maiuscula: true });
const pp = vocab.pessoa({ plural: true });

const ESTADO: Record<ClientStatus, { texto: string; tom: EstadoTom }> = {
  active: { texto: 'Ativo', tom: 'ok' }, blocked: { texto: 'Bloqueado', tom: 'erro' }, return_to_play: { texto: 'Regresso', tom: 'aviso' },
  injured: { texto: 'Lesionado', tom: 'aviso' }, inactive: { texto: 'Inativo', tom: 'neutro' },
};
type Filtro = 'all' | 'attention' | 'noplan' | 'semconta';
const VISTAS_KEY = 'luna.clientes.vistas';
interface Vista { nome: string; filtro: Filtro; q: string }
const lerVistas = (): Vista[] => { try { return JSON.parse(localStorage.getItem(VISTAS_KEY) ?? '[]') as Vista[]; } catch { return []; } };

function ultimaVez(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dias = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dias <= 0) return `hoje ${d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
  if (dias === 1) return 'ontem';
  if (dias < 7) return d.toLocaleDateString('pt-PT', { weekday: 'long' });
  return `há ${dias} dias`;
}

/** Assiduidade das últimas 8 semanas: uma barra por semana, sem eixos. */
function Semanas({ s }: { s: number[] | undefined }) {
  if (!s) return <span className="lv-legenda">—</span>;
  const max = Math.max(1, ...s);
  return (
    <span className="lg-semanas" role="img" aria-label={`Últimas 8 semanas: ${s.join(', ')}`}>
      {s.map((n, i) => <i key={i} style={{ height: n === 0 ? 3 : 6 + Math.round((n / max) * 14) }} data-zero={n === 0 || undefined} />)}
    </span>
  );
}

/**
 * Clientes (G-03, Figma 63:58) na versão do PT: a carteira com plano, estado,
 * última vez e assiduidade de 8 semanas. Clicar abre o resumo ao lado sem sair
 * da lista. Filtros no endereço e em vistas guardadas; selecionar vários abre
 * a barra de ações em massa. Arquivados ficam no separador próprio e voltam.
 */
export function Clients() {
  const navigate = useNavigate();
  const scope = useScope();
  const gere = scope.permissions.includes('clients.read_all');
  // No telemóvel, tocar abre logo a ficha; no tablet e no computador, o primeiro toque abre o resumo ao lado
  const estreito = useMediaQuery('(max-width: 760px)');
  const [searchParams, setSearchParams] = useSearchParams();
  const [separador, setSeparador] = useState<'ativos' | 'arquivados'>(searchParams.get('ver') === 'arquivados' ? 'arquivados' : 'ativos');
  const [q, setQ] = useState(searchParams.get('q') ?? '');
  const [filtro, setFiltro] = useState<Filtro>((searchParams.get('filtro') as Filtro) ?? 'all');
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [arquivados, setArquivados] = useState<ClienteArquivado[] | null>(null);
  const [assid, setAssid] = useState<Map<string, Assiduidade>>(new Map());
  const [atencao, setAtencao] = useState<Map<string, string[]>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [resumo, setResumo] = useState<string | null>(null);
  const [novo, setNovo] = useState(searchParams.get('novo') === '1');
  const [atribuir, setAtribuir] = useState<string[] | null>(null);
  const [convidar, setConvidar] = useState<ParaConvidar | null>(null);
  const [massaConvite, setMassaConvite] = useState(false);
  const [vistas, setVistas] = useState<Vista[]>(lerVistas);

  // Filtros no endereço: "Voltar a…" a partir da ficha repõe-nos (G-00)
  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (separador === 'arquivados') p.set('ver', 'arquivados');
    if (q) p.set('q', q);
    if (filtro !== 'all') p.set('filtro', filtro);
    return p;
  }, [separador, q, filtro]);
  useEffect(() => { setSearchParams(params, { replace: true }); }, [params, setSearchParams]);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void fetchClients(client, scope).then(setRows).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    // Secções que podem falhar sozinhas: a lista continua a funcionar
    void fetchAssiduidade(client, scope).then(setAssid).catch(() => setAssid(new Map()));
    void fetchClientesAtencao(client, scope)
      .then((r) => setAtencao(new Map(r.map((x) => [x.linkId, x.motivos.map((m) => MOTIVO_ATENCAO[m])]))))
      .catch(() => setAtencao(new Map()));
    void fetchArchivedClients(client, scope).then(setArquivados).catch(() => setArquivados([]));
  }, [scope]);
  useEffect(() => carregar(), [carregar]);

  const lista = useMemo(() => {
    const termo = q.trim().toLocaleLowerCase('pt-PT');
    return (rows ?? [])
      .filter((r) => !termo || [r.name, r.email, r.planName, r.responsibleName].filter(Boolean).join(' ').toLocaleLowerCase('pt-PT').includes(termo))
      .filter((r) => filtro === 'all' || (filtro === 'attention' ? atencao.has(r.id) : filtro === 'noplan' ? !r.hasPlan : !r.hasAccount));
  }, [rows, q, filtro, atencao]);
  const contar = (f: Filtro) => (rows ?? []).filter((r) => (f === 'attention' ? atencao.has(r.id) : f === 'noplan' ? !r.hasPlan : !r.hasAccount)).length;
  const aberto = lista.find((r) => r.id === resumo) ?? null;
  const abrirFicha = (id: string) => {
    const qs = params.toString();
    navigate(`/clients/${id}`, { state: { voltar: { rotulo: PP, href: `/clients${qs ? `?${qs}` : ''}` } } });
  };
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todosSel = lista.length > 0 && lista.every((r) => sel.has(r.id));
  // Antes de convidar em massa: a quem chega e quem fica de fora e porquê
  const previaConvite = useMemo(() => {
    const alvos = (rows ?? []).filter((r) => sel.has(r.id));
    const fora: ForaDeAlcance[] = [];
    const recebem: ClientRow[] = [];
    for (const r of alvos) {
      if (r.hasAccount) fora.push({ nome: r.name, motivo: 'já usam a app' });
      else if (!r.email && !r.phone) fora.push({ nome: r.name, motivo: 'sem email nem telemóvel' });
      else recebem.push(r);
    }
    return { recebem, fora };
  }, [rows, sel]);

  const arquivar = async (alvos: ClientRow[]) => {
    const client = getSupabaseClient();
    if (!client || alvos.length === 0) return;
    const muitos = alvos.length > 1;
    const ok = await confirmarDestrutivo({
      titulo: muitos ? `Arquivar ${alvos.length} ${pp}?` : `Arquivar ${alvos[0].name}?`,
      texto: 'Deixa de aparecer na lista. O histórico fica e podes voltar a ativar.',
      efeitos: [`${alvos.length} ${muitos ? pp : p1} saem da carteira ativa`],
      verbo: 'Arquivar', manter: 'Cancelar',
      motivo: { rotulo: 'Motivo', placeholder: 'Ex.: mudou de cidade' },
      acao: async (motivo) => {
        if (!motivo?.trim()) throw new Error('Arquivar pede motivo.');
        for (const a of alvos) await arquivarCliente(client, a.id, motivo.trim());
      },
    });
    if (ok) { toast({ variant: 'success', title: muitos ? `${alvos.length} ${pp} arquivados` : `${P1} arquivado` }); setSel(new Set()); setResumo(null); carregar(); }
  };
  const reativar = async (a: ClienteArquivado) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await reativarCliente(client, a.id, 'Reativado na lista de arquivados'); toast({ variant: 'success', title: `${a.name} voltou à carteira` }); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível reativar', description: e instanceof Error ? e.message : undefined }); }
  };
  const [nomeVista, setNomeVista] = useState<string | null>(null);
  const guardarVista = (nome: string) => {
    const n = [...vistas.filter((v) => v.nome !== nome), { nome, filtro, q }];
    setVistas(n);
    try { localStorage.setItem(VISTAS_KEY, JSON.stringify(n)); } catch { /* só conveniência */ }
  };

  return (
    <CoachShell headStrong={PP} headSub={rows ? `${rows.length} na carteira` : scope.orgName} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}><Botao variante="secundario" onClick={() => navigate('/clients/importar')}>Importar</Botao><Botao icone={Plus} onClick={() => setNovo(true)}>Novo {p1}</Botao></span>}>
      <div className="lv-root lg-clientes">
        <div className="lg-separadores" role="tablist" aria-label={PP}>
          <button type="button" role="tab" aria-selected={separador === 'ativos'} onClick={() => { setSeparador('ativos'); setSel(new Set()); }}>
            Ativos <span>{rows?.length ?? '…'}</span>
          </button>
          <button type="button" role="tab" aria-selected={separador === 'arquivados'} onClick={() => { setSeparador('arquivados'); setSel(new Set()); setResumo(null); }}>
            Arquivados <span>{arquivados?.length ?? '…'}</span>
          </button>
        </div>

        {separador === 'arquivados' ? (
          !arquivados ? <div className="lv-lista"><Esqueleto /></div>
            : arquivados.length === 0 ? <EstadoPagina tipo="vazio" titulo={`Sem ${pp} arquivados`} texto="Quem arquivares aparece aqui e pode voltar." />
            : (
              <section className="lv-lista" aria-label="Arquivados">
                {arquivados.map((a) => (
                  <div key={a.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <Avatar nome={a.name} foto={a.avatarUrl} tamanho={32} />
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{a.name}</span>
                      <span className="lv-legenda">Arquivado a {new Date(a.archivedAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}{a.reason ? ` · ${a.reason}` : ''}</span>
                    </span>
                    <Botao variante="secundario" onClick={() => void reativar(a)}>Reativar</Botao>
                  </div>
                ))}
              </section>
            )
        ) : (
          <>
            <div className="lg-clientes__barra">
              <div className="lg-clientes__chips">
                <Chip ativo={filtro === 'all'} onClick={() => setFiltro('all')}>Todos</Chip>
                <Chip ativo={filtro === 'attention'} onClick={() => setFiltro('attention')} contagem={rows ? contar('attention') : undefined}>Em atenção</Chip>
                <Chip ativo={filtro === 'noplan'} onClick={() => setFiltro('noplan')} contagem={rows ? contar('noplan') : undefined}>Sem plano</Chip>
                <Chip ativo={filtro === 'semconta'} onClick={() => setFiltro('semconta')} contagem={rows ? contar('semconta') : undefined}>Sem app</Chip>
                {vistas.map((v) => (
                  <Chip key={v.nome} ativo={filtro === v.filtro && q === v.q} onClick={() => { setFiltro(v.filtro); setQ(v.q); }}>{v.nome}</Chip>
                ))}
              </div>
              <div className="lg-clientes__chips">
                <input className="lv-campo-input lg-clientes__procura" type="search" placeholder={`Procurar ${p1}`} aria-label={`Procurar ${p1}`}
                  value={q} onChange={(e) => setQ(e.target.value)} />
                <Botao variante="secundario" onClick={() => setNomeVista(filtro === 'attention' ? 'Em atenção' : '')}>Guardar vista</Botao>
              </div>
            </div>

            {erro ? <EstadoPagina tipo="erro" titulo={`Não foi possível carregar os ${pp}`} texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
              : !rows ? <div className="lv-lista"><Esqueleto /></div>
              : rows.length === 0 ? <EstadoPagina tipo="vazio" titulo={`Ainda não há ${pp}`} texto={`Os ${pp} que acrescentares aparecem aqui.`} acao={{ rotulo: `Novo ${p1}`, onClick: () => setNovo(true) }} />
              : (
                <div className="lg-clientes__grelha">
                  <section className="lv-lista lg-tabela" aria-label={PP}>
                    {sel.size > 0 && (
                      <div className="lg-tabela__massa" role="toolbar" aria-label="Ações para os selecionados">
                        <b>{sel.size} selecionados</b>
                        <span style={{ flex: 1 }} />
                        <button type="button" onClick={() => setMassaConvite(true)}>Convidar para a app</button>
                        <button type="button" onClick={() => setAtribuir([...sel])}>Atribuir plano</button>
                        <button type="button" onClick={() => void arquivar(lista.filter((r) => sel.has(r.id)))}>Arquivar</button>
                        <button type="button" onClick={() => setSel(new Set())}>Limpar</button>
                      </div>
                    )}
                    <div className="lg-tabela__cabeca" role="row">
                      <input type="checkbox" aria-label="Selecionar todos" checked={todosSel}
                        onChange={() => setSel(todosSel ? new Set() : new Set(lista.map((r) => r.id)))} />
                      <span>{P1}</span><span>Plano</span><span>Estado</span><span className="lg-num">Última vez</span><span>8 sem.</span>
                    </div>
                    {lista.length === 0 ? <p className="lv-legenda" style={{ padding: 'var(--espaco-16)' }}>Nenhum {p1} neste filtro.</p>
                      : lista.map((r) => {
                        const a = assid.get(r.id);
                        const motivos = atencao.get(r.id);
                        return (
                          <div key={r.id} role="row" className={`lg-tabela__linha${sel.has(r.id) || resumo === r.id ? ' lg-tabela__linha--sel' : ''}`}>
                            <input type="checkbox" aria-label={`Selecionar ${r.name}`} checked={sel.has(r.id)} onChange={() => alternar(r.id)} />
                            <button type="button" className="lg-tabela__nome"
                              onClick={() => (estreito || resumo === r.id ? abrirFicha(r.id) : setResumo(r.id))}>
                              <Avatar nome={r.name} foto={r.avatarUrl} tamanho={32} />
                              <span style={{ minWidth: 0 }}>
                                <span className="lv-linha-lista__titulo">{r.name}</span>
                                {motivos ? <span className="lv-legenda lg-tabela__motivo">{motivos.join(' · ')}</span>
                                  : gere && r.responsibleName ? <span className="lv-legenda">{r.responsibleName}</span> : null}
                              </span>
                            </button>
                            <span className="lg-tabela__plano">{r.planName ?? <span className="lv-legenda">Sem plano</span>}</span>
                            <span><Estado tom={motivos ? 'aviso' : ESTADO[r.status].tom}>{motivos ? 'Em atenção' : ESTADO[r.status].texto}</Estado></span>
                            <span className="lg-num">{ultimaVez(a?.ultimaVez)}</span>
                            <Semanas s={a?.semanas} />
                          </div>
                        );
                      })}
                  </section>

                  {aberto && (
                    <aside className="lv-lista lg-clientes__resumo" aria-label={`Resumo de ${aberto.name}`}>
                      <Avatar nome={aberto.name} foto={aberto.avatarUrl} tamanho={56} />
                      <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{aberto.name}</h2>
                      <span className="lv-legenda">{[aberto.email, aberto.responsibleName ? `${vocab.responsavel({ maiuscula: true })}: ${aberto.responsibleName}` : null].filter(Boolean).join(' · ')}</span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
                        <Estado tom={ESTADO[aberto.status].tom}>{ESTADO[aberto.status].texto}</Estado>
                        <span className="lv-legenda">{aberto.hasAccount ? 'Usa a app' : 'Sem conta na app'}</span>
                      </div>
                      {atencao.get(aberto.id) && <Nota>{atencao.get(aberto.id)!.join(' · ')}</Nota>}
                      <div className="lg-clientes__numeros">
                        <div><span className="lv-legenda">Plano</span><b>{aberto.planName ?? 'Sem plano'}</b></div>
                        <div><span className="lv-legenda">Última vez</span><b>{ultimaVez(assid.get(aberto.id)?.ultimaVez)}</b></div>
                        <div><span className="lv-legenda">Últimas 4 semanas</span><b>{(assid.get(aberto.id)?.semanas ?? []).slice(-4).reduce((x, y) => x + y, 0)} {vocab.sessao({ plural: true })}</b></div>
                        <div><span className="lv-legenda">Grupo</span><b>{aberto.groupName ?? '—'}</b></div>
                      </div>
                      <div style={{ display: 'flex', gap: 'var(--espaco-8)', marginTop: 'auto' }}>
                        {!aberto.hasAccount && (
                          <Botao variante="secundario" onClick={() => setConvidar({ id: aberto.id, nome: aberto.name, email: aberto.email, telefone: aberto.phone })}>Convidar</Botao>
                        )}
                        <Botao variante="secundario" onClick={() => setAtribuir([aberto.id])}>Atribuir plano</Botao>
                        <Botao onClick={() => abrirFicha(aberto.id)}>Abrir ficha</Botao>
                      </div>
                    </aside>
                  )}
                </div>
              )}
          </>
        )}
      </div>

      <NovoCliente aberta={novo} gere={gere} onFechar={() => { setNovo(false); if (searchParams.get('novo')) setSearchParams(params, { replace: true }); }}
        onCriado={(id) => { carregar(); abrirFicha(id); }} onAbrir={abrirFicha} />
      <Janela aberta={nomeVista !== null} onFechar={() => setNomeVista(null)} titulo="Guardar vista" sub="Fica com o filtro e a procura de agora."
        acoes={<><Botao variante="secundario" onClick={() => setNomeVista(null)}>Voltar</Botao>
          <Botao disabled={!nomeVista?.trim()} onClick={() => { guardarVista(nomeVista!.trim()); setNomeVista(null); }}>Guardar</Botao></>}>
        <Campo rotulo="Nome" value={nomeVista ?? ''} onChange={(e) => setNomeVista(e.target.value)} placeholder="Ex.: Em atenção esta semana" />
      </Janela>
      <ConvidarApp cliente={convidar} onFechar={() => setConvidar(null)} />
      <PreviaMassa aberta={massaConvite} titulo={`Convidar ${sel.size} ${pp} para a app?`} verbo="Convidar"
        recebem={previaConvite.recebem.length} fora={previaConvite.fora}
        nota="Vale 7 dias e fica no perfil de cada um, com o teu nome."
        onFechar={() => setMassaConvite(false)}
        onConfirmar={async () => {
          const client = getSupabaseClient();
          if (!client) return;
          let ok = 0;
          for (const r of previaConvite.recebem) {
            try { await convidarParaApp(client, r.id, r.phone ? 'sms' : 'email'); ok++; } catch { /* conta no fim */ }
          }
          toast({ variant: ok === previaConvite.recebem.length ? 'success' : 'warning', title: `${ok} convites enviados`,
            description: ok < previaConvite.recebem.length ? `${previaConvite.recebem.length - ok} não foram: tenta outra vez na ficha.` : undefined });
          setMassaConvite(false); setSel(new Set());
        }} />
      <AtribuirPlano ids={atribuir} alvos={(rows ?? []).filter((r) => atribuir?.includes(r.id))} onFechar={() => setAtribuir(null)} onFeito={() => { setSel(new Set()); carregar(); }} />
    </CoachShell>
  );
}

interface RascunhoNovo { nome: string; email: string; telefone: string; nif: string; resp: string }
const vazioNovo = (resp: string): RascunhoNovo => ({ nome: '', email: '', telefone: '', nif: '', resp });

/**
 * Novo cliente (P-07): o duplicado aparece ao escrever o telemóvel, o email ou
 * o NIF; sair sem guardar só pergunta quando algo mudou e o rascunho fica 7
 * dias, no computador ou no telemóvel.
 */
function NovoCliente({ aberta, gere, onFechar, onCriado, onAbrir }: {
  aberta: boolean; gere: boolean; onFechar: () => void; onCriado: (id: string) => void; onAbrir: (id: string) => void;
}) {
  const scope = useScope();
  const userId = useAuthStore((s) => s.userId) ?? '';
  const chave = `novo-cliente:${scope.orgId}`;
  const [f, setF] = useState<RascunhoNovo>(vazioNovo(scope.membershipId));
  const [rascunhoDe, setRascunhoDe] = useState<string | null>(null);
  const [equipa, setEquipa] = useState<StaffLite[]>([]);
  const [duplicados, setDuplicados] = useState<Duplicado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [sair, setSair] = useState(false);
  const sujo = !!(f.nome.trim() || f.email.trim() || f.telefone.trim() || f.nif.trim());

  useEffect(() => {
    if (!aberta) return;
    setF(vazioNovo(scope.membershipId)); setErro(null); setDuplicados([]); setRascunhoDe(null); setSair(false);
    const client = getSupabaseClient();
    if (!client) return;
    if (gere) void fetchStaff(client, scope).then(setEquipa).catch(() => setEquipa([]));
    void lerRascunhoServidor<RascunhoNovo>(client, userId, chave).then((r) => {
      if (r) { setF({ ...vazioNovo(scope.membershipId), ...r.valor }); setRascunhoDe(r.em); }
    });
  }, [aberta, gere, scope, userId, chave]);

  // Duplicados ao escrever (telemóvel, email ou NIF)
  useEffect(() => {
    if (!aberta) return;
    const client = getSupabaseClient();
    if (!client) return;
    const t = setTimeout(() => {
      void procurarDuplicados(client, scope, { telefone: f.telefone, email: f.email, nif: f.nif }).then(setDuplicados).catch(() => setDuplicados([]));
    }, 350);
    return () => clearTimeout(t);
  }, [aberta, scope, f.telefone, f.email, f.nif]);

  const fechar = () => { if (sujo) setSair(true); else onFechar(); };
  const sairEGuardar = async () => {
    const client = getSupabaseClient();
    if (client) await guardarRascunhoServidor(client, userId, chave, f).catch(() => undefined);
    setSair(false); onFechar();
    toast({ variant: 'success', title: 'Rascunho guardado', description: 'Fica 7 dias, aqui ou no telemóvel.' });
  };
  const sairSemGuardar = async () => {
    const client = getSupabaseClient();
    if (client) await apagarRascunhoServidor(client, userId, chave).catch(() => undefined);
    setSair(false); onFechar();
  };
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !f.nome.trim()) return;
    setAGravar(true); setErro(null);
    try {
      const id = await addClient(client, scope, {
        name: f.nome.trim(), email: f.email.trim() || null, phone: f.telefone.trim() || null, taxId: f.nif.trim() || null, responsibleMembershipId: f.resp,
      });
      await apagarRascunhoServidor(client, userId, chave);
      toast({ variant: 'success', title: `${P1} criado`, description: f.nome.trim() });
      onFechar(); onCriado(id);
    } catch (err) {
      setErro(err instanceof DuplicateClientError ? `Já existe um ${p1} com este telemóvel, email ou NIF.` : err instanceof Error ? err.message : 'Não foi possível criar.');
    } finally { setAGravar(false); }
  };
  const campo = (k: keyof RascunhoNovo) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <>
      <Janela aberta={aberta && !sair} onFechar={fechar} titulo={`Novo ${p1}`} sub="O convite para a app pode ir logo a seguir.">
        <form onSubmit={(e) => void criar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          {rascunhoDe && <Nota>Continuas o rascunho de {new Date(rascunhoDe).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}.</Nota>}
          <Campo rotulo="Nome" value={f.nome} onChange={campo('nome')} required autoComplete="off" />
          <Campo rotulo="Telemóvel" value={f.telefone} onChange={campo('telefone')} inputMode="tel" autoComplete="off" />
          <Campo rotulo="Email" type="email" value={f.email} onChange={campo('email')} autoComplete="off" ajuda="Para o convite da app" />
          <Campo rotulo="NIF (opcional)" value={f.nif} onChange={campo('nif')} inputMode="numeric" autoComplete="off" />
          <AvisoDuplicado duplicados={duplicados} onAbrir={(id) => { onFechar(); onAbrir(id); }} />
          {gere && equipa.length > 0 && (
            <label className="lv-campo">
              <span className="lv-campo-rotulo">{vocab.responsavel({ maiuscula: true })}</span>
              <select className="lv-campo-input" value={f.resp} onChange={campo('resp')}>
                {equipa.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
          )}
          {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
          <Botao type="submit" aCarregar={aGravar} disabled={duplicados.length > 0}>Criar {p1}</Botao>
        </form>
      </Janela>
      <Janela aberta={sair} onFechar={() => setSair(false)} titulo={`Sair do novo ${p1}?`}
        sub={`${f.nome.trim() || 'O que escreveste'} fica guardado 7 dias; podes continuar aqui ou no telemóvel.`}
        acoes={<>
          <Botao variante="secundario" onClick={() => void sairSemGuardar()}>Descartar</Botao>
          <Botao variante="secundario" onClick={() => setSair(false)}>Continuar</Botao>
          <Botao onClick={() => void sairEGuardar()}>Sair e guardar</Botao>
        </>} />
    </>
  );
}

function AtribuirPlano({ ids, alvos, onFechar, onFeito }: { ids: string[] | null; alvos: ClientRow[]; onFechar: () => void; onFeito: () => void }) {
  const bloqueados = alvos.filter((a) => a.status === 'blocked');
  const scope = useScope();
  const [planos, setPlanos] = useState<PlanLite[] | null>(null);
  const [aGravar, setAGravar] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!ids || !client) return;
    setPlanos(null);
    void fetchPlans(client, scope).then(setPlanos).catch(() => setPlanos([]));
  }, [ids, scope]);
  const escolher = async (p: PlanLite) => {
    const client = getSupabaseClient();
    if (!client || !ids) return;
    setAGravar(p.id);
    try {
      const r = await assignPlanToClients(client, scope, p.id, ids);
      const extra = [r.alreadyActive ? `${r.alreadyActive} já tinham` : '', r.skippedRestricted ? `${r.skippedRestricted} bloqueados ficaram de fora` : ''].filter(Boolean).join(' · ');
      toast({ variant: 'success', title: `${p.name} atribuído a ${r.created}`, description: extra || undefined });
      onFechar(); onFeito();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível atribuir', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(null); }
  };
  return (
    <Janela aberta={!!ids} onFechar={onFechar} titulo="Atribuir plano" sub={ids && ids.length > 1 ? `${ids.length} ${pp}. Quem está bloqueado fica de fora.` : undefined}>
      {bloqueados.length > 0 && <Nota>{bloqueados.length} {bloqueados.length === 1 ? 'fica' : 'ficam'} de fora por estarem bloqueados: {bloqueados.map((b) => b.name).slice(0, 3).join(', ')}.</Nota>}
      {!planos ? <Esqueleto linhas={3} />
        : planos.length === 0 ? <p className="lv-legenda">Ainda não há planos. Cria um em Treino.</p>
        : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {planos.map((p) => (
              <button key={p.id} type="button" className="lv-linha-lista" disabled={!!aGravar} onClick={() => void escolher(p)}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{p.name}</span></span>
                {aGravar === p.id && <span className="lv-spinner" aria-hidden />}
              </button>
            ))}
          </div>
        )}
    </Janela>
  );
}
