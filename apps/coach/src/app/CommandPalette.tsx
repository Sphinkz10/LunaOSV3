import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '@luna/ui';

const NAV = [
  { ico: '⌂', title: 'Início', sub: 'Dashboard', to: '/dashboard', key: 'G D' },
  { ico: '▤', title: 'Atletas', sub: 'Carteira de atletas', to: '/athletes', key: 'G A' },
  { ico: '⊞', title: 'Grupos', sub: 'Grupos e listas', to: '/groups', key: 'G G' },
  { ico: '▣', title: 'Calendário', sub: 'Marcações e agenda', to: '/calendar', key: 'G C' },
  { ico: '◉', title: 'Live', sub: 'Treino ao vivo', to: '/live', key: 'G L' },
  { ico: '✎', title: 'Studio', sub: 'Conteúdos', to: '/studio' },
  { ico: '⬡', title: 'Data.OS', sub: 'Dados e fórmulas', to: '/dataos' },
  { ico: '⚙', title: 'Definições', sub: 'Conta e preferências', to: '/settings' },
] as const;

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [...NAV];
    return NAV.filter((i) => [i.title, i.sub, i.to].join(' ').toLowerCase().includes(q));
  }, [query]);

  const run = useCallback((to: string) => {
    setOpen(false);
    setQuery('');
    navigate(to);
  }, [navigate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        setIdx(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { setIdx(0); }, [query]);

  const palette = (
    <Modal open={open} onClose={() => setOpen(false)} title="Comandos rápidos"
      footer={null}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 'var(--sp-3)' }}>
        <span style={{ color: 'var(--gold)', fontWeight: 900 }}>⌘K</span>
        <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Procurar módulo ou ação…"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
            if (e.key === 'Enter' && items[idx]) { e.preventDefault(); run(items[idx].to); }
          }}
          style={{
            flex: 1, background: 'transparent', border: 0, outline: 0,
            color: 'var(--text-primary)', fontSize: 'var(--fs-base)', fontWeight: 800,
            fontFamily: 'var(--font-body)',
          }} />
      </label>
      <div style={{ display: 'grid', gap: 4, maxHeight: 360, overflow: 'auto' }}>
        {items.length === 0
          ? <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 'var(--sp-6)' }}>Sem resultados</p>
          : items.map((item, i) => (
            <button key={item.to} type="button" onClick={() => run(item.to)}
              style={{
                width: '100%', minHeight: 48, borderRadius: 'var(--r-md)', textAlign: 'left',
                display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) auto', gap: 10, alignItems: 'center',
                padding: '8px 10px', cursor: 'pointer', fontFamily: 'var(--font-body)',
                border: i === idx ? '1px solid rgba(255,183,1,.24)' : '1px solid transparent',
                background: i === idx ? 'rgba(255,183,1,.10)' : 'transparent', color: 'var(--text-primary)',
              }}>
              <span style={{ width: 32, height: 32, borderRadius: 11, display: 'grid', placeItems: 'center',
                background: 'var(--glass)', color: 'var(--gold)', fontWeight: 900 }}>{item.ico}</span>
              <span>
                <strong style={{ display: 'block', fontSize: 'var(--fs-sm)' }}>{item.title}</strong>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{item.sub}</span>
              </span>
              {'key' in item && item.key && (
                <kbd style={{ borderRadius: 'var(--r-pill)', background: 'var(--glass)', border: '1px solid var(--border)',
                  fontSize: '.66rem', fontWeight: 900, padding: '4px 8px', color: 'var(--text-secondary)' }}>{item.key}</kbd>
              )}
            </button>
          ))}
      </div>
    </Modal>
  );

  return { open, setOpen, palette };
}
