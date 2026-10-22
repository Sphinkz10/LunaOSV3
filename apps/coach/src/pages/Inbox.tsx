import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  adiarPendencias, atribuirPendencias, responderPedidoLigacao, avisar, sincronizarAtrasos, contarAdiadas, fetchInbox, fetchStaff, reabrirPendencia, toast,
  type CategoriaInbox, type Pendencia, type StaffLite,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, EstadoPagina, Janela, Nota } from '@luna/ui/v3';
import { ArrowCounterClockwise, Heartbeat, Users } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const CATEGORIA: Record<CategoriaInbox, string> = { saude: 'Saúde e atestados', clientes: vocab.pessoa({ plural: true, maiuscula: true }) };
const ICONE: Record<CategoriaInbox, typeof Users> = { saude: Heartbeat, clientes: Users };

function ha(iso: string): string {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 60) return `há ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
const amanha = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };

/**
 * Inbox (G-02, Figma 67:186): tudo o que espera por alguém. Cada pendência diz
 * de onde veio, quem é o dono e qual é a ação, e resolve-se no ecrã dono sem
 * perder o contexto. Nada se apaga: resolvidas ficam com quem e quando. Adiar
 * pede uma data; no dia volta ao topo. Selecionar várias abre ações em massa.
 */
export function Inbox() {
  const navigate = useNavigate();
  const scope = useScope();
  const gere = scope.permissions.includes('clients.read_all');
  const [itens, setItens] = useState<Pendencia[] | null>(null);
  const [adiadas, setAdiadas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<CategoriaInbox | 'tudo'>('tudo');
  // O PT vê só o que é dele (T18); quem gere a carteira vê tudo e filtra
  const [minhas, setMinhas] = useState(!gere);
  const [resolvidas, setResolvidas] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [aberta, setAberta] = useState<string | null>(null);
  const [adiar, setAdiar] = useState<string[] | null>(null);
  const [atribuir, setAtribuir] = useState<string[] | null>(null);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void sincronizarAtrasos(client, scope).catch(() => undefined)
      .then(() => Promise.all([fetchInbox(client, scope, { resolvidas }), contarAdiadas(client, scope)]))
      .then(([p, n]) => { setItens(p); setAdiadas(n); setSel(new Set()); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope, resolvidas]);
  useEffect(() => carregar(), [carregar]);

  const visiveis = useMemo(() => (itens ?? [])
    .filter((p) => categoria === 'tudo' || p.categoria === categoria)
    .filter((p) => !minhas || p.donoId === scope.membershipId), [itens, categoria, minhas, scope.membershipId]);
  const conta = (c: CategoriaInbox) => (itens ?? []).filter((p) => p.categoria === c).length;
  const detalhe = visiveis.find((p) => p.id === aberta) ?? visiveis[0] ?? null;
  const abrirDono = (p: Pendencia) => navigate(p.acao.to, { state: { voltar: { rotulo: 'à Inbox', href: '/inbox' } } });
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <CoachShell headStrong="Inbox" headSub={itens ? `${itens.length} ${resolvidas ? 'resolvidas' : 'por resolver'}${adiadas && !resolvidas ? ` · ${adiadas} adiadas` : ''}` : 'Pendências'} legado={false}>
      <div className="lv-root lg-inbox">
        <div className="lg-inbox__filtros">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
            <Chip ativo={categoria === 'tudo'} onClick={() => setCategoria('tudo')} contagem={itens?.length}>Tudo</Chip>
            {(Object.keys(CATEGORIA) as CategoriaInbox[]).map((c) => (
              <Chip key={c} ativo={categoria === c} onClick={() => setCategoria(c)} contagem={itens ? conta(c) : undefined}>{CATEGORIA[c]}</Chip>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
            <Chip ativo={minhas} onClick={() => setMinhas((v) => !v)}>Minhas</Chip>
            <Chip ativo={resolvidas} onClick={() => { setResolvidas((v) => !v); setAberta(null); }}>Resolvidas</Chip>
          </div>
        </div>

        {sel.size > 0 && (
          <div className="lg-inbox__massa" role="toolbar" aria-label="Ações para as selecionadas">
            <b>{sel.size} selecionadas</b>
            <Botao variante="secundario" onClick={() => setAdiar([...sel])}>Adiar</Botao>
            {gere && <Botao variante="secundario" onClick={() => setAtribuir([...sel])}>Atribuir</Botao>}
            <Botao variante="secundario" onClick={() => setSel(new Set())}>Limpar</Botao>
          </div>
        )}

        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar a Inbox" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !itens ? <div className="lv-lista"><Esqueleto /></div>
          : visiveis.length === 0 ? (
            <EstadoPagina tipo="vazio" titulo={resolvidas ? 'Ainda nada resolvido' : 'Nada à tua espera'}
              texto={resolvidas ? 'As pendências resolvidas aparecem aqui com quem e quando.' : adiadas ? `${adiadas} adiadas voltam no dia marcado.` : 'Quando algo precisar de ti, aparece aqui.'} />
          ) : (
            <div className="lg-inbox__grelha">
              <section className="lv-lista lg-inbox__lista" aria-label="Pendências">
                {visiveis.map((p) => {
                  const Ic = ICONE[p.categoria];
                  return (
                    <Deslizar key={p.id} ativo={!resolvidas} className={`lg-inbox__linha${detalhe?.id === p.id ? ' lg-inbox__linha--aberta' : ''}`}
                      onDireita={() => abrirDono(p)} onEsquerda={() => setAdiar([p.id])}>
                      {!resolvidas && (
                        <input type="checkbox" aria-label={`Selecionar ${p.cliente}`} checked={sel.has(p.id)} onChange={() => alternar(p.id)} />
                      )}
                      <Ic size={18} aria-hidden className="lg-inbox__icone" />
                      <button type="button" className="lg-inbox__corpo" onClick={() => setAberta(p.id)}>
                        <span className="lv-linha-lista__titulo">{p.cliente} · {p.titulo}</span>
                        <span className="lv-legenda">{p.origem}</span>
                      </button>
                      {p.dono && <span title={p.dono}><Avatar nome={p.dono} tamanho={28} /></span>}
                      <span className="lv-legenda lg-inbox__quando">{ha(resolvidas && p.resolvidaEm ? p.resolvidaEm : p.criadaEm)}</span>
                      {!resolvidas && <Botao variante="secundario" onClick={() => abrirDono(p)}>{p.acao.rotulo}</Botao>}
                    </Deslizar>
                  );
                })}
              </section>

              {detalhe && (
                <aside className="lv-lista lg-inbox__detalhe" aria-label="Detalhe">
                  <span className="lv-sobretitulo">{CATEGORIA[detalhe.categoria]}</span>
                  <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{detalhe.cliente} · {detalhe.titulo}</h2>
                  <p className="lv-legenda" style={{ margin: 0 }}>{detalhe.origem}</p>
                  {detalhe.kind === 'pedido_ligacao' && !resolvidas && <PedidoLigacao linkId={detalhe.linkId} nome={detalhe.cliente} onFeito={carregar} />}
                  {detalhe.categoria === 'saude' && (
                    <p className="lv-nota" style={{ margin: 0 }}>Aqui vê-se só o que falta. O detalhe clínico fica com quem tem acesso à saúde, com dois fatores.</p>
                  )}
                  <dl className="lg-conta__dados">
                    <dt>Dono</dt><dd>{detalhe.dono ?? 'Sem dono'}</dd>
                    <dt>Criada</dt><dd>{new Date(detalhe.criadaEm).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd>
                    {detalhe.adiadaAte && <><dt>Voltou de adiar</dt><dd>{new Date(detalhe.adiadaAte).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</dd></>}
                    {detalhe.resolvidaEm && <><dt>Resolvida</dt><dd>{new Date(detalhe.resolvidaEm).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</dd></>}
                    {detalhe.resolucao && <><dt>Comprovativo</dt><dd>{detalhe.resolucao}</dd></>}
                  </dl>
                  {!resolvidas && (
                    <div style={{ display: 'flex', gap: 'var(--espaco-8)', marginTop: 'auto' }}>
                      <Botao variante="secundario" onClick={() => setAdiar([detalhe.id])}>Adiar</Botao>
                      {gere && <Botao variante="secundario" onClick={() => setAtribuir([detalhe.id])}>Atribuir</Botao>}
                      <Botao onClick={() => abrirDono(detalhe)}>{detalhe.acao.rotulo}</Botao>
                    </div>
                  )}
                </aside>
              )}
            </div>
          )}
      </div>

      <Adiar ids={adiar} onFechar={() => setAdiar(null)} onFeito={carregar} />
      {gere && <Atribuir ids={atribuir} onFechar={() => setAtribuir(null)} onFeito={carregar} />}
    </CoachShell>
  );
}

function Adiar({ ids, onFechar, onFeito }: { ids: string[] | null; onFechar: () => void; onFeito: () => void }) {
  const [data, setData] = useState(amanha());
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (ids) setData(amanha()); }, [ids]);
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client || !ids) return;
    setAGravar(true);
    try {
      await adiarPendencias(client, ids, new Date(`${data}T08:00:00`));
      onFechar(); onFeito();
      avisar({
        tom: 'ok', texto: ids.length > 1 ? `${ids.length} pendências adiadas` : 'Pendência adiada',
        acao: { rotulo: 'Desfazer', fn: () => void Promise.all(ids.map((id) => reabrirPendencia(client, id))).then(onFeito) },
      });
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível adiar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={!!ids} onFechar={onFechar} titulo="Adiar até" sub="No dia volta a aparecer no topo da Inbox."
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao aCarregar={aGravar} onClick={() => void confirmar()}>Adiar</Botao></>}>
      <Campo rotulo="Data" type="date" min={amanha()} value={data} onChange={(e) => setData(e.target.value)} />
    </Janela>
  );
}

function Atribuir({ ids, onFechar, onFeito }: { ids: string[] | null; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [equipa, setEquipa] = useState<StaffLite[]>([]);
  const [aGravar, setAGravar] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!ids || !client) return;
    void fetchStaff(client, scope).then(setEquipa).catch(() => setEquipa([]));
  }, [ids, scope]);
  const escolher = async (m: StaffLite) => {
    const client = getSupabaseClient();
    if (!client || !ids) return;
    setAGravar(m.id);
    try { await atribuirPendencias(client, ids, m.id); toast({ variant: 'success', title: `Atribuída a ${m.name}` }); onFechar(); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível atribuir', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(null); }
  };
  return (
    <Janela aberta={!!ids} onFechar={onFechar} titulo="Atribuir a">
      <div className="lv-lista" style={{ padding: 0, border: 0 }}>
        {equipa.map((m) => (
          <button key={m.id} type="button" className="lv-linha-lista" disabled={!!aGravar} onClick={() => void escolher(m)}>
            <Avatar nome={m.name} tamanho={32} />
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{m.name}</span></span>
            {aGravar === m.id && <ArrowCounterClockwise size={16} aria-hidden />}
          </button>
        ))}
      </div>
    </Janela>
  );
}

/**
 * No telemóvel (T18): deslizar para a direita resolve (abre o ecrã dono, onde
 * se resolve), para a esquerda adia. Os botões continuam lá para quem não desliza.
 */
function Deslizar({ ativo, className, onDireita, onEsquerda, children }: {
  ativo: boolean; className: string; onDireita: () => void; onEsquerda: () => void; children: ReactNode;
}) {
  const [dx, setDx] = useState(0);
  const inicio = useRef<{ x: number; y: number } | null>(null);
  const LIMITE = 80;
  return (
    <div className={className} style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}
      onTouchStart={(e) => { if (ativo) inicio.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchMove={(e) => {
        if (!inicio.current) return;
        const x = e.touches[0].clientX - inicio.current.x; const y = e.touches[0].clientY - inicio.current.y;
        if (Math.abs(y) > Math.abs(x)) { inicio.current = null; setDx(0); return; }
        setDx(Math.max(-120, Math.min(120, x)));
      }}
      onTouchEnd={() => {
        if (dx > LIMITE) onDireita(); else if (dx < -LIMITE) onEsquerda();
        inicio.current = null; setDx(0);
      }}>
      {dx > 20 && <span className="lg-inbox__deslize lg-inbox__deslize--resolver" aria-hidden>Resolver</span>}
      {dx < -20 && <span className="lg-inbox__deslize lg-inbox__deslize--adiar" aria-hidden>Adiar</span>}
      {children}
    </div>
  );
}

/** C-27 do lado do treinador: aceitar começa a ligação; recusar pede motivo. */
function PedidoLigacao({ linkId, nome, onFeito }: { linkId: string; nome: string; onFeito: () => void }) {
  const [recusar, setRecusar] = useState(false);
  const [motivo, setMotivo] = useState('');
  const responder = async (aceitar: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await responderPedidoLigacao(client, linkId, aceitar, motivo); toast({ variant: 'success', title: aceitar ? `${nome} está ligado a ti` : 'Pedido recusado' }); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: e instanceof Error ? e.message : undefined }); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
      <Nota>Aceitar dá-te acesso ao que {nome.split(' ')[0]} escolheu partilhar, incluindo o histórico de quando treinava sozinho.</Nota>
      {recusar ? (
        <>
          <Campo rotulo="Motivo" placeholder="Ex.: não tenho vagas este mês" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Botao variante="secundario" disabled={!motivo.trim()} onClick={() => void responder(false)}>Recusar</Botao>
        </>
      ) : (
        <span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
          <Botao onClick={() => void responder(true)}>Aceitar</Botao>
          <Botao variante="secundario" onClick={() => setRecusar(true)}>Recusar</Botao>
        </span>
      )}
    </div>
  );
}
