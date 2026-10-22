import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { euros, exportarNegocio, fetchDinheiro, rotuloMetodo, toast, type Devedor, type Dinheiro as DadosDinheiro } from '@luna/core';
import { Avatar, Botao, Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { ShieldCheck, UploadSimple, Wallet } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { RegistarPagamento, type AlvoPagamento } from './Packs';

const descarregar = (nome: string, texto: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + texto], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/**
 * O meu dinheiro (G-01 do PT, tarefa 29 parte B): recebido no mês, quem me
 * deve e packs a acabar. Só lê os registos de P-14: não é contabilidade nem
 * faturação. Exportar funciona também em só leitura.
 */
export function Dinheiro() {
  const scope = useScope();
  const navigate = useNavigate();
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [d, setD] = useState<DadosDinheiro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [registar, setRegistar] = useState<AlvoPagamento | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchDinheiro(client, scope, `${mes}-01`).then(setD).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope, mes]);
  useEffect(() => carregar(), [carregar]);
  const exportar = async (soMes: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      const e = await exportarNegocio(client, scope);
      if (soMes) {
        const [cab, ...linhas] = e.pagamentos.split('\n');
        descarregar(`pagamentos-${mes}.csv`, [cab, ...linhas.filter((l) => l.includes(`"${mes}-`))].join('\n'));
      } else {
        (['clientes', 'planos', 'sessoes', 'pagamentos'] as const).forEach((k) => e[k] && descarregar(`${k}.csv`, e[k]));
      }
      toast({ variant: 'success', title: 'Exportado' });
    } catch (err) { toast({ variant: 'danger', title: 'Não foi possível exportar', description: err instanceof Error ? err.message : undefined }); }
  };
  const nomeMes = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' });
  const deIcone = (x: Devedor) => (x.tipo === 'mensalidade' ? 'Mensalidade' : x.tipo === 'avulsa' ? 'Avulsa' : x.tipo === 'pack' ? 'Pack' : 'Programa');
  return (
    <CoachShell headStrong="O meu dinheiro" headSub={nomeMes} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)', alignItems: 'center' }}>
        <input className="lv-campo-input" type="month" aria-label="Mês" value={mes} max={new Date().toISOString().slice(0, 7)} onChange={(e) => e.target.value && setMes(e.target.value)} style={{ width: 'auto' }} />
        <Botao variante="secundario" onClick={() => navigate('/business/packs')}>Planos e preços</Botao>
        <Botao variante="secundario" icone={UploadSimple} onClick={() => void exportar(true)}>Exportar o mês</Botao>
      </span>}>
      <div className="lv-root lg-vivo">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !d ? <Esqueleto /> : (
          <>
            <div className="lg-hoje__contagens">
              <div className="lg-contagem lg-contagem--acao"><span className="lg-contagem__rotulo"><Wallet size={16} aria-hidden />Recebido</span><span className="lv-numero-grande">{euros(d.recebido)}</span>
                <span className="lg-contagem__legenda">{d.registos} registos · {Object.entries(d.por_metodo).map(([m, v]) => `${rotuloMetodo(m)} ${euros(v)}`).join(' · ') || 'sem registos'}</span></div>
              <div className={`lg-contagem${d.por_receber ? ' lg-contagem--aviso' : ''}`}><span className="lg-contagem__rotulo">Por receber</span><span className="lv-numero-grande">{euros(d.por_receber)}</span>
                <span className="lg-contagem__legenda">{d.quem_deve.length} {d.quem_deve.length === 1 ? 'item' : 'itens'} em "Quem me deve"</span></div>
              <div className="lg-contagem"><span className="lg-contagem__rotulo">Packs a acabar</span><span className="lv-numero-grande">{d.a_acabar.length}</span>
                <span className="lg-contagem__legenda">2 sessões ou menos, ou validade em 7 dias</span></div>
            </div>
            <div className="lg-hoje__grelha">
              <section className="lv-lista" aria-label="Quem me deve">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Quem me deve</h2>
                {d.quem_deve.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ninguém. Está tudo registado.</p> : d.quem_deve.map((x, i) => (
                  <button key={`${x.tipo}-${x.alvo}-${x.periodo ?? i}`} type="button" className="lv-linha-lista"
                    onClick={() => setRegistar({ linkId: x.link_id, nome: x.nome, tipo: x.tipo, alvo: x.tipo === 'avulsa' ? null : x.alvo, periodo: x.periodo, item: x.item, falta: x.valor, marcacao: x.tipo === 'avulsa' ? x.alvo : null })}>
                    <Avatar nome={x.nome} tamanho={32} />
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.nome}</span>
                      <span className="lv-legenda">{deIcone(x)} · {x.item} · desde {new Date(`${x.desde}T12:00:00Z`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</span></span>
                    <span className="lv-pill">{euros(x.valor)}</span>
                  </button>
                ))}
                <Nota>Toca num nome para registar o pagamento.</Nota>
              </section>
              <aside className="lv-lista" aria-label="Acaba esta semana">
                <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Packs a acabar</h2>
                {d.a_acabar.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nenhum.</p> : d.a_acabar.map((x, i) => (
                  <button key={i} type="button" className="lv-linha-lista" onClick={() => navigate(`/clients/${x.link_id}?sep=treino`)}>
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.nome}</span>
                      <span className="lv-legenda">{x.pack} · restam {x.restam} · até {new Date(`${x.valido_ate}T12:00:00Z`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</span></span>
                    <span className="lv-pill">Vender novo</span>
                  </button>
                ))}
                <Botao variante="secundario" icone={UploadSimple} onClick={() => void exportar(false)}>Exportar tudo (CSV)</Botao>
                <Nota icone={ShieldCheck}>Só lê o que registaste. Não é contabilidade nem faturação: as faturas vêm do teu faturador.</Nota>
              </aside>
            </div>
          </>
        )}
      </div>
      <RegistarPagamento alvo={registar} onFechar={() => setRegistar(null)} onFeito={() => { setRegistar(null); carregar(); }} />
    </CoachShell>
  );
}
