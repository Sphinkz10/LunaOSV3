import type { LunaClient } from './client';
import type { OrgScope } from '../authStore';
import type { ExerciseRow, LibraryExerciseRow } from '../types/database';

/**
 * Biblioteca de exercícios (G-15, tarefas 27 e 12): a base do LunaOS, só de
 * leitura, e os exercícios da organização. Usar um exercício do LunaOS
 * reaproveita a cópia; duplicar cria uma cópia para mudar, com a origem.
 */
export type ExercicioBase = LibraryExerciseRow;
export type ExercicioOrg = ExerciseRow;
export const NIVEL: Record<string, string> = { iniciante: 'Iniciante', intermedio: 'Intermédio', avancado: 'Avançado' };
export const CATEGORIA_EXERCICIO: Record<string, string> = {
  forca: 'Força', cardio: 'Cardio', mobilidade: 'Mobilidade', pliometria: 'Pliometria', equilibrio: 'Equilíbrio', reabilitacao: 'Reabilitação', tecnica: 'Técnica',
};

export async function fetchBibliotecaBase(client: LunaClient): Promise<ExercicioBase[]> {
  const { data, error } = await client.from('library_current').select('*').order('name');
  if (error) throw error;
  return data ?? [];
}

export async function fetchExerciciosOrg(client: LunaClient, scope: OrgScope): Promise<ExercicioOrg[]> {
  const { data, error } = await client.from('exercises').select('*').eq('org_id', scope.orgId).is('archived_at', null).order('name');
  if (error) throw error;
  return data ?? [];
}

/** Devolve o id do exercício na organização (a cópia já existente, ou nova). */
export async function usarExercicioBase(client: LunaClient, scope: OrgScope, chave: string): Promise<string> {
  const { data, error } = await client.rpc('copy_library_exercise', { _org: scope.orgId, _key: chave, _nova: false });
  if (error) throw error;
  return data as string;
}

/** Cópia para mudar: fica com a origem e a versão; a biblioteca nunca muda. */
export async function duplicarExercicioBase(client: LunaClient, scope: OrgScope, chave: string): Promise<string> {
  const { data, error } = await client.rpc('copy_library_exercise', { _org: scope.orgId, _key: chave, _nova: true });
  if (error) throw error;
  return data as string;
}

/** Filtro simples por texto, categoria, músculo e material. */
export function filtrarExercicios<T extends { name: string; category: string; muscles: string[]; equipment: string[] }>(
  lista: T[], f: { q?: string; categoria?: string | null; musculo?: string | null; material?: string | null },
): T[] {
  const termo = (f.q ?? '').trim().toLocaleLowerCase('pt-PT');
  return lista.filter((e) => (!termo || e.name.toLocaleLowerCase('pt-PT').includes(termo) || e.muscles.some((m) => m.includes(termo)))
    && (!f.categoria || e.category === f.categoria)
    && (!f.musculo || e.muscles.includes(f.musculo))
    && (!f.material || (f.material === 'sem material' ? e.equipment.length === 0 : e.equipment.includes(f.material))));
}
