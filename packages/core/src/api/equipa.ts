import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';

/** Equipa e acessos (G-44): membros, papéis, convites e histórico. */
export interface MembroEquipa {
  id: string; nome: string; email: string | null; titulo: string | null; estado: 'invited' | 'active' | 'left';
  papeis: { key: string; nome: string; ocupaLugar: boolean }[]; desde: string | null; souEu: boolean;
}
export interface ConviteEquipa {
  id: string; email: string; papel: string; criadoEm: string; expiraEm: string;
  estado: 'pendente' | 'aceite' | 'cancelado' | 'expirado';
}
export interface EventoEquipa { id: number; membershipId: string; acao: string; motivo: string | null; em: string }
export interface Lugares { lugares: number; ocupados: number }

export async function fetchEquipa(client: LunaClient, scope: OrgScope): Promise<{
  membros: MembroEquipa[]; convites: ConviteEquipa[]; eventos: EventoEquipa[]; lugares: Lugares | null;
}> {
  const [staff, mr, roles, inv, ev, seats] = await Promise.all([
    client.from('staff').select('id,full_name,email,title,status,joined_at').eq('org_id', scope.orgId).order('full_name'),
    client.from('membership_roles').select('membership_id,role_id').eq('org_id', scope.orgId),
    client.from('roles').select('id,key,name,occupies_seat'),
    client.from('invites').select('id,email,role_id,created_at,expires_at,accepted_at,revoked_at').eq('org_id', scope.orgId).order('created_at', { ascending: false }).limit(100),
    client.from('membership_events').select('id,membership_id,action,reason,created_at').eq('org_id', scope.orgId).order('created_at', { ascending: false }).limit(100),
    client.rpc('seats_summary', { _org: scope.orgId }),
  ]);
  for (const r of [staff, mr, roles]) if (r.error) throw r.error;
  const rolesById = new Map((roles.data ?? []).map((r) => [r.id, r]));
  const papeisDe = (mid: string) => (mr.data ?? []).filter((x) => x.membership_id === mid)
    .map((x) => rolesById.get(x.role_id)).filter(Boolean)
    .map((r) => ({ key: r!.key, nome: r!.name, ocupaLugar: r!.occupies_seat }));
  const agora = Date.now();
  const s = seats.data as { seats?: number; used?: number } | null;
  return {
    membros: (staff.data ?? []).map((m) => ({
      id: m.id, nome: m.full_name, email: m.email, titulo: m.title, estado: m.status,
      papeis: papeisDe(m.id), desde: m.joined_at, souEu: m.id === scope.membershipId,
    })),
    convites: inv.error ? [] : (inv.data ?? []).map((i) => ({
      id: i.id, email: i.email, papel: rolesById.get(i.role_id)?.name ?? '—', criadoEm: i.created_at, expiraEm: i.expires_at,
      estado: i.accepted_at ? 'aceite' : i.revoked_at ? 'cancelado' : Date.parse(i.expires_at) < agora ? 'expirado' : 'pendente',
    })),
    eventos: ev.error ? [] : (ev.data ?? []).map((e) => ({ id: e.id, membershipId: e.membership_id, acao: e.action, motivo: e.reason, em: e.created_at })),
    lugares: s && typeof s.seats === 'number' ? { lugares: s.seats, ocupados: s.used ?? 0 } : null,
  };
}

export class LugaresEsgotadosError extends Error {
  constructor() { super('Não há lugares livres. Confirma o lugar extra para convidar.'); this.name = 'LugaresEsgotadosError'; }
}

/** Convida (válido 7 dias). Devolve a ligação a enviar; o código só aparece aqui. */
export async function convidarMembro(
  client: LunaClient, scope: OrgScope, email: string, papel: string, confirmarLugarExtra = false,
): Promise<string> {
  const { data, error } = await client.rpc('create_invite', {
    _org: scope.orgId, _email: email, _role_key: papel, _confirm_over_seats: confirmarLugarExtra,
  });
  if (error) {
    if (/seats_exceeded/.test(error.message)) throw new LugaresEsgotadosError();
    throw error;
  }
  return `${window.location.origin}/login?convite=${encodeURIComponent(data as string)}`;
}

export async function cancelarConvite(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.rpc('cancel_invite', { _invite: id });
  if (error) throw error;
}

export async function desativarMembro(client: LunaClient, id: string, motivo: string): Promise<void> {
  const { error } = await client.rpc('deactivate_member', { _membership: id, _reason: motivo });
  if (error) {
    if (/pelo menos um dono/.test(error.message)) throw new Error('A organização precisa de pelo menos um dono ativo.');
    throw error;
  }
}

export async function reativarMembro(client: LunaClient, id: string, motivo: string): Promise<void> {
  const { error } = await client.rpc('reactivate_member', { _membership: id, _reason: motivo });
  if (error) throw error;
}

/** Código de recuperação assistida: válido 30 min, de uso único, mostrado uma vez. */
export async function gerarCodigoRecuperacao(client: LunaClient, membershipId: string): Promise<string> {
  const { data, error } = await client.rpc('create_recovery_code', { _membership: membershipId });
  if (error) throw error;
  return data as string;
}

/** "Tenho um código": email + código + palavra-passe nova, pela Edge Function. */
export async function usarCodigoRecuperacao(client: LunaClient, email: string, codigo: string, password: string): Promise<void> {
  const { data, error } = await client.functions.invoke('recuperacao-assistida', { body: { email, codigo, password } });
  if (error) {
    const corpo = (error as { context?: { json?: () => Promise<{ erro?: string }> } }).context;
    const msg = corpo?.json ? (await corpo.json().catch(() => null))?.erro : null;
    throw new Error(msg ?? 'Não foi possível usar o código.');
  }
  if (!(data as { ok?: boolean })?.ok) throw new Error('Não foi possível usar o código.');
}
