import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRede } from '@luna/core';
import { Users } from '@luna/icons';
import { ListaComEstados, type EstadoLista } from '../v3';

const base = {
  titulo: 'Leads',
  primeiraVez: { icone: Users, titulo: 'Ainda não há leads', texto: 'Chegam da página pública.', acao: { rotulo: 'Adicionar lead', onClick: () => {} } },
  semResultados: { titulo: 'Ninguém com estes filtros', onLimpar: () => {} },
  onTentar: () => {},
};
const lista = (estado: EstadoLista<string>, extra: object = {}) =>
  render(<ListaComEstados {...base} estado={estado} {...extra}>{(itens) => itens.map((i) => <p key={i}>{i}</p>)}</ListaComEstados>);

afterEach(() => act(() => { useRede.setState({ online: true, pendentes: 0 }); }));

describe('estados por lista (X-06)', () => {
  it('a carregar: esqueleto e nunca um zero', () => {
    lista({ tipo: 'a-carregar' });
    expect(screen.getByText('a carregar')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });
  it('primeira vez oferece a ação que cria o primeiro item', () => {
    lista({ tipo: 'ok', itens: [] });
    expect(screen.getByRole('button', { name: 'Adicionar lead' })).toBeInTheDocument();
  });
  it('vazio por filtro oferece Limpar filtros', () => {
    const limpar = vi.fn();
    lista({ tipo: 'ok', itens: [] }, { filtrado: true, semResultados: { titulo: 'Ninguém', onLimpar: limpar } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(limpar).toHaveBeenCalled();
  });
  it('erro numa parte fica no sítio e tenta de novo ao voltar a rede', () => {
    const tentar = vi.fn();
    act(() => { useRede.setState({ online: false }); });
    lista({ tipo: 'erro', mensagem: '12 cobranças não carregaram' }, { onTentar: tentar });
    expect(screen.getByRole('alert')).toHaveTextContent('12 cobranças não carregaram');
    act(() => { useRede.setState({ online: true }); });
    expect(tentar).toHaveBeenCalled();
  });
  it('sem permissão não mostra números', () => {
    lista({ tipo: 'sem-permissao' }, { area: 'Receita' });
    expect(screen.getByText('Não tens acesso a Receita')).toBeInTheDocument();
    expect(screen.queryByText(/^\d+$/)).toBeNull();
  });
  it('sem rede mostra a última versão e de quando é', () => {
    act(() => { useRede.setState({ online: false }); });
    lista({ tipo: 'ok', itens: ['Rita'] }, { carregadaEm: new Date(Date.now() - 12 * 60000), emFila: 1 });
    expect(screen.getByText('de há 12 min')).toBeInTheDocument();
    expect(screen.getByText(/1 alteração em fila/)).toBeInTheDocument();
    expect(screen.getByText('Rita')).toBeInTheDocument();
  });
});
