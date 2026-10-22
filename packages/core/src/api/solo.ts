/**
 * Começar sozinho e ligar a um treinador (passo 24 da F1b: C-26, C-27, J36, J37).
 * O plano solo é da pessoa; com um treinador, o plano dele passa para a frente.
 */
import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { Enums } from '../types/database';
type ShareCategory = Enums['share_category'];
import type { DiaDaSemana, MeuTreino } from './treinoApp';

export type ObjetivoSolo = 'forca' | 'peso' | 'mexer' | 'prova';
export type Nivel = 'iniciante' | 'intermedio' | 'avancado';
export const OBJETIVOS: { id: ObjetivoSolo; titulo: string; texto: string; embreve?: boolean }[] = [
  { id: 'forca', titulo: 'Ganhar força', texto: 'Pesos, 3 vezes por semana' },
  { id: 'peso', titulo: 'Perder peso', texto: 'Força e cardio, com hábitos' },
  { id: 'mexer', titulo: 'Mexer-me mais', texto: 'Treinos curtos em casa' },
  { id: 'prova', titulo: 'Preparar uma prova', texto: 'Corrida · em breve', embreve: true },
];
export const NIVEIS: { id: Nivel; titulo: string; texto: string }[] = [
  { id: 'iniciante', titulo: 'A começar', texto: 'Treino pouco ou nada' },
  { id: 'intermedio', titulo: 'Já treino', texto: 'Há uns meses, com regularidade' },
  { id: 'avancado', titulo: 'Treino há anos', texto: 'Conheço bem os exercícios' },
];

export async function comecarSozinho(client: LunaClient, e: { objetivo: ObjetivoSolo; nivel: Nivel; dias: number; onde: 'casa' | 'ginasio' }): Promise<string> {
  const { data, error } = await client.rpc('start_solo', { _goal: e.objetivo, _level: e.nivel, _days: e.dias, _place: e.onde });
  if (error) throw error;
  return data as string;
}
export async function temPlanoSolo(client: LunaClient): Promise<boolean> {
  const { count } = await client.from('solo_plans').select('id', { count: 'exact', head: true }).is('archived_at', null);
  return (count ?? 0) > 0;
}
export async function fetchTreinoSolo(client: LunaClient, diaId?: string | null, dia?: string): Promise<MeuTreino | null> {
  const { data, error } = await client.rpc('my_solo_workout', { _day: diaId ?? null, ...(dia ? { _on: dia } : {}) });
  if (error) throw error;
  return (data as unknown as MeuTreino) ?? null;
}
export async function fetchSemanaSolo(client: LunaClient): Promise<DiaDaSemana[]> {
  const { data, error } = await client.rpc('my_solo_week', {});
  if (error) throw error;
  return (data ?? []).map((d) => ({ dia: d.dia, workoutId: d.workout_id, nome: d.nome, plano: d.plano }));
}

/* ── C-27 · Ligar a um treinador ────────────────────────────────────────── */
export const normalizarCodigo = (c: string) => {
  const s = c.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 6 ? `${s.slice(0, 2)}-${s.slice(2)}` : c.trim().toUpperCase();
};
export const codigoValido = (c: string) => /^[A-Z]{2}-[0-9]{4}$/.test(normalizarCodigo(c));
export async function procurarCodigo(client: LunaClient, codigo: string): Promise<{ nome: string; org: string; papel: string } | null> {
  const { data } = await client.rpc('lookup_trainer_code', { _code: normalizarCodigo(codigo) });
  return (data as unknown as { nome: string; org: string; papel: string }) ?? null;
}
export async function pedirLigacao(client: LunaClient, codigo: string, partilhas: ShareCategory[]): Promise<string> {
  const { data, error } = await client.rpc('request_link', { _code: normalizarCodigo(codigo), _shares: partilhas });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function convidarTreinador(client: LunaClient, canal: 'email' | 'sms', destino: string, partilhas: ShareCategory[]): Promise<void> {
  const { error } = await client.rpc('invite_my_trainer', { _channel: canal, _destination: destino, _shares: partilhas });
  if (error) throw new Error(error.message);
}
export interface MeuTreinador { linkId: string; org: string; treinador: string | null; estado: 'pending' | 'active'; desde: string; partilhas: string[] }
export async function fetchMeusTreinadores(client: LunaClient): Promise<MeuTreinador[]> {
  const { data, error } = await client.rpc('my_trainers', {});
  if (error) throw error;
  return (data ?? []).map((t) => ({ linkId: t.link_id, org: t.org, treinador: t.treinador, estado: t.estado as MeuTreinador['estado'], desde: t.desde, partilhas: t.partilhas }));
}
export async function desligarDoTreinador(client: LunaClient, linkId: string): Promise<void> {
  const { error } = await client.rpc('end_link', { _link: linkId });
  if (error) throw error;
}

/* ── Do lado do treinador ───────────────────────────────────────────────── */
export async function meuCodigoDeTreinador(client: LunaClient, scope: OrgScope, novo = false): Promise<string> {
  const { data, error } = await client.rpc('my_trainer_code', { _org: scope.orgId, _novo: novo });
  if (error) throw error;
  return data as string;
}
export async function responderPedidoLigacao(client: LunaClient, linkId: string, aceitar: boolean, motivo?: string): Promise<void> {
  const { error } = await client.rpc('answer_link_request', { _link: linkId, _accept: aceitar, _reason: motivo ?? null });
  if (error) throw new Error(error.message);
}
/** O treinador que chegou por convite de um atleta: liga-o logo depois de criar a conta (J32). */
export async function reclamarConviteDeAtleta(client: LunaClient, orgId: string, token: string): Promise<string> {
  const { data, error } = await client.rpc('claim_trainer_invite', { _token: token, _org: orgId });
  if (error) throw new Error(error.message);
  return data as string;
}
