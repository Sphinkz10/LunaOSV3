/**
 * Avaliação (passo 22 da F1b, tarefa 13): questionários e protocolos com
 * versões (G-21, G-22), pedidos (G-24), rever e comparar (G-25), aplicar no
 * terreno sem rede (G-23), e na app o check-in e as respostas (C-08, C-15).
 */
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Json } from '../types/database';
import { novoId } from './treinoApp';

/* ── Perguntas (G-21) ───────────────────────────────────────────────────── */
export type TipoPergunta = 'texto' | 'numero' | 'escala' | 'escolha' | 'escolha_multipla' | 'sim_nao' | 'foto' | 'data' | 'hora';
export const TIPOS_PERGUNTA: { id: TipoPergunta; rotulo: string }[] = [
  { id: 'texto', rotulo: 'Texto' }, { id: 'numero', rotulo: 'Número' }, { id: 'escala', rotulo: 'Escala' }, { id: 'escolha', rotulo: 'Escolha' },
  { id: 'escolha_multipla', rotulo: 'Várias escolhas' }, { id: 'sim_nao', rotulo: 'Sim ou não' }, { id: 'foto', rotulo: 'Foto' },
  { id: 'data', rotulo: 'Data' }, { id: 'hora', rotulo: 'Hora' },
];
export interface Pergunta {
  id: string; tipo: TipoPergunta; texto: string; obrigatorio?: boolean; ajuda?: string;
  min?: number; max?: number; unidade?: string; opcoes?: string[];
  se?: { pergunta: string; valores: (string | number | boolean)[] };
  pontua?: { dimensao: string; peso: number };
  acao?: 'avisar_pt' | 'pedir_atestado'; valores_aviso?: (string | number | boolean)[];
}
export type Respostas = Record<string, string | number | boolean | string[] | null>;
export type TipoQuestionario = 'anamnese' | 'satisfacao' | 'checkin_semanal' | 'outro';
export const TIPOS_QUESTIONARIO: { id: TipoQuestionario; rotulo: string }[] = [
  { id: 'checkin_semanal', rotulo: 'Check-in semanal' }, { id: 'anamnese', rotulo: 'Anamnese' }, { id: 'satisfacao', rotulo: 'Satisfação' }, { id: 'outro', rotulo: 'Outro' },
];

/** O mesmo que o servidor verifica ao publicar; devolve a primeira falha em português. */
export function validarPerguntas(qs: Pergunta[]): string | null {
  if (!qs.length) return 'O questionário não tem perguntas.';
  const ids: string[] = [];
  for (const q of qs) {
    if (!q.id || ids.includes(q.id)) return 'Cada pergunta precisa de um identificador único.';
    if (!q.texto.trim()) return 'Há uma pergunta sem texto.';
    if ((q.tipo === 'escolha' || q.tipo === 'escolha_multipla') && (q.opcoes?.filter((o) => o.trim()).length ?? 0) < 2) return `A pergunta "${q.texto}" precisa de pelo menos 2 opções.`;
    if (q.se && !ids.includes(q.se.pergunta)) return `A condição da pergunta "${q.texto}" tem de depender de uma pergunta anterior.`;
    if (q.tipo === 'numero' && q.min != null && q.max != null && q.min > q.max) return `Limites trocados em "${q.texto}".`;
    ids.push(q.id);
  }
  return null;
}

/** Mostra a pergunta? Só se a condição dela (resposta anterior) se cumprir. */
export function perguntaVisivel(q: Pergunta, r: Respostas): boolean {
  if (!q.se) return true;
  const v = r[q.se.pergunta];
  return v != null && q.se.valores.some((x) => x === v);
}
/** Erro desta resposta (ou null). */
export function erroResposta(q: Pergunta, v: Respostas[string]): string | null {
  const vazio = v == null || v === '' || (Array.isArray(v) && v.length === 0);
  if (vazio) return q.obrigatorio ? 'Esta resposta é obrigatória.' : null;
  if (q.tipo === 'numero') {
    const n = Number(v);
    if (!Number.isFinite(n)) return 'Escreve um número.';
    if (q.min != null && n < q.min) return `Mínimo ${q.min}${q.unidade ? ` ${q.unidade}` : ''}.`;
    if (q.max != null && n > q.max) return `Máximo ${q.max}${q.unidade ? ` ${q.unidade}` : ''}.`;
  }
  if (q.tipo === 'escolha_multipla' && Array.isArray(v)) {
    if (q.min != null && v.length < q.min) return `Escolhe pelo menos ${q.min}.`;
    if (q.max != null && v.length > q.max) return `Escolhe no máximo ${q.max}.`;
  }
  return null;
}

export interface Questionario { id: string; nome: string; tipo: TipoQuestionario; saude: boolean; perguntas: Pergunta[]; versao: number; arquivado: boolean; atualizado: string }
const paraQuestionario = (f: { id: string; name: string; kind: string; health: boolean; questions: Json; version: number; archived_at: string | null; updated_at: string }): Questionario => ({
  id: f.id, nome: f.name, tipo: f.kind as TipoQuestionario, saude: f.health, perguntas: (f.questions as unknown as Pergunta[]) ?? [], versao: f.version, arquivado: !!f.archived_at, atualizado: f.updated_at,
});
export async function fetchQuestionarios(client: LunaClient, scope: OrgScope): Promise<Questionario[]> {
  const { data, error } = await client.from('forms').select('id,name,kind,health,questions,version,archived_at,updated_at').eq('org_id', scope.orgId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(paraQuestionario);
}
export async function fetchQuestionario(client: LunaClient, id: string): Promise<Questionario> {
  const { data, error } = await client.from('forms').select('id,name,kind,health,questions,version,archived_at,updated_at').eq('id', id).single();
  if (error) throw error;
  return paraQuestionario(data);
}
export async function guardarQuestionario(client: LunaClient, scope: OrgScope, q: Omit<Questionario, 'id' | 'versao' | 'arquivado' | 'atualizado'> & { id?: string }): Promise<string> {
  const row = { org_id: scope.orgId, name: q.nome.trim(), kind: q.tipo, health: q.saude || q.tipo === 'anamnese', questions: q.perguntas as unknown as Json, updated_at: new Date().toISOString() };
  if (q.id) {
    const { error } = await client.from('forms').update(row).eq('id', q.id);
    if (error) throw error;
    return q.id;
  }
  const { data, error } = await client.from('forms').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}
export async function publicarQuestionario(client: LunaClient, id: string): Promise<number> {
  const { data, error } = await client.rpc('publish_form', { _form: id });
  if (error) throw new Error(error.message);
  return data as number;
}
export async function arquivarQuestionario(client: LunaClient, id: string, arquivar: boolean): Promise<void> {
  const { error } = await client.from('forms').update({ archived_at: arquivar ? new Date().toISOString() : null }).eq('id', id);
  if (error) throw error;
}

/** Modelos para começar (o PAR-Q do LunaOS fica à parte e não se edita). */
export const MODELOS_QUESTIONARIO: { nome: string; tipo: TipoQuestionario; perguntas: Pergunta[] }[] = [
  { nome: 'Check-in semanal online', tipo: 'checkin_semanal', perguntas: [
    { id: 'peso', tipo: 'numero', texto: 'Quanto pesas hoje?', unidade: 'kg', min: 30, max: 250 },
    { id: 'sono', tipo: 'escala', texto: 'Como dormiste esta semana?', min: 1, max: 5, pontua: { dimensao: 'bem_estar', peso: 1 } },
    { id: 'treinos', tipo: 'escolha', texto: 'Cumpriste os treinos do plano?', opcoes: ['Sim', 'Em parte', 'Não'] },
    { id: 'fotos', tipo: 'foto', texto: 'Fotos de frente, lado e costas' },
    { id: 'dor', tipo: 'sim_nao', texto: 'Alguma dor ou lesão nova?', acao: 'avisar_pt' },
    { id: 'dor_onde', tipo: 'texto', texto: 'Onde e desde quando?', obrigatorio: true, se: { pergunta: 'dor', valores: [true] } },
  ] },
  { nome: 'Anamnese', tipo: 'anamnese', perguntas: [
    { id: 'objetivo', tipo: 'texto', texto: 'O que queres conseguir com o treino?', obrigatorio: true },
    { id: 'lesao', tipo: 'sim_nao', texto: 'Já tiveste alguma lesão que ainda te incomode?', obrigatorio: true, acao: 'avisar_pt' },
    { id: 'lesao_onde', tipo: 'texto', texto: 'Onde e desde quando?', obrigatorio: true, se: { pergunta: 'lesao', valores: [true] } },
    { id: 'medicacao', tipo: 'sim_nao', texto: 'Tomas alguma medicação regular?' },
    { id: 'dias', tipo: 'escolha_multipla', texto: 'Que dias podes treinar?', opcoes: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'], min: 1 },
  ] },
  { nome: 'Satisfação', tipo: 'satisfacao', perguntas: [
    { id: 'nota', tipo: 'escala', texto: 'De 1 a 5, como estás com o acompanhamento?', min: 1, max: 5, obrigatorio: true, pontua: { dimensao: 'satisfacao', peso: 1 } },
    { id: 'melhorar', tipo: 'texto', texto: 'O que podíamos fazer melhor?' },
  ] },
];

/* ── Protocolos (G-22) ──────────────────────────────────────────────────── */
export interface TesteProtocolo { chave: string; nome: string; unidade: string; tentativas: number; guarda?: 'melhor' | 'media'; menor_melhor?: boolean; zonas?: string[]; como?: string }
export interface BlocoProtocolo { titulo: string; testes: TesteProtocolo[] }
export interface Protocolo { id: string; nome: string; blocos: BlocoProtocolo[]; versao: number; arquivado: boolean }
export async function fetchProtocolos(client: LunaClient, scope: OrgScope): Promise<Protocolo[]> {
  const { data, error } = await client.from('protocols').select('id,name,blocks,version,archived_at').eq('org_id', scope.orgId).order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((p) => ({ id: p.id, nome: p.name, blocos: (p.blocks as unknown as BlocoProtocolo[]) ?? [], versao: p.version, arquivado: !!p.archived_at }));
}
export async function guardarProtocolo(client: LunaClient, scope: OrgScope, p: { id?: string; nome: string; blocos: BlocoProtocolo[] }): Promise<string> {
  const row = { org_id: scope.orgId, name: p.nome.trim(), blocks: p.blocos as unknown as Json, updated_at: new Date().toISOString() };
  if (p.id) { const { error } = await client.from('protocols').update(row).eq('id', p.id); if (error) throw error; return p.id; }
  const { data, error } = await client.from('protocols').insert(row).select('id').single();
  if (error) throw error;
  return data.id;
}
export async function publicarProtocolo(client: LunaClient, id: string): Promise<number> {
  const { data, error } = await client.rpc('publish_protocol', { _protocol: id });
  if (error) throw new Error(error.message);
  return data as number;
}
export const chaveDeTeste = (nome: string) => nome.toLocaleLowerCase('pt-PT').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'teste';
export const MODELO_PROTOCOLO: BlocoProtocolo[] = [
  { titulo: 'Composição corporal', testes: [
    { chave: 'peso', nome: 'Peso', unidade: 'kg', tentativas: 1 }, { chave: 'gordura', nome: '% gordura', unidade: '%', tentativas: 1, menor_melhor: true },
  ] },
  { titulo: 'Perímetros', testes: [{ chave: 'cintura', nome: 'Cintura', unidade: 'cm', tentativas: 1, menor_melhor: true }, { chave: 'anca', nome: 'Anca', unidade: 'cm', tentativas: 1 }] },
  { titulo: 'Força', testes: [
    { chave: 'agachamento_5rm', nome: 'Agachamento 5RM', unidade: 'kg', tentativas: 3, guarda: 'melhor', zonas: ['joelho', 'lombar'] },
    { chave: 'flexoes', nome: 'Flexões até à falha', unidade: 'reps', tentativas: 1, zonas: ['ombro', 'punho'] },
    { chave: 'prancha', nome: 'Prancha', unidade: 's', tentativas: 1, zonas: ['lombar'] },
  ] },
];
export const duracaoProtocolo = (b: BlocoProtocolo[]) => b.reduce((t, x) => t + x.testes.reduce((u, y) => u + 1 + y.tentativas, 0), 0);

/* ── G-20 e G-25 ────────────────────────────────────────────────────────── */
export interface ItemAvaliar { tipo: 'resposta' | 'avaliacao' | 'em_atraso' | 'em_curso'; id: string; link_id: string; nome: string; titulo: string; detalhe: string; quando: string; saude: boolean }
export interface ResumoAvaliacao { marcadas: number; proxima: { nome: string; inicio: string } | null; em_atraso: number; por_responder: number; por_ler: number; fazer: ItemAvaliar[] }
export async function fetchResumoAvaliacao(client: LunaClient, scope: OrgScope): Promise<ResumoAvaliacao> {
  const { data, error } = await client.rpc('assessment_overview', { _org: scope.orgId });
  if (error) throw error;
  return data as unknown as ResumoAvaliacao;
}
export interface LinhaComparar { chave: string; nome: string; unidade: string; antes: number | null; agora: number | null; mudou: number | null; melhor: boolean | null; estado: string; valor_id: string; motivo: string | null; saltado: string | null }
export async function compararAvaliacao(client: LunaClient, id: string): Promise<LinhaComparar[]> {
  const { data, error } = await client.rpc('compare_assessment', { _id: id });
  if (error) throw error;
  return data ?? [];
}
export async function tendencia(client: LunaClient, personId: string, chave: string): Promise<{ em: string; valor: number }[]> {
  const { data, error } = await client.rpc('test_trend', { _person: personId, _key: chave });
  if (error) throw error;
  return (data ?? []).map((x) => ({ em: x.em, valor: Number(x.valor) }));
}
export async function invalidarValor(client: LunaClient, id: string, motivo: string): Promise<void> {
  if (!motivo.trim()) throw new Error('Escreve o motivo.');
  const { error } = await client.rpc('invalidate_value', { _value: id, _reason: motivo.trim() });
  if (error) throw error;
}
export async function rever(client: LunaClient, tipo: 'resposta' | 'avaliacao', id: string, resposta?: string): Promise<void> {
  const { error } = await client.rpc('review_item', { _kind: tipo, _id: id, _reply: resposta?.trim() || null });
  if (error) throw error;
}
export interface RespostaDetalhe { id: string; linkId: string; personId: string; cliente: string; nome: string; saude: boolean; perguntas: Pergunta[]; respostas: Respostas; pontos: Record<string, number>; em: string; revista: boolean; resposta: string | null }
export async function fetchResposta(client: LunaClient, id: string): Promise<RespostaDetalhe> {
  const { data, error } = await client.from('form_responses').select('id,link_id,person_id,form_version_id,answers,score,submitted_at,needs_review,reply').eq('id', id).single();
  if (error) throw error;
  const [v, c] = await Promise.all([
    client.from('form_versions').select('name,health,questions').eq('id', data.form_version_id).single(),
    client.from('clients').select('full_name').eq('id', data.link_id).maybeSingle(),
  ]);
  if (v.error) throw v.error;
  return {
    id: data.id, linkId: data.link_id, personId: data.person_id, cliente: (c.data as { full_name: string } | null)?.full_name ?? '—', nome: v.data.name, saude: v.data.health,
    perguntas: v.data.questions as unknown as Pergunta[], respostas: data.answers as unknown as Respostas, pontos: data.score as unknown as Record<string, number>,
    em: data.submitted_at, revista: !data.needs_review, resposta: data.reply,
  };
}
export interface AvaliacaoDetalhe { id: string; linkId: string; personId: string; cliente: string; protocolo: string; versao: number; inicio: string; fechada: boolean; revista: boolean; resposta: string | null }
export async function fetchAvaliacao(client: LunaClient, id: string): Promise<AvaliacaoDetalhe> {
  const { data, error } = await client.from('assessments').select('id,link_id,person_id,protocol_version_id,started_at,status,reviewed_at,reply').eq('id', id).single();
  if (error) throw error;
  const [pv, c] = await Promise.all([
    client.from('protocol_versions').select('name,version').eq('id', data.protocol_version_id).single(),
    client.from('clients').select('full_name').eq('id', data.link_id).maybeSingle(),
  ]);
  return {
    id: data.id, linkId: data.link_id, personId: data.person_id, cliente: (c.data as { full_name: string } | null)?.full_name ?? '—',
    protocolo: pv.data?.name ?? 'Avaliação', versao: pv.data?.version ?? 1, inicio: data.started_at, fechada: data.status === 'fechada', revista: !!data.reviewed_at, resposta: data.reply,
  };
}

/* ── G-24 enviar e agendar ──────────────────────────────────────────────── */
export async function enviarAgora(client: LunaClient, scope: OrgScope, formId: string, links: string[], prazo: string | null, lembrar: boolean): Promise<number> {
  const { data, error } = await client.rpc('send_requests', { _org: scope.orgId, _form: formId, _links: links, _due: prazo, _remind: lembrar });
  if (error) throw new Error(error.message);
  return data as number;
}
export async function agendar(client: LunaClient, scope: OrgScope, a: { formId: string; links: string[]; grupoId: string | null; diaSemana: number; hora: number; prazoDias: number; ateFimDoPlano: boolean; ate: string | null; lembrar: boolean; avisarPT: boolean }): Promise<string> {
  const { data, error } = await client.rpc('schedule_requests', {
    _org: scope.orgId, _form: a.formId, _links: a.links, _group: a.grupoId, _weekday: a.diaSemana, _hour: a.hora, _due_days: a.prazoDias,
    _until_plan_end: a.ateFimDoPlano, _until: a.ate, _remind: a.lembrar, _notify_pt: a.avisarPT,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
export interface PedidoCliente { id: string; nome: string; estado: string; prazo: string | null; aberto: string | null; respondido: string | null; motivo: string | null; criado: string }
export async function fetchPedidosDoCliente(client: LunaClient, linkId: string): Promise<PedidoCliente[]> {
  const { data, error } = await client.from('requests').select('id,status,due_at,opened_at,answered_at,withdrawn_reason,created_at,form_version_id,protocol_version_id').eq('link_id', linkId).order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  const fv = [...new Set((data ?? []).map((r) => r.form_version_id).filter((x): x is string => !!x))];
  const { data: vs } = fv.length ? await client.from('form_versions').select('id,name,version').in('id', fv) : { data: [] as { id: string; name: string; version: number }[] };
  return (data ?? []).map((r) => {
    const v = vs?.find((x) => x.id === r.form_version_id);
    return { id: r.id, nome: v ? `${v.name} · v${v.version}` : 'Avaliação física', estado: r.status, prazo: r.due_at, aberto: r.opened_at, respondido: r.answered_at, motivo: r.withdrawn_reason, criado: r.created_at };
  });
}
export async function retirarPedido(client: LunaClient, id: string, motivo: string): Promise<void> {
  const { error } = await client.rpc('withdraw_request', { _request: id, _reason: motivo });
  if (error) throw new Error(error.message);
}

/* ── G-23 aplicar no terreno (fila sem rede, como o ao vivo) ────────────── */
export interface ValorLocal { id: string; chave: string; tentativas: (number | null)[]; saltado: string | null }
export interface AvaliacaoLocal {
  id: string; linkId: string; cliente: string; zonas: string[]; protocoloVersaoId: string; protocolo: string; blocos: BlocoProtocolo[];
  iniciadaEm: string; valores: ValorLocal[]; passo: number; versao: number; enviada: number; mostrarCliente: boolean;
}
const CHAVE_AV = 'luna.avaliacao.';
const lerAv = (id: string): AvaliacaoLocal | null => { try { const v = localStorage.getItem(CHAVE_AV + id); return v ? (JSON.parse(v) as AvaliacaoLocal) : null; } catch { return null; } };
export const avaliacaoLocal = {
  ler: lerAv,
  guardar: (a: AvaliacaoLocal) => { try { localStorage.setItem(CHAVE_AV + a.id, JSON.stringify(a)); } catch { /* sem armazenamento */ } },
  limpar: (id: string) => { try { localStorage.removeItem(CHAVE_AV + id); } catch { /* idem */ } },
  todas: (): AvaliacaoLocal[] => {
    const r: AvaliacaoLocal[] = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(CHAVE_AV)) { const a = lerAv(k.slice(CHAVE_AV.length)); if (a) r.push(a); } } } catch { /* idem */ }
    return r;
  },
};
export function testesDe(a: Pick<AvaliacaoLocal, 'blocos'>): TesteProtocolo[] { return a.blocos.flatMap((b) => b.testes); }
/** Testes que a restrição do cliente salta: ficam "não feito", nunca zero. */
export function saltaPorRestricao(t: TesteProtocolo, zonas: string[]): string | null {
  const z = (t.zonas ?? []).find((x) => zonas.includes(x));
  return z ? `Restrição · ${z}` : null;
}
export function comecarAvaliacao(p: { linkId: string; cliente: string; zonas: string[]; versaoId: string; nome: string; blocos: BlocoProtocolo[] }): AvaliacaoLocal {
  return {
    id: novoId(), linkId: p.linkId, cliente: p.cliente, zonas: p.zonas, protocoloVersaoId: p.versaoId, protocolo: p.nome, blocos: p.blocos,
    iniciadaEm: new Date().toISOString(), passo: 0, versao: 1, enviada: 0, mostrarCliente: true,
    valores: testesDe(p).map((t) => ({ id: novoId(), chave: t.chave, tentativas: Array.from({ length: t.tentativas }, () => null), saltado: saltaPorRestricao(t, p.zonas) })),
  };
}
export function valorGuardado(t: TesteProtocolo, tent: (number | null)[]): number | null {
  const v = tent.filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return null;
  if (t.guarda === 'media') return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
  return t.menor_melhor ? Math.min(...v) : Math.max(...v);
}
export function mudarTentativa(a: AvaliacaoLocal, chave: string, i: number, v: number | null): AvaliacaoLocal {
  return { ...a, versao: a.versao + 1, valores: a.valores.map((x) => (x.chave === chave ? { ...x, saltado: null, tentativas: x.tentativas.map((y, j) => (j === i ? v : y)) } : x)) };
}
export function saltarTeste(a: AvaliacaoLocal, chave: string, motivo: string | null): AvaliacaoLocal {
  return { ...a, versao: a.versao + 1, valores: a.valores.map((x) => (x.chave === chave ? { ...x, saltado: motivo } : x)) };
}
export async function enviarAvaliacao(client: LunaClient | null, a: AvaliacaoLocal): Promise<AvaliacaoLocal> {
  if (!client || a.versao <= a.enviada) return a;
  const versao = a.versao;
  const { error } = await client.rpc('sync_assessment', { _p: {
    id: a.id, link_id: a.linkId, protocol_version_id: a.protocoloVersaoId, iniciada_em: a.iniciadaEm,
    valores: a.valores.map((v) => ({ id: v.id, chave: v.chave, tentativas: v.tentativas.filter((x) => x != null), saltado: v.saltado })),
  } as unknown as Json });
  const atual = lerAv(a.id);
  if (!atual) return a;
  const nova = error ? atual : { ...atual, enviada: Math.max(atual.enviada, versao) };
  avaliacaoLocal.guardar(nova);
  return nova;
}
export async function fecharAvaliacao(client: LunaClient, a: AvaliacaoLocal): Promise<void> {
  const r = await enviarAvaliacao(client, { ...a, versao: Math.max(a.versao, a.enviada + 1) });
  if (r.versao > r.enviada) throw new Error('Ainda há valores por enviar. Volta a tentar com rede.');
  const { error } = await client.rpc('close_assessment', { _id: a.id, _show_client: a.mostrarCliente });
  if (error) throw error;
  avaliacaoLocal.limpar(a.id);
}
export interface VersaoProtocolo { id: string; nome: string; versao: number; blocos: BlocoProtocolo[] }
export async function fetchVersaoAtual(client: LunaClient, protocoloId: string): Promise<VersaoProtocolo | null> {
  const { data: p } = await client.from('protocols').select('version').eq('id', protocoloId).single();
  if (!p?.version) return null;
  const { data, error } = await client.from('protocol_versions').select('id,name,version,blocks').eq('protocol_id', protocoloId).eq('version', p.version).single();
  if (error) throw error;
  return { id: data.id, nome: data.name, versao: data.version, blocos: data.blocks as unknown as BlocoProtocolo[] };
}
/** Última avaliação válida de cada teste (para "Última vez"). */
export async function ultimosValores(client: LunaClient, personId: string): Promise<Map<string, { valor: number; em: string }>> {
  const { data } = await client.from('assessment_values').select('test_key,value,recorded_at,invalidated_at').eq('person_id', personId).is('invalidated_at', null).not('value', 'is', null).order('recorded_at', { ascending: false }).limit(200);
  const m = new Map<string, { valor: number; em: string }>();
  for (const v of data ?? []) if (!m.has(v.test_key)) m.set(v.test_key, { valor: Number(v.value), em: v.recorded_at });
  return m;
}

/* ── App do cliente (C-08, C-15, C-16) ──────────────────────────────────── */
export interface MeuPedido { id: string; org: string; nome: string; tipo: string; saude: boolean; prazo: string | null; perguntas: number; de: string | null }
export async function fetchMeusPedidos(client: LunaClient): Promise<MeuPedido[]> {
  const { data, error } = await client.rpc('my_requests', {});
  if (error) throw error;
  return data ?? [];
}
export interface PedidoAberto { id: string; nome: string; tipo: string; saude: boolean; perguntas: Pergunta[]; estado: string; prazo: string | null; quem_ve: string }
export async function abrirPedido(client: LunaClient, id: string): Promise<PedidoAberto> {
  const { data, error } = await client.rpc('open_request', { _request: id });
  if (error) throw error;
  return data as unknown as PedidoAberto;
}
/** Respostas por enviar ficam no telemóvel (sem rede) e seguem depois; reenviar não duplica. */
const FILA_R = 'luna.cliente.fila-respostas';
interface RespostaPendente { id: string; pedido: string; respostas: Respostas }
const lerFila = (): RespostaPendente[] => { try { return JSON.parse(localStorage.getItem(FILA_R) ?? '[]') as RespostaPendente[]; } catch { return []; } };
const gravarFila = (f: RespostaPendente[]) => { try { localStorage.setItem(FILA_R, JSON.stringify(f)); } catch { /* idem */ } };
export async function responderPedido(client: LunaClient | null, pedido: string, respostas: Respostas): Promise<'enviada' | 'guardada'> {
  const r: RespostaPendente = { id: novoId(), pedido, respostas };
  gravarFila([...lerFila().filter((x) => x.pedido !== pedido), r]);
  return (await enviarRespostas(client)) === 0 ? 'enviada' : 'guardada';
}
export async function enviarRespostas(client: LunaClient | null): Promise<number> {
  const fila = lerFila();
  if (!client) return fila.length;
  const falta: RespostaPendente[] = [];
  for (const r of fila) {
    const { error } = await client.rpc('submit_response', { _id: r.id, _request: r.pedido, _answers: r.respostas as unknown as Json });
    // Erro de validação: não fica preso na fila (mostra-se ao responder); falha de rede fica
    if (error && /fetch|network|Failed/i.test(error.message)) falta.push(r);
    else if (error) throw new Error(error.message);
  }
  gravarFila(falta);
  return falta.length;
}
export async function checkinDiario(client: LunaClient, c: { sono: number | null; energia: number | null; dor: boolean; onde?: string | null }): Promise<void> {
  const dia = new Date(); const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
  const { error } = await client.rpc('submit_daily_checkin', { _id: novoId(), _day: iso, _sleep: c.sono, _energy: c.energia, _pain: c.dor, _pain_where: c.onde ?? null });
  if (error) throw error;
}
export async function checkinDeHoje(client: LunaClient): Promise<{ sono: number | null; energia: number | null; dor: boolean } | null> {
  const dia = new Date(); const iso = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
  const { data } = await client.from('daily_checkins').select('sleep,energy,pain').eq('day', iso).maybeSingle();
  return data ? { sono: data.sleep, energia: data.energy, dor: data.pain } : null;
}
export async function enviarFoto(client: LunaClient, f: { ficheiro: File; personId: string; linkId: string; origem: 'checkin' | 'avaliacao'; ref: string | null; pose: string | null }): Promise<string> {
  const id = novoId();
  const ext = (f.ficheiro.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${f.personId}/${id}.${ext}`;
  const up = await client.storage.from('fotos').upload(path, f.ficheiro, { contentType: f.ficheiro.type || 'image/jpeg', upsert: false });
  if (up.error) throw up.error;
  const { error } = await client.rpc('add_progress_photo', { _id: id, _link: f.linkId, _source: f.origem, _ref: f.ref, _pose: f.pose, _path: path });
  if (error) throw error;
  return path;
}
export interface MinhaAvaliacao { id: string; nome: string; em: string; linhas: LinhaComparar[] }
export async function fetchMinhasAvaliacoes(client: LunaClient): Promise<MinhaAvaliacao[]> {
  const { data, error } = await client.from('assessments').select('id,started_at,protocol_version_id').eq('status', 'fechada').order('started_at', { ascending: false }).limit(10);
  if (error) throw error;
  const pvs = [...new Set((data ?? []).map((a) => a.protocol_version_id))];
  const { data: vs } = pvs.length ? await client.from('protocol_versions').select('id,name').in('id', pvs) : { data: [] as { id: string; name: string }[] };
  return Promise.all((data ?? []).slice(0, 3).map(async (a) => ({
    id: a.id, nome: vs?.find((v) => v.id === a.protocol_version_id)?.name ?? 'Avaliação', em: a.started_at, linhas: await compararAvaliacao(client, a.id),
  })));
}
