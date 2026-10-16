import { create } from 'zustand';
import { avisar, type AvisoTom } from './avisos';

export type ToastVariant = 'success' | 'danger' | 'warning' | 'info';
export interface ToastItem { id: number; variant: ToastVariant; title: string; description?: string; durationMs: number; }
interface ToastState {
  items: ToastItem[];
  push: (t: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => number;
  dismiss: (id: number) => void;
}
let seq = 0;
export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (t) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items, { id, durationMs: 2400, ...t }] })); // 2400ms = legado
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));
const TOM: Record<ToastVariant, AvisoTom> = { success: 'ok', danger: 'erro', warning: 'erro', info: 'info' };

/**
 * Aviso a partir dos ecrãs antigos: passa a ser o aviso curto v3 (P-01), para
 * haver uma só peça na app. O Toaster antigo continua só na página de prova.
 */
export const toast = (t: Parameters<ToastState['push']>[0]) => {
  avisar({ tom: TOM[t.variant], texto: t.description ? `${t.title} · ${t.description}` : t.title });
  return useToastStore.getState().push(t);
};
