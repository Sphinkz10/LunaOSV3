import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
export interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  onSearch: (term: string) => void; delayMs?: number; label?: string;
}
/** Debounce 250ms (Guia §6.0). */
export function SearchInput({ onSearch, delayMs = 250, label = 'Pesquisar', ...rest }: SearchInputProps) {
  const [v, setV] = useState('');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const h = setTimeout(() => onSearch(v), delayMs);
    return () => clearTimeout(h);
  }, [v, delayMs, onSearch]);
  return (
    <input type="search" role="searchbox" aria-label={label} placeholder={label} value={v}
      onChange={(e) => setV(e.target.value)}
      style={{ height: 'var(--ctl-md)', padding: '0 var(--sp-4)', borderRadius: 'var(--r-pill)',
               border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--text-primary)',
               fontFamily: 'var(--font-body)', fontSize: 'var(--fs-sm)', width: '100%' }} {...rest} />
  );
}
