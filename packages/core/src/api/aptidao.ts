import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { RestrictionRow } from '../types/database';

/** Restrição e aptidão (G-29). */
export type EstadoAptidao = 'livre' | 'restricao' | 'bloqueado' | 'atestado_em_falta';
export type TipoRestricao = 'atestado' | 'permitir' | 'adaptar' | 'bloquear';

export interface EfeitoZona { zona: string | null; tipo: TipoRestricao; reverEm: string | null }

export interface Aptidao {
  estado: EstadoAptidao;
  /** Efeito por zona, sem a causa: toda a equipa que vê o cliente. */
  efeitos: EfeitoZona[];
  /** Registos completos (causa, atestado): só papel clínico com dois fatores; null se não pode ver. */
  registos: RestrictionRow[] | null;
  pendenteParq: boolean;
}

export async function fetchAptidao(client: LunaClient, scope: OrgScope, linkId: string): Promise<Aptidao> {
  const [estado, efeitos, pend] = await Promise.all([
    client.rpc('client_aptidao', { _link: linkId }),
    client.rpc('client_restricoes_efeito', { _link: linkId }),
    client.from('pendencias').select('id').eq('org_id', scope.orgId).eq('link_id', linkId)
      .eq('kind', 'parq_atestado').eq('status', 'aberta').limit(1),
  ]);
  if (estado.error) throw estado.error;
  if (efeitos.error) throw efeitos.error;
  let registos: RestrictionRow[] | null = null;
  if (scope.permissions.includes('health.read')) {
    const { data, error } = await client.from('restrictions').select('*')
      .eq('org_id', scope.orgId).eq('link_id', linkId).is('revoked_at', null).order('created_at', { ascending: false });
    if (!error) registos = data ?? [];
  }
  return {
    estado: estado.data as EstadoAptidao,
    efeitos: (efeitos.data ?? []).map((e) => ({ zona: e.zone, tipo: e.kind as TipoRestricao, reverEm: e.review_on })),
    registos,
    pendenteParq: !!pend.data?.length,
  };
}

export interface NovaRestricao { tipo: TipoRestricao; zona?: string | null; notas?: string | null; validaAte?: string | null; reverEm?: string | null }

export async function registarRestricao(client: LunaClient, linkId: string, r: NovaRestricao): Promise<void> {
  const { error } = await client.rpc('record_restriction', {
    _link: linkId, _kind: r.tipo, _notes: r.notas || null, _valid_until: r.validaAte || null,
    _zone: r.zona || null, _review_on: r.reverEm || null,
  });
  if (error) {
    if (/mfa_required/.test(error.message)) throw new Error('Para registar dados de saúde precisas de entrar com dois fatores.');
    throw error;
  }
}

export async function revogarRestricao(client: LunaClient, id: string): Promise<void> {
  const { error } = await client.rpc('revoke_restriction', { _id: id });
  if (error) throw error;
}
