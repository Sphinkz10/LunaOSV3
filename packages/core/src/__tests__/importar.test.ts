import { falhasEmCsv, lerCsv, lerData, reconhecerColuna, validarImport } from '../api/definicoes';

describe('importar clientes (G-05)', () => {
  it('lê CSV com ponto e vírgula, aspas e BOM', () => {
    const { cabecalho, linhas } = lerCsv('﻿Nome Completo;Telemovel;E-mail\r\n"Rita ""Ritinha"" Moura";912 345 678;rita@x.pt\r\n\r\nTiago;;t@x.pt\n');
    expect(cabecalho).toEqual(['Nome Completo', 'Telemovel', 'E-mail']);
    expect(linhas).toEqual([['Rita "Ritinha" Moura', '912 345 678', 'rita@x.pt'], ['Tiago', '', 't@x.pt']]);
  });

  it('reconhece as colunas mais comuns', () => {
    expect(['Nome Completo', 'Telemovel', 'NIF', 'Data Nasc', 'E-mail', 'Obs'].map(reconhecerColuna))
      .toEqual(['nome', 'telefone', 'nif', 'nascimento', 'email', 'ignorar']);
  });

  it('lê datas portuguesas e ISO e recusa as impossíveis', () => {
    expect(lerData('14/03/1991')).toBe('1991-03-14');
    expect(lerData('1991-3-4')).toBe('1991-03-04');
    expect(lerData('31/02/1990')).toBeNull();
    expect(lerData('')).toBeNull();
  });

  it('valida no aparelho com erros e avisos por linha', () => {
    const r = validarImport([['', '91', 'x'], ['Ana', '', '']], ['nome', 'telefone', 'email']);
    expect(r[0]).toMatchObject({ linha: 2, erros: ['Falta o nome'] });
    expect(r[0].avisos).toContain('Telemóvel incompleto');
    expect(r[1].avisos).toContain('Sem email nem telemóvel: não dá para convidar');
  });

  it('lê o saldo de sessões do pack e recusa o que não é número inteiro', () => {
    expect(reconhecerColuna('Sessões por usar')).toBe('saldo');
    const r = validarImport([['Ana', '912345678', '7'], ['Rui', '912345679', '2,5']], ['nome', 'telefone', 'saldo']);
    expect(r[0].saldo).toBe(7);
    expect(r[1].erros).toContain('Saldo tem de ser um número inteiro de sessões');
  });

  it('as falhas saem em CSV para corrigir e repetir', () => {
    expect(falhasEmCsv([{ linha: 3, nome: 'Jo "J"', motivo: 'Já existe' }])).toBe('linha;nome;motivo\n"3";"Jo ""J""";"Já existe"');
  });
});
