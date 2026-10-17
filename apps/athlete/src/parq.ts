/**
 * PAR-Q+ (Questionário de Prontidão para a Atividade Física), as 7 perguntas
 * gerais. Uma pergunta por ecrã; qualquer "Sim" pede atestado médico antes de
 * treinar. As respostas são da pessoa: a equipa só recebe a pendência.
 */
export const PARQ: { id: string; pergunta: string }[] = [
  { id: 'coracao_tensao', pergunta: 'Algum médico te disse que tens um problema de coração ou tensão alta?' },
  { id: 'dor_peito', pergunta: 'Sentes dor no peito em repouso, no dia a dia ou quando fazes atividade física?' },
  { id: 'tonturas', pergunta: 'Perdeste o equilíbrio por tonturas ou perdeste a consciência nos últimos 12 meses?' },
  { id: 'doenca_cronica', pergunta: 'Tens outra doença crónica diagnosticada, além de coração ou tensão alta?' },
  { id: 'medicacao', pergunta: 'Tomas medicação para uma doença crónica?' },
  { id: 'ossos_articulacoes', pergunta: 'Tens um problema nos ossos, articulações ou músculos que pode piorar com atividade física?' },
  { id: 'supervisao_medica', pergunta: 'Algum médico te disse que só deves fazer atividade física com supervisão médica?' },
];
