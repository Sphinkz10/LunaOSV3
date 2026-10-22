import {
  comecarAvaliacao, erroResposta, MODELOS_QUESTIONARIO, mudarTentativa, perguntaVisivel, saltaPorRestricao, validarPerguntas, valorGuardado,
  type Pergunta, type TesteProtocolo,
} from '../api/avaliacao';

describe('avaliação (passo 22)', () => {
  it('os modelos são válidos e o construtor apanha os erros antes de publicar', () => {
    for (const m of MODELOS_QUESTIONARIO) expect(validarPerguntas(m.perguntas)).toBeNull();
    expect(validarPerguntas([{ id: 'a', tipo: 'escolha', texto: 'X', opcoes: ['só uma'] }])).toMatch(/2 opções/);
    expect(validarPerguntas([{ id: 'b', tipo: 'texto', texto: 'Y', se: { pergunta: 'z', valores: [true] } }])).toMatch(/anterior/);
  });

  it('pergunta condicional só aparece com a resposta certa', () => {
    const q: Pergunta = { id: 'onde', tipo: 'texto', texto: 'Onde?', obrigatorio: true, se: { pergunta: 'dor', valores: [true] } };
    expect(perguntaVisivel(q, { dor: false })).toBe(false);
    expect(perguntaVisivel(q, { dor: true })).toBe(true);
  });

  it('valida limites, obrigatórias e escolhas múltiplas', () => {
    expect(erroResposta({ id: 'p', tipo: 'numero', texto: 'Peso', min: 30, max: 250, unidade: 'kg' }, 900)).toBe('Máximo 250 kg.');
    expect(erroResposta({ id: 'p', tipo: 'texto', texto: 'X', obrigatorio: true }, '')).toMatch(/obrigatória/);
    expect(erroResposta({ id: 'd', tipo: 'escolha_multipla', texto: 'Dias', min: 2 }, ['Seg'])).toBe('Escolhe pelo menos 2.');
  });

  it('guarda a melhor, a média ou a menor conforme o teste', () => {
    const t: TesteProtocolo = { chave: 'a', nome: 'A', unidade: 'kg', tentativas: 3 };
    expect(valorGuardado(t, [55, 60, null])).toBe(60);
    expect(valorGuardado({ ...t, guarda: 'media' }, [55, 60])).toBe(57.5);
    expect(valorGuardado({ ...t, menor_melhor: true }, [12.1, 11.8])).toBe(11.8);
    expect(valorGuardado(t, [null, null])).toBeNull();
  });

  it('com restrição o teste fica "não feito" (nunca zero) até o PT decidir', () => {
    const blocos = [{ titulo: 'Força', testes: [{ chave: 'agacha', nome: 'Agachamento', unidade: 'kg', tentativas: 2, zonas: ['joelho'] }, { chave: 'prancha', nome: 'Prancha', unidade: 's', tentativas: 1 }] }];
    let a = comecarAvaliacao({ linkId: 'l', cliente: 'Rita', zonas: ['joelho'], versaoId: 'v', nome: 'Reavaliação', blocos });
    expect(a.valores.map((v) => v.saltado)).toEqual(['Restrição · joelho', null]);
    expect(saltaPorRestricao(blocos[0].testes[1], ['joelho'])).toBeNull();
    a = mudarTentativa(a, 'prancha', 0, 52);
    expect(a.valores[1].tentativas).toEqual([52]);
    expect(a.versao).toBe(2);
  });
});
