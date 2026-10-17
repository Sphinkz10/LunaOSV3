import { useEffect, type ReactNode } from 'react';
import { useRede } from '@luna/core';
import { Sliders, Warning, WifiSlash, type IconComponent } from '@luna/icons';
import { Botao } from './components';
import { SemPermissao } from './Globais';

/**
 * Estados por lista (X-06, Figma 159:138). Completam os de página: a lista nunca
 * fica em branco nem mostra zeros falsos. A contagem no cabeçalho só aparece
 * quando a lista carregou.
 */
export type EstadoLista<T> =
  | { tipo: 'a-carregar' }
  | { tipo: 'ok'; itens: T[] }
  | { tipo: 'erro'; mensagem: string }
  | { tipo: 'sem-permissao' };

export interface ListaComEstadosProps<T> {
  titulo: string;
  estado: EstadoLista<T>;
  /** Total conhecido (pode ser maior do que os itens mostrados). */
  total?: number;
  /** Há filtros ativos? Muda o vazio de "primeira vez" para "nada com estes filtros". */
  filtrado?: boolean;
  primeiraVez: { icone: IconComponent; titulo: string; texto: string; acao?: { rotulo: string; onClick: () => void } };
  semResultados?: { titulo: string; texto?: string; onLimpar: () => void };
  /** Nome da área para o estado sem permissão. */
  area?: string;
  onPedirAcesso?: () => void;
  onTentar: () => void;
  /** Quando a lista foi carregada (para "de há 12 min" sem rede). */
  carregadaEm?: Date | null;
  /** Ações em fila sem rede, nesta lista. */
  emFila?: number;
  linhasEsqueleto?: number;
  children: (itens: T[]) => ReactNode;
}

function haQuanto(d: Date): string {
  const min = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (min < 1) return 'de agora';
  if (min < 60) return `de há ${min} min`;
  return `de há ${Math.round(min / 60)} h`;
}

export function ListaComEstados<T>({
  titulo, estado, total, filtrado, primeiraVez, semResultados, area, onPedirAcesso, onTentar,
  carregadaEm, emFila = 0, linhasEsqueleto = 3, children,
}: ListaComEstadosProps<T>) {
  const online = useRede((s) => s.online);

  // Uma parte com erro tenta de novo sozinha quando a rede volta
  useEffect(() => {
    if (online && estado.tipo === 'erro') onTentar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  const contagem = estado.tipo === 'ok' ? (total ?? estado.itens.length) : null;
  const direita = estado.tipo === 'a-carregar' ? 'a carregar'
    : !online && carregadaEm ? haQuanto(carregadaEm)
    : estado.tipo === 'sem-permissao' ? '—'
    : contagem != null ? String(contagem) : '—';

  let corpo: ReactNode;
  if (estado.tipo === 'a-carregar') {
    corpo = (
      <div aria-busy="true" aria-label={`A carregar ${titulo}`}>
        {Array.from({ length: linhasEsqueleto }, (_, i) => (
          <div key={i} className="lv-lista__esq">
            <span className="lv-lista__esq-av" /><span className="lv-lista__esq-txt"><span /><span /></span><span className="lv-lista__esq-pill" />
          </div>
        ))}
      </div>
    );
  } else if (estado.tipo === 'sem-permissao') {
    corpo = <SemPermissao area={area ?? titulo} onPedirAcesso={onPedirAcesso} />;
  } else if (estado.tipo === 'erro') {
    corpo = (
      <div className="lv-lista__erro" role="alert">
        <Warning size={18} aria-hidden /><span>{estado.mensagem}</span>
        <button type="button" className="lv-aviso-secao__acao" onClick={onTentar}>Tentar de novo</button>
      </div>
    );
  } else if (estado.itens.length === 0) {
    corpo = filtrado && semResultados ? (
      <div className="lv-lista__vazio" role="status">
        <span className="lv-estado-pagina__icone" aria-hidden><Sliders size={22} /></span>
        <h4 className="lv-lista__vazio-titulo">{semResultados.titulo}</h4>
        {semResultados.texto && <p className="lv-legenda" style={{ margin: 0 }}>{semResultados.texto}</p>}
        <Botao variante="secundario" onClick={semResultados.onLimpar}>Limpar filtros</Botao>
      </div>
    ) : (
      <div className="lv-lista__vazio" role="status">
        <span className="lv-estado-pagina__icone" aria-hidden><primeiraVez.icone size={22} /></span>
        <h4 className="lv-lista__vazio-titulo">{primeiraVez.titulo}</h4>
        <p className="lv-legenda" style={{ margin: 0 }}>{primeiraVez.texto}</p>
        {primeiraVez.acao && <Botao onClick={primeiraVez.acao.onClick}>{primeiraVez.acao.rotulo}</Botao>}
      </div>
    );
  } else {
    corpo = <div className={!online ? 'lv-lista--esbatida' : undefined}>{children(estado.itens)}</div>;
  }

  return (
    <section className="lv-lista" aria-label={titulo}>
      <header className="lv-lista__cabeca">
        <h3 className="lv-titulo-cartao" style={{ fontSize: 18 }}>{titulo}</h3>
        <span className="lv-legenda">{direita}</span>
      </header>
      {!online && estado.tipo === 'ok' && (
        <div className="lv-aviso-secao" role="status">
          <span style={{ display: 'flex', gap: 'var(--espaco-8)', alignItems: 'center' }}>
            <WifiSlash size={16} aria-hidden />
            Sem rede.{emFila > 0 ? ` ${emFila} ${emFila === 1 ? 'alteração' : 'alterações'} em fila.` : ' A mostrar a última versão.'}
          </span>
        </div>
      )}
      {corpo}
    </section>
  );
}
