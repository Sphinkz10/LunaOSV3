import { useCallback, useEffect, useState } from 'react';
import {
  arquivarPackProduto, euros, fetchPackProdutos, fetchSaldo, guardarPackProduto, toast, venderPack,
  type PackProduto, type SaldoPack,
} from '@luna/core';
import { Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { Plus, Wallet } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../lib/vocab';

/**
 * Planos e preços (G-33, Figma 73:392), na F1a só com packs de sessões de PT
 * (D18). Programas e o registo de pagamentos chegam na F1b; adesões e
 * créditos de aulas com o plano Ginásio.
 */
export function Packs() {
  const scope = useScope();
  const [lista, setLista] = useState<PackProduto[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<(Omit<PackProduto, 'id' | 'arquivado'> & { id?: string }) | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchPackProdutos(client, scope).then(setLista).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope]);
  useEffect(() => carregar(), [carregar]);
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client || !aberto) return;
    try { await guardarPackProduto(client, scope, aberto); toast({ variant: 'success', title: 'Pack guardado' }); setAberto(null); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: e instanceof Error ? e.message : undefined }); }
  };
  const visiveis = (lista ?? []).filter((p) => verArquivados || !p.arquivado);
  return (
    <CoachShell headStrong="Planos e preços" headSub="Negócio" legado={false}
      topActions={<Botao icone={Plus} onClick={() => setAberto({ nome: '', sessoes: 8, validadeDias: 60, precoCent: 0 })}>Novo pack</Botao>}>
      <div className="lv-root lg-ficha">
        <div className="lg-separadores" role="tablist" aria-label="O que vendemos">
          <button type="button" role="tab" aria-selected>Packs de {t('sessao', { plural: true })} <span>{lista?.filter((p) => !p.arquivado).length ?? '…'}</span></button>
          <button type="button" role="tab" aria-selected={false} disabled>Programas online (F1b)</button>
        </div>
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !lista ? <Esqueleto />
          : lista.length === 0 ? <EstadoPagina tipo="vazio" icone={Wallet} titulo="Ainda sem packs" texto={`Cria um pack com o número de ${t('sessao', { plural: true })}, a validade e o preço.`} acao={{ rotulo: 'Novo pack', onClick: () => setAberto({ nome: '', sessoes: 8, validadeDias: 60, precoCent: 0 }) }} />
          : (
            <section className="lv-lista lg-tabela" aria-label="Packs">
              <div className="lg-pack__linha lg-tabela__cabeca"><span>Pack</span><span className="lg-num">Preço</span><span className="lg-num">Por {t('sessao')}</span><span>Validade</span><span>Estado</span></div>
              {visiveis.map((p) => (
                <button key={p.id} type="button" className="lg-pack__linha lg-tabela__linha" onClick={() => setAberto({ id: p.id, nome: p.nome, sessoes: p.sessoes, validadeDias: p.validadeDias, precoCent: p.precoCent })}>
                  <span><b>{p.nome}</b><span className="lv-legenda" style={{ display: 'block' }}>{p.sessoes} {t('sessao', { plural: p.sessoes !== 1 })}</span></span>
                  <span className="lg-num"><b>{euros(p.precoCent)}</b></span>
                  <span className="lg-num">{euros(Math.round(p.precoCent / p.sessoes))}</span>
                  <span>{p.validadeDias} dias</span>
                  <Estado tom={p.arquivado ? 'neutro' : 'ok'}>{p.arquivado ? 'Arquivado' : 'À venda'}</Estado>
                </button>
              ))}
              <div className="lg-import__acoes" style={{ justifyContent: 'flex-start' }}><Chip ativo={verArquivados} onClick={() => setVerArquivados(!verArquivados)}>Ver arquivados</Chip></div>
            </section>
          )}
        <Nota>No plano Treinador o LunaOS não cobra os teus clientes: vendes o pack e o pagamento fica contigo.</Nota>
      </div>
      <Janela aberta={!!aberto} onFechar={() => setAberto(null)} titulo={aberto?.id ? 'Editar pack' : 'Novo pack'}
        sub="Mudar o preço não muda os packs já vendidos."
        acoes={<>
          {aberto?.id && <Botao variante="secundario" onClick={() => { const c = getSupabaseClient(); const p = lista?.find((x) => x.id === aberto.id); if (c && p) void arquivarPackProduto(c, p.id, !p.arquivado).then(() => { setAberto(null); carregar(); }); }}>
            {lista?.find((x) => x.id === aberto?.id)?.arquivado ? 'Voltar a vender' : 'Arquivar'}</Botao>}
          <Botao disabled={!aberto?.nome.trim()} onClick={() => void guardar()}>Guardar</Botao>
        </>}>
        {aberto && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <Campo rotulo="Nome" value={aberto.nome} onChange={(e) => setAberto({ ...aberto, nome: e.target.value })} placeholder="Ex.: Pack de PT 8" />
            <div className="lg-conta__prefs">
              <Campo rotulo={t('sessao', { plural: true, maiuscula: true })} type="number" min={1} max={200} value={aberto.sessoes} onChange={(e) => setAberto({ ...aberto, sessoes: Number(e.target.value) || 1 })} />
              <Campo rotulo="Validade (dias)" type="number" min={1} max={730} value={aberto.validadeDias} onChange={(e) => setAberto({ ...aberto, validadeDias: Number(e.target.value) || 30 })} />
              <Campo rotulo="Preço (€)" inputMode="decimal" value={(aberto.precoCent / 100).toString().replace('.', ',')} onChange={(e) => setAberto({ ...aberto, precoCent: Math.round(Number(e.target.value.replace(',', '.')) * 100) || 0 })} />
            </div>
            {aberto.sessoes > 0 && <p className="lv-legenda" style={{ margin: 0 }}>{euros(Math.round(aberto.precoCent / aberto.sessoes))} por {t('sessao')}.</p>}
          </div>
        )}
      </Janela>
    </CoachShell>
  );
}

/* ── Separador Packs da ficha (G-06) e vender em 2 cliques ─────────────── */
const TOM: Record<SaldoPack['estado'], EstadoTom> = { ativo: 'ok', a_acabar: 'aviso', a_expirar: 'aviso', esgotado: 'neutro', expirado: 'erro' };
const TEXTO: Record<SaldoPack['estado'], string> = { ativo: 'Ativo', a_acabar: 'A acabar', a_expirar: 'A expirar', esgotado: 'Esgotado', expirado: 'Expirado' };

export function PacksCliente({ linkId, nome, soLeitura }: { linkId: string; nome: string; soLeitura: boolean }) {
  const scope = useScope();
  const [saldo, setSaldo] = useState<SaldoPack[] | null>(null);
  const [produtos, setProdutos] = useState<PackProduto[]>([]);
  const [vender, setVender] = useState(false);
  const [escolha, setEscolha] = useState<string | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchSaldo(client, linkId).then(setSaldo).catch(() => setSaldo([]));
    void fetchPackProdutos(client, scope).then((p) => setProdutos(p.filter((x) => !x.arquivado))).catch(() => setProdutos([]));
  }, [linkId, scope]);
  useEffect(() => carregar(), [carregar]);
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client || !escolha) return;
    try { await venderPack(client, linkId, escolha); toast({ variant: 'success', title: 'Pack vendido', description: nome }); setVender(false); setEscolha(null); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível vender', description: e instanceof Error ? e.message : undefined }); }
  };
  const p = produtos.find((x) => x.id === escolha);
  return (
    <section className="lv-lista" aria-label="Packs e sessões">
      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Packs</h3>
        {!soLeitura && <Botao variante="secundario" icone={Plus} onClick={() => setVender(true)}>Vender pack</Botao>}</div>
      {!saldo ? <Esqueleto linhas={2} /> : saldo.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem packs. As {t('sessao', { plural: true })} ficam por pagar.</p> : saldo.map((s) => (
        <div key={s.packId} className="lv-linha-lista" style={{ cursor: 'default' }}>
          <span className="lv-linha-lista__corpo">
            <span className="lv-linha-lista__titulo">{s.nome}</span>
            <span className="lv-legenda">Restam {s.restam} de {s.total} · válido até {new Date(`${s.validoAte}T12:00:00Z`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <span className="lg-pack__barra" aria-hidden><i style={{ width: `${(s.restam / s.total) * 100}%` }} /></span>
          </span>
          <Estado tom={TOM[s.estado]}>{TEXTO[s.estado]}</Estado>
        </div>
      ))}
      <Janela aberta={vender} onFechar={() => { setVender(false); setEscolha(null); }} titulo={`Vender pack a ${nome}`}
        acoes={<><Botao variante="secundario" onClick={() => setVender(false)}>Voltar</Botao><Botao disabled={!escolha} onClick={() => void confirmar()}>{p ? `Vender por ${euros(p.precoCent)}` : 'Vender'}</Botao></>}>
        {produtos.length === 0 ? <Nota>Ainda não há packs à venda. Cria-os em Planos e preços.</Nota> : (
          <div role="radiogroup" aria-label="Pack" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
            {produtos.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={escolha === x.id} className="lg-juntar__cartao" onClick={() => setEscolha(x.id)}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}><b>{x.nome}</b><b>{euros(x.precoCent)}</b></span>
                <span className="lv-legenda">{x.sessoes} {t('sessao', { plural: x.sessoes !== 1 })} · válido {x.validadeDias} dias a partir de hoje</span>
              </button>
            ))}
          </div>
        )}
      </Janela>
    </section>
  );
}
