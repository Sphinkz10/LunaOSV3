/**
 * Sessão de PT ao vivo (tarefa 08: G-12 preparar, G-13 dar, G-14 fechar).
 *
 * Regra 8 (sem rede): tudo grava primeiro no aparelho, com ids gerados no
 * aparelho, e segue por uma fila idempotente (sync_live faz upsert pelos ids:
 * reenviar nunca duplica). Fechar a app, perder a rede ou recarregar não
 * perde nada: o estado inteiro da sessão vive em localStorage até ser fechada.
 */
import type { LunaClient } from './client';
import type { Json } from '../types/database';
import type { OrgScope } from '../authStore';
import { novoId } from './treinoApp';

export type Presenca = 'presente' | 'atrasado' | 'saiu_cedo' | 'faltou' | 'nao_treina';
export type AptidaoSessao = 'ok' | 'adaptar' | 'atestado' | 'nao_pode';
export const PRESENCAS: { id: Presenca; rotulo: string }[] = [
  { id: 'presente', rotulo: 'Presente' }, { id: 'atrasado', rotulo: 'Chegou atrasado' }, { id: 'saiu_cedo', rotulo: 'Saiu mais cedo' },
  { id: 'faltou', rotulo: 'Faltou' }, { id: 'nao_treina', rotulo: 'Não pode treinar' },
];
export const contaComoPresente = (p: Presenca | null) => p === 'presente' || p === 'atrasado' || p === 'saiu_cedo';

/* ── G-12: o que vem do servidor para preparar ──────────────────────────── */
export interface ExercicioPlano {
  exercise_id: string | null; nome: string; series: number | null; reps: string | null; carga: string | null; rpe: number | null;
  descanso: number | null; notas: string | null; trocado_de?: string | null;
}
export interface BlocoPlano { rotulo: string | null; modo: string | null; voltas: number | null; minutos: number | null; exercicios: ExercicioPlano[] }
export interface TreinoPlano { workout_id: string; nome: string; versao: number; blocos: BlocoPlano[]; trocas: { de: string; para: string | null }[] }
export interface ParticipantePrep {
  booking_id: string; link_id: string; nome: string; avatar: string | null; estado_marcacao: string;
  presenca: Presenca | null; entrada_sem_reserva: boolean; aptidao: AptidaoSessao; zonas: string[];
  pack: { nome: string; restam: number; total: number } | null; sessoes_semana: number;
  treino: TreinoPlano | null; sessao_id: string | null;
}
export interface Preparacao {
  booking_id: string; group_id: string | null; inicio: string; fim: string; titulo: string | null; local: string | null;
  submetida_em: string | null; participantes: ParticipantePrep[];
  /** Quando foi descarregada (para "Disponível sem rede"). */
  descarregadaEm?: string;
}

const CHAVE_PREP = 'luna.aovivo.prep.';
const CHAVE_AULA = 'luna.aovivo.sessao.';
function ler<T>(k: string): T | null { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } }
function gravar(k: string, v: unknown): boolean { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
function tirar(k: string): void { try { localStorage.removeItem(k); } catch { /* sem armazenamento */ } }

/** Descarrega e guarda no aparelho; sem rede, devolve a última cópia. */
export async function prepararSessao(client: LunaClient | null, bookingId: string): Promise<{ prep: Preparacao; doAparelho: boolean }> {
  if (client) {
    const { data, error } = await client.rpc('prepare_session', { _booking: bookingId });
    if (!error && data) {
      const prep = { ...(data as unknown as Preparacao), descarregadaEm: new Date().toISOString() };
      gravar(CHAVE_PREP + bookingId, prep);
      return { prep, doAparelho: false };
    }
    const guardada = ler<Preparacao>(CHAVE_PREP + bookingId);
    if (guardada) return { prep: guardada, doAparelho: true };
    if (error) throw error;
  }
  const guardada = ler<Preparacao>(CHAVE_PREP + bookingId);
  if (!guardada) throw new Error('Sem rede e esta sessão ainda não foi descarregada neste aparelho.');
  return { prep: guardada, doAparelho: true };
}

/* ── G-13: a sessão no aparelho ─────────────────────────────────────────── */
export interface SerieLocal { id: string; n: number; reps: number | null; carga: number | null; rpe: number | null; feito: boolean; em: string }
export interface ExercicioLocal {
  id: string; exerciseId: string | null; nome: string; posicao: number; bloco: string | null; series: number | null;
  alvo: { reps: string | null; carga: string | null; rpe: number | null }; descanso: number | null; nota: string; sets: SerieLocal[];
}
export interface ParticipanteLocal {
  bookingId: string; linkId: string; nome: string; aptidao: AptidaoSessao; zonas: string[];
  presenca: Presenca | null; presencaEm: string | null; entradaSemReserva: boolean;
  sessaoId: string; workoutId: string | null; nota: string; exercicios: ExercicioLocal[];
  pack: ParticipantePrep['pack'];
}
export interface SessaoLocal {
  bookingId: string; titulo: string; inicioMarcado: string; fimMarcado: string;
  iniciadaEm: string; pausadaDesde: string | null; pausaSegundos: number;
  participantes: ParticipanteLocal[];
  /** Cada alteração sobe a versão; a fila sabe o que falta enviar. */
  versao: number; enviada: number; ultimoEnvio: string | null; erroEnvio: string | null;
}

function exerciciosDoTreino(t: TreinoPlano | null): ExercicioLocal[] {
  if (!t) return [];
  let pos = 0;
  return t.blocos.flatMap((b) => b.exercicios.map((e) => ({
    id: novoId(), exerciseId: e.exercise_id, nome: e.nome, posicao: pos++, bloco: b.rotulo, series: e.series,
    alvo: { reps: e.reps, carga: e.carga, rpe: e.rpe }, descanso: e.descanso, nota: '', sets: [],
  })));
}

/** Começar: uma sessão por cliente que vai treinar, com o treino do dia já carregado. */
export function comecarSessao(prep: Preparacao, agora = new Date()): SessaoLocal {
  return {
    bookingId: prep.booking_id, titulo: prep.titulo ?? (prep.participantes.length > 1 ? 'Pequeno grupo' : prep.participantes[0]?.nome ?? 'Sessão'),
    inicioMarcado: prep.inicio, fimMarcado: prep.fim, iniciadaEm: agora.toISOString(), pausadaDesde: null, pausaSegundos: 0,
    participantes: prep.participantes.map((p) => ({
      bookingId: p.booking_id, linkId: p.link_id, nome: p.nome, aptidao: p.aptidao, zonas: p.zonas ?? [],
      presenca: p.presenca ?? (p.aptidao === 'nao_pode' ? 'nao_treina' : prep.participantes.length === 1 ? 'presente' : null),
      presencaEm: null, entradaSemReserva: p.entrada_sem_reserva,
      sessaoId: novoId(), workoutId: p.treino?.workout_id ?? null, nota: '',
      exercicios: p.aptidao === 'nao_pode' ? [] : exerciciosDoTreino(p.treino), pack: p.pack,
    })),
    versao: 1, enviada: 0, ultimoEnvio: null, erroEnvio: null,
  };
}

/** Relógio que não conta as pausas (auditoria, secção 10). */
export function segundosDecorridos(s: Pick<SessaoLocal, 'iniciadaEm' | 'pausadaDesde' | 'pausaSegundos'>, agora = new Date()): number {
  const fim = s.pausadaDesde ? Date.parse(s.pausadaDesde) : agora.getTime();
  return Math.max(0, Math.floor((fim - Date.parse(s.iniciadaEm)) / 1000) - s.pausaSegundos);
}

type Mudanca = (s: SessaoLocal) => SessaoLocal;
const comVersao = (s: SessaoLocal): SessaoLocal => ({ ...s, versao: s.versao + 1 });
const noParticipante = (s: SessaoLocal, linkId: string, f: (p: ParticipanteLocal) => ParticipanteLocal): SessaoLocal =>
  comVersao({ ...s, participantes: s.participantes.map((p) => (p.linkId === linkId ? f(p) : p)) });

export const mudar = {
  pausar: (agora = new Date()): Mudanca => (s) => (s.pausadaDesde ? s : comVersao({ ...s, pausadaDesde: agora.toISOString() })),
  retomar: (agora = new Date()): Mudanca => (s) => (!s.pausadaDesde ? s
    : comVersao({ ...s, pausaSegundos: s.pausaSegundos + Math.max(0, Math.floor((agora.getTime() - Date.parse(s.pausadaDesde)) / 1000)), pausadaDesde: null })),
  presenca: (linkId: string, p: Presenca, agora = new Date()): Mudanca => (s) =>
    noParticipante(s, linkId, (x) => ({ ...x, presenca: p, presencaEm: agora.toISOString() })),
  entrada: (c: { linkId: string; nome: string }, agora = new Date()): Mudanca => (s) => (s.participantes.some((p) => p.linkId === c.linkId) ? s
    : comVersao({ ...s, participantes: [...s.participantes, {
        bookingId: novoId(), linkId: c.linkId, nome: c.nome, aptidao: 'ok', zonas: [], presenca: 'presente', presencaEm: agora.toISOString(),
        entradaSemReserva: true, sessaoId: novoId(), workoutId: null, nota: '',
        exercicios: s.participantes[0]?.exercicios.map((e) => ({ ...e, id: novoId(), sets: [], nota: '' })) ?? [], pack: null,
      }] })),
  serie: (linkId: string, exId: string, v: { reps: number | null; carga: number | null; rpe: number | null; feito?: boolean }, n?: number, agora = new Date()): Mudanca => (s) =>
    noParticipante(s, linkId, (p) => ({ ...p, presenca: p.presenca ?? 'presente', exercicios: p.exercicios.map((e) => {
      if (e.id !== exId) return e;
      const alvo = n ?? e.sets.length + 1;
      const existe = e.sets.find((x) => x.n === alvo);
      const nova: SerieLocal = { id: existe?.id ?? novoId(), n: alvo, reps: v.reps, carga: v.carga, rpe: v.rpe, feito: v.feito ?? true, em: agora.toISOString() };
      return { ...e, sets: existe ? e.sets.map((x) => (x.n === alvo ? nova : x)) : [...e.sets, nova] };
    }) })),
  exercicio: (linkId: string, e: { exerciseId: string | null; nome: string }): Mudanca => (s) =>
    noParticipante(s, linkId, (p) => ({ ...p, exercicios: [...p.exercicios, {
      id: novoId(), exerciseId: e.exerciseId, nome: e.nome, posicao: p.exercicios.reduce((m, x) => Math.max(m, x.posicao + 1), 0),
      bloco: null, series: null, alvo: { reps: null, carga: null, rpe: null }, descanso: null, nota: '', sets: [],
    }] })),
  notaExercicio: (linkId: string, exId: string, nota: string): Mudanca => (s) =>
    noParticipante(s, linkId, (p) => ({ ...p, exercicios: p.exercicios.map((e) => (e.id === exId ? { ...e, nota } : e)) })),
  nota: (linkId: string, nota: string): Mudanca => (s) => noParticipante(s, linkId, (p) => ({ ...p, nota })),
};

/** O que segue para o servidor: o estado inteiro (idempotente). */
export function payloadSync(s: SessaoLocal): Record<string, unknown> {
  return {
    booking_id: s.bookingId, iniciada_em: s.iniciadaEm, segundos: segundosDecorridos(s), pausa_segundos: s.pausaSegundos,
    fase: s.pausadaDesde ? 'paused' : 'live',
    participantes: s.participantes.map((p) => ({
      booking_id: p.bookingId, link_id: p.linkId, presenca: p.presenca, presenca_em: p.presencaEm, workout_id: p.workoutId, nota: p.nota,
      // Quem falta ou não treina não abre sessão
      sessao_id: p.presenca === 'faltou' || p.presenca === 'nao_treina' || (!p.exercicios.some((e) => e.sets.length) && !contaComoPresente(p.presenca)) ? null : p.sessaoId,
      exercicios: p.exercicios.map((e) => ({
        id: e.id, exercise_id: e.exerciseId, posicao: e.posicao, series: e.series, nota: e.nota,
        sets: e.sets.map((x) => ({ id: x.id, n: x.n, reps: x.reps, carga: x.carga, rpe: x.rpe, feito: x.feito, em: x.em })),
      })),
    })),
  };
}

/* ── Guardar no aparelho e a fila ───────────────────────────────────────── */
export const sessaoLocal = {
  ler: (bookingId: string) => ler<SessaoLocal>(CHAVE_AULA + bookingId),
  guardar: (s: SessaoLocal) => gravar(CHAVE_AULA + s.bookingId, s),
  limpar: (bookingId: string) => { tirar(CHAVE_AULA + bookingId); tirar(CHAVE_PREP + bookingId); },
  /** Todas as sessões neste aparelho (para retomar e para a barra "à espera"). */
  todas: (): SessaoLocal[] => {
    try {
      const chaves: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(CHAVE_AULA)) chaves.push(k); }
      return chaves.map((k) => ler<SessaoLocal>(k)).filter((x): x is SessaoLocal => !!x);
    } catch { return []; }
  },
};
export const porEnviar = (s: SessaoLocal) => s.versao > s.enviada;
export function contarPorEnviar(): number { return sessaoLocal.todas().filter(porEnviar).length; }

/** Envia o estado atual; se falhar fica marcado para a próxima. Devolve a sessão atualizada (e já guardada). */
export async function enviarSessao(client: LunaClient | null, s: SessaoLocal): Promise<SessaoLocal> {
  if (!client || !porEnviar(s)) return s;
  const versao = s.versao;
  const { error } = await client.rpc('sync_live', { _p: payloadSync(s) as unknown as Json });
  // Pode ter mudado enquanto enviava: lê a última versão guardada
  const atual = sessaoLocal.ler(s.bookingId);
  if (!atual) return { ...s, enviada: error ? s.enviada : Math.max(s.enviada, versao) };   // entretanto fechada: não volta a gravar
  const nova: SessaoLocal = error
    ? { ...atual, erroEnvio: error.message }
    : { ...atual, enviada: Math.max(atual.enviada, versao), ultimoEnvio: new Date().toISOString(), erroEnvio: null };
  sessaoLocal.guardar(nova);
  return nova;
}

/** Com rede de volta: envia tudo o que está à espera neste aparelho. */
export async function enviarPendentes(client: LunaClient): Promise<number> {
  let falta = 0;
  for (const s of sessaoLocal.todas().filter(porEnviar)) {
    const r = await enviarSessao(client, s);
    if (porEnviar(r)) falta++;
  }
  return falta;
}

/* ── G-14: fechar uma vez ───────────────────────────────────────────────── */
export interface ResultadoFecho { presentes: number; faltas: number; semFalta: number; jaFechada: boolean }
export async function fecharSessao(client: LunaClient, s: SessaoLocal): Promise<ResultadoFecho> {
  const enviada = await enviarSessao(client, s);
  if (porEnviar(enviada)) throw new Error(enviada.erroEnvio ? `Não foi possível enviar: ${enviada.erroEnvio}` : 'Ainda há registos por enviar. Volta a tentar com rede.');
  const { data, error } = await client.rpc('submit_live', { _booking: s.bookingId });
  if (error) throw new Error(error.message.replace(/^Falta marcar/, 'Falta marcar'));
  const r = (data ?? {}) as { presentes?: number; faltas?: number; sem_falta?: number; ja_submetida?: boolean };
  sessaoLocal.limpar(s.bookingId);
  return { presentes: r.presentes ?? 0, faltas: r.faltas ?? 0, semFalta: r.sem_falta ?? 0, jaFechada: !!r.ja_submetida };
}

/** Verificação antes de fechar: quem falta marcar e quem tem resultados por registar. */
export function antesDeFechar(s: SessaoLocal): { semPresenca: string[]; semResultados: string[]; creditos: number } {
  return {
    semPresenca: s.participantes.filter((p) => !p.presenca && !p.exercicios.some((e) => e.sets.length)).map((p) => p.nome),
    semResultados: s.participantes.filter((p) => contaComoPresente(p.presenca) && p.exercicios.length > 0 && !p.exercicios.some((e) => e.sets.length)).map((p) => p.nome),
    creditos: s.participantes.filter((p) => p.pack && (contaComoPresente(p.presenca) || p.presenca === 'faltou' || (!p.presenca && p.exercicios.some((e) => e.sets.length)))).length,
  };
}

/* ── Depois de fechar: resumo, histórico e correções ────────────────────── */
export interface LinhaFecho { bookingId: string; linkId: string; nome: string; presenca: Presenca | null; entradaSemReserva: boolean; series: number; volume: number; pack: string | null; sessaoId: string | null }
export async function resumoFecho(client: LunaClient, bookingId: string): Promise<{ prep: Preparacao; linhas: LinhaFecho[] }> {
  const { prep } = await prepararSessao(client, bookingId);
  const sessoes = prep.participantes.map((p) => p.sessao_id).filter((x): x is string => !!x);
  const { data: sets } = sessoes.length
    ? await client.from('session_sets').select('session_id,reps,load_kg,completed').in('session_id', sessoes)
    : { data: [] as { session_id: string; reps: number | null; load_kg: number | null; completed: boolean }[] };
  const { data: usos } = await client.from('pack_usages').select('booking_id,reverted_at').in('booking_id', prep.participantes.map((p) => p.booking_id));
  return {
    prep,
    linhas: prep.participantes.map((p) => {
      const meus = (sets ?? []).filter((x) => x.session_id === p.sessao_id && x.completed);
      const uso = (usos ?? []).find((u) => u.booking_id === p.booking_id && !u.reverted_at);
      return {
        bookingId: p.booking_id, linkId: p.link_id, nome: p.nome, presenca: p.presenca, entradaSemReserva: p.entrada_sem_reserva,
        series: meus.length, volume: meus.reduce((t, x) => t + (x.reps ?? 0) * Number(x.load_kg ?? 0), 0),
        pack: uso ? 'Descontou 1' : p.pack ? 'Sem desconto' : null, sessaoId: p.sessao_id,
      };
    }),
  };
}
export interface EntradaHistorico { em: string; quem: string | null; texto: string; motivo: string | null }
export async function historicoSessao(client: LunaClient, bookingId: string): Promise<EntradaHistorico[]> {
  const { data, error } = await client.rpc('session_history', { _booking: bookingId });
  if (error) throw error;
  return (data ?? []) as EntradaHistorico[];
}
export async function corrigirPresenca(client: LunaClient, bookingId: string, p: Presenca, motivo: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Escreve o motivo da correção.');
  const { error } = await client.rpc('correct_attendance', { _booking: bookingId, _status: p, _reason: motivo.trim() });
  if (error) throw error;
}
export async function corrigirSerie(client: LunaClient, setId: string, v: { reps: number | null; carga: number | null; rpe: number | null }, motivo: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Escreve o motivo da correção.');
  const { error } = await client.rpc('correct_set', { _set: setId, _reps: v.reps, _carga: v.carga, _rpe: v.rpe, _reason: motivo.trim() });
  if (error) throw error;
}

/* ── Marcar pequeno grupo e sessões esquecidas ──────────────────────────── */
export async function marcarGrupo(client: LunaClient, scope: OrgScope, g: { membershipId: string; links: string[]; inicio: string; minutos: number; titulo?: string; salaId?: string | null }): Promise<string> {
  const { data, error } = await client.rpc('create_group_booking', {
    _org: scope.orgId, _membership: g.membershipId, _links: g.links, _starts: g.inicio, _minutes: g.minutos, _title: g.titulo ?? null, _room: g.salaId ?? null,
  });
  if (error) throw error;
  return data as string;
}
export interface SessaoEsquecida { id: string; bookingId: string | null; cliente: string; inicio: string; series: number }
export async function sessoesEsquecidas(client: LunaClient, scope: OrgScope): Promise<SessaoEsquecida[]> {
  const { data, error } = await client.rpc('stale_sessions', { _org: scope.orgId });
  if (error) throw error;
  return (data ?? []).map((x) => ({ id: x.id, bookingId: x.booking_id, cliente: x.cliente, inicio: x.inicio, series: x.series }));
}
