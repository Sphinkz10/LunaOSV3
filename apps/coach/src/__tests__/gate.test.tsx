import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore, type MyOrgRow } from '@luna/core';
import { Protected } from '../app/ModuleLayout';
import { navItems } from '../app/CoachNav';

const org: MyOrgRow = {
  org_id: 'o1', name: 'Estúdio', type: 'studio', theme: 'oceano', timezone: 'Europe/Lisbon',
  membership_id: 'm1', roles: ['coach'], permissions: ['clients.read_own'], subscription_status: 'trial',
};

function renderAt(path: string, module?: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>login</p>} />
        <Route path="/today" element={<p>hoje</p>} />
        <Route path="/business" element={<Protected module={module}><p>conteúdo</p></Protected>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Porta da Gestão (X-02, AUD-71)', () => {
  it('sem .env mostra um erro claro, não um esqueleto infinito', () => {
    useAuthStore.getState().setNotConfigured();
    renderAt('/business');
    expect(screen.getByRole('alert')).toHaveTextContent('VITE_SUPABASE_URL');
  });

  it('conta sem equipa é recusada', () => {
    useAuthStore.getState().signIn('u1', []);
    renderAt('/business');
    expect(screen.getByText('Esta conta não pertence a nenhuma equipa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).toBeNull();
  });

  it('sem sessão vai para Entrar', () => {
    useAuthStore.getState().signOut();
    renderAt('/business');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('módulo desligado pelo serviço de direitos não aparece', () => {
    useAuthStore.getState().signIn('u1', [org], null, ['today', 'clients']);
    renderAt('/business', 'business');
    expect(screen.getByText('hoje')).toBeInTheDocument();
    expect(screen.queryByText('conteúdo')).toBeNull();
  });

  it('módulo ligado abre', () => {
    useAuthStore.getState().signIn('u1', [org], null, ['today', 'clients']);
    renderAt('/business', 'clients');
    expect(screen.getByText('conteúdo')).toBeInTheDocument();
  });
});

describe('Menu por direitos (G-00)', () => {
  it('só mostra destinos ligados, com o vocabulário da modalidade', () => {
    const labels = navItems(['today', 'clients']).map((i) => i.label);
    expect(labels).toEqual(['Hoje', 'Clientes', 'Grupos']);
    expect(navItems([]).length).toBe(0);
  });
});
