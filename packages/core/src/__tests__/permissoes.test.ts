import { deveMostrarPedidoAvisos, estadoAvisos, estadoCamara, marcarPedidoAvisos, pedirAvisos } from '../permissoes';

const guarda = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); } }; };

describe('permissões (T19, P-09)', () => {
  it('sem suporte a avisos, nunca mostra o pedido', () => {
    expect(estadoAvisos({})).toBe('sem_suporte');
    expect(deveMostrarPedidoAvisos({ armazenamento: guarda() })).toBe(false);
  });

  it('pede uma vez; "Agora não" não volta a insistir', () => {
    const a = { Notification: { permission: 'default', requestPermission: async () => 'granted' }, armazenamento: guarda() };
    expect(deveMostrarPedidoAvisos(a)).toBe(true);
    marcarPedidoAvisos('agora_nao', a);
    expect(deveMostrarPedidoAvisos(a)).toBe(false);
  });

  it('pedir devolve o que a pessoa escolheu e já decidido no sistema não pede', async () => {
    const a = { Notification: { permission: 'default', requestPermission: async () => 'denied' }, armazenamento: guarda() };
    expect(await pedirAvisos(a)).toBe('recusada');
    expect(deveMostrarPedidoAvisos({ ...a, Notification: { ...a.Notification, permission: 'granted' }, armazenamento: guarda() })).toBe(false);
  });

  it('câmara recusada é reconhecida sem a pedir', async () => {
    expect(await estadoCamara({ permissions: { query: async () => ({ state: 'denied' }) } })).toBe('recusada');
    expect(await estadoCamara(undefined)).toBe('por_pedir');
  });
});
