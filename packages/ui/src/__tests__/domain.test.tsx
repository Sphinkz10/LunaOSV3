import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { DayCell, DAY_META, type DayState } from '../domain/DayCell';
import { SwipeableCard } from '../domain/SwipeableCard';
import { SearchInput } from '../data/SearchInput';
import { DataTable } from '../data/DataTable';
import { useToastStore, toast } from '@luna/core';
import { Toaster } from '../feedback/Toaster';

describe('DayCell (9 estados — cor+ícone+texto, nunca só cor)', () => {
  it('todos os 9 estados têm label e ícone acessíveis', () => {
    const states = Object.keys(DAY_META) as DayState[];
    expect(states).toHaveLength(9);
    render(<>{states.map((s, i) => <DayCell key={s} day={i + 1} state={s} />)}</>);
    for (const [i, s] of states.entries()) {
      expect(screen.getByRole('button', { name: `Dia ${i + 1}: ${DAY_META[s].label}` })).toBeInTheDocument();
    }
  });
});

describe('SwipeableCard (gesto com alternativa ⋮ SEMPRE)', () => {
  it('ações acessíveis por menu ⋮ sem gesto', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<SwipeableCard actions={[{ label: 'Cancelar', onAct: onCancel, danger: true }]}>conteúdo</SwipeableCard>);
    await user.click(screen.getByRole('button', { name: 'Mais ações' }));
    await user.click(screen.getByRole('menuitem', { name: 'Cancelar' }));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe('SearchInput (debounce 250ms)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('só dispara após a pausa (e uma só vez)', () => {
    const onSearch = vi.fn();
    render(<SearchInput onSearch={onSearch} />);
    const box = screen.getByRole('searchbox');
    for (const v of ['m', 'ma', 'mar', 'mari', 'maria']) {
      fireEvent.change(box, { target: { value: v } });
      vi.advanceTimersByTime(100); // < 250ms entre teclas → não dispara
    }
    expect(onSearch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(260);
    expect(onSearch).toHaveBeenCalledWith('maria');
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});

describe('DataTable (sort + paginação)', () => {
  const rows = [{ id: 1, nome: 'Zé' }, { id: 2, nome: 'Ana' }, { id: 3, nome: 'Rui' }];
  it('ordena ao clicar no cabeçalho', async () => {
    const user = userEvent.setup();
    render(<DataTable columns={[{ key: 'nome', header: 'Nome', sortable: true }]} rows={rows} />);
    await user.click(screen.getByRole('button', { name: /Nome/ }));
    const cells = screen.getAllByRole('cell').map(c => c.textContent);
    expect(cells).toEqual(['Ana', 'Rui', 'Zé']);
  });
});

describe('Toast (store central + aria-live)', () => {
  it('push aparece na região polite e dismiss remove', async () => {
    useToastStore.setState({ items: [] });
    render(<Toaster />);
    toast({ variant: 'success', title: 'Marcação confirmada' });
    expect(await screen.findByText('Marcação confirmada')).toBeInTheDocument();
    expect(screen.getByLabelText('Notificações')).toHaveAttribute('aria-live', 'polite');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Dispensar' }));
    expect(screen.queryByText('Marcação confirmada')).not.toBeInTheDocument();
  });
});
