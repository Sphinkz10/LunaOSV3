import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  avisoPack, confirmarDestrutivo, conflitosAntes, fetchClients, fetchSaldo, fetchSemana, fetchStaff, fetchUnidades, guardarMarcacao, instante, setBookingStatus, toast,
  wallClock, type ClientRow, type MarcacaoEditavel, type MarcacaoSemana, type StaffLite, type Unidade,
  fetchLocais, type LocalPT,
} from '@luna/core';
import { Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Nota, type EstadoTom } from '@luna/ui/v3';
import { CalendarBlank, CaretRight, Plus, Warning } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t, vocab } from '../lib/vocab';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const H0 = 6; const H1 = 22; const PX = 48;
const TIPO: Record<string, string> = { training: t('sessao', { maiuscula: true }), consultation: 'Consulta', assessment: 'Avaliação', other: 'Outro', class: t('aula', { maiuscula: true }) };
const ESTADO: Record<string, { texto: string; tom: EstadoTom }> = {
  pending: { texto: 'Por confirmar', tom: 'aviso' }, confirmed: { texto: 'Confirmada', tom: 'ok' }, completed: { texto: 'Feita', tom: 'neutro' },
  no_show: { texto: 'Faltou', tom: 'erro' }, cancelled: { texto: 'Cancelada', tom: 'neutro' }, waitlisted: { texto: 'Em espera', tom: 'aviso' },
};
const isoDia = (d: Date) => d.toISOString().slice(0, 10);

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
  const [segunda, setSegunda] = useState(() => { const d = new Date(hoje); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; });
  const [lista, setLista] = useState<MarcacaoSemana[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [equipa, setEquipa] = useState<StaffLite[]>([]);
  const [salas, setSalas] = useState<{ id: string; nome: string }[]>([]);
  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [filtroPt, setFiltroPt] = useState<string>(veTodos ? 'todos' : scope.membershipId);
  const [filtroSala, setFiltroSala] = useState<string | null>(null);
  const soPendentes = params.get('estado') === 'pendente';
  const [aberto, setAberto] = useState<MarcacaoEditavel | null>(null);
  const [atual, setAtual] = useState<MarcacaoSemana | null>(null);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    const ini = instante(isoDia(segunda), '00:00', scope.timezone);
    void fetchSemana(client, scope, ini, 7).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope, segunda]);
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

  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setUTCDate(d.getUTCDate() + i); return d; });
  const visiveis = (lista ?? []).filter((b) => (filtroPt === 'todos' || b.membershipId === filtroPt) && (!filtroSala || b.salaId === filtroSala) && (!soPendentes || b.estado === 'pending'));
  const local = (iso: string) => wallClock(new Date(iso), scope.timezone);
  const abrir = (b: MarcacaoSemana) => {
    const w = local(b.inicio);
    setAtual(b);
    setAberto({ id: b.id, membershipId: b.membershipId ?? scope.membershipId, clienteId: b.clienteId, salaId: b.salaId, tipo: b.tipo, titulo: b.titulo,
      dia: `${w.year}-${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')}`, hora: `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`,
      minutos: Math.round((Date.parse(b.fim) - Date.parse(b.inicio)) / 60000), notas: b.notas ?? '' });
  };
  const semanaTxt = `${dias[0].getUTCDate()} ${MESES[dias[0].getUTCMonth()]} a ${dias[6].getUTCDate()} ${MESES[dias[6].getUTCMonth()]}`;
  const mover = (n: number) => setSegunda((d) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n * 7); return x; });

  return (
    <CoachShell headStrong="Horário" headSub={semanaTxt} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <Botao variante="secundario" onClick={() => navigate('/schedule/disponibilidade')}>Disponibilidade</Botao>
        <Botao variante="secundario" onClick={() => navigate('/schedule/regras')}>Regras e lembretes</Botao>
        <Botao icone={Plus} onClick={() => { setAtual(null); setAberto(novaBase()); }}>Nova {t('sessao')}</Botao>
      </span>}>
      <div className="lv-root lg-ficha">
        <div className="lg-clientes__barra">
          <div className="lg-clientes__chips">
            <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone lg-refazer" aria-label="Semana anterior" onClick={() => mover(-1)}><CaretRight size={16} aria-hidden /></button>
            <Botao variante="secundario" onClick={() => setSegunda(() => { const d = new Date(hoje); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; })}>Hoje</Botao>
            <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Semana seguinte" onClick={() => mover(1)}><CaretRight size={16} aria-hidden /></button>
          </div>
          <div className="lg-clientes__chips">
            {veTodos && <Chip ativo={filtroPt === 'todos'} onClick={() => setFiltroPt('todos')}>Toda a equipa</Chip>}
            <Chip ativo={filtroPt === scope.membershipId} onClick={() => setFiltroPt(scope.membershipId)}>Só eu</Chip>
            {veTodos && equipa.filter((m) => m.id !== scope.membershipId).slice(0, 4).map((m) => <Chip key={m.id} ativo={filtroPt === m.id} onClick={() => setFiltroPt(m.id)}>{m.name.split(' ')[0]}</Chip>)}
            {salas.map((s) => <Chip key={s.id} ativo={filtroSala === s.id} onClick={() => setFiltroSala(filtroSala === s.id ? null : s.id)}>{s.nome}</Chip>)}
            <Chip ativo={soPendentes} onClick={() => setParams((p) => { if (soPendentes) p.delete('estado'); else p.set('estado', 'pendente'); return p; })}>Por confirmar</Chip>
          </div>
        </div>
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar o horário" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !lista ? <Esqueleto />
          : (
            <div className={`lg-horario${aberto ? ' lg-horario--aberto' : ''}`}>
              <section className="lv-lista lg-grade" aria-label="Semana">
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
                {visiveis.length === 0 && <p className="lv-legenda" style={{ padding: 'var(--espaco-12)', margin: 0 }}>{soPendentes ? 'Nada por confirmar nesta semana.' : 'Semana livre. Toca duas vezes num dia para marcar.'}</p>}
              </section>
              {aberto && (
                <Editor marcacao={aberto} atual={atual} equipa={equipa} salas={salas} clientes={clientes}
                  onFechar={() => { setAberto(null); setAtual(null); }} onGuardado={() => { setAberto(null); setAtual(null); carregar(); }} />
              )}
            </div>
          )}
      </div>
    </CoachShell>
  );
}

function Editor({ marcacao, atual, equipa, salas, clientes, onFechar, onGuardado }: {
  marcacao: MarcacaoEditavel; atual: MarcacaoSemana | null; equipa: StaffLite[]; salas: { id: string; nome: string }[]; clientes: ClientRow[];
  onFechar: () => void; onGuardado: () => void;
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
  const cancelar = async () => {
    const client = getSupabaseClient();
    if (!client || !atual) return;
    const ok = await confirmarDestrutivo({
      titulo: 'Cancelar esta sessão?', verbo: 'Cancelar sessão', manter: 'Manter', efeitos: atual.cliente ? [`${atual.cliente} recebe o aviso`] : [],
      motivo: { rotulo: 'Motivo', placeholder: 'Ex.: PT doente' }, acao: (m) => setBookingStatus(client, scope, atual.id, 'cancelled', m ?? null),
    });
    if (ok) onGuardado();
  };
  const set = (p: Partial<MarcacaoEditavel>) => setE((x) => ({ ...x, ...p }));
  return (
    <aside className="lv-lista lg-horario__editor" aria-label={atual ? 'Editar sessão' : 'Nova sessão'}>
      <div className="lv-lista__cabeca">
        <h2 className="lv-titulo-cartao">{atual ? (atual.cliente ?? atual.titulo ?? 'Sessão') : `Nova ${t('sessao')}`}</h2>
        {atual && <Estado tom={ESTADO[atual.estado]?.tom ?? 'neutro'}>{ESTADO[atual.estado]?.texto ?? atual.estado}</Estado>}
      </div>
      <div role="radiogroup" aria-label="Tipo" className="lg-ficha__metricas">
        {(['training', 'consultation', 'assessment', 'other'] as const).map((k) => <Chip key={k} role="radio" aria-checked={e.tipo === k} ativo={e.tipo === k} onClick={() => set({ tipo: k })}>{TIPO[k]}</Chip>)}
      </div>
      <label className="lv-campo"><span className="lv-campo-rotulo">{vocab.pessoa({ maiuscula: true })}</span>
        <select className="lv-campo-input" value={e.clienteId ?? ''} onChange={(x) => set({ clienteId: x.target.value || null })}>
          <option value="">Sem {vocab.pessoa()} (bloqueio ou tarefa)</option>
          {clientes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
      {!e.clienteId && <Campo rotulo="Título" value={e.titulo} onChange={(x) => set({ titulo: x.target.value })} />}
      <div className="lg-conta__prefs">
        <Campo rotulo="Dia" type="date" value={e.dia} onChange={(x) => set({ dia: x.target.value })} />
        <Campo rotulo="Hora" type="time" value={e.hora} onChange={(x) => set({ hora: x.target.value })} />
        <Campo rotulo="Duração (min)" type="number" min={15} max={240} step={15} value={e.minutos} onChange={(x) => set({ minutos: Number(x.target.value) || 60 })} />
        <label className="lv-campo"><span className="lv-campo-rotulo">Sala</span>
          <select className="lv-campo-input" value={e.salaId ?? ''} onChange={(x) => set({ salaId: x.target.value || null })}>
            <option value="">Sem sala</option>{salas.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select></label>
      </div>
      {locais.length > 0 && (
        <div role="radiogroup" aria-label="Local" className="lg-ficha__metricas">
          {locais.map((l) => {
            const ativo = e.local?.tipo === l.tipo && e.local?.texto === (l.morada ? `${l.nome}, ${l.morada}` : l.nome);
            return <Chip key={l.id} role="radio" aria-checked={ativo} ativo={ativo} onClick={() => set({ local: ativo ? null : { tipo: l.tipo, texto: l.morada ? `${l.nome}, ${l.morada}` : l.nome } })}>{l.nome}</Chip>;
          })}
        </div>
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
      <div className="lg-import__acoes" style={{ padding: 0 }}>
        <Botao variante="secundario" onClick={onFechar}>Fechar</Botao>
        <Botao aCarregar={aGravar} disabled={conflitos.length > 0 || (repetir && !e.repetirAte)} onClick={() => void guardar()}>Guardar</Botao>
      </div>
      {atual && (
        <div className="lg-ficha__metricas">
          {atual.estado === 'pending' && <Botao variante="secundario" onClick={() => void estado('confirmed')}>Confirmar</Botao>}
          {atual.tipo === 'training' && atual.estado === 'confirmed' && <Botao variante="secundario" onClick={() => navigate(`/live/${atual.id}`)}>Iniciar</Botao>}
          {Date.parse(atual.inicio) < Date.now() && atual.estado !== 'completed' && <Botao variante="secundario" onClick={() => void estado('completed')}>Feita</Botao>}
          {Date.parse(atual.inicio) < Date.now() && atual.estado !== 'no_show' && <Botao variante="secundario" onClick={() => void estado('no_show')}>Faltou</Botao>}
          <Botao variante="secundario" className="lg-perigo" onClick={() => void cancelar()}>Cancelar</Botao>
        </div>
      )}
      {atual?.serieId && <Nota icone={CalendarBlank}>Faz parte de uma série semanal; mudar aqui muda só esta.</Nota>}
    </aside>
  );
}
