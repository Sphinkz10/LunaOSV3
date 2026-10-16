import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { Info, type IconComponent } from '@luna/icons';

/**
 * Componentes base da v3 (DS-05, Figma 86:1029–86:1072) e padrões dos ecrãs.
 * Só tokens (v3.css); foco, desativado e a carregar em todos os interativos.
 */

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ── Botão / principal e secundário (86:1029, 86:1032) ─────────────────── */
export type BotaoVariante = 'principal' | 'secundario' | 'no-destaque';
export interface BotaoProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: BotaoVariante;
  icone?: IconComponent;
  aCarregar?: boolean;
  /** Botão principal fixo em baixo (altura 56, largura total). */
  fixo?: boolean;
}
export function Botao({ variante = 'principal', icone: Icone, aCarregar, fixo, className, children, disabled, ...rest }: BotaoProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || aCarregar}
      aria-busy={aCarregar || undefined}
      className={cx('lv-btn', `lv-btn--${variante}`, fixo && 'lv-btn--fixo', className)}
    >
      {aCarregar ? <span className="lv-spinner" aria-hidden /> : Icone && <Icone size={16} aria-hidden />}
      {children}
    </button>
  );
}

/* ── Pill / neutra (86:1035) ───────────────────────────────────────────── */
export function Pill({ children }: { children: ReactNode }) {
  return <span className="lv-pill">{children}</span>;
}

/* ── Chip / ativo e normal (86:1038, 86:1041) ──────────────────────────── */
export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  ativo?: boolean;
  contagem?: number;
}
export function Chip({ ativo, contagem, children, className, ...rest }: ChipProps) {
  return (
    <button type="button" {...rest} aria-pressed={!!ativo} className={cx('lv-chip', className)}>
      {children}{contagem != null && <span aria-label={`${contagem}`}> {contagem}</span>}
    </button>
  );
}

/* ── Avatar / 40 (86:1044) ─────────────────────────────────────────────── */
export function iniciais(nome: string): string {
  return nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toLocaleUpperCase('pt-PT')).join('');
}
export function Avatar({ nome, foto, tamanho = 40 }: { nome: string; foto?: string | null; tamanho?: number }) {
  return (
    <span className="lv-avatar" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.35) }}
      role="img" aria-label={nome}>
      {foto ? <img src={foto} alt="" /> : <span aria-hidden>{iniciais(nome)}</span>}
    </span>
  );
}

/* ── Menu / item ativo (86:1048) ───────────────────────────────────────── */
export function MenuItem({ icone: Icone, ativo, children, href, onClick }: {
  icone?: IconComponent; ativo?: boolean; children: ReactNode; href?: string; onClick?: () => void;
}) {
  const content = <>{Icone && <Icone size={20} aria-hidden />}{children}</>;
  return href
    ? <a className="lv-menu-item" href={href} aria-current={ativo ? 'page' : undefined} onClick={onClick}>{content}</a>
    : <button type="button" className="lv-menu-item" aria-current={ativo ? 'page' : undefined} onClick={onClick}>{content}</button>;
}

/* ── Métrica / destaque (86:1058) ──────────────────────────────────────── */
export function Metrica({ rotulo, icone: Icone, valor, de, legenda }: {
  rotulo: string; icone?: IconComponent; valor: ReactNode; de?: string; legenda?: string;
}) {
  return (
    <section className="lv-metrica" aria-label={rotulo}>
      <div className="lv-metrica__rotulo">{Icone && <Icone size={16} aria-hidden />}{rotulo}</div>
      <div className="lv-metrica__valor">
        <span className="lv-numero-grande">{valor}</span>{de && <span className="lv-metrica__de">{de}</span>}
      </div>
      {legenda && <div className="lv-metrica__legenda">{legenda}</div>}
    </section>
  );
}

/* ── Cartão de número (rótulo, valor, legenda, rodapé alinhado em baixo) ─ */
export function CartaoNumero({ rotulo, valor, legenda, rodape }: {
  rotulo: string; valor: ReactNode; legenda?: string; rodape?: ReactNode;
}) {
  return (
    <section className="lv-cartao-numero" aria-label={rotulo}>
      <span className="lv-sobretitulo">{rotulo}</span>
      <span className="lv-numero-grande">{valor}</span>
      {legenda && <span className="lv-legenda" style={{ color: 'inherit', opacity: 0.85 }}>{legenda}</span>}
      {rodape && <div className="lv-cartao-numero__rodape">{rodape}</div>}
    </section>
  );
}

/* ── Estado (Ativa, Em risco, Em atraso) ───────────────────────────────── */
export type EstadoTom = 'ok' | 'aviso' | 'erro';
export function Estado({ tom, children }: { tom: EstadoTom; children: ReactNode }) {
  return <span className={`lv-estado lv-estado--${tom}`}>{children}</span>;
}

/* ── Linha de tabela (86:1068) ─────────────────────────────────────────── */
export function LinhaTabela({ hora, nome, detalhe, onde, estado }: {
  hora: string; nome: string; detalhe?: string; onde?: string; estado?: { tom: EstadoTom; texto: string };
}) {
  return (
    <div className="lv-linha-tabela" role="row">
      <span className="lv-linha-tabela__hora" role="cell">{hora}</span>
      <span role="cell"><Avatar nome={nome} tamanho={32} /></span>
      <span role="cell" style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span className="lv-linha-tabela__nome">{nome}</span>
        {detalhe && <span className="lv-legenda">{detalhe}</span>}
      </span>
      <span role="cell" className="lv-legenda" style={{ fontSize: 14 }}>{onde}</span>
      <span role="cell">{estado && <Estado tom={estado.tom}>{estado.texto}</Estado>}</span>
    </div>
  );
}

/* ── Nota (86:1072) ────────────────────────────────────────────────────── */
export function Nota({ children, icone: Icone = Info }: { children: ReactNode; icone?: IconComponent }) {
  return <p className="lv-nota"><Icone size={16} aria-hidden />{children}</p>;
}

/* ── Linha de lista com miniatura ──────────────────────────────────────── */
export function LinhaLista({ titulo, legenda, miniatura, fim, onClick }: {
  titulo: string; legenda?: string; miniatura?: string | null; fim?: ReactNode; onClick?: () => void;
}) {
  const body = (
    <>
      {miniatura !== undefined && (miniatura
        ? <img className="lv-linha-lista__mini" src={miniatura} alt="" />
        : <span className="lv-linha-lista__mini" aria-hidden />)}
      <span className="lv-linha-lista__corpo">
        <span className="lv-linha-lista__titulo">{titulo}</span>
        {legenda && <span className="lv-legenda">{legenda}</span>}
      </span>
      {fim}
    </>
  );
  return onClick
    ? <button type="button" className="lv-linha-lista" onClick={onClick}>{body}</button>
    : <div className="lv-linha-lista">{body}</div>;
}

/* ── Cartão de destaque com foto e véu ─────────────────────────────────── */
export function CartaoDestaque({ sobretitulo, titulo, texto, foto, acao }: {
  sobretitulo?: string; titulo: string; texto?: string; foto?: string;
  /** O botão usa sempre cor/acao-no-destaque (no Limão fica escuro). */
  acao?: { rotulo: string; onClick: () => void; aCarregar?: boolean };
}) {
  return (
    <section className="lv-destaque" aria-label={titulo}>
      {foto && <img className="lv-destaque__foto" src={foto} alt="" />}
      {foto && <span className="lv-destaque__veu" aria-hidden />}
      {sobretitulo && <span className="lv-sobretitulo">{sobretitulo}</span>}
      <h2 className="lv-titulo-cartao">{titulo}</h2>
      {texto && <p style={{ margin: 0, opacity: 0.9 }}>{texto}</p>}
      {acao && (
        <Botao variante="no-destaque" className="lv-destaque__acao" onClick={acao.onClick} aCarregar={acao.aCarregar}>
          {acao.rotulo}
        </Botao>
      )}
    </section>
  );
}

/* ── Atalho redondo ─────────────────────────────────────────────────────── */
export function Atalho({ icone: Icone, rotulo, onClick }: { icone: IconComponent; rotulo: string; onClick: () => void }) {
  return (
    <button type="button" className="lv-atalho" onClick={onClick}>
      <span className="lv-atalho__circulo"><Icone size={24} aria-hidden /></span>
      {rotulo}
    </button>
  );
}

/* ── Navegação inferior em pílula ──────────────────────────────────────── */
export interface NavItem { id: string; rotulo: string; icone: IconComponent; ativo?: boolean; onClick: () => void }
export function NavegacaoInferior({ itens, estatica }: { itens: NavItem[]; estatica?: boolean }) {
  return (
    <>
      {!estatica && <div className="lv-esbate-fundo" aria-hidden />}
      <nav className={cx('lv-nav-inferior', estatica && 'lv-nav-inferior--estatica')} aria-label="Navegação principal">
        {itens.map(({ id, rotulo, icone: Icone, ativo, onClick }) => (
          <button key={id} type="button" className="lv-nav-item" aria-current={ativo ? 'page' : undefined} onClick={onClick}>
            <Icone size={22} weight={ativo ? 'fill' : 'regular'} aria-hidden />{rotulo}
          </button>
        ))}
      </nav>
    </>
  );
}

/* ── Botão principal fixo em baixo ─────────────────────────────────────── */
export function BotaoFixo({ estatico, ...props }: BotaoProps & { estatico?: boolean }) {
  return (
    <>
      {!estatico && <div className="lv-esbate-fundo" aria-hidden />}
      <div className={cx('lv-botao-fixo', estatico && 'lv-botao-fixo--estatico')}><Botao {...props} fixo /></div>
    </>
  );
}

/* ── Interruptor ────────────────────────────────────────────────────────── */
export function Interruptor({ ligado, onMudar, rotulo, disabled }: {
  ligado: boolean; onMudar: (v: boolean) => void; rotulo: string; disabled?: boolean;
}) {
  const id = useId();
  return (
    <span className="lv-switch-wrap">
      <button id={id} type="button" role="switch" aria-checked={ligado} disabled={disabled}
        className="lv-switch" onClick={() => onMudar(!ligado)} />
      <label htmlFor={id}>{rotulo}</label>
    </span>
  );
}

/* ── Campo ──────────────────────────────────────────────────────────────── */
export interface CampoProps extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string;
  erro?: string | null;
  ajuda?: string;
}
export function Campo({ rotulo, erro, ajuda, id: idProp, ...rest }: CampoProps) {
  const auto = useId();
  const id = idProp ?? auto;
  const msgId = `${id}-msg`;
  return (
    <div className="lv-campo">
      <label className="lv-campo-rotulo" htmlFor={id}>{rotulo}</label>
      <input id={id} className="lv-campo-input" aria-invalid={erro ? true : undefined}
        aria-describedby={erro || ajuda ? msgId : undefined} {...rest} />
      {erro ? <span id={msgId} className="lv-campo-erro" role="alert">{erro}</span>
        : ajuda && <span id={msgId} className="lv-legenda">{ajuda}</span>}
    </div>
  );
}

/* ── Barra de lotação ───────────────────────────────────────────────────── */
export function BarraLotacao({ ocupados, lotacao, rotulo = 'Lotação' }: { ocupados: number; lotacao: number; rotulo?: string }) {
  const pct = lotacao > 0 ? Math.min(100, Math.round((ocupados / lotacao) * 100)) : 0;
  return (
    <div className="lv-lotacao">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span className="lv-legenda">{rotulo}</span>
        <span className="lv-legenda">{ocupados} de {lotacao}</span>
      </div>
      <div className="lv-lotacao__barra" role="meter" aria-label={rotulo} aria-valuemin={0} aria-valuemax={lotacao} aria-valuenow={ocupados}>
        <div className={cx('lv-lotacao__cheio', pct >= 90 && 'lv-lotacao__cheio--alerta')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/* ── Tema ───────────────────────────────────────────────────────────────── */
export type TemaId = 'oceano' | 'ouro' | 'limao' | 'esboco';
export const TEMAS: TemaId[] = ['oceano', 'ouro', 'limao', 'esboco'];
export function Tema({ tema, children }: { tema: TemaId; children: ReactNode }) {
  return <div className="lv-root" data-tema={tema}>{children}</div>;
}
