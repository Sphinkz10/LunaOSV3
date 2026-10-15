import { create } from 'zustand';

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
export const toast = (t: Parameters<ToastState['push']>[0]) => useToastStore.getState().push(t);
