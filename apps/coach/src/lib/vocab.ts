import { getModalidade, termo, type Termo, type TermoOpcoes } from '@luna/modalidades';

/**
 * Vocabulário da modalidade (regra 4: nenhum texto escreve o nome do papel à mão).
 * Por agora a Gestão trabalha com a modalidade da organização (fitness); os ajustes
 * de OrgSport.vocabulary_override entram com o G-48 (F5).
 */
const modalidade = getModalidade('fitness');

export function t(chave: Termo, opcoes?: TermoOpcoes): string {
  return termo(modalidade, chave, opcoes);
}

/** "Cliente", "Clientes", "cliente", "clientes". */
export const vocab = {
  pessoa: (o?: TermoOpcoes) => t('pessoa', o),
  sessao: (o?: TermoOpcoes) => t('sessao', o),
  responsavel: (o?: TermoOpcoes) => t('responsavel', o),
  grupo: (o?: TermoOpcoes) => t('grupo_principal', o),
};

export { modalidade };
