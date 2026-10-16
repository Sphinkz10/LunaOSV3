import { create } from 'zustand';

/**
 * Estado da rede e alterações à espera de enviar. A fila em si (Live, presenças)
 * entra na tarefa 08; aqui fica o contador que a barra "Sem rede" mostra.
 */
interface RedeState {
  online: boolean;
  pendentes: number;
  setOnline: (v: boolean) => void;
  setPendentes: (n: number) => void;
}

export const useRede = create<RedeState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  pendentes: 0,
  setOnline: (online) => set({ online }),
  setPendentes: (pendentes) => set({ pendentes: Math.max(0, pendentes) }),
}));

/** Liga o estado aos eventos do browser. Devolve a função de limpeza. */
export function vigiarRede(): () => void {
  if (typeof window === 'undefined') return () => {};
  const on = () => useRede.getState().setOnline(true);
  const off = () => useRede.getState().setOnline(false);
  window.addEventListener('online', on);
  window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}
