import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import { Parq, Consentimentos } from '../pages/Conta';
import { PARQ } from '../parq';

const emRouter = (el: JSX.Element) => render(<MemoryRouter>{el}</MemoryRouter>);

describe('PAR-Q (C-01)', () => {
  it('uma pergunta por ecrã, 7 no total; Seguinte só com resposta', () => {
    emRouter(<Parq />);
    expect(screen.getByText(PARQ[0].pergunta)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seguinte' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Não'));
    fireEvent.click(screen.getByRole('button', { name: 'Seguinte' }));
    expect(screen.getByText(PARQ[1].pergunta)).toBeInTheDocument();
    expect(PARQ).toHaveLength(7);
  });

  it('um Sim avisa que vai precisar de atestado', () => {
    emRouter(<Parq />);
    fireEvent.click(screen.getByLabelText('Sim'));
    expect(screen.getByText(/atestado médico antes de treinar/)).toBeInTheDocument();
  });

  it('axe sem violações', async () => {
    const { container } = emRouter(<Parq />);
    const r = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});

describe('Consentimentos separados', () => {
  it('termos obrigatórios; saúde e novidades são escolhas', () => {
    emRouter(<Consentimentos />);
    expect(screen.getByText('Termos e regulamento')).toBeInTheDocument();
    expect(screen.getByText('Novidades e campanhas')).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(3);
  });
});
