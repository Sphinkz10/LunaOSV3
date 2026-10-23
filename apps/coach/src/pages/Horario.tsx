import { novo, g } from '@luna/modalidades';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  avisoPack, confirmarDestrutivo, conflitosAntes, fetchClients, fetchSaldo, fetchSemana, fetchStaff, fetchUnidades, guardarMarcacao, instante, setBookingStatus, toast,
  wallClock, type ClientRow, type MarcacaoEditavel, type MarcacaoSemana, type StaffLite, type Unidade,
  fetchLocais, type LocalPT,
  cancelarMarcacao, contarPorDia, expirarPorConfirmar, filtrarLista, historicoMarcacao, mudancaDeHora, MOTIVOS_CANCELAR,
  type EventoMarcacao, type FiltroLista, type SaldoPack,
} from '@luna/core';
import { Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, MenuAcoes, Nota, type EstadoTom } from '@luna/ui/v3';
import { CaretRight, Clock, Plus, Warning } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t, vocab } from '../lib/vocab';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const H0 = 6; const H1 = 22; const PX = 64;
const TIPO: Record<string, string> = { training: t('sessao', { maiuscula: true }), consultation: 'Consulta', assessment: 'Avaliação', other: 'Outro', class: t('aula', { maiuscula: true }) };
const ESTADO: Record<string, { texto: string; tom: EstadoTom }> = {
  pending: { texto: 'Por confirmar', tom: 'aviso' }, confirmed: { texto: 'Confirmada', tom: 'ok' }, completed: { texto: 'Feita', tom: 'neutro' },
  no_show: { texto: 'Faltou', tom: 'erro' }, cancelled: { texto: 'Cancelada', tom: 'neutro' }, waitlisted: { texto: 'Em espera', tom: 'aviso' },
};
const isoDia = (d: Date) => d.toISOString().slice(0, 10);
const LOCAL: Record<string, string> = { estudio: 'Estúdio', casa_cliente: 'Em casa', parque: 'Parque', online: 'Online' };

/**
 * Onde vai cada sessão no pack do cliente: as já passadas desta janela são as
 * últimas usadas; as seguintes contam a partir daí (Figma 201:108, "3/10").
 */
function posicoesNoPack(lista: MarcacaoSemana[], saldos: Map<string, SaldoPack[]>): Map<string, { n: number; total: number; restam: number; nome: string }> {
  const r = new Map<string, { n: number; total: number; restam: number; nome: string }>();
  const agora = Date.now();
  for (const [id, sl] of saldos) {
    const p = sl.find((x) => x.estado !== 'expirado');
    if (!p) continue;
    const usadas = p.total - p.restam;
    const minhas = lista.filter((b) => b.clienteId === id && b.tipo === 'training' && b.estado !== 'cancelled').sort((a, b) => a.inicio.localeCompare(b.inicio));
    const passadas = minhas.filter((b) => Date.parse(b.inicio) < agora);
    const futuras = minhas.filter((b) => Date.parse(b.inicio) >= agora);
    passadas.forEach((b, i) => r.set(b.id, { n: Math.max(1, usadas - (passadas.length - 1 - i)), total: p.total, restam: p.restam, nome: p.nome }));
    futuras.forEach((b, i) => { const n = usadas + 1 + i; if (n <= p.total) r.set(b.id, { n, total: p.total, restam: p.restam, nome: p.nome }); });
  }
  return r;
}

/** Semana do PT (Figma 201:108): uma linha por hora marcada, um bloco por sessão com o sítio e o pack. */
function VistaSemanaPT({ dias, lista, hoje, tz, posicoes, atualId, onAbrir, onNova }: {
  dias: Date[]; lista: MarcacaoSemana[]; hoje: Date; tz: string; posicoes: Map<string, { n: number; total: number }>; atualId: string | null;
  onAbrir: (b: MarcacaoSemana) => void; onNova: (dia: string, hora: string) => void;
}) {
  const w = (iso: string) => wallClock(new Date(iso), tz);
  const hhmm = (iso: string) => { const x = w(iso); return `${String(x.hour).padStart(2, '0')}:${String(x.minute).padStart(2, '0')}`; };
  const diaDe = (iso: string) => { const x = w(iso); return `${x.year}-${String(x.month).padStart(2, '0')}-${String(x.day).padStart(2, '0')}`; };
  // Sábado e domingo só aparecem quando há alguma coisa marcada
  const mostrar = dias.filter((d) => ![0, 6].includes(d.getUTCDay()) || lista.some((b) => diaDe(b.inicio) === isoDia(d)));
  const horas = [...new Set(lista.map((b) => hhmm(b.inicio)))].sort();
  const cor = (b: MarcacaoSemana) => (b.tipo === 'assessment' ? 'avaliacao' : b.local === 'online' ? 'online' : b.grupoId ? 'grupo' : b.estado === 'pending' ? 'pendente' : 'presencial');
  return (
    <section className="lv-lista lg-semana-pt" aria-label="Semana" style={{ ['--dias' as string]: mostrar.length }}>
      <div className="lg-semana-pt__linha lg-semana-pt__cabeca">
        <span />
        {mostrar.map((d) => (
          <span key={isoDia(d)} className={isoDia(d) === isoDia(hoje) ? 'lg-grade__hoje' : undefined}>
            <span className="lv-legenda">{DIAS[d.getUTCDay()]}</span><b>{d.getUTCDate()}</b>
          </span>
        ))}
      </div>
      {horas.length === 0 && <p className="lv-legenda" style={{ padding: 'var(--espaco-12)', margin: 0 }}>Semana livre. Usa {novo(t('sessao'))} para marcar.</p>}
      {horas.map((h) => (
        <div key={h} className="lg-semana-pt__linha">
          <span className="lg-semana-pt__hora">{h}</span>
          {mostrar.map((d) => {
            const aqui = lista.filter((b) => diaDe(b.inicio) === isoDia(d) && hhmm(b.inicio) === h);
            return (
              <div key={isoDia(d)} className="lg-semana-pt__celula">
                {aqui.length === 0 ? <button type="button" className="lg-semana-pt__vazio" aria-label={`Marcar ${DIAS[d.getUTCDay()]} ${d.getUTCDate()} às ${h}`} onClick={() => onNova(isoDia(d), h)} />
                  : aqui.map((b) => {
                    const p = posicoes.get(b.id);
                    return (
                      <button key={b.id} type="button" className={`lg-semana-pt__bloco lg-semana-pt__bloco--${cor(b)}${atualId === b.id ? ' lg-semana-pt__bloco--aberto' : ''}`} onClick={() => onAbrir(b)}>
                        <b>{b.cliente ?? (b.titulo || TIPO[b.tipo])}</b>
                        <span>{b.local ? LOCAL[b.local] ?? b.local : b.sala ?? (b.tipo === 'training' ? 'Por definir' : TIPO[b.tipo])}</span>
                        <b>{b.tipo === 'assessment' ? 'Avaliação' : b.estado === 'pending' ? 'Por confirmar' : p ? `${p.n}/${p.total}` : ''}</b>
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/**
 * Horário (G-09 e G-10, Figma 66:154), F1a: sessões de PT, consultas e
 * avaliações por PT e sala. Clicar abre ao lado para editar; os conflitos
 * de PT, sala, férias e folgas aparecem antes de guardar. Aulas de grupo,
 * reservas e lista de espera chegam na F2.
 */
export function Horario() {
  const navigate = useNavigate();
  const scope = useScope();
  const [params, setParams] = useSearchParams();
  const veTodos = scope.permissions.includes('schedule.read_all');
  const hoje = useMemo(() => { const w = wallClock(new Date(), scope.timezone); return new Date(Date.UTC(w.year, w.month - 1, w.day)); }, [scope.timezone]);
  type Vista = 'dia' | 'semana' | 'mes' | 'lista';
  const [vista, setVistaEstado] = useState<Vista>(() => { try { return (localStorage.getItem('luna.horario.vista') as Vista) || 'semana'; } catch { return 'semana'; } });
  const setVista = (v: Vista) => { setVistaEstado(v); try { localStorage.setItem('luna.horario.vista', v); } catch { /* conveniência */ } };
  const [ancora, setAncora] = useState(hoje);
  const segunda = useMemo(() => { const d = new Date(ancora); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; }, [ancora]);
  const inicioMes = useMemo(() => { const d = new Date(Date.UTC(ancora.getUTCFullYear(), ancora.getUTCMonth(), 1)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; }, [ancora]);
  const [alvoCancelar, setAlvoCancelar] = useState<MarcacaoSemana | null>(null);
  const [lista, setLista] = useState<MarcacaoSemana[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [equipa, setEquipa] = useState<StaffLite[]>([]);
  const [salas, setSalas] = useState<{ id: string; nome: string }[]>([]);
  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [filtroPt, setFiltroPt] = useState<string>(veTodos ? 'todos' : scope.membershipId);
  const [filtroSala, setFiltroSala] = useState<string | null>(null);
  const soPendentes = params.get('estado') === 'pendente';
  const [aberto, setAberto] = useState<MarcacaoEditavel | null>(null);
  // Figma (201:108): filtrar por tipo de sessão no topo
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'online' | 'avaliacao'>('todos');
  const [saldos, setSaldos] = useState<Map<string, SaldoPack[]>>(new Map());
  const [atual, setAtual] = useState<MarcacaoSemana | null>(null);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    const [de, n] = vista === 'dia' ? [ancora, 1] : vista === 'mes' ? [inicioMes, 42] : vista === 'lista' ? [ancora, 31] : [segunda, 7];
    const ini = instante(isoDia(de), '00:00', scope.timezone);
    // As por confirmar que passaram do prazo libertam a hora antes de mostrar
    void expirarPorConfirmar(client, scope).catch(() => 0)
      .then(() => fetchSemana(client, scope, ini, n, vista === 'lista'))
      .then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope, segunda, ancora, inicioMes, vista]);
  useEffect(() => carregar(), [carregar]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchStaff(client, scope).then(setEquipa).catch(() => setEquipa([]));
    void fetchUnidades(client, scope).then((u: Unidade[]) => setSalas(u.flatMap((x) => x.salas.map((s) => ({ id: s.id, nome: s.name }))))).catch(() => setSalas([]));
    void fetchClients(client, scope).then(setClientes).catch(() => setClientes([]));
  }, [scope]);
  const novaBase = useCallback((dia = isoDia(hoje), hora = '18:00'): MarcacaoEditavel => ({
    membershipId: scope.membershipId, clienteId: params.get('cliente'), salaId: null, tipo: 'training', titulo: '', dia, hora, minutos: 60, notas: '', repetirAte: null,
  }), [hoje, scope.membershipId, params]);
  useEffect(() => {
    if (params.get('nova') === '1') { setAtual(null); setAberto(novaBase()); setParams((p) => { p.delete('nova'); return p; }, { replace: true }); }
  }, [params, setParams, novaBase]);

  const dias = vista === 'dia' ? [ancora] : Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setUTCDate(d.getUTCDate() + i); return d; });
  const visiveis = (lista ?? []).filter((b) => (filtroPt === 'todos' || b.membershipId === filtroPt) && (!filtroSala || b.salaId === filtroSala) && (!soPendentes || b.estado === 'pending')
    && (filtroTipo === 'todos' || (filtroTipo === 'online' ? b.local === 'online' : b.tipo === 'assessment')));
  // O pack de cada cliente da semana, para o "3/10" de cada bloco e o "Sessão 6 de 8" do painel
  useEffect(() => {
    const client = getSupabaseClient();
    const ids = [...new Set((lista ?? []).filter((b) => b.tipo === 'training' && b.clienteId).map((b) => b.clienteId!))];
    if (!client || !ids.length) return;
    void Promise.all(ids.map((id) => fetchSaldo(client, id).then((sl): [string, SaldoPack[]] => [id, sl]).catch((): [string, SaldoPack[]] => [id, []])))
      .then((pares) => setSaldos(new Map(pares)));
  }, [lista]);
  const posicoes = useMemo(() => posicoesNoPack(lista ?? [], saldos), [lista, saldos]);
  const local = (iso: string) => wallClock(new Date(iso), scope.timezone);
  const abrir = (b: MarcacaoSemana) => {
    const w = local(b.inicio);
    setAtual(b);
    setAberto({ id: b.id, membershipId: b.membershipId ?? scope.membershipId, clienteId: b.clienteId, salaId: b.salaId, tipo: b.tipo, titulo: b.titulo,
      dia: `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`, hora: `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`,
      minutos: Math.round((Date.parse(b.fim) - Date.parse(b.inicio)) / 60000), notas: b.notas ?? '' });
  };
  const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const semanaTxt = vista === 'dia' ? `${DIAS[ancora.getUTCDay()]}, ${ancora.getUTCDate()} ${MESES[ancora.getUTCMonth()]}`
    : vista === 'mes' ? `${MESES_LONGOS[ancora.getUTCMonth()]} ${ancora.getUTCFullYear()}`
    : vista === 'lista' ? `30 dias desde ${ancora.getUTCDate()} ${MESES[ancora.getUTCMonth()]}`
    : `${dias[0].getUTCDate()} ${MESES[dias[0].getUTCMonth()]} a ${dias[6].getUTCDate()} ${MESES[dias[6].getUTCMonth()]}`;
  const mover = (n: number) => setAncora((d) => {
    const x = new Date(d);
    if (vista === 'mes') x.setUTCMonth(x.getUTCMonth() + n); else x.setUTCDate(x.getUTCDate() + n * (vista === 'dia' ? 1 : vista === 'lista' ? 30 : 7));
    return x;
  });

  return (
    <CoachShell headStrong="Horário" headSub={semanaTxt} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)', alignItems: 'center' }}>
        <span className="lg-clientes__chips" role="radiogroup" aria-label="Tipo">
          <Chip role="radio" aria-checked={filtroTipo === 'todos'} ativo={filtroTipo === 'todos'} onClick={() => setFiltroTipo('todos')}>Todos os tipos</Chip>
          <Chip role="radio" aria-checked={filtroTipo === 'online'} ativo={filtroTipo === 'online'} onClick={() => setFiltroTipo('online')}>Online</Chip>
          <Chip role="radio" aria-checked={filtroTipo === 'avaliacao'} ativo={filtroTipo === 'avaliacao'} onClick={() => setFiltroTipo('avaliacao')}>Avaliação</Chip>
        </span>
        <Botao icone={Plus} onClick={() => { setAtual(null); setAberto(novaBase()); }}>{novo(t('sessao'))}</Botao>
      </span>}>
      <div className="lv-root lg-ficha">
        <div className="lg-clientes__barra">
          <div className="lg-clientes__chips">
            <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone lg-refazer" aria-label="Semana anterior" onClick={() => mover(-1)}><CaretRight size={16} aria-hidden /></button>
            <Botao variante="secundario" onClick={() => setAncora(hoje)}>Hoje</Botao>
            <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Semana seguinte" onClick={() => mover(1)}><CaretRight size={16} aria-hidden /></button>
          </div>
          <div className="lg-clientes__chips" role="radiogroup" aria-label="Vista">
            {(['dia', 'semana', 'mes', 'lista'] as Vista[]).map((v) => <Chip key={v} role="radio" aria-checked={vista === v} ativo={vista === v} onClick={() => setVista(v)}>{v === 'dia' ? 'Dia' : v === 'semana' ? 'Semana' : v === 'mes' ? 'Mês' : 'Lista'}</Chip>)}
          </div>
          <div className="lg-clientes__chips">
            {veTodos && equipa.length > 1 && <Chip ativo={filtroPt === 'todos'} onClick={() => setFiltroPt('todos')}>Toda a equipa</Chip>}
            {equipa.length > 1 && <Chip ativo={filtroPt === scope.membershipId} onClick={() => setFiltroPt(scope.membershipId)}>Só eu</Chip>}
            {veTodos && equipa.filter((m) => m.id !== scope.membershipId).slice(0, 4).map((m) => <Chip key={m.id} ativo={filtroPt === m.id} onClick={() => setFiltroPt(m.id)}>{m.name.split(' ')[0]}</Chip>)}
            {salas.map((s) => <Chip key={s.id} ativo={filtroSala === s.id} onClick={() => setFiltroSala(filtroSala === s.id ? null : s.id)}>{s.nome}</Chip>)}
            <Chip ativo={soPendentes} onClick={() => setParams((p) => { if (soPendentes) p.delete('estado'); else p.set('estado', 'pendente'); return p; })}>Por confirmar</Chip>
            <MenuAcoes rotulo="Mais do horário" acoes={[
              { rotulo: 'Disponibilidade', onClick: () => navigate('/schedule/disponibilidade') },
              { rotulo: 'Regras e lembretes', onClick: () => navigate('/schedule/regras') },
            ]} />
          </div>
        </div>
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar o horário" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !lista ? <Esqueleto />
          : (
            <div className={`lg-horario${aberto ? ' lg-horario--aberto' : ''}`}>
              {vista === 'mes' ? <VistaMes inicio={inicioMes} lista={visiveis} hoje={hoje} tz={scope.timezone} onDia={(d) => { setAncora(d); setVista('dia'); }} />
              : vista === 'semana' ? <VistaSemanaPT dias={dias} lista={visiveis} hoje={hoje} tz={scope.timezone} posicoes={posicoes} atualId={atual?.id ?? null}
                  onAbrir={abrir} onNova={(dia, hora) => { setAtual(null); setAberto(novaBase(dia, hora)); }} />
              : vista === 'lista' ? <VistaLista lista={(lista ?? []).filter((b) => (filtroPt === 'todos' || b.membershipId === filtroPt) && (!filtroSala || b.salaId === filtroSala))} clientes={clientes} onAbrir={abrir} />
              : (
              <section className={`lv-lista lg-grade${vista === 'dia' ? ' lg-grade--dia' : ''}`} aria-label={vista === 'dia' ? 'Dia' : 'Semana'}>
                <div className="lg-grade__cabeca">
                  <span />
                  {dias.map((d) => (
                    <span key={d.toISOString()} className={isoDia(d) === isoDia(hoje) ? 'lg-grade__hoje' : undefined}>
                      <span className="lv-legenda">{DIAS[d.getUTCDay()]}</span><b>{d.getUTCDate()}</b>
                    </span>
                  ))}
                </div>
                <div className="lg-grade__corpo" style={{ height: (H1 - H0) * PX }}>
                  <div className="lg-grade__horas">{Array.from({ length: H1 - H0 }, (_, i) => <span key={i} style={{ top: i * PX }}>{String(H0 + i).padStart(2, '0')}:00</span>)}</div>
                  {dias.map((d) => {
                    const doDia = visiveis.filter((b) => { const w = local(b.inicio); return w.day === d.getUTCDate() && w.month === d.getUTCMonth() + 1; });
                    return (
                      <div key={d.toISOString()} className="lg-grade__dia" role="presentation"
                        onDoubleClick={(e) => {
                          const y = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
                          const h = Math.min(H1 - 1, Math.max(H0, Math.floor(y / PX) + H0));
                          setAtual(null); setAberto(novaBase(isoDia(d), `${String(h).padStart(2, '0')}:00`));
                        }}>
                        {doDia.map((b) => {
                          const w = local(b.inicio); const min = (Date.parse(b.fim) - Date.parse(b.inicio)) / 60000;
                          return (
                            <button key={b.id} type="button" className={`lg-grade__bloco lg-grade__bloco--${b.tipo} lg-grade__bloco--${b.estado}${atual?.id === b.id ? ' lg-grade__bloco--aberto' : ''}`}
                              style={{ top: ((w.hour - H0) + w.minute / 60) * PX, height: Math.max(24, (min / 60) * PX - 2) }} onClick={() => abrir(b)}>
                              <b>{b.cliente ?? b.titulo ?? TIPO[b.tipo]}</b>
                              <span>{String(w.hour).padStart(2, '0')}:{String(w.minute).padStart(2, '0')}{b.sala ? ` · ${b.sala}` : ''}{filtroPt === 'todos' && b.pt ? ` · ${b.pt.split(' ')[0]}` : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {visiveis.length === 0 && <p className="lv-legenda" style={{ padding: 'var(--espaco-12)', margin: 0 }}>{soPendentes ? 'Nada por confirmar.' : 'Livre. Toca duas vezes num dia para marcar.'}</p>}
              </section>
              )}
              {aberto && (
                <Editor marcacao={aberto} atual={atual} equipa={equipa} salas={salas} clientes={clientes} posicao={atual ? posicoes.get(atual.id) ?? null : null}
                  onFechar={() => { setAberto(null); setAtual(null); }} onGuardado={() => { setAberto(null); setAtual(null); carregar(); }} onCancelar={setAlvoCancelar} />
              )}
            </div>
          )}
      </div>
      <CancelarMarcacao alvo={alvoCancelar} onFechar={() => setAlvoCancelar(null)} onFeito={() => { setAlvoCancelar(null); setAberto(null); setAtual(null); carregar(); }} />
    </CoachShell>
  );
}

function Editor({ marcacao, atual, equipa, salas, clientes, posicao, onFechar, onGuardado, onCancelar }: {
  marcacao: MarcacaoEditavel; atual: MarcacaoSemana | null; equipa: StaffLite[]; salas: { id: string; nome: string }[]; clientes: ClientRow[];
  posicao: { n: number; total: number; restam: number; nome: string } | null;
  onFechar: () => void; onGuardado: () => void; onCancelar: (b: MarcacaoSemana) => void;
}) {
  const scope = useScope();
  const navigate = useNavigate();
  const [e, setE] = useState(marcacao);
  const [repetir, setRepetir] = useState(false);
  const [conflitos, setConflitos] = useState<string[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !e.clienteId || e.tipo !== 'training') { setAviso(null); return; }
    void fetchSaldo(client, e.clienteId).then((s) => setAviso(avisoPack(s))).catch(() => setAviso(null));
  }, [e.clienteId, e.tipo]);
  const [aGravar, setAGravar] = useState(false);
  const [locais, setLocais] = useState<LocalPT[]>([]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchLocais(client, scope, e.membershipId).then(setLocais).catch(() => setLocais([]));
  }, [e.membershipId, scope]);
  useEffect(() => { setE(marcacao); setRepetir(false); }, [marcacao]);
  // Conflitos de PT, sala, férias e folgas antes de guardar
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !e.dia || !e.hora) return;
    const ini = instante(e.dia, e.hora, scope.timezone); const fim = new Date(ini.getTime() + e.minutos * 60000);
    const t1 = setTimeout(() => { void conflitosAntes(client, scope, e.membershipId, e.salaId, ini.toISOString(), fim.toISOString(), e.id).then(setConflitos).catch(() => setConflitos([])); }, 250);
    return () => clearTimeout(t1);
  }, [e.dia, e.hora, e.minutos, e.membershipId, e.salaId, e.id, scope]);
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true);
    try { const n = await guardarMarcacao(client, scope, { ...e, repetirAte: repetir ? e.repetirAte : null }); toast({ variant: 'success', title: n > 1 ? `${n} ${t('sessao', { plural: true })} marcadas` : 'Guardado' }); onGuardado(); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: err instanceof Error ? err.message : undefined }); }
    finally { setAGravar(false); }
  };
  const estado = async (s: 'confirmed' | 'completed' | 'no_show') => {
    const client = getSupabaseClient();
    if (!client || !atual) return;
    await setBookingStatus(client, scope, atual.id, s).then(onGuardado).catch((err) => toast({ variant: 'danger', title: 'Não foi possível mudar', description: err instanceof Error ? err.message : undefined }));
  };
  const cancelar = () => { if (atual) onCancelar(atual); };
  const recusar = async () => {
    const client = getSupabaseClient();
    if (!client || !atual) return;
    const ok = await confirmarDestrutivo({ titulo: 'Recusar este pedido?', verbo: 'Recusar', manter: 'Voltar', efeitos: atual.cliente ? [`${atual.cliente} é avisado e a hora fica livre`] : [],
      acao: () => cancelarMarcacao(client, scope, atual.id, 'Recusada pelo PT') });
    if (ok) onGuardado();
  };
  const set = (p: Partial<MarcacaoEditavel>) => setE((x) => ({ ...x, ...p }));
  return (
    <aside className="lv-lista lg-horario__editor" aria-label={atual ? `Editar ${t('sessao')}` : novo(t('sessao'))}>
      {/* G-10 do PT (Figma 201:108): foto em cima, o nome e onde vai no pack; depois dia, hora, local e tipo */}
      <div className="lg-editor__foto" aria-hidden />
      <div className="lv-lista__cabeca">
        <h2 className="lg-editor__nome">{atual ? (atual.cliente ?? atual.titulo ?? TIPO[atual.tipo]) : novo(t('sessao'))}</h2>
        {atual && (posicao && atual.estado === 'confirmed'
          ? <Estado tom="ok">{t('sessao', { maiuscula: true })} {posicao.n} de {posicao.total}</Estado>
          : <Estado tom={ESTADO[atual.estado]?.tom ?? 'neutro'}>{ESTADO[atual.estado]?.texto ?? atual.estado}</Estado>)}
      </div>
      <div className="lg-conta__prefs">
        <Campo rotulo="Dia" type="date" value={e.dia} onChange={(x) => set({ dia: x.target.value })} />
        <Campo rotulo="Hora" type="time" value={e.hora} onChange={(x) => set({ hora: x.target.value })} />
        <label className="lv-campo"><span className="lv-campo-rotulo">Local</span>
          <select className="lv-campo-input" value={e.local?.tipo === 'online' ? 'online' : e.local?.texto ?? (atual?.local === 'online' ? 'online' : atual?.localTexto ?? '')}
            onChange={(x) => { const v = x.target.value; const l = locais.find((y) => (y.morada ? `${y.nome}, ${y.morada}` : y.nome) === v);
              set({ local: v === 'online' ? { tipo: 'online', texto: 'Online' } : l ? { tipo: l.tipo, texto: v } : null }); }}>
            <option value="">{atual?.local ? LOCAL[atual.local] ?? 'Por definir' : 'Por definir'}</option>
            {locais.filter((l) => l.tipo !== 'online').map((l) => { const v = l.morada ? `${l.nome}, ${l.morada}` : l.nome; return <option key={l.id} value={v}>{l.nome}</option>; })}
            <option value="online">Online</option>
          </select></label>
        <label className="lv-campo"><span className="lv-campo-rotulo">Tipo</span>
          <select className="lv-campo-input" value={e.tipo} onChange={(x) => set({ tipo: x.target.value as MarcacaoEditavel['tipo'] })}>
            {(['training', 'assessment', 'consultation', 'other'] as const).map((k) => <option key={k} value={k}>{k === 'training' ? ((e.local?.tipo ?? atual?.local) === 'online' ? 'Online' : 'Presencial') : TIPO[k]}</option>)}
          </select></label>
        <Campo rotulo="Duração (min)" type="number" min={15} max={240} step={15} value={e.minutos} onChange={(x) => set({ minutos: Number(x.target.value) || 60 })} />
        {salas.length > 0 && (
          <label className="lv-campo"><span className="lv-campo-rotulo">Sala</span>
            <select className="lv-campo-input" value={e.salaId ?? ''} onChange={(x) => set({ salaId: x.target.value || null })}>
              <option value="">Sem sala</option>{salas.map((sa) => <option key={sa.id} value={sa.id}>{sa.nome}</option>)}
            </select></label>
        )}
      </div>
      <label className="lv-campo"><span className="lv-campo-rotulo">{vocab.pessoa({ maiuscula: true })}</span>
        <select className="lv-campo-input" value={e.clienteId ?? ''} onChange={(x) => set({ clienteId: x.target.value || null })}>
          <option value="">Sem {vocab.pessoa()} (bloqueio ou tarefa)</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      {!e.clienteId && <Campo rotulo="Título" value={e.titulo} onChange={(x) => set({ titulo: x.target.value })} />}
      {posicao && e.tipo === 'training' && (
        <div className="lv-campo"><span className="lv-campo-rotulo">Pack</span>
          <span className="lg-editor__info">{posicao.nome} · {posicao.total - posicao.n === 0 ? `é ${g(t('sessao'), 'a última', 'o último')}` : `ficam ${posicao.total - posicao.n} depois ${g(t('sessao'), 'desta', 'deste')}`}</span></div>
      )}
      {atual?.serieId && (
        <div className="lv-campo"><span className="lv-campo-rotulo">Repetição</span>
          <span className="lg-editor__info">Todas as semanas · mudar aqui muda só esta</span></div>
      )}
      {equipa.length > 1 && (
        <label className="lv-campo"><span className="lv-campo-rotulo">{vocab.responsavel({ maiuscula: true })}</span>
          <select className="lv-campo-input" value={e.membershipId} onChange={(x) => set({ membershipId: x.target.value })}>{equipa.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      )}
      {!atual && (
        <>
          <label className="lv-legenda" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={repetir} onChange={() => setRepetir(!repetir)} />Repetir todas as semanas</label>
          {repetir && <Campo rotulo="Até" type="date" value={e.repetirAte ?? ''} onChange={(x) => set({ repetirAte: x.target.value })} />}
        </>
      )}
      <Campo rotulo="Notas" value={e.notas} onChange={(x) => set({ notas: x.target.value })} />
      {aviso && <Nota icone={Warning}>{aviso}</Nota>}
      {conflitos.length > 0 && <div className="lg-duplicado" role="alert"><Warning size={18} aria-hidden /><span>{conflitos.join(' · ')}</span></div>}
      <div className="lg-bib__acoes">
        {e.clienteId ? <Botao variante="secundario" onClick={() => navigate(`/clients/${e.clienteId}`)}>Ver ficha</Botao> : <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>}
        <Botao aCarregar={aGravar} disabled={conflitos.length > 0 || (repetir && !e.repetirAte)} onClick={() => void guardar()}>Guardar</Botao>
      </div>
      {atual && (
        <div className="lg-ficha__metricas">
          {atual.estado === 'pending' && <Botao onClick={() => void estado('confirmed')}>Confirmar</Botao>}
          {atual.estado === 'pending' && <Botao variante="secundario" onClick={() => void recusar()}>Recusar</Botao>}
          {atual.tipo === 'training' && atual.estado === 'confirmed' && <Botao variante="secundario" onClick={() => navigate(`/live/${atual.id}`)}>Iniciar</Botao>}
          {Date.parse(atual.inicio) < Date.now() && atual.estado !== 'completed' && <Botao variante="secundario" onClick={() => void estado('completed')}>Feita</Botao>}
          {Date.parse(atual.inicio) < Date.now() && atual.estado !== 'no_show' && <Botao variante="secundario" onClick={() => void estado('no_show')}>Faltou</Botao>}
          <Botao variante="secundario" className="lg-perigo" onClick={() => void cancelar()}>Cancelar</Botao>
        </div>
      )}
      {atual?.estado === 'pending' && atual.confirmarAte && (
        <Nota icone={Clock}>Confirmar até {new Date(atual.confirmarAte).toLocaleString('pt-PT', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}. Se ninguém confirmar, a hora fica livre e {atual.cliente ?? 'quem marcou'} é avisado.</Nota>
      )}
      {atual?.estado === 'cancelled' && atual.motivoCancelar && <Nota>Cancelada: {atual.motivoCancelar}</Nota>}
      {atual && <HistoricoMarcacao id={atual.id} />}
    </aside>
  );
}

/* ── G-09 Mês e Lista (T24) ─────────────────────────────────────────────── */
function VistaMes({ inicio, lista, hoje, tz, onDia }: { inicio: Date; lista: MarcacaoSemana[]; hoje: Date; tz: string; onDia: (d: Date) => void }) {
  const contagem = contarPorDia(lista, tz);
  const mes = new Date(inicio); mes.setUTCDate(mes.getUTCDate() + 10);
  const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(inicio); d.setUTCDate(d.getUTCDate() + i); return d; });
  const muda = mudancaDeHora(tz, inicio, 42);
  return (
    <section className="lv-lista lg-mes" aria-label="Mês">
      <div className="lg-mes__grelha">
        {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x, i) => <span key={i} className="lg-mes__cabeca">{x}</span>)}
        {dias.map((d) => {
          const k = isoDia(d); const c = contagem.get(k);
          const fora = d.getUTCMonth() !== mes.getUTCMonth();
          return (
            <button key={k} type="button" className={`lg-mes__dia${fora ? ' lg-mes__dia--fora' : ''}${k === isoDia(hoje) ? ' lg-mes__dia--hoje' : ''}`}
              onClick={() => onDia(d)} aria-label={`${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}: ${c?.n ?? 0} ${t('sessao', { plural: (c?.n ?? 0) !== 1 })}${c?.porConfirmar ? ', com marcações por confirmar' : ''}`}>
              <b>{d.getUTCDate()}</b>
              <span className="lv-legenda">{c?.porConfirmar && <i className="lg-mes__ponto" aria-hidden />}{c?.n ?? '—'}</span>
            </button>
          );
        })}
      </div>
      <Nota icone={Clock}>Hora de {tz.split('/').pop()?.replace('_', ' ')}.{muda ? ` A ${Number(muda.slice(8))} ${MESES[Number(muda.slice(5, 7)) - 1]} a hora muda; ${g(t('sessao', { plural: true }), 'as', 'os')} ficam à mesma hora local.` : ''}</Nota>
    </section>
  );
}

const CHAVE_FILTROS = 'luna.horario.lista';
function VistaLista({ lista, clientes, onAbrir }: { lista: MarcacaoSemana[]; clientes: ClientRow[]; onAbrir: (b: MarcacaoSemana) => void }) {
  const scope = useScope();
  const guardados = (() => { try { return JSON.parse(localStorage.getItem(CHAVE_FILTROS) ?? '{}') as { q?: string; estado?: FiltroLista; cliente?: string | null }; } catch { return {}; } })();
  const [q, setQ] = useState(guardados.q ?? '');
  const [estado, setEstado] = useState<FiltroLista>(guardados.estado ?? 'todas');
  const [cliente, setCliente] = useState<string | null>(guardados.cliente ?? null);
  useEffect(() => { try { localStorage.setItem(CHAVE_FILTROS, JSON.stringify({ q, estado, cliente })); } catch { /* fica só nesta visita */ } }, [q, estado, cliente]);
  const vis = filtrarLista(lista, q, estado, cliente);
  const n = (e: FiltroLista) => filtrarLista(lista, '', e, null).length;
  const quando = (iso: string) => {
    const w = wallClock(new Date(iso), scope.timezone);
    return `${DIAS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()].toLocaleLowerCase('pt-PT')} ${w.day} · ${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
  };
  return (
    <section className="lv-lista lg-tabela" aria-label="Lista">
      <div className="lg-lista__filtros">
        <Campo rotulo="Pesquisar" type="search" placeholder={`${t('sessao', { maiuscula: true })}, PT ou ${vocab.pessoa()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="lg-clientes__chips">
          <Chip ativo={estado === 'todas'} onClick={() => setEstado('todas')}>Todas</Chip>
          <Chip ativo={estado === 'pending'} onClick={() => setEstado('pending')}>Por confirmar {n('pending')}</Chip>
          <Chip ativo={estado === 'cancelled'} onClick={() => setEstado('cancelled')}>Canceladas {n('cancelled')}</Chip>
          <Chip ativo={estado === 'confirmed'} onClick={() => setEstado('confirmed')}>Confirmadas</Chip>
          <select className="lv-campo-input" style={{ width: 'auto' }} aria-label={vocab.pessoa({ maiuscula: true })} value={cliente ?? ''} onChange={(e) => setCliente(e.target.value || null)}>
            <option value="">{vocab.pessoa({ maiuscula: true })}: todos</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="lg-lista__linha lg-tabela__cabeca"><span>Dia e hora</span><span>{t('sessao', { maiuscula: true })}</span><span>Sala</span><span>Com</span><span>Estado</span></div>
      {vis.length === 0 ? <p className="lv-legenda" style={{ padding: 'var(--espaco-16)', margin: 0 }}>Nada com estes filtros.</p> : vis.map((b) => {
        const e = b.estado === 'pending' && b.confirmarAte ? { texto: `Até ${quando(b.confirmarAte)}`, tom: 'aviso' as EstadoTom } : ESTADO[b.estado];
        return (
          <button key={b.id} type="button" className="lg-lista__linha" onClick={() => onAbrir(b)}>
            <b>{quando(b.inicio)}</b>
            <span>{TIPO[b.tipo]}{b.cliente ? ` · ${b.cliente}` : b.titulo ? ` · ${b.titulo}` : ''}</span>
            <span>{b.sala ?? '—'}</span>
            <span>{b.pt ?? '—'}</span>
            <span><Estado tom={e?.tom ?? 'neutro'}>{e?.texto ?? b.estado}</Estado></span>
          </button>
        );
      })}
      <Nota>Por confirmar tem prazo: se ninguém confirmar a tempo, a hora fica livre e quem marcou é avisado.</Nota>
    </section>
  );
}

/* ── G-10 Cancelar com motivo e histórico ───────────────────────────────── */
function CancelarMarcacao({ alvo, onFechar, onFeito }: { alvo: MarcacaoSemana | null; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [motivo, setMotivo] = useState<string | null>(null);
  const [nota, setNota] = useState('');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { setMotivo(null); setNota(''); }, [alvo]);
  if (!alvo) return null;
  const w = wallClock(new Date(alvo.inicio), scope.timezone);
  const gravar = async () => {
    const client = getSupabaseClient();
    if (!client || !motivo) return;
    setAGravar(true);
    try { await cancelarMarcacao(client, scope, alvo.id, motivo, nota); toast({ variant: 'success', title: 'Cancelada', description: alvo.cliente ? `${alvo.cliente} foi avisado.` : undefined }); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível cancelar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta onFechar={onFechar} titulo={`Cancelar ${alvo.cliente ?? alvo.titulo ?? TIPO[alvo.tipo]} de ${DIAS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()].toLocaleLowerCase('pt-PT')}, ${w.day} ${MESES[w.month - 1]}?`}
      sub={alvo.cliente ? `${alvo.cliente} é avisado. Cancelada por ti, não desconta do pack.` : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <span className="lv-sobretitulo">Motivo</span>
        <div role="radiogroup" aria-label="Motivo" className="lg-ficha__metricas">
          {MOTIVOS_CANCELAR.map((m) => <Chip key={m} role="radio" aria-checked={motivo === m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
        </div>
        <Campo rotulo={alvo.cliente ? `Nota para ${alvo.cliente.split(' ')[0]}` : 'Nota'} placeholder="Ex.: estou doente, remarcamos para a semana" value={nota} onChange={(e) => setNota(e.target.value)} />
        <div className="lg-import__acoes" style={{ padding: 0 }}>
          <Botao variante="secundario" onClick={onFechar}>Voltar</Botao>
          <Botao className="lg-perigo" aCarregar={aGravar} disabled={!motivo || (motivo === 'Outro' && !nota.trim())} onClick={() => void gravar()}>Cancelar {t('sessao')}</Botao>
        </div>
      </div>
    </Janela>
  );
}

function HistoricoMarcacao({ id }: { id: string }) {
  const [h, setH] = useState<EventoMarcacao[] | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void historicoMarcacao(client, id).then(setH).catch(() => setH([]));
  }, [id]);
  if (!h || h.length === 0) return null;
  return (
    <details className="lg-horario__historico">
      <summary className="lv-sobretitulo">Histórico</summary>
      {h.map((e, i) => (
        <div key={i} className="lv-linha-lista" style={{ cursor: 'default', alignItems: 'flex-start' }}>
          <span className="lg-conta__ponto" aria-hidden />
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{e.oque}</span>
            <span className="lv-legenda">{[e.antes && e.depois ? `${e.antes} → ${e.depois}` : e.depois, e.motivo, e.quem,
              new Date(e.em).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })].filter(Boolean).join(' · ')}</span></span>
        </div>
      ))}
    </details>
  );
}
