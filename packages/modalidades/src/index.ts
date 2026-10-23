import { modalidadeSchema, type Modalidade, type Vocabulario } from '@luna/contracts';
import fitnessV1 from './fitness/v1.json';

/** Catálogo de modalidades, validado pelo esquema ao carregar. */
export const MODALIDADES: Record<string, Modalidade> = {
  fitness: modalidadeSchema.parse(fitnessV1),
};

export const MODALIDADE_PADRAO = 'fitness';

export function getModalidade(id: string | null | undefined): Modalidade {
  return MODALIDADES[id ?? MODALIDADE_PADRAO] ?? MODALIDADES[MODALIDADE_PADRAO];
}

export type Termo = keyof Vocabulario & string;

export interface TermoOpcoes {
  plural?: boolean;
  /** Primeira letra maiúscula (títulos e botões). */
  maiuscula?: boolean;
}

/**
 * Nome de uma coisa na língua da modalidade (regra 4: nenhum texto escreve o
 * nome do papel à mão). Os ajustes da organização (OrgSport.vocabulary_override)
 * sobrepõem-se ao vocabulário da modalidade.
 */
export function termo(
  mod: Modalidade,
  chave: Termo,
  opcoes: TermoOpcoes = {},
  ajustes: Partial<Record<string, string>> = {},
): string {
  const singular = ajustes[chave] ?? mod.vocabulario[chave] ?? chave;
  const base = opcoes.plural ? (ajustes[`${chave}_plural`] ?? mod.plurais[singular] ?? `${singular}s`) : singular;
  return opcoes.maiuscula ? base.charAt(0).toLocaleUpperCase('pt-PT') + base.slice(1) : base;
}

export function unidadeDe(mod: Modalidade, metrica: string): string | null {
  return mod.metricas.find((m) => m.id === metrica)?.unidade ?? null;
}

export { fitnessV1 };

/** "Novo treino", "Nova sessão", "Nova aula": o adjetivo concorda com o termo do vocabulário. */
export function novo(palavra: string, opcoes: { plural?: boolean } = {}): string {
  return `${eFeminino(palavra) ? 'Nova' : 'Novo'}${opcoes.plural ? 's' : ''} ${palavra}`;
}

/** Género do termo, para concordar adjetivos ("Próxima sessão", "Próximo treino"). */
export function eFeminino(palavra: string): boolean {
  // No plural, volta ao singular: sessões → sessão, aulas → aula, treinos → treino
  const w = palavra.trim().split(' ')[0].toLocaleLowerCase('pt-PT').replace(/ões$/, 'ão').replace(/s$/, '');
  return /(a|ção|são|dade|gem)$/.test(w);
}

/** Palavra antes do termo com o género certo: g('sessão', 'a', 'o') → "a sessão"; g('treino', 'a', 'o') → "o treino". */
export function g(palavra: string, feminino: string, masculino: string): string {
  return `${eFeminino(palavra) ? feminino : masculino} ${palavra}`;
}
