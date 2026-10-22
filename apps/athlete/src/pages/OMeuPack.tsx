import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { euros, fetchOQueTenho, rotuloMetodo, type MeuItem, type MeuPagamento } from '@luna/core';
import { Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { ArrowLeft, Info, Wallet } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../vocab';

const dia = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });

/**
 * C-22 · O meu pack: o pack, as sessões que faltam, a mensalidade e os
 * pagamentos que o PT registou (sem as notas internas). As faturas vêm do
 * faturador do PT; o LunaOS não cobra.
 */
export function OMeuPack() {
  const navigate = useNavigate();
  const [d, setD] = useState<{ itens: MeuItem[]; pagamentos: MeuPagamento[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (client) void fetchOQueTenho(client).then(setD).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, []);
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => navigate('/eu')}><ArrowLeft size={18} aria-hidden /></button>
        <div style={{ flex: 1 }}><span className="lv-legenda">Eu</span><h1 className="lc-cabeca__titulo">O meu pack</h1></div>
      </header>
      {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !d ? <Esqueleto /> : d.itens.length === 0 && d.pagamentos.length === 0
        ? <EstadoPagina tipo="vazio" icone={Wallet} titulo="Ainda nada" texto={`Quando o teu ${t('responsavel')} te vender um pack ou uma mensalidade, aparece aqui.`} />
        : (
          <>
            {d.itens.map((i, k) => (
              <section key={k} className={`lc-cartao${i.tipo === 'pack' ? ' lc-cartao--claro' : ''}`} aria-label={i.nome}>
                <span className="lc-par" style={{ justifyContent: 'space-between' }}>
                  <b>{i.nome}</b>
                  {i.tipo === 'pack' && <span><span className="lv-numero-grande">{i.restam}</span> por usar</span>}
                </span>
                <span className="lv-legenda">
                  {[i.treinador && `Com ${i.treinador}`, i.tipo === 'pack' && i.validoAte && `válido até ${dia(i.validoAte)}`,
                    i.tipo === 'mensalidade' && `${euros(i.precoCent)} por mês${i.total ? ` · ${i.total} por semana` : ''}`,
                    i.pagoCent != null && i.tipo !== 'mensalidade' && `pago ${euros(i.pagoCent)} de ${euros(i.precoCent)}`].filter(Boolean).join(' · ')}
                </span>
              </section>
            ))}
            {d.pagamentos.length > 0 && (
              <>
                <h2 className="lv-sobretitulo">Pagamentos registados</h2>
                <section className="lc-lista" aria-label="Pagamentos">
                  {d.pagamentos.map((p, k) => (
                    <div key={k} className="lc-lista__linha" style={{ cursor: 'default' }}>
                      <span className="lc-lista__icone"><Wallet size={18} aria-hidden /></span>
                      <span className="lv-linha-lista__corpo">
                        <span className="lv-linha-lista__titulo">{euros(p.valorCent)} · {rotuloMetodo(p.metodo)}</span>
                        <span className="lv-legenda">{[p.alvo + (p.periodo ? ` ${p.periodo}` : ''), dia(p.pagoEm), p.fatura && `fatura ${p.fatura}`, p.corrigido && 'corrigido'].filter(Boolean).join(' · ')}</span>
                      </span>
                    </div>
                  ))}
                </section>
              </>
            )}
            <Nota icone={Info}>Registados pelo teu {t('responsavel')}. As faturas vêm do faturador dele.</Nota>
          </>
        )}
    </main>
  );
}
