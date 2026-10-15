import { act, render, screen } from '@testing-library/react';
import { LayoutProvider, useLayout } from '../layout/LayoutContext';
import { ResponsiveShell } from '../layout/ResponsiveShell';
import { Button } from '../Button';

function Page({ mobileActions }: { mobileActions?: React.ReactNode }) {
  return (
    <ResponsiveShell
      nav={<span>NAV</span>}
      header={<span>HEADER</span>}
      topActions={<span>TOP</span>}
      content={<span>CONTEÚDO</span>}
      aside={<span>BOARD</span>}
      mobileActions={mobileActions}
    />
  );
}
function SwapButton() {
  const { setOverride } = useLayout();
  return <Button onClick={() => setOverride({ shell: 'collapsed', aside: 'hidden' })}>trocar</Button>;
}

describe('ResponsiveShell (fidelidade HTML — sidebar|main|board + mobile-actions)', () => {
  it('≥960px: sidebar + board à direita (sem bottom-nav)', () => {
    render(<LayoutProvider initialWidth={1440}><Page /></LayoutProvider>);
    const root = document.querySelector('[data-shell]')!;
    expect(root).toHaveAttribute('data-shell', 'sidebar');
    expect(root).toHaveAttribute('data-aside', 'right');
    expect(screen.getByText('BOARD')).toBeInTheDocument();
    expect(screen.getByText('NAV')).toBeInTheDocument();
  });
  it('<960px: sidebar/board ocultos + barra mobile-actions (não navegação)', () => {
    render(<LayoutProvider initialWidth={375}><Page mobileActions={<button type="button">Atribuir</button>} /></LayoutProvider>);
    const root = document.querySelector('[data-shell]')!;
    expect(root).toHaveAttribute('data-shell', 'collapsed');
    expect(root).toHaveAttribute('data-aside', 'hidden');
    expect(screen.queryByText('BOARD')).not.toBeInTheDocument();
    expect(screen.queryByText('NAV')).not.toBeInTheDocument();
    expect(screen.getByRole('toolbar', { name: 'Ações rápidas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Atribuir' })).toBeInTheDocument();
  });
  it('override por config troca o layout SEM tocar na página (e persiste)', async () => {
    const { rerender } = render(
      <LayoutProvider initialWidth={1440}><SwapButton /><Page /></LayoutProvider>,
    );
    act(() => { (screen.getByRole('button', { name: 'trocar' }) as HTMLButtonElement).click(); });
    rerender(<LayoutProvider initialWidth={1440}><SwapButton /><Page /></LayoutProvider>);
    expect(document.querySelector('[data-shell="collapsed"]')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('luna.layout')!)).toMatchObject({ shell: 'collapsed' });
  });
});
