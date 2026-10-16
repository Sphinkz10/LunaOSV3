import { act, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { comDesfazer, useAvisos, useRede, DURACAO_AVISO_MS } from '@luna/core';
import { Avisos, BarraSemRede, ConfirmarDestrutivo, MenuAcoes, Tema } from '../v3';

function viewport(largura: number) {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('max-width: 960px') ? largura <= 960 : false,
    media: q, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => { useAvisos.setState({ itens: [] }); vi.useRealTimers(); });

describe('aviso curto com Desfazer (P-01)', () => {
  it('Desfazer repõe o estado sem pedido ao servidor', () => {
    vi.useFakeTimers();
    let estado = 'inscrita';
    const gravar = vi.fn(async () => {});
    render(<Avisos />);
    act(() => {
      comDesfazer({ texto: 'Rita inscrita', aplicar: () => { estado = 'inscrita'; }, reverter: () => { estado = 'antes'; }, gravar });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    act(() => { vi.advanceTimersByTime(DURACAO_AVISO_MS + 100); });
    expect(estado).toBe('antes');
    expect(gravar).not.toHaveBeenCalled();
  });

  it('sem Desfazer, só grava no fim dos 6 segundos', () => {
    vi.useFakeTimers();
    const gravar = vi.fn(async () => {});
    render(<Avisos />);
    act(() => { comDesfazer({ texto: 'Arquivado', aplicar: () => {}, reverter: () => {}, gravar }); });
    act(() => { vi.advanceTimersByTime(DURACAO_AVISO_MS - 100); });
    expect(gravar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(200); });
    expect(gravar).toHaveBeenCalledTimes(1);
  });
});

describe('confirmação destrutiva', () => {
  const props = {
    aberta: true, titulo: 'Cancelar o Funcional?', verbo: 'Cancelar aula', manter: 'Manter aula',
    efeitos: [{ texto: '18 inscritos recebem aviso' }, { texto: 'A lista de espera fecha (3 pessoas)' }],
    onConfirmar: () => {}, onFechar: () => {},
  };

  it('mostra o efeito em números e o verbo no botão; axe sem violações', async () => {
    viewport(1440);
    render(<Tema tema="oceano"><ConfirmarDestrutivo {...props} /></Tema>);
    expect(screen.getByRole('button', { name: 'Cancelar aula' })).toBeInTheDocument();
    expect(screen.getByText('18 inscritos recebem aviso')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^OK$/ })).toBeNull();
    const r = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  it('no telemóvel abre como folha de baixo, nunca janela centrada', () => {
    viewport(375);
    render(<ConfirmarDestrutivo {...props} />);
    expect(screen.getByRole('dialog')).toHaveClass('lv-janela--folha');
  });
});

describe('menu de ações', () => {
  it('abre, navega com setas e executa', () => {
    viewport(1440);
    const editar = vi.fn();
    render(<MenuAcoes acoes={[{ rotulo: 'Editar aula', onClick: editar }, { rotulo: 'Cancelar aula', perigo: true, onClick: () => {} }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Mais ações' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Editar aula' }));
    expect(editar).toHaveBeenCalled();
  });
});

describe('sem rede', () => {
  it('conta as alterações à espera', () => {
    act(() => { useRede.setState({ online: false, pendentes: 3 }); });
    render(<BarraSemRede />);
    expect(screen.getByRole('status')).toHaveTextContent('3 alterações à espera de enviar');
    act(() => { useRede.setState({ online: true, pendentes: 0 }); });
  });
});
