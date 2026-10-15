import { act, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { LayoutProvider } from '@luna/ui';
import { Poc } from '../Poc';

async function expectNoSeriousViolations(el: HTMLElement) {
  const r = await axe.run(el, {
    rules: {
      'color-contrast': { enabled: false },
      'aria-prohibited-attr': { enabled: false },
    },
  });
  const serious = r.violations.filter(v => ['critical', 'serious'].includes(v.impact ?? ''));
  expect(serious.map(v => v.id)).toEqual([]);
}

describe('G1 — POC layout responsivo (320 / 1440)', () => {
  it('320px: collapsed + mobile-actions (sem bottom-nav)', () => {
    render(<LayoutProvider initialWidth={320}><Poc /></LayoutProvider>);
    const root = document.querySelector('[data-shell]')!;
    expect(root).toHaveAttribute('data-shell', 'collapsed');
    expect(root).toHaveAttribute('data-aside', 'hidden');
    expect(screen.getByText(/POC G1/i)).toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Ações rápidas' })).toBeInTheDocument();
  });

  it('1440px: sidebar + board à direita', () => {
    render(<LayoutProvider initialWidth={1440}><Poc /></LayoutProvider>);
    const root = document.querySelector('[data-shell]')!;
    expect(root).toHaveAttribute('data-shell', 'sidebar');
    expect(root).toHaveAttribute('data-aside', 'right');
    expect(screen.getByText('Board')).toBeInTheDocument();
  });

  it('mesmo ecrã: troca layout só por config (override)', () => {
    render(<LayoutProvider initialWidth={1440}><Poc /></LayoutProvider>);
    expect(document.querySelector('[data-shell="sidebar"]')).toBeTruthy();
    act(() => {
      (screen.getByRole('button', { name: /Mobile \(HTML/i }) as HTMLButtonElement).click();
    });
    expect(document.querySelector('[data-shell="collapsed"]')).toBeTruthy();
  });

  it('axe: 0 violações critical/serious na POC', async () => {
    const { container } = render(<LayoutProvider initialWidth={1440}><Poc /></LayoutProvider>);
    await expectNoSeriousViolations(container);
  }, 20000);
});
