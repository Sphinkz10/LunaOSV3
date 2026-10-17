import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Janela } from '@luna/ui/v3';

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const CMD = MAC ? '⌘' : 'Ctrl ';

/** Está a escrever? Os atalhos só funcionam fora de campos de texto. */
export function aEscrever(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Ctrl/⌘S chama a gravação do ecrã aberto (se o ecrã a registou). */
export function useAtalhoGuardar(guardar: (() => void) | null): void {
  const ref = useRef(guardar);
  ref.current = guardar;
  useEffect(() => {
    const on = () => ref.current?.();
    window.addEventListener('luna:guardar', on);
    return () => window.removeEventListener('luna:guardar', on);
  }, []);
}

/**
 * Atalhos de teclado (G-00, Figma 180:94): ? abre esta ajuda em qualquer ecrã;
 * / ou Ctrl/⌘K procura; N novo; G e H vai para Hoje; G e C para o Horário;
 * G e P para as pessoas; Ctrl/⌘S guarda; Esc fecha ou volta.
 */
export function Atalhos({ onProcurar, novo, pessoas }: { onProcurar: () => void; novo: string | null; pessoas: string }) {
  const navigate = useNavigate();
  const [ajuda, setAjuda] = useState(false);
  const g = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        window.dispatchEvent(new Event('luna:guardar'));
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || aEscrever(e.target)) return;
      if (document.querySelector('[role="dialog"]') && e.key !== '?') return;
      const k = e.key.toLowerCase();
      if (Date.now() - g.current < 1200) {
        g.current = 0;
        const destino = k === 'h' ? '/today' : k === 'c' ? '/schedule' : k === 'p' ? '/clients' : null;
        if (destino) { e.preventDefault(); navigate(destino); }
        return;
      }
      if (e.key === '?') { e.preventDefault(); setAjuda((v) => !v); }
      else if (e.key === '/') { e.preventDefault(); onProcurar(); }
      else if (k === 'n' && novo) { e.preventDefault(); navigate(novo); }
      else if (k === 'g') g.current = Date.now();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, onProcurar, novo]);

  const linhas: [string, string[]][] = [
    ['Procurar', ['/', `${CMD}K`]],
    ['Novo (cliente, aula, treino…)', ['N']],
    ['Ir para Hoje', ['G', 'H']],
    ['Ir para Horário', ['G', 'C']],
    [`Ir para ${pessoas}`, ['G', 'P']],
    ['Guardar', [`${CMD}S`]],
    ['Fechar ou voltar', ['Esc']],
    ['Esta ajuda', ['?']],
  ];
  return (
    <Janela aberta={ajuda} onFechar={() => setAjuda(false)} titulo="Atalhos de teclado" sub="Só funcionam fora de campos de texto.">
      <dl className="lg-atalhos">
        {linhas.map(([o, teclas]) => (
          <div key={o} className="lg-atalhos__linha">
            <dt>{o}</dt>
            <dd>{teclas.map((t) => <kbd key={t}>{t}</kbd>)}</dd>
          </div>
        ))}
      </dl>
    </Janela>
  );
}
