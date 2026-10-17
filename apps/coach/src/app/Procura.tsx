import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@luna/core';
import { MagnifyingGlass } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';
import { navItems } from './CoachNav';

type Modulo = 'clientes' | 'grupos' | 'destinos';
interface Resultado { id: string; titulo: string; sub: string; to: string; modulo: Modulo }

/**
 * Procura (Ctrl/⌘K, P-02 e G-00 Figma 180:94): resultados por módulo
 * (clientes, grupos, destinos). Teclado: Tab muda de módulo e a escolha fica
 * visível, setas escolhem, Enter abre, Esc fecha.
 */
export function Procura({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const navigate = useNavigate();
  const scope = useAuthStore((s) => s.scope);
  const modules = useAuthStore((s) => s.modules);
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState<Resultado[]>([]);
  const [grupos, setGrupos] = useState<Resultado[]>([]);
  const [modulo, setModulo] = useState<Modulo | 'tudo'>('tudo');
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listaId = useId();

  useEffect(() => {
    if (!aberta) return;
    setQ(''); setSel(0); setClientes([]); setGrupos([]); setModulo('tudo'); setErro(null);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [aberta]);

  // Clientes: só os que o RLS deixa ver, filtrados no servidor
  useEffect(() => {
    if (!aberta || !scope || q.trim().length < 2 || !modules.includes('clients')) { setClientes([]); setGrupos([]); return; }
    const client = getSupabaseClient();
    if (!client) return;
    let cancel = false;
    const t = setTimeout(() => {
      const termo = `%${q.trim().replace(/[%_]/g, '')}%`;
      void client.from('groups').select('id,name').eq('org_id', scope.orgId).ilike('name', termo).limit(5)
        .then(({ data }) => { if (!cancel) setGrupos((data ?? []).map((g) => ({ id: g.id, titulo: g.name, sub: 'Grupo', to: `/groups/${g.id}`, modulo: 'grupos' }))); });
      void client.from('clients').select('id,full_name,email').eq('org_id', scope.orgId)
        .is('archived_at', null).ilike('full_name', `%${q.trim().replace(/[%_]/g, '')}%`).limit(8)
        .then(({ data, error }) => {
          if (cancel) return;
          if (error) { setErro(error.message); return; }
          setErro(null);
          setClientes((data ?? []).map((c) => ({ id: c.id, titulo: c.full_name, sub: c.email ?? vocab.pessoa({ maiuscula: true }), to: `/clients/${c.id}`, modulo: 'clientes' as const })));
        });
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [aberta, q, scope, modules]);

  if (!aberta) return null;

  const termo = q.trim().toLocaleLowerCase('pt-PT');
  const destinos: Resultado[] = navItems(modules, scope?.permissions)
    .filter((i) => !termo || i.label.toLocaleLowerCase('pt-PT').includes(termo))
    .map((i) => ({ id: i.to, titulo: i.label, sub: 'Ir para', to: i.to, modulo: 'destinos' as const }));
  const todos = [...clientes, ...grupos, ...destinos];
  const MODULOS: { id: Modulo | 'tudo'; rotulo: string; n: number }[] = [
    { id: 'tudo', rotulo: 'Tudo', n: todos.length },
    { id: 'clientes', rotulo: vocab.pessoa({ plural: true, maiuscula: true }), n: clientes.length },
    { id: 'grupos', rotulo: 'Grupos', n: grupos.length },
    { id: 'destinos', rotulo: 'Destinos', n: destinos.length },
  ];
  const resultados = modulo === 'tudo' ? todos : todos.filter((r) => r.modulo === modulo);
  const mudarModulo = (passo: 1 | -1) => {
    const i = MODULOS.findIndex((m) => m.id === modulo);
    setModulo(MODULOS[(i + passo + MODULOS.length) % MODULOS.length].id);
    setSel(0);
  };
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
              else if (e.key === 'Tab') { e.preventDefault(); mudarModulo(e.shiftKey ? -1 : 1); }
              else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); abrir(resultados[sel]); }
            }} />
        </label>
        <div role="tablist" aria-label="Módulo" className="lg-procura__modulos">
          {MODULOS.map((m) => (
            <button key={m.id} type="button" role="tab" aria-selected={modulo === m.id} tabIndex={-1}
              className="lv-chip" onClick={() => { setModulo(m.id); setSel(0); inputRef.current?.focus(); }}>
              {m.rotulo}{m.n > 0 ? ` ${m.n}` : ''}
            </button>
          ))}
        </div>
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
          <p className="lv-legenda" style={{ padding: 'var(--espaco-8) var(--espaco-12)', margin: 0 }}>Tab muda de módulo; Enter abre o selecionado.</p>
        </div>
      </div>
    </div>
  );
}
