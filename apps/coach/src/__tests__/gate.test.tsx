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

  it('conta sem equipa cria o seu negócio e não vê nada de outros (J32)', () => {
    useAuthStore.getState().signIn('u1', []);
    renderAt('/business');
    expect(screen.getByText('Como trabalhas?')).toBeInTheDocument();
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
    expect(labels).toEqual(['Hoje', 'Clientes', 'Negócio']);
    expect(navItems([]).length).toBe(0);
  });

  it('cada papel vê só os seus destinos', () => {
    const plano = ['today', 'clients', 'schedule', 'training', 'settings'];
    // PT: Hoje, Clientes (os seus), Horário, Treino; nunca Definições
    expect(navItems(plano, ['clients.read_own', 'clients.write', 'schedule.write', 'training.write']).map((i) => i.to))
      .toEqual(['/today', '/clients', '/schedule', '/training/biblioteca']);
    // Receção: sem Treino
    expect(navItems(plano, ['clients.read_all', 'schedule.read_all', 'schedule.write']).map((i) => i.to))
      .toEqual(['/today', '/clients', '/schedule', '/business/dinheiro']);
  });
});

describe('Rotas dos ecrãs G- (T04)', () => {
  it('os 49 ecrãs do mapa têm rota', async () => {
    const { ECRAS_G, rotaPorConstruir } = await import('../app/ecras');
    expect(ECRAS_G).toHaveLength(49);
    expect(new Set(ECRAS_G.map((e) => e.id)).size).toBe(49);
    for (const e of ECRAS_G) expect(e.rota ?? rotaPorConstruir(e.id)).toMatch(/^\//);
  });
});
