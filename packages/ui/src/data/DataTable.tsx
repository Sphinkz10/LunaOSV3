import { useMemo, useState, type ReactNode } from 'react';
export interface Column<T> { key: keyof T & string; header: string; render?: (row: T) => ReactNode; sortable?: boolean; }
export function DataTable<T extends { id: string | number }>({ columns, rows, pageSize = 10 }:
  { columns: Column<T>[]; rows: T[]; pageSize?: number }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key as keyof T], bv = b[sort.key as keyof T];
      return (av! > bv! ? 1 : av! < bv! ? -1 : 0) * sort.dir;
    });
  }, [rows, sort]);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const view = sorted.slice(page * pageSize, (page + 1) * pageSize);
  const th: React.CSSProperties = { textAlign: 'left', padding: 'var(--sp-3)', fontSize: 'var(--fs-xs)',
    color: 'var(--text-muted)', borderBottom: '1px solid var(--border-strong)', whiteSpace: 'nowrap' };
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm)', color: 'var(--text-primary)' }}>
        <thead><tr>
          {columns.map((c) => (
            <th key={c.key} style={th} aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : undefined}>
              {c.sortable ? (
                <button onClick={() => { setPage(0); setSort(s => s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }); }}
                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', font: 'inherit', minHeight: 'var(--touch-min)' }}>
                  {c.header}{sort?.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                </button>
              ) : c.header}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {view.map((r) => (
            <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
              {columns.map((c) => <td key={c.key} style={{ padding: 'var(--sp-3)' }}>{c.render ? c.render(r) : String(r[c.key])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {pages > 1 && (
        <nav aria-label="Paginação" style={{ display: 'flex', gap: 'var(--sp-2)', padding: 'var(--sp-3)', justifyContent: 'flex-end' }}>
          <button disabled={page === 0} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"
            style={{ minWidth: 'var(--touch-min)', minHeight: 'var(--touch-min)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--text-primary)', cursor: 'pointer' }}>‹</button>
          <span style={{ alignSelf: 'center', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{page + 1}/{pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)} aria-label="Página seguinte"
            style={{ minWidth: 'var(--touch-min)', minHeight: 'var(--touch-min)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--glass)', color: 'var(--text-primary)', cursor: 'pointer' }}>›</button>
        </nav>
      )}
    </div>
  );
}
