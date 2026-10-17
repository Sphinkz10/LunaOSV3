import { useEffect, useState } from 'react';
import { useBlocker, useLocation, useNavigate } from 'react-router-dom';
import { toast, useGravacoesIncertas, type ConflitoError } from '@luna/core';
import { Botao, Janela } from '@luna/ui/v3';
import { ArrowLeft, WifiSlash } from '@luna/icons';

/**
 * Estados de todos os ecrãs (X-02, Figma 181:85). A sessão expirada abre por
 * cima do ecrã (SessaoExpirada), por isso nada do que estava escrito se perde.
 */

/** "Não sabemos se gravou": Verificar e retomar pergunta ao servidor antes de repetir. */
export function GravacoesPorConfirmar() {
  const itens = useGravacoesIncertas((s) => s.itens);
  const [aVerificar, setAVerificar] = useState<number | null>(null);
  if (itens.length === 0) return null;
  const retomar = async (id: number, fn: () => Promise<void>) => {
    setAVerificar(id);
    try { await fn(); useGravacoesIncertas.getState().tirar(id); toast({ variant: 'success', title: 'Verificado e gravado' }); }
    catch (e) { toast({ variant: 'danger', title: 'Ainda não deu', description: e instanceof Error ? e.message : undefined }); }
    finally { setAVerificar(null); }
  };
  return (
    <div className="lg-incertas" role="status">
      {itens.map((g) => (
        <div key={g.id} className="lg-incertas__item">
          <WifiSlash size={18} aria-hidden />
          <span className="lv-linha-lista__corpo">
            <b>Não sabemos se gravou</b>
            <span className="lv-legenda">A rede caiu ao guardar {g.rotulo}.</span>
          </span>
          <Botao variante="secundario" aCarregar={aVerificar === g.id} onClick={() => void retomar(g.id, g.retomar)}>Verificar e retomar</Botao>
        </div>
      ))}
    </div>
  );
}

/**
 * Sair sem guardar: só aparece quando algo mudou. Bloqueia a navegação dentro
 * da app e avisa o browser ao fechar o separador.
 */
export function SairSemGuardar({ sujo, resumo, onGuardar }: {
  sujo: boolean; resumo?: string; onGuardar?: () => Promise<boolean>;
}) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => sujo && currentLocation.pathname !== nextLocation.pathname);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (!sujo) return;
    const antes = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', antes);
    return () => window.removeEventListener('beforeunload', antes);
  }, [sujo]);
  const aberta = blocker.state === 'blocked';
  return (
    <Janela aberta={aberta} onFechar={() => blocker.reset?.()} titulo="Sair sem guardar?" sub={resumo ?? 'Há alterações por guardar.'}
      acoes={<>
        <Botao variante="secundario" onClick={() => blocker.proceed?.()}>Sair</Botao>
        {onGuardar && (
          <Botao aCarregar={aGravar} onClick={() => {
            setAGravar(true);
            void onGuardar().then((ok) => { if (ok) blocker.proceed?.(); else blocker.reset?.(); }).finally(() => setAGravar(false));
          }}>Guardar</Botao>
        )}
      </>} />
  );
}

/**
 * Alterado por outra pessoa: os dois valores lado a lado; nada se perde sem
 * escolha. Devolve "deles" (aceita a versão do servidor) ou "meu" (grava a minha).
 */
export function JanelaConflito({ conflito, coisa, onEscolher }: {
  conflito: ConflitoError | null; coisa: string; onEscolher: (qual: 'deles' | 'meu') => void;
}) {
  const quem = conflito?.quem ?? 'Outra pessoa';
  const fmt = (v: unknown) => (v == null || v === '' ? '—' : String(v));
  return (
    <Janela aberta={!!conflito} onFechar={() => onEscolher('deles')} titulo={`${quem} mudou ${coisa}`}
      sub="Enquanto editavas. Escolhe o que fica."
      acoes={<>
        <Botao variante="secundario" onClick={() => onEscolher('deles')}>Usar a {quem === 'Outra pessoa' ? 'versão nova' : `de ${quem.split(' ')[0]}`}</Botao>
        <Botao onClick={() => onEscolher('meu')}>Manter a minha</Botao>
      </>}>
      <div className="lg-conflito">
        {conflito?.diferencas.map((d) => (
          <div key={d.campo} className="lg-conflito__linha">
            <span className="lg-conflito__valor"><span className="lv-legenda">{quem}</span>{d.rotulo} {fmt(d.deles)}</span>
            <span className="lg-conflito__valor lg-conflito__valor--meu"><span className="lv-legenda">Tu</span>{d.rotulo} {fmt(d.meu)}</span>
          </div>
        ))}
      </div>
    </Janela>
  );
}

/* ── Voltar a… ──────────────────────────────────────────────────────────── */
export interface Origem { rotulo: string; href: string }

/** Estado de navegação para "Voltar a…": o nome deste sítio e os filtros (search) atuais. */
export function useDeAqui(rotulo: string): { state: { voltar: Origem } } {
  const { pathname, search } = useLocation();
  return { state: { voltar: { rotulo, href: pathname + search } } };
}

/** Ligação "Voltar a <sítio anterior>" com os filtros que lá estavam; sem origem, usa o destino por omissão. */
export function VoltarA({ omissao }: { omissao: Origem }) {
  const navigate = useNavigate();
  const { state } = useLocation() as { state: { voltar?: Origem } | null };
  const o = state?.voltar ?? omissao;
  return (
    <button type="button" className="lg-voltar" onClick={() => navigate(o.href)}>
      <ArrowLeft size={16} aria-hidden />Voltar {/^(a|à|ao|aos|às) /i.test(o.rotulo) ? o.rotulo : `a ${o.rotulo}`}
    </button>
  );
}
