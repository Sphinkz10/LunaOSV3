/**
 * Mensagens (passo 23, G-31 e C-18). Cada mensagem tem um id do aparelho:
 * sem rede fica na fila e segue depois, sem duplicar.
 */
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Json } from '../types/database';
import { novoId } from './treinoApp';

export type TipoConversa = 'pt' | 'ginasio' | 'grupo' | 'aviso';
export interface Conversa {
  id: string; orgId: string; tipo: TipoConversa; titulo: string; linkId: string | null; grupoId: string | null;
  ultima: string | null; ultimaEm: string | null; ultimaLado: 'equipa' | 'cliente' | null; porLer: number; porResponder: boolean;
}
export interface Mensagem {
  id: string; autor: string | null; lado: 'equipa' | 'cliente'; tipo: 'texto' | 'audio' | 'anexo' | 'resultado';
  texto: string | null; anexo: string | null; meta: { titulo?: string; resumo?: string; rota?: string; nome?: string; duracao?: number; mime?: string };
  em: string; minha: boolean; aEnviar?: boolean;
}

export async function fetchConversas(client: LunaClient, scope?: OrgScope | null): Promise<Conversa[]> {
  const { data, error } = await client.rpc('my_conversations', { _org: scope?.orgId ?? null });
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id, orgId: c.org_id, tipo: c.kind as TipoConversa, titulo: c.titulo ?? 'Conversa', linkId: c.link_id, grupoId: c.group_id,
    ultima: c.ultima, ultimaEm: c.ultima_em, ultimaLado: c.ultima_lado as Conversa['ultimaLado'], porLer: c.por_ler, porResponder: c.por_responder,
  }));
}

export async function fetchMensagens(client: LunaClient, conversa: string, meuId: string | null): Promise<Mensagem[]> {
  const { data, error } = await client.from('messages').select('id,author_user,author_side,kind,body,attachment_path,meta,created_at')
    .eq('conversation_id', conversa).order('created_at').limit(500);
  if (error) throw error;
  const pendentes = mensagensPorEnviar().filter((m) => m.conversa === conversa && !(data ?? []).some((d) => d.id === m.id));
  return [
    ...(data ?? []).map((m) => ({
      id: m.id, autor: m.author_user, lado: m.author_side as Mensagem['lado'], tipo: m.kind as Mensagem['tipo'], texto: m.body, anexo: m.attachment_path,
      meta: (m.meta as Mensagem['meta']) ?? {}, em: m.created_at, minha: !!meuId && m.author_user === meuId,
    })),
    ...pendentes.map((p) => ({ id: p.id, autor: meuId, lado: p.lado, tipo: p.tipo, texto: p.texto, anexo: null, meta: p.meta, em: p.em, minha: true, aEnviar: true })),
  ];
}

/* ── Fila sem rede ───────────────────────────────────────────────────────── */
interface Pendente { id: string; conversa: string; texto: string | null; tipo: Mensagem['tipo']; meta: Mensagem['meta']; em: string; lado: Mensagem['lado'] }
const FILA = 'luna.mensagens.fila';
const lerFila = (): Pendente[] => { try { return JSON.parse(localStorage.getItem(FILA) ?? '[]') as Pendente[]; } catch { return []; } };
const gravarFila = (f: Pendente[]) => { try { localStorage.setItem(FILA, JSON.stringify(f)); } catch { /* sem armazenamento */ } };
export function mensagensPorEnviar(): Pendente[] { return lerFila(); }

export async function enviarMensagem(client: LunaClient | null, conversa: string, texto: string, lado: Mensagem['lado'], extra?: { tipo: 'resultado'; meta: Mensagem['meta'] }): Promise<'enviada' | 'na_fila'> {
  const p: Pendente = { id: novoId(), conversa, texto: texto.trim() || null, tipo: extra?.tipo ?? 'texto', meta: extra?.meta ?? {}, em: new Date().toISOString(), lado };
  if (p.tipo === 'texto' && !p.texto) throw new Error('A mensagem está vazia.');
  gravarFila([...lerFila(), p]);
  const falta = await enviarFilaMensagens(client);
  return falta.some((x) => x.id === p.id) ? 'na_fila' : 'enviada';
}
export async function enviarFilaMensagens(client: LunaClient | null): Promise<Pendente[]> {
  const fila = lerFila();
  if (!client) return fila;
  const falta: Pendente[] = [];
  for (const m of fila) {
    const { error } = await client.rpc('send_message', { _id: m.id, _conv: m.conversa, _body: m.texto ?? '', _kind: m.tipo, _path: null, _meta: m.meta as unknown as Json });
    if (error && /fetch|network|Failed/i.test(error.message)) falta.push(m);
    // Outros erros (sem permissão, aviso) não ficam presos na fila
  }
  gravarFila(falta);
  return falta;
}

/** Áudio e anexos sobem para o balde privado da conversa e seguem como mensagem. */
export async function enviarAnexo(client: LunaClient, conversa: string, f: Blob, nome: string, tipo: 'audio' | 'anexo', duracao?: number): Promise<void> {
  const id = novoId();
  const ext = (nome.split('.').pop() ?? (tipo === 'audio' ? 'webm' : 'bin')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${conversa}/${id}.${ext}`;
  const up = await client.storage.from('mensagens').upload(path, f, { contentType: f.type || 'application/octet-stream' });
  if (up.error) throw up.error;
  const { error } = await client.rpc('send_message', { _id: id, _conv: conversa, _body: '', _kind: tipo, _path: path, _meta: { nome, duracao, mime: f.type } as unknown as Json });
  if (error) throw error;
}
export async function urlDoAnexo(client: LunaClient, path: string): Promise<string | null> {
  const { data } = await client.storage.from('mensagens').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function marcarLida(client: LunaClient, conversa: string): Promise<void> {
  await client.rpc('mark_conversation_read', { _conv: conversa });
}
export async function abrirConversaCliente(client: LunaClient, linkId: string, tipo: 'pt' | 'ginasio' = 'pt'): Promise<string> {
  const { data, error } = await client.rpc('open_client_conversation', { _link: linkId, _kind: tipo });
  if (error) throw error;
  return data as string;
}
export async function abrirConversaGrupo(client: LunaClient, grupoId: string): Promise<string> {
  const { data, error } = await client.rpc('open_group_conversation', { _group: grupoId });
  if (error) throw error;
  return data as string;
}
export async function abrirConversaComMeuPT(client: LunaClient, linkId: string): Promise<string> {
  const { data, error } = await client.rpc('open_my_pt_conversation', { _link: linkId });
  if (error) throw error;
  return data as string;
}
export async function janelaDeResposta(client: LunaClient, conversa: string): Promise<{ dentro: boolean; texto?: string }> {
  const { data } = await client.rpc('reply_window', { _conv: conversa });
  return (data as unknown as { dentro: boolean; texto?: string }) ?? { dentro: true };
}
export interface ContextoConversa { nome: string; desde: string; link_id: string; proxima: string | null; plano: string | null; zonas: string[]; checkin: { dia: string; energia: number | null; sono: number | null; dor: boolean } | null; pack: { nome: string; restam: number } | null }
export async function contextoConversa(client: LunaClient, conversa: string): Promise<ContextoConversa | null> {
  const { data } = await client.rpc('conversation_context', { _conv: conversa });
  return (data as unknown as ContextoConversa) ?? null;
}

/** Ouvir mensagens novas (Realtime); devolve a função para parar. Sem Realtime, quem chama faz polling. */
export function ouvirConversa(client: LunaClient, conversa: string, aoChegar: () => void): () => void {
  try {
    const canal = client.channel(`conversa-${conversa}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversa}` }, () => aoChegar())
      .subscribe();
    return () => { void client.removeChannel(canal); };
  } catch { return () => {}; }
}

/* ── Horário de resposta e respostas rápidas ────────────────────────────── */
export interface HorarioResposta { inicio: string; fim: string; dias: number[] }
export async function fetchHorarioResposta(client: LunaClient, membershipId: string): Promise<HorarioResposta | null> {
  const { data } = await client.from('reply_hours').select('start_time,end_time,days').eq('membership_id', membershipId).maybeSingle();
  return data ? { inicio: data.start_time.slice(0, 5), fim: data.end_time.slice(0, 5), dias: data.days } : null;
}
export async function guardarHorarioResposta(client: LunaClient, membershipId: string, h: HorarioResposta): Promise<void> {
  if (h.inicio >= h.fim) throw new Error('A hora de início tem de ser antes do fim.');
  const { error } = await client.from('reply_hours').upsert({ membership_id: membershipId, start_time: h.inicio, end_time: h.fim, days: h.dias, updated_at: new Date().toISOString() });
  if (error) throw error;
}
export const RESPOSTAS_SUGERIDAS = ['Até quinta!', 'Vou ver e já te digo.', 'Boa! Continua assim.', 'Envio-te o treino daqui a pouco.'];
export async function fetchRespostasRapidas(client: LunaClient, membershipId: string): Promise<{ id: string; texto: string }[]> {
  const { data } = await client.from('quick_replies').select('id,body').eq('membership_id', membershipId).order('position');
  return (data ?? []).map((x) => ({ id: x.id, texto: x.body }));
}
export async function guardarRespostaRapida(client: LunaClient, membershipId: string, texto: string): Promise<void> {
  const { error } = await client.from('quick_replies').insert({ membership_id: membershipId, body: texto.trim() });
  if (error) throw error;
}
export async function apagarRespostaRapida(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.from('quick_replies').delete().eq('id', id);
  if (error) throw error;
}
