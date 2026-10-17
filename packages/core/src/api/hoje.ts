import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import { dayBoundsInZone, timeInZone, todayInZone } from '../time';

/**
 * Hoje do PT (G-01, F1a): contagens que levam à lista filtrada, clientes em
 * atenção com o motivo (4 regras de D18), 3 pendências e a agenda. Sem gráficos.
 */
export type MotivoAtencao = 'sem_treinar_7d' | 'falta_sem_aviso' | 'pack_2_sessoes' | 'pack_validade_7d';
export const MOTIVO_ATENCAO: Record<MotivoAtencao, string> = {
  sem_treinar_7d: 'Sem treinar há 7 dias',
  falta_sem_aviso: 'Faltou sem aviso na última sessão',
  pack_2_sessoes: 'Pack com 2 sessões ou menos',
  pack_validade_7d: 'Pack acaba a validade em 7 dias',
};

export interface ClienteAtencao { linkId: string; nome: string; motivos: MotivoAtencao[]; ultimoTreino: string | null }

export async function fetchClientesAtencao(client: LunaClient, scope: OrgScope): Promise<ClienteAtencao[]> {
  const { data, error } = await client.rpc('clients_attention', { _org: scope.orgId });
  if (error) throw error;
  return (data ?? []).map((r) => ({ linkId: r.link_id, nome: r.full_name, motivos: r.reasons as MotivoAtencao[], ultimoTreino: r.last_training }));
}

/** Bloco da equipa para o dono de estúdio pequeno: sessões de hoje por PT. */
export interface SessoesPorPt { membershipId: string; nome: string; total: number; feitas: number; proxima: string | null }

export async function fetchEquipaHoje(client: LunaClient, scope: OrgScope, now = new Date()): Promise<SessoesPorPt[]> {
  const { start, end } = dayBoundsInZone(todayInZone(scope.timezone, now), scope.timezone);
  const [b, st] = await Promise.all([
    client.from('bookings').select('membership_id,status,starts_at').eq('org_id', scope.orgId)
      .gte('starts_at', start).lt('starts_at', end).neq('status', 'cancelled').not('membership_id', 'is', null).limit(500),
    client.from('staff').select('id,full_name,status').eq('org_id', scope.orgId).eq('status', 'active'),
  ]);
  if (b.error) throw b.error;
  if (st.error) throw st.error;
  const agora = now.toISOString();
  return (st.data ?? []).map((m) => {
    const minhas = (b.data ?? []).filter((x) => x.membership_id === m.id);
    const proxima = minhas.filter((x) => x.starts_at >= agora).sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0];
    return {
      membershipId: m.id, nome: m.full_name, total: minhas.length,
      feitas: minhas.filter((x) => x.status === 'completed').length,
      proxima: proxima ? timeInZone(proxima.starts_at, scope.timezone) : null,
    };
  }).filter((p) => p.total > 0).sort((x, y) => y.total - x.total);
}
