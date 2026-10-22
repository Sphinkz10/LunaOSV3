import { useEffect, useState } from 'react';
import { conversaoTrial, fetchMetricasAtivacao, souEquipaLunaOS, type MetricasAtivacao } from '@luna/core';
import { Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { ChartLineUp } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { getSupabaseClient } from '../lib/supabase';

const n1 = (v: number | null | undefined, suf = '') => (v == null ? 'Sem dados suficientes' : `${v.toLocaleString('pt-PT', { maximumFractionDigits: 1 })}${suf}`);

/**
 * Painel interno da LunaOS (tarefa 28): as métricas do portão da F1a e do
 * modelo de negócio. Só a equipa da LunaOS o abre; não está no menu e nunca
 * aparece aos clientes. Números baixos aparecem como "sem dados suficientes".
 */
export function MetricasInternas() {
  const [pode, setPode] = useState<boolean | null>(null);
  const [m, setM] = useState<MetricasAtivacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void souEquipaLunaOS(client).then((sim) => {
      setPode(sim);
      if (sim) void fetchMetricasAtivacao(client, 8).then(setM).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    });
  }, []);
  if (pode === false) return <CoachShell headStrong="Métricas" legado={false}><div className="lv-root"><EstadoPagina tipo="vazio" icone={ChartLineUp} titulo="Página interna" texto="Só a equipa da LunaOS vê esta página." /></div></CoachShell>;
  const ultima = m?.semanas[m.semanas.length - 1];
  const maxPt = Math.max(1, ...(m?.semanas.map((s) => s.pt_ativos) ?? [1]));
  return (
    <CoachShell headStrong="Ativação e retenção" headSub="Painel interno da LunaOS" legado={false}>
      <div className="lv-root lg-vivo">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !m ? <Esqueleto /> : (
          <>
            <div className="lg-hoje__contagens">
              <div className="lg-contagem lg-contagem--acao"><span className="lg-contagem__rotulo">PT ativos esta semana</span><span className="lv-numero-grande">{ultima?.pt_ativos ?? 0}</span>
                <span className="lg-contagem__legenda">{ultima?.clientes_por_pt != null ? `${n1(ultima.clientes_por_pt)} clientes ativos na app por PT` : 'Sem clientes ativos na app'}</span></div>
              <div className="lg-contagem"><span className="lg-contagem__rotulo">Até ao primeiro plano</span><span className="lv-numero-grande">{m.dias_ate_primeiro_plano == null ? '—' : `${n1(m.dias_ate_primeiro_plano)} d`}</span>
                <span className="lg-contagem__legenda">mediana · {m.organizacoes_com_plano} de {m.organizacoes} organizações já atribuíram</span></div>
              <div className="lg-contagem"><span className="lg-contagem__rotulo">Retenção na app a 4 semanas</span><span className="lv-numero-grande">{m.retencao_4_semanas == null ? '—' : `${m.retencao_4_semanas}%`}</span>
                <span className="lg-contagem__legenda">{m.coorte_retencao ? `de ${m.coorte_retencao} clientes que entraram` : 'Sem dados suficientes'}</span></div>
              <div className="lg-contagem"><span className="lg-contagem__rotulo">Conversão do experimental</span><span className="lv-numero-grande">{conversaoTrial(m) == null ? '—' : `${conversaoTrial(m)}%`}</span>
                <span className="lg-contagem__legenda">{m.trial_convertidos} convertidos · {m.trial_expirados} expirados · {m.so_leitura} em só leitura</span></div>
            </div>
            <div className="lg-hoje__grelha">
              <section className="lv-lista" aria-label="PT ativos por semana">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>PT ativos por semana</h2>
                <div className="lg-ficha__barras" role="img" aria-label={`Por semana: ${m.semanas.map((s) => s.pt_ativos).join(', ')}`}>
                  {m.semanas.map((s, i) => (
                    <span key={s.semana} className={i === m.semanas.length - 1 ? 'lg-ficha__barra lg-ficha__barra--agora' : 'lg-ficha__barra'}>
                      <b>{s.pt_ativos}</b><i style={{ height: 6 + Math.round((s.pt_ativos / maxPt) * 60) }} />
                    </span>
                  ))}
                </div>
                <p className="lv-legenda" style={{ margin: 0 }}>Semanas desde {new Date(m.semanas[0]?.semana ?? Date.now()).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}. Ativo: juntou cliente, atribuiu plano, criou treino ou deu sessão.</p>
              </section>
              <aside className="lv-lista" aria-label="Portão da F1a">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Portão da F1a</h2>
                <dl className="lg-conta__dados">
                  <dt>Sessões ao vivo (8 semanas)</dt><dd>{m.sessoes_ao_vivo}</dd>
                  <dt>Clientes ativos na app</dt><dd>{ultima?.clientes_app ?? 0} esta semana</dd>
                  <dt>Ligações atleta–treinador</dt><dd>{m.ligacoes_total} · {m.ligacoes_vindas_do_atleta} começadas pelo atleta</dd>
                </dl>
                <Nota>4 semanas de uso real, T4 e T7 em 3 cliques ou menos e zero dados perdidos sem rede verificam-se no piloto. Quem recusou a análise conta só nos totais.</Nota>
              </aside>
            </div>
          </>
        )}
      </div>
    </CoachShell>
  );
}
