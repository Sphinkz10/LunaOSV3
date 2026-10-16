import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Botao, CartaoDestaque, Interruptor, Tema, TEMAS, iniciais } from '../v3/components';
import { Galeria } from '../v3/Galeria';

async function semViolacoes(el: HTMLElement) {
  // jsdom não calcula cores: o contraste está provado pelos testes de @luna/tokens
  const r = await axe.run(el, { rules: { 'color-contrast': { enabled: false } } });
  expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
}

describe('componentes base v3 · quatro temas', () => {
  for (const tema of TEMAS) {
    it(`${tema}: axe sem violações`, async () => {
      const { container } = render(<Tema tema={tema}><Galeria /></Tema>);
      await semViolacoes(container);
    }, 20000);

    it(`${tema}: snapshot`, () => {
      const { container } = render(<Tema tema={tema}><Galeria /></Tema>);
      expect(container.firstElementChild?.getAttribute('data-tema')).toBe(tema);
      expect(container.innerHTML).toMatchSnapshot();
    });
  }
});

describe('regras do design system', () => {
  it('o botão no cartão de destaque usa cor/acao-no-destaque', () => {
    render(<CartaoDestaque titulo="Força A" acao={{ rotulo: 'Iniciar', onClick: () => {} }} />);
    expect(screen.getByRole('button', { name: 'Iniciar' })).toHaveClass('lv-btn--no-destaque');
    const css = readFileSync(resolve(__dirname, '../v3/v3.css'), 'utf8');
    expect(css).toMatch(/\.lv-btn--no-destaque\s*\{[^}]*var\(--cor-acao-no-destaque\)[^}]*var\(--cor-sobre-acao-no-destaque\)/);
  });

  it('só tokens: o CSS não tem cores, nem cinzento/preto transparente nos esbatimentos', () => {
    const css = readFileSync(resolve(__dirname, '../v3/v3.css'), 'utf8');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    expect(css).not.toMatch(/rgba?\(/);
    expect(css).not.toMatch(/background:\s*(black|gray|grey)/);
  });

  it('a carregar: botão ocupado e desativado', () => {
    render(<Botao aCarregar>Guardar</Botao>);
    const b = screen.getByRole('button', { name: 'Guardar' });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute('aria-busy', 'true');
  });

  it('interruptor muda com o teclado e anuncia o estado', async () => {
    const user = userEvent.setup();
    let v = false;
    const { rerender } = render(<Interruptor ligado={v} onMudar={(n) => { v = n; }} rotulo="Lembretes" />);
    const sw = screen.getByRole('switch', { name: 'Lembretes' });
    sw.focus();
    await user.keyboard(' ');
    expect(v).toBe(true);
    rerender(<Interruptor ligado={v} onMudar={() => {}} rotulo="Lembretes" />);
    expect(sw).toHaveAttribute('aria-checked', 'true');
  });

  it('iniciais', () => {
    expect(iniciais('ana  costa silva')).toBe('AC');
    expect(iniciais('Íris')).toBe('Í');
  });
});
