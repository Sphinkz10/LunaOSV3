import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { contarNaoLidas, fetchNotificacoes, marcarLidas, useAuthStore, type Notificacao } from '@luna/core';
import { Bell } from '@luna/icons';
import { Botao, Esqueleto, EstadoPagina, PainelLateral } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';

/** Sino e painel de notificações (P-03): por ler em destaque, marcar tudo como lido. */
export function Notificacoes() {
  const navigate = useNavigate();
  const tz = useAuthStore((s) => s.scope?.timezone ?? 'Europe/Lisbon');
  const [aberto, setAberto] = useState(false);
  const [naoLidas, setNaoLidas] = useState<number | null>(null);
  const [lista, setLista] = useState<Notificacao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const contar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void contarNaoLidas(client).then(setNaoLidas).catch(() => setNaoLidas(null));
  }, []);
  useEffect(() => { contar(); const t = setInterval(contar, 60_000); return () => clearInterval(t); }, [contar]);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setLista(null); setErro(null);
    void fetchNotificacoes(client).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, []);
  useEffect(() => { if (aberto) carregar(); }, [aberto, carregar]);

  const lerTudo = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    await marcarLidas(client);
    setNaoLidas(0);
    setLista((l) => l?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
  };

  const abrir = async (n: Notificacao) => {
    const client = getSupabaseClient();
    if (client && !n.read_at) { await marcarLidas(client, [n.id]).catch(() => {}); contar(); }
    if (n.action_url?.startsWith('/')) { setAberto(false); navigate(n.action_url); }
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz });

  return (
    <>
      <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" style={{ position: 'relative' }}
        aria-label={naoLidas ? `Notificações, ${naoLidas} por ler` : 'Notificações'} onClick={() => setAberto(true)}>
        <Bell size={20} aria-hidden />
        {!!naoLidas && <span aria-hidden style={{ position: 'absolute', top: 10, right: 11, width: 8, height: 8, borderRadius: 'var(--raio-pilula)', background: 'var(--cor-acao)' }} />}
      </button>
      <PainelLateral aberta={aberto} onFechar={() => setAberto(false)} titulo="Notificações"
        acoes={lista && lista.some((n) => !n.read_at) ? <Botao variante="secundario" onClick={() => void lerTudo()}>Marcar tudo como lido</Botao> : undefined}>
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !lista ? <Esqueleto linhas={4} />
          : lista.length === 0 ? <EstadoPagina tipo="vazio" icone={Bell} titulo="Sem notificações" texto="Os avisos de marcações e da equipa aparecem aqui." />
          : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--espaco-4)' }}>
              {lista.map((n) => (
                <li key={n.id}>
                  <button type="button" className="lv-linha-lista" onClick={() => void abrir(n)}
                    style={n.read_at ? undefined : { background: 'var(--cor-selecao)' }}>
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{n.title}</span>
                      {n.body && <span className="lv-legenda">{n.body}</span>}
                      <span className="lv-legenda">{fmt(n.created_at)}{n.read_at ? '' : ' · por ler'}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </PainelLateral>
    </>
  );
}
