import { create } from 'zustand';

/**
 * Pedido de confirmação destrutiva (P-01), para que todos os ecrãs usem a mesma
 * peça. A janela (ConfirmarHost em @luna/ui/v3) é montada uma vez na app.
 */
export interface PedidoConfirmacao {
  titulo: string;
  texto?: string;
  /** O efeito em números, uma linha cada. */
  efeitos?: string[];
  /** O verbo no botão (Arquivar, Cancelar aula), nunca só OK. */
  verbo: string;
  manter?: string;
  /** Pede um motivo opcional (arquivar, cancelar com motivo), que chega à ação. */
  motivo?: { rotulo: string; placeholder?: string };
  /** Corre ao confirmar; se falhar, a janela mostra o erro e fica aberta. */
  acao: (motivo?: string) => Promise<void>;
}

interface ConfirmacoesState {
  pedido: (PedidoConfirmacao & { resolver: (ok: boolean) => void }) | null;
  abrir: (p: PedidoConfirmacao) => Promise<boolean>;
  fechar: (ok: boolean) => void;
}

export const useConfirmacoes = create<ConfirmacoesState>((set, get) => ({
  pedido: null,
  abrir: (p) => new Promise<boolean>((resolver) => {
    get().pedido?.resolver(false);
    set({ pedido: { ...p, resolver } });
  }),
  fechar: (ok) => {
    get().pedido?.resolver(ok);
    set({ pedido: null });
  },
}));

/** Pede confirmação e corre a ação. Devolve true se foi confirmada e gravada. */
export const confirmarDestrutivo = (p: PedidoConfirmacao) => useConfirmacoes.getState().abrir(p);
