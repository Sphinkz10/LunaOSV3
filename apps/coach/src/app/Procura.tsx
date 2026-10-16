import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@luna/core';
import { MagnifyingGlass } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';
import { navItems } from './CoachNav';

interface Resultado { id: string; titulo: string; sub: string; to: string }

/**
 * Procura (Ctrl/⌘K, P-02): destinos do papel e clientes visíveis. Teclado:
 * setas para escolher, Enter para abrir, Esc para fechar.
 */
export function Procura({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const navigate = useNavigate();
  const scope = useAuthStore((s) => s.scope);
  const modules = useAuthStore((s) => s.modules);
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState<Resultado[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  useEffect(() => {
    if (!aberta) return;
    setQ(''); setSel(0); setClientes([]); setErro(null);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [aberta]);

  // Clientes: só os que o RLS deixa ver, filtrados no servidor
  useEffect(() => {
    if (!aberta || !scope || q.trim().length < 2 || !modules.includes('clients')) { setClientes([]); return; }
    const client = getSupabaseClient();
    if (!client) return;
    let cancel = false;
    const t = setTimeout(() => {
      void client.from('clients').select('id,full_name,email').eq('org_id', scope.orgId)
        .is('archived_at', null).ilike('full_name', `%${q.trim().replace(/[%_]/g, '')}%`).limit(8)
        .then(({ data, error }) => {
          if (cancel) return;
          if (error) { setErro(error.message); return; }
          setErro(null);
          setClientes((data ?? []).map((c) => ({ id: c.id, titulo: c.full_name, sub: c.email ?? vocab.pessoa({ maiuscula: true }), to: `/clients/${c.id}` })));
        });
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [aberta, q, scope, modules]);

  if (!aberta) return null;

  const termo = q.trim().toLocaleLowerCase('pt-PT');
  const destinos: Resultado[] = navItems(modules, scope?.permissions)
    .filter((i) => !termo || i.label.toLocaleLowerCase('pt-PT').includes(termo))
    .map((i) => ({ id: i.to, titulo: i.label, sub: 'Ir para', to: i.to }));
  const resultados = [...destinos, ...clientes];
  const abrir = (r: Resultado | undefined) => { if (!r) return; onFechar(); navigate(r.to); };

  return (
    <div className="lv-root" style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'grid', placeItems: 'start center',
      paddingTop: '12vh', background: 'color-mix(in srgb, var(--cor-texto) 35%, transparent)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }} role="presentation">
      <div role="dialog" aria-modal="true" aria-label="Procurar" className="lg-pop__lista"
        style={{ position: 'static', width: 'min(560px, calc(100vw - 2 * var(--margem-telemovel)))' }}>
        <label className="lg-procura" style={{ width: '100%', cursor: 'text' }}>
          <MagnifyingGlass size={16} aria-hidden />
          <span className="sr-only">Procurar</span>
          <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }}
            placeholder={`Procurar ${vocab.pessoa()} ou destino`}
            role="combobox" aria-expanded aria-controls={listaId} aria-activedescendant={resultados[sel] ? `${listaId}-${sel}` : undefined}
            style={{ flex: 1, border: 0, outline: 0, background: 'transparent', color: 'var(--cor-texto)', font: 'inherit', minHeight: 40 }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onFechar();
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); abrir(resultados[sel]); }
            }} />
        </label>
        <div id={listaId} role="listbox" aria-label="Resultados">
          {resultados.map((r, i) => (
            <div key={r.id} id={`${listaId}-${i}`} role="option" aria-selected={i === sel} tabIndex={-1}
              className="lg-pop__item" style={{ flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', ...(i === sel ? { background: 'var(--cor-selecao)' } : {}) }}
              onMouseEnter={() => setSel(i)} onClick={() => abrir(r)} onKeyDown={(e) => { if (e.key === 'Enter') abrir(r); }}>
              <span>{r.titulo}</span><span className="lv-legenda">{r.sub}</span>
            </div>
          ))}
          {erro && <p role="alert" className="lv-legenda" style={{ padding: 'var(--espaco-8) var(--espaco-12)', color: 'var(--estado-erro)' }}>A procura de {vocab.pessoa({ plural: true })} falhou: {erro}</p>}
          {!erro && resultados.length === 0 && <p className="lv-legenda" style={{ padding: 'var(--espaco-8) var(--espaco-12)' }}>Sem resultados.</p>}
        </div>
      </div>
    </div>
  );
}
