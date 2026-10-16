import { create } from 'zustand';

/**
 * Aviso curto (P-01): some sozinho em 6 segundos. Com Desfazer, a ação só se
 * grava no fim desse tempo; Desfazer repõe o estado sem pedido ao servidor.
 */
export type AvisoTom = 'ok' | 'erro' | 'info' | 'sem-rede';
export interface Aviso {
  id: number;
  tom: AvisoTom;
  texto: string;
  acao?: { rotulo: string; fn: () => void };
  duracaoMs: number;
}

interface AvisosState {
  itens: Aviso[];
  mostrar: (a: Omit<Aviso, 'id' | 'duracaoMs'> & { duracaoMs?: number }) => number;
  fechar: (id: number) => void;
}

export const DURACAO_AVISO_MS = 6000;
let seq = 0;

export const useAvisos = create<AvisosState>((set) => ({
  itens: [],
  mostrar: (a) => {
    const id = ++seq;
    set((s) => ({ itens: [...s.itens.slice(-2), { duracaoMs: DURACAO_AVISO_MS, ...a, id }] }));
    return id;
  },
  fechar: (id) => set((s) => ({ itens: s.itens.filter((i) => i.id !== id) })),
}));

export const avisar = (a: Parameters<AvisosState['mostrar']>[0]) => useAvisos.getState().mostrar(a);

export interface AcaoComDesfazer {
  texto: string;
  /** Muda o ecrã já (otimista). */
  aplicar: () => void;
  /** Repõe o ecrã: Desfazer ou erro ao gravar. */
  reverter: () => void;
  /** Grava no servidor no fim dos 6 segundos. */
  gravar: () => Promise<void>;
  textoErro?: string;
}

/**
 * Ação com Desfazer: aplica no ecrã, mostra o aviso e só grava quando o aviso
 * acaba. Devolve uma função que grava já (por exemplo ao sair da página).
 */
export function comDesfazer({ texto, aplicar, reverter, gravar, textoErro }: AcaoComDesfazer): () => void {
  let feito = false;
  aplicar();
  const executar = () => {
    if (feito) return;
    feito = true;
    clearTimeout(timer);
    useAvisos.getState().fechar(id);
    gravar().catch(() => {
      reverter();
      avisar({ tom: 'erro', texto: textoErro ?? 'Não foi possível guardar.' });
    });
  };
  const id = avisar({
    tom: 'ok', texto,
    acao: {
      rotulo: 'Desfazer',
      fn: () => {
        if (feito) return;
        feito = true;
        clearTimeout(timer);
        useAvisos.getState().fechar(id);
        reverter();
      },
    },
  });
  const timer = setTimeout(executar, DURACAO_AVISO_MS);
  return executar;
}
