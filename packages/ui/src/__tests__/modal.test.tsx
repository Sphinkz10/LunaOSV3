import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Modal } from '../overlays/Modal';
import { Button } from '../Button';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Teste">
        <input aria-label="campo" />
      </Modal>
    </>
  );
}

describe('Modal (P1.8 — focus-trap, ESC, devolve foco)', () => {
  it('abre com foco lá dentro, fecha com ESC e devolve o foco ao trigger', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Abrir' });
    await user.click(trigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    // foco dentro do dialog
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    // Tab mantém o foco dentro (trap)
    await user.tab(); await user.tab(); await user.tab(); await user.tab();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    // ESC fecha e devolve foco
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
