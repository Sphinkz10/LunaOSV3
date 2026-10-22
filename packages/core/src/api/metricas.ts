/**
 * Medir a ativação (tarefa 28). Os eventos gravam-se sozinhos no servidor;
 * aqui só ficam a escolha da pessoa (C-24) e o painel interno da LunaOS.
 */
import type { LunaClient } from './client';

/** Está na análise anónima? (sem decisão, está; recusar tira-a de tudo o que é individual) */
export async function fetchConsentimentoAnalise(client: LunaClient): Promise<boolean> {
  const { data, error } = await client.rpc('my_analytics_consent', {});
  if (error) throw error;
  return data !== false;
}
export async function definirConsentimentoAnalise(client: LunaClient, sim: boolean): Promise<void> {
  const { error } = await client.rpc('set_analytics_consent', { _granted: sim });
  if (error) throw error;
}

export async function souEquipaLunaOS(client: LunaClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_lunaos_staff', {});
  return !error && data === true;
}

export interface SemanaAtivacao { semana: string; pt_ativos: number; clientes_app: number; clientes_por_pt: number | null }
export interface MetricasAtivacao {
  semanas: SemanaAtivacao[]; dias_ate_primeiro_plano: number | null; organizacoes: number; organizacoes_com_plano: number;
  retencao_4_semanas: number | null; coorte_retencao: number | null; trial_convertidos: number; trial_expirados: number;
  ligacoes_vindas_do_atleta: number; ligacoes_total: number; so_leitura: number; sessoes_ao_vivo: number;
}
export async function fetchMetricasAtivacao(client: LunaClient, semanas = 8): Promise<MetricasAtivacao> {
  const { data, error } = await client.rpc('activation_metrics', { _weeks: semanas });
  if (error) throw error;
  return data as unknown as MetricasAtivacao;
}
/** Conversão do período experimental em %, ou null sem casos suficientes (nunca um número inventado). */
export function conversaoTrial(m: Pick<MetricasAtivacao, 'trial_convertidos' | 'trial_expirados'>): number | null {
  const n = m.trial_convertidos + m.trial_expirados;
  return n >= 3 ? Math.round((100 * m.trial_convertidos) / n) : null;
}
