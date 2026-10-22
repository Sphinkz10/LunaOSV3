/**
 * Permissões do aparelho (tarefa 19, P-09): a app nunca as pede no arranque.
 * Avisos pedem-se na primeira vez que fazem falta, com o porquê; a câmara pede-se
 * no passo que a usa e, recusada, há sempre outro caminho (Definições ou galeria).
 */
export type EstadoPermissao = 'concedida' | 'recusada' | 'por_pedir' | 'sem_suporte';

const CHAVE_PEDIDO = 'luna.avisos.pedido';

interface AmbienteAvisos {
  Notification?: { permission: string; requestPermission: () => Promise<string> };
  armazenamento?: Pick<Storage, 'getItem' | 'setItem'>;
}
const ambiente = (): AmbienteAvisos => ({
  Notification: typeof window !== 'undefined' && 'Notification' in window ? (window.Notification as unknown as AmbienteAvisos['Notification']) : undefined,
  armazenamento: (() => { try { return localStorage; } catch { return undefined; } })(),
});

const traduzir = (p: string | undefined): EstadoPermissao =>
  p === 'granted' ? 'concedida' : p === 'denied' ? 'recusada' : p === 'default' || p === 'prompt' ? 'por_pedir' : 'sem_suporte';

export function estadoAvisos(a: AmbienteAvisos = ambiente()): EstadoPermissao {
  return a.Notification ? traduzir(a.Notification.permission) : 'sem_suporte';
}

/** Mostrar a folha "Avisamos-te?" agora? Só uma vez, e só se ainda não se decidiu no sistema. */
export function deveMostrarPedidoAvisos(a: AmbienteAvisos = ambiente()): boolean {
  if (estadoAvisos(a) !== 'por_pedir') return false;
  try { return a.armazenamento?.getItem(CHAVE_PEDIDO) == null; } catch { return false; }
}

/** "Agora não" também conta: não voltamos a insistir sem a pessoa ir a Eu › Avisos. */
export function marcarPedidoAvisos(resposta: 'pedido' | 'agora_nao', a: AmbienteAvisos = ambiente()): void {
  try { a.armazenamento?.setItem(CHAVE_PEDIDO, resposta); } catch { /* sem armazenamento: volta a perguntar noutra visita */ }
}

export async function pedirAvisos(a: AmbienteAvisos = ambiente()): Promise<EstadoPermissao> {
  marcarPedidoAvisos('pedido', a);
  if (!a.Notification) return 'sem_suporte';
  try { return traduzir(await a.Notification.requestPermission()); } catch { return estadoAvisos(a); }
}

/** Câmara: só se pergunta o estado (nunca se pede aqui); o pedido acontece ao abrir a câmara. */
export async function estadoCamara(nav: { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } } | undefined =
  typeof navigator !== 'undefined' ? (navigator as unknown as { permissions?: { query: (d: { name: string }) => Promise<{ state: string }> } }) : undefined): Promise<EstadoPermissao> {
  if (!nav?.permissions) return 'por_pedir';
  try { return traduzir((await nav.permissions.query({ name: 'camera' })).state); } catch { return 'por_pedir'; }
}
