import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAvisos, useConfirmacoes, useRede, type Aviso } from '@luna/core';
import { CheckCircle, DotsThree, Lock, MapPin, ShieldCheck, Warning, WifiSlash, X, type IconComponent } from '@luna/icons';
import { Botao, Campo } from './components';

/**
 * Peças globais (P-01 a P-06, Figma 135:2 e 139:300). Feitas uma vez e usadas
 * por todos os ecrãs. No telemóvel, janelas e painéis abrem como folha de baixo.
 */

/** Telemóvel/tablet estreito (≤ 960 px). */
export function useEstreito(): boolean {
  const q = '(max-width: 960px)';
  const [v, setV] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return v;
}

/* ── Aviso curto ────────────────────────────────────────────────────────── */
const ICONE_AVISO: Record<Aviso['tom'], IconComponent> = { ok: CheckCircle, erro: Warning, info: CheckCircle, 'sem-rede': WifiSlash };

function AvisoItem({ a }: { a: Aviso }) {
  const fechar = useAvisos((s) => s.fechar);
  useEffect(() => {
    const t = setTimeout(() => fechar(a.id), a.duracaoMs);
    return () => clearTimeout(t);
  }, [a, fechar]);
  const Icone = ICONE_AVISO[a.tom];
  return (
    <div className={`lv-aviso lv-aviso--${a.tom}`} role={a.tom === 'erro' ? 'alert' : 'status'}>
      <Icone size={18} aria-hidden />
      <span className="lv-aviso__texto">{a.texto}</span>
      {a.acao && <button type="button" className="lv-aviso__acao" onClick={a.acao.fn}>{a.acao.rotulo}</button>}
    </div>
  );
}

/** Pilha de avisos (montada uma vez na app). Fica por cima do menu inferior. */
export function Avisos() {
  const itens = useAvisos((s) => s.itens);
  return <div className="lv-avisos" aria-live="polite">{itens.map((a) => <AvisoItem key={a.id} a={a} />)}</div>;
}

/* ── Janela: diálogo no computador, folha de baixo no telemóvel ────────── */
export interface JanelaProps {
  aberta: boolean;
  onFechar: () => void;
  titulo: string;
  sub?: string;
  children?: ReactNode;
  acoes?: ReactNode;
  /** 'dialogo' (por omissão) ou 'painel' lateral de 440 px. */
  forma?: 'dialogo' | 'painel';
  rotuloFechar?: string;
}

export function Janela({ aberta, onFechar, titulo, sub, children, acoes, forma = 'dialogo', rotuloFechar = 'Fechar' }: JanelaProps) {
  const estreito = useEstreito();
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  useEffect(() => {
    if (!aberta) return;
    const anterior = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const foco = ref.current?.querySelector<HTMLElement>('[data-autofoco], input, select, textarea, button');
      foco?.focus();
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.hasAttribute('disabled'));
        if (!f.length) return;
        const [a, z] = [f[0], f[f.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); anterior?.focus?.(); };
  }, [aberta, onFechar]);
  if (!aberta) return null;
  const tipo = estreito ? 'folha' : forma;
  return createPortal(
    <div className={`lv-janela-fundo lv-janela-fundo--${tipo}`} role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div ref={ref} className={`lv-janela lv-janela--${tipo}`} role="dialog" aria-modal="true" aria-labelledby={tituloId}>
        {tipo === 'folha' && <span className="lv-janela__pega" aria-hidden />}
        <div className="lv-janela__cabeca">
          <div>
            <h2 id={tituloId} className="lv-titulo-cartao">{titulo}</h2>
            {sub && <p className="lv-legenda" style={{ margin: 'var(--espaco-4) 0 0' }}>{sub}</p>}
          </div>
          <button type="button" className="lv-janela__fechar" aria-label={rotuloFechar} onClick={onFechar}><X size={18} aria-hidden /></button>
        </div>
        {children && <div className="lv-janela__corpo">{children}</div>}
        {acoes && <div className="lv-janela__acoes">{acoes}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Painel lateral (X-05: gaveta de 440 px por cima do conteúdo). */
export function PainelLateral(props: Omit<JanelaProps, 'forma'>) {
  return <Janela {...props} forma="painel" />;
}

/* ── Confirmação destrutiva ─────────────────────────────────────────────── */
export interface Efeito { icone?: IconComponent; texto: ReactNode }
export interface ConfirmarDestrutivoProps {
  aberta: boolean;
  titulo: string;
  texto?: string;
  /** O efeito em números (inscritos avisados, créditos, lista de espera…). */
  efeitos?: Efeito[];
  /** O verbo no botão (Arquivar, Cancelar aula), nunca só OK. */
  verbo: string;
  /** O que fica (Manter aula), por omissão "Cancelar". */
  manter?: string;
  aCarregar?: boolean;
  erro?: string | null;
  onConfirmar: () => void;
  onFechar: () => void;
  children?: ReactNode;
}

export function ConfirmarDestrutivo({
  aberta, titulo, texto, efeitos, verbo, manter = 'Cancelar', aCarregar, erro, onConfirmar, onFechar, children,
}: ConfirmarDestrutivoProps) {
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo={titulo} rotuloFechar={manter}
      acoes={<>
        <Botao variante="secundario" onClick={onFechar} disabled={aCarregar}>{manter}</Botao>
        <button type="button" className="lv-btn lv-btn--perigo" onClick={onConfirmar} disabled={aCarregar} aria-busy={aCarregar || undefined}>
          {aCarregar && <span className="lv-spinner" aria-hidden />}{verbo}
        </button>
      </>}>
      <div className="lv-confirmar">
        {texto && <p style={{ margin: 0 }} className="lv-legenda">{texto}</p>}
        {children}
        {efeitos && efeitos.length > 0 && (
          <ul className="lv-confirmar__efeitos">
            {efeitos.map((ef, i) => {
              const Icone = ef.icone;
              return <li key={i}>{Icone && <Icone size={16} aria-hidden />}<span>{ef.texto}</span></li>;
            })}
          </ul>
        )}
        {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
      </div>
    </Janela>
  );
}

/* ── Menu de ações ──────────────────────────────────────────────────────── */
export interface AcaoMenu { rotulo: string; icone?: IconComponent; contagem?: number; perigo?: boolean; onClick: () => void; disabled?: boolean }

export function MenuAcoes({ rotulo = 'Mais ações', acoes }: { rotulo?: string; acoes: AcaoMenu[] }) {
  const [aberto, setAberto] = useState(false);
  const estreito = useEstreito();
  const ref = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!aberto || estreito) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    document.addEventListener('mousedown', fora);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(), 0);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto, estreito]);

  const itens = (
    <div id={menuId} role="menu" tabIndex={-1} className="lv-menu" aria-label={rotulo}
      onKeyDown={(e) => {
        const its = [...(e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'))];
        const i = its.indexOf(document.activeElement as HTMLElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); its[(i + 1) % its.length]?.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); its[(i - 1 + its.length) % its.length]?.focus(); }
        if (e.key === 'Escape') setAberto(false);
      }}>
      {acoes.map((a) => {
        const Icone = a.icone;
        return (
          <button key={a.rotulo} type="button" role="menuitem" disabled={a.disabled}
            className={`lv-menu__item${a.perigo ? ' lv-menu__item--perigo' : ''}`}
            onClick={() => { setAberto(false); a.onClick(); }}>
            {Icone && <Icone size={18} aria-hidden />}<span>{a.rotulo}</span>
            {a.contagem != null && <span className="lv-menu__conta">{a.contagem}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="lv-menu-wrap" ref={ref}>
      <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label={rotulo}
        aria-haspopup="menu" aria-expanded={aberto} aria-controls={aberto ? menuId : undefined}
        onClick={() => setAberto((v) => !v)}>
        <DotsThree size={18} aria-hidden />
      </button>
      {aberto && (estreito
        ? <Janela aberta onFechar={() => setAberto(false)} titulo={rotulo}>{itens}</Janela>
        : <div className="lv-menu-pop">{itens}</div>)}
    </div>
  );
}

/* ── Seletor de unidade ─────────────────────────────────────────────────── */
export interface UnidadeOpcao { id: string; nome: string; agora?: number | null }
export function SeletorUnidade({ unidades, valor, onMudar, todas = true }: {
  unidades: UnidadeOpcao[]; valor: string | null; onMudar: (id: string | null) => void; todas?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Unidade" className="lv-menu">
      {unidades.map((u) => (
        <button key={u.id} type="button" role="radio" aria-checked={valor === u.id} className="lv-menu__item" onClick={() => onMudar(u.id)}>
          <MapPin size={18} aria-hidden /><span>{u.nome}</span>
          {u.agora != null && <span className="lv-menu__conta">{u.agora} agora</span>}
        </button>
      ))}
      {todas && (
        <button type="button" role="radio" aria-checked={valor === null} className="lv-menu__item" onClick={() => onMudar(null)}>
          <span>Todas as unidades</span>
        </button>
      )}
    </div>
  );
}

/* ── Sessão terminada ───────────────────────────────────────────────────── */
/** Por segurança, entra outra vez. O que estavas a fazer fica guardado (o ecrã não muda). */
export function SessaoTerminada({ aberta, children }: { aberta: boolean; children: ReactNode }) {
  if (!aberta) return null;
  return createPortal(
    <div className="lv-janela-fundo lv-janela-fundo--dialogo">
      <div className="lv-janela lv-janela--dialogo" role="alertdialog" aria-modal="true" aria-labelledby="lv-sessao-titulo">
        <span className="lv-estado-pagina__icone" aria-hidden><Lock size={22} /></span>
        <h2 id="lv-sessao-titulo" className="lv-titulo-cartao">A sessão terminou</h2>
        <p className="lv-legenda" style={{ margin: 0 }}>Por segurança, entra outra vez. O que estavas a fazer ficou guardado.</p>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/* ── Sem permissão ──────────────────────────────────────────────────────── */
export function SemPermissao({ area, onVoltar, onPedirAcesso }: { area: string; onVoltar?: () => void; onPedirAcesso?: () => void }) {
  return (
    <section className="lv-estado-pagina" role="status" aria-label={`Sem acesso a ${area}`}>
      <span className="lv-estado-pagina__icone" aria-hidden><ShieldCheck size={24} /></span>
      <h3 className="lv-estado-pagina__titulo">Não tens acesso a {area}</h3>
      <p className="lv-estado-pagina__texto">Os números não aparecem para não mostrar valores errados.</p>
      <div style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        {onVoltar && <Botao variante="secundario" onClick={onVoltar}>Voltar</Botao>}
        {onPedirAcesso && <Botao onClick={onPedirAcesso}>Pedir acesso</Botao>}
      </div>
    </section>
  );
}

/* ── Sem rede ───────────────────────────────────────────────────────────── */
/** Barra no topo: sem rede, conta as alterações à espera de enviar. */
export function BarraSemRede() {
  const online = useRede((s) => s.online);
  const pendentes = useRede((s) => s.pendentes);
  if (online) return null;
  return (
    <div className="lv-sem-rede" role="status">
      <WifiSlash size={16} aria-hidden />
      Sem rede.{pendentes > 0 ? ` ${pendentes} ${pendentes === 1 ? 'alteração' : 'alterações'} à espera de enviar.` : ' O que fizeres fica guardado neste aparelho.'}
    </div>
  );
}

/* ── Anfitrião das confirmações (montado uma vez na app) ────────────────── */
export function ConfirmarHost() {
  const pedido = useConfirmacoes((s) => s.pedido);
  const fechar = useConfirmacoes((s) => s.fechar);
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  useEffect(() => { setErro(null); setACarregar(false); setMotivo(''); }, [pedido]);
  if (!pedido) return null;
  const confirmar = async () => {
    setACarregar(true); setErro(null);
    try {
      await pedido.acao(motivo.trim() || undefined);
      fechar(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível concluir.');
      setACarregar(false);
    }
  };
  return (
    <ConfirmarDestrutivo aberta titulo={pedido.titulo} texto={pedido.texto} verbo={pedido.verbo} manter={pedido.manter}
      efeitos={pedido.efeitos?.map((t) => ({ texto: t }))} aCarregar={aCarregar} erro={erro}
      onConfirmar={() => void confirmar()} onFechar={() => { if (!aCarregar) fechar(false); }}>
      {pedido.motivo && (
        <Campo rotulo={pedido.motivo.rotulo} placeholder={pedido.motivo.placeholder} value={motivo}
          onChange={(e) => setMotivo(e.target.value)} />
      )}
    </ConfirmarDestrutivo>
  );
}
