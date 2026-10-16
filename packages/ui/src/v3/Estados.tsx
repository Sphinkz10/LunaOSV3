import type { ReactNode } from 'react';
import { ArrowsClockwise, Lock, Users, Warning, WifiSlash, type IconComponent } from '@luna/icons';
import { Botao } from './components';

/**
 * Estados de página (X-02, Figma 61:2). O mesmo desenho para quando não há
 * dados, há um erro, não há rede ou a pessoa não tem permissão. Nenhum ecrã
 * fica em branco e nunca se mostram zeros falsos.
 */
export type TipoEstado = 'vazio' | 'erro' | 'sem-rede' | 'sem-permissao' | 'desatualizado' | 'falha-parcial';

const ICONE: Record<TipoEstado, IconComponent> = {
  vazio: Users, erro: Warning, 'sem-rede': WifiSlash, 'sem-permissao': Lock,
  desatualizado: ArrowsClockwise, 'falha-parcial': Warning,
};

export interface EstadoPaginaProps {
  tipo: TipoEstado;
  titulo: string;
  texto?: string;
  /** Ícone do conteúdo (no vazio, o do que falta: clientes, aulas…). */
  icone?: IconComponent;
  /** Ação principal (vazio: criar) ou secundária (erro: tentar de novo). */
  acao?: { rotulo: string; onClick: () => void; aCarregar?: boolean };
  /** Linha de estado em baixo (sem rede: "A aguardar rede"). */
  nota?: string;
  children?: ReactNode;
}

export function EstadoPagina({ tipo, titulo, texto, icone, acao, nota, children }: EstadoPaginaProps) {
  const Icone = icone ?? ICONE[tipo];
  const alerta = tipo === 'erro' || tipo === 'falha-parcial';
  return (
    <section className={`lv-estado-pagina lv-estado-pagina--${tipo}`} role={alerta ? 'alert' : 'status'} aria-label={titulo}>
      <span className="lv-estado-pagina__icone" aria-hidden><Icone size={24} /></span>
      <h3 className="lv-estado-pagina__titulo">{titulo}</h3>
      {texto && <p className="lv-estado-pagina__texto">{texto}</p>}
      {acao && (
        <Botao variante={tipo === 'vazio' ? 'principal' : 'secundario'} onClick={acao.onClick} aCarregar={acao.aCarregar}>
          {acao.rotulo}
        </Botao>
      )}
      {nota && <span className="lv-estado lv-estado--aviso">{nota}</span>}
      {children}
    </section>
  );
}

/** A carregar: esqueleto com a forma do conteúdo, nunca um ecrã vazio. */
export function Esqueleto({ linhas = 6, rotulo = 'A carregar' }: { linhas?: number; rotulo?: string }) {
  const larguras = ['60%', '100%', '85%', '70%', '100%', '40%'];
  return (
    <div className="lv-esqueleto" role="status" aria-busy="true" aria-label={rotulo}>
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} className="lv-esqueleto__linha" style={{ width: larguras[i % larguras.length] }} />
      ))}
    </div>
  );
}

/** Aviso fino no topo de uma secção: dados desatualizados ou parte que falhou. */
export function AvisoSecao({ tipo, texto, acao }: {
  tipo: 'desatualizado' | 'falha-parcial'; texto: string; acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <div className={`lv-aviso-secao lv-aviso-secao--${tipo}`} role="status">
      <span>{texto}</span>
      {acao && <button type="button" className="lv-aviso-secao__acao" onClick={acao.onClick}>{acao.rotulo}</button>}
    </div>
  );
}
