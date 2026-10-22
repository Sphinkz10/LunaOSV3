import { useCallback, useEffect, useState } from 'react';
import {
  arquivarPackProduto, arquivarProduto, confirmarDestrutivo, corrigirPagamento, euros, fetchClients, fetchItensCliente, fetchMensalidades,
  fetchPackProdutos, fetchPagamentosCliente, fetchPlanos, fetchProgramas, guardarMensalidade, guardarPackProduto, guardarPrecoAvulsa, guardarPrograma,
  lerEuros, mesAtual, METODOS, pagoEm, partilharPack, precoAvulsa, registarPagamento, rotuloMetodo, terminarMensalidade, toast, venderMensalidade,
  venderPack, venderPrograma,
  type ClientRow, type ItemCliente, type Mensalidade, type Metodo, type PackProduto, type PagamentoRegistado, type PlanoResumo, type Programa,
  type TipoPagamento,
} from '@luna/core';
import { Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Interruptor, Janela, Nota } from '@luna/ui/v3';
import { CalendarBlank, Plus, ShieldCheck, Wallet } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t, vocab } from '../lib/vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : undefined);
const dia = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
const euroTexto = (c: number) => (c / 100).toFixed(2).replace('.', ',');
type Separador = 'packs' | 'mensalidades' | 'avulsa' | 'programas';

/**
 * Planos e preços (G-33): pack, mensalidade, sessão avulsa e programa. No
 * plano Treinador o LunaOS não cobra os clientes: o PT vende e regista à mão
 * o que recebeu (P-14).
 */
export function Packs() {
  const scope = useScope();
  const [sep, setSep] = useState<Separador>('packs');
  const [packs, setPacks] = useState<PackProduto[] | null>(null);
  const [mens, setMens] = useState<Mensalidade[]>([]);
  const [progs, setProgs] = useState<Programa[]>([]);
  const [planos, setPlanos] = useState<PlanoResumo[]>([]);
  const [avulsa, setAvulsa] = useState<{ id: string; precoCent: number } | null>(null);
  const [valorAvulsa, setValorAvulsa] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [verArquivados, setVerArquivados] = useState(false);
  const [pack, setPack] = useState<(Omit<PackProduto, 'id' | 'arquivado'> & { id?: string }) | null>(null);
  const [mensal, setMensal] = useState<(Omit<Mensalidade, 'id' | 'arquivado'> & { id?: string }) | null>(null);
  const [prog, setProg] = useState<(Omit<Programa, 'id' | 'arquivado'> & { id?: string }) | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchPackProdutos(client, scope).then(setPacks).catch((e) => setErro(erroDe(e) ?? 'Erro'));
    void fetchMensalidades(client, scope).then(setMens).catch(() => setMens([]));
    void fetchProgramas(client, scope).then(setProgs).catch(() => setProgs([]));
    void fetchPlanos(client, scope).then(setPlanos).catch(() => setPlanos([]));
    void precoAvulsa(client, scope).then((a) => { setAvulsa(a); setValorAvulsa(a ? euroTexto(a.precoCent) : ''); });
  }, [scope]);
  useEffect(() => carregar(), [carregar]);
  const correr = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); toast({ variant: 'success', title: ok }); setPack(null); setMensal(null); setProg(null); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
  };
  const client = getSupabaseClient();
  const novo = () => {
    if (sep === 'packs') setPack({ nome: '', sessoes: 10, validadeDias: 90, precoCent: 0 });
    else if (sep === 'mensalidades') setMensal({ nome: '2x por semana', precoCent: 12000, sessoesSemana: 2, diaPagamento: 1, sobras: 'perdem', renova: true });
    else if (sep === 'programas') setProg({ nome: '', planoId: planos[0]?.id ?? '', precoCent: 0 });
  };
  const visivel = <T extends { arquivado: boolean }>(l: T[]) => l.filter((x) => verArquivados || !x.arquivado);
  return (
    <CoachShell headStrong="Planos e preços" headSub="Negócio" legado={false}
      topActions={sep !== 'avulsa' ? <Botao icone={Plus} onClick={novo}>Novo</Botao> : undefined}>
      <div className="lv-root lg-ficha">
        <div className="lg-separadores" role="tablist" aria-label="O que vendemos">
          {([['packs', `Packs de ${t('sessao', { plural: true })}`, packs?.filter((p) => !p.arquivado).length], ['mensalidades', 'Mensalidades', mens.filter((m) => !m.arquivado).length],
            ['avulsa', 'Sessão avulsa', avulsa ? 1 : 0], ['programas', 'Programas', progs.filter((p) => !p.arquivado).length]] as const).map(([k, r, n]) => (
            <button key={k} type="button" role="tab" aria-selected={sep === k} onClick={() => setSep(k)}>{r} <span>{n ?? '…'}</span></button>
          ))}
        </div>
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !packs ? <Esqueleto />
          : sep === 'packs' ? (packs.length === 0 ? <EstadoPagina tipo="vazio" icone={Wallet} titulo="Ainda sem packs" texto={`Cria um pack com o número de ${t('sessao', { plural: true })}, a validade e o preço.`} acao={{ rotulo: 'Novo pack', onClick: novo }} /> : (
            <section className="lv-lista lg-tabela" aria-label="Packs">
              <div className="lg-pack__linha lg-tabela__cabeca"><span>Pack</span><span className="lg-num">Preço</span><span className="lg-num">Por {t('sessao')}</span><span>Validade</span><span>Estado</span></div>
              {visivel(packs).map((p) => (
                <button key={p.id} type="button" className="lg-pack__linha lg-tabela__linha" onClick={() => setPack({ id: p.id, nome: p.nome, sessoes: p.sessoes, validadeDias: p.validadeDias, precoCent: p.precoCent })}>
                  <span><b>{p.nome}</b><span className="lv-legenda" style={{ display: 'block' }}>{p.sessoes} {t('sessao', { plural: p.sessoes !== 1 })} · pode ser partilhado</span></span>
                  <span className="lg-num"><b>{euros(p.precoCent)}</b></span>
                  <span className="lg-num">{euros(Math.round(p.precoCent / p.sessoes))}</span>
                  <span>{p.validadeDias} dias</span>
                  <Estado tom={p.arquivado ? 'neutro' : 'ok'}>{p.arquivado ? 'Arquivado' : 'À venda'}</Estado>
                </button>
              ))}
            </section>
          ))
          : sep === 'mensalidades' ? (mens.length === 0 ? <EstadoPagina tipo="vazio" icone={CalendarBlank} titulo="Ainda sem mensalidades" texto="Por exemplo 2 sessões por semana a 120 € por mês." acao={{ rotulo: 'Nova mensalidade', onClick: novo }} /> : (
            <section className="lv-lista lg-tabela" aria-label="Mensalidades">
              <div className="lg-pack__linha lg-tabela__cabeca"><span>Mensalidade</span><span className="lg-num">Por mês</span><span>Paga-se</span><span>Sobras</span><span>Estado</span></div>
              {visivel(mens).map((m) => (
                <button key={m.id} type="button" className="lg-pack__linha lg-tabela__linha" onClick={() => setMensal({ ...m })}>
                  <span><b>{m.nome}</b><span className="lv-legenda" style={{ display: 'block' }}>{m.sessoesSemana ? `${m.sessoesSemana} por semana` : 'Sem limite'}{m.renova ? ' · renova' : ''}</span></span>
                  <span className="lg-num"><b>{euros(m.precoCent)}</b></span>
                  <span>Dia {m.diaPagamento}</span>
                  <span>{m.sobras === 'perdem' ? 'Perdem-se' : m.sobras === 'passam' ? 'Passam todas' : 'Passam até 2'}</span>
                  <Estado tom={m.arquivado ? 'neutro' : 'ok'}>{m.arquivado ? 'Arquivada' : 'À venda'}</Estado>
                </button>
              ))}
            </section>
          ))
          : sep === 'avulsa' ? (
            <section className="lv-lista" aria-label="Sessão avulsa" style={{ maxWidth: 520 }}>
              <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Sessão avulsa</h3>
              <p className="lv-legenda" style={{ margin: 0 }}>Uma {t('sessao')} paga no dia. As {t('sessao', { plural: true })} feitas sem pack nem mensalidade aparecem em "Quem me deve" com este preço.</p>
              <Campo rotulo="Preço (€)" inputMode="decimal" value={valorAvulsa} onChange={(e) => setValorAvulsa(e.target.value)} />
              <Botao disabled={lerEuros(valorAvulsa) == null} onClick={() => client && void correr(() => guardarPrecoAvulsa(client, scope, lerEuros(valorAvulsa)!, avulsa?.id), 'Preço guardado')}>Guardar</Botao>
            </section>
          )
          : (progs.length === 0 ? <EstadoPagina tipo="vazio" icone={Wallet} titulo="Ainda sem programas" texto="Um programa é um plano de treino com preço: vendê-lo atribui o plano ao cliente." acao={planos.length ? { rotulo: 'Novo programa', onClick: novo } : undefined} /> : (
            <section className="lv-lista lg-tabela" aria-label="Programas">
              <div className="lg-pack__linha lg-tabela__cabeca"><span>Programa</span><span className="lg-num">Preço</span><span>Plano</span><span /><span>Estado</span></div>
              {visivel(progs).map((p) => (
                <button key={p.id} type="button" className="lg-pack__linha lg-tabela__linha" onClick={() => setProg({ ...p })}>
                  <span><b>{p.nome}</b></span><span className="lg-num"><b>{euros(p.precoCent)}</b></span>
                  <span>{planos.find((x) => x.id === p.planoId)?.nome ?? '—'}</span><span />
                  <Estado tom={p.arquivado ? 'neutro' : 'ok'}>{p.arquivado ? 'Arquivado' : 'À venda'}</Estado>
                </button>
              ))}
            </section>
          ))}
        {sep !== 'avulsa' && <div className="lg-import__acoes" style={{ justifyContent: 'flex-start' }}><Chip ativo={verArquivados} onClick={() => setVerArquivados(!verArquivados)}>Ver arquivados</Chip></div>}
        <Nota icone={ShieldCheck}>No plano Treinador o LunaOS não cobra nem fatura os teus clientes: vendes, e registas o que recebeste na ficha de cada um.</Nota>
      </div>

      <Janela aberta={!!pack} onFechar={() => setPack(null)} titulo={pack?.id ? 'Editar pack' : 'Novo pack'} sub="Mudar o preço não muda os packs já vendidos."
        acoes={<>
          {pack?.id && <Botao variante="secundario" onClick={() => { const p = packs?.find((x) => x.id === pack.id); if (client && p) void correr(() => arquivarPackProduto(client, p.id, !p.arquivado), p.arquivado ? 'De volta à venda' : 'Arquivado'); }}>
            {packs?.find((x) => x.id === pack?.id)?.arquivado ? 'Voltar a vender' : 'Arquivar'}</Botao>}
          <Botao disabled={!pack?.nome.trim()} onClick={() => client && pack && void correr(() => guardarPackProduto(client, scope, pack), 'Pack guardado')}>Guardar</Botao>
        </>}>
        {pack && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <Campo rotulo="Nome" value={pack.nome} onChange={(e) => setPack({ ...pack, nome: e.target.value })} placeholder="Ex.: Pack 10 sessões" />
            <div className="lg-conta__prefs">
              <Campo rotulo={t('sessao', { plural: true, maiuscula: true })} type="number" min={1} max={200} value={pack.sessoes} onChange={(e) => setPack({ ...pack, sessoes: Number(e.target.value) || 1 })} />
              <Campo rotulo="Validade (dias)" type="number" min={1} max={730} value={pack.validadeDias} onChange={(e) => setPack({ ...pack, validadeDias: Number(e.target.value) || 30 })} />
              <Campo rotulo="Preço (€)" inputMode="decimal" defaultValue={euroTexto(pack.precoCent)} onChange={(e) => setPack({ ...pack, precoCent: lerEuros(e.target.value) ?? 0 })} />
            </div>
            <p className="lv-legenda" style={{ margin: 0 }}>{euros(Math.round(pack.precoCent / Math.max(1, pack.sessoes)))} por {t('sessao')}. Pode partilhar-se por 2 a 4 pessoas na ficha.</p>
          </div>
        )}
      </Janela>

      <Janela aberta={!!mensal} onFechar={() => setMensal(null)} titulo={mensal?.id ? 'Editar mensalidade' : 'Nova mensalidade'}
        acoes={<>
          {mensal?.id && <Botao variante="secundario" onClick={() => { const m = mens.find((x) => x.id === mensal.id); if (client && m) void correr(() => arquivarProduto(client, 'monthly_products', m.id, !m.arquivado), m.arquivado ? 'De volta à venda' : 'Arquivada'); }}>
            {mens.find((x) => x.id === mensal?.id)?.arquivado ? 'Voltar a vender' : 'Arquivar'}</Botao>}
          <Botao disabled={!mensal?.nome.trim()} onClick={() => client && mensal && void correr(() => guardarMensalidade(client, scope, mensal), 'Mensalidade guardada')}>Pôr à venda</Botao>
        </>}>
        {mensal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <Campo rotulo="Nome" value={mensal.nome} onChange={(e) => setMensal({ ...mensal, nome: e.target.value })} />
            <div className="lg-conta__prefs">
              <Campo rotulo="Preço por mês (€)" inputMode="decimal" defaultValue={euroTexto(mensal.precoCent)} onChange={(e) => setMensal({ ...mensal, precoCent: lerEuros(e.target.value) ?? 0 })} />
              <Campo rotulo="Sessões por semana" type="number" min={1} max={7} value={mensal.sessoesSemana ?? ''} onChange={(e) => setMensal({ ...mensal, sessoesSemana: e.target.value === '' ? null : Number(e.target.value) })} />
              <Campo rotulo="Paga-se ao dia" type="number" min={1} max={28} value={mensal.diaPagamento} onChange={(e) => setMensal({ ...mensal, diaPagamento: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
            <span className="lv-sobretitulo">Sessões que sobram no mês</span>
            <div className="lg-ficha__metricas">
              {([['perdem', 'Perdem-se'], ['passam_ate_2', 'Passam até 2'], ['passam', 'Passam todas']] as const).map(([k, r]) => <Chip key={k} ativo={mensal.sobras === k} onClick={() => setMensal({ ...mensal, sobras: k })}>{r}</Chip>)}
            </div>
            <div className="lv-linha-lista" style={{ cursor: 'default' }}>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Renova todos os meses</span><span className="lv-legenda">Até o cliente ou tu a pararem</span></span>
              <Interruptor rotulo="Renova todos os meses" ligado={mensal.renova} onMudar={(v) => setMensal({ ...mensal, renova: v })} />
            </div>
          </div>
        )}
      </Janela>

      <Janela aberta={!!prog} onFechar={() => setProg(null)} titulo={prog?.id ? 'Editar programa' : 'Novo programa'} sub="Vender um programa atribui o plano ao cliente."
        acoes={<>
          {prog?.id && <Botao variante="secundario" onClick={() => { const p = progs.find((x) => x.id === prog.id); if (client && p) void correr(() => arquivarProduto(client, 'program_products', p.id, !p.arquivado), p.arquivado ? 'De volta à venda' : 'Arquivado'); }}>
            {progs.find((x) => x.id === prog?.id)?.arquivado ? 'Voltar a vender' : 'Arquivar'}</Botao>}
          <Botao disabled={!prog?.nome.trim() || !prog?.planoId} onClick={() => client && prog && void correr(() => guardarPrograma(client, scope, prog), 'Programa guardado')}>Guardar</Botao>
        </>}>
        {prog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <Campo rotulo="Nome" value={prog.nome} onChange={(e) => setProg({ ...prog, nome: e.target.value })} placeholder="Ex.: Força em 6 semanas" />
            <label className="lv-campo"><span className="lv-campo-rotulo">Plano</span>
              <select className="lv-campo-input" value={prog.planoId} onChange={(e) => setProg({ ...prog, planoId: e.target.value })}>
                <option value="">Escolher</option>{planos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select></label>
            <Campo rotulo="Preço (€)" inputMode="decimal" defaultValue={euroTexto(prog.precoCent)} onChange={(e) => setProg({ ...prog, precoCent: lerEuros(e.target.value) ?? 0 })} />
          </div>
        )}
      </Janela>
    </CoachShell>
  );
}

/* ── Ficha (G-06) · Packs, mensalidades e pagamentos com P-14 ───────────── */
export interface AlvoPagamento { linkId: string; nome: string; tipo: TipoPagamento; alvo: string | null; periodo?: string | null; item: string; falta: number; marcacao?: string | null }

/** P-14: registar o pagamento recebido, já preenchido com o que falta e a data de hoje. */
export function RegistarPagamento({ alvo, onFechar, onFeito }: { alvo: AlvoPagamento | null; onFechar: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState('');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [metodo, setMetodo] = useState<Metodo>('dinheiro');
  const [comFatura, setComFatura] = useState(false);
  const [fatura, setFatura] = useState('');
  const [nota, setNota] = useState('');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (!alvo) return;
    setValor(alvo.falta > 0 ? euroTexto(alvo.falta) : ''); setData(new Date().toISOString().slice(0, 10)); setMetodo('dinheiro'); setComFatura(false); setFatura(''); setNota('');
  }, [alvo]);
  if (!alvo) return null;
  const cent = lerEuros(valor);
  const gravar = async () => {
    const client = getSupabaseClient();
    if (!client || cent == null) return;
    setAGravar(true);
    try {
      await registarPagamento(client, { linkId: alvo.linkId, tipo: alvo.tipo, alvo: alvo.alvo, periodo: alvo.periodo, valorCent: cent, data, metodo, fatura: comFatura ? fatura : undefined, nota, marcacao: alvo.marcacao });
      toast({ variant: 'success', title: `Registado: ${euros(cent)}`, description: alvo.nome });
      onFeito();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível registar', description: erroDe(e) }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta onFechar={onFechar} titulo="Registar pagamento recebido" sub={`${alvo.nome} · ${alvo.item}${alvo.falta > 0 ? ` · falta ${euros(alvo.falta)}` : ''}`}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Cancelar</Botao><Botao aCarregar={aGravar} disabled={cent == null || cent <= 0 || (comFatura && !fatura.trim())} onClick={() => void gravar()}>{cent ? `Registar ${euros(cent)}` : 'Registar'}</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div className="lg-conta__prefs">
          <Campo rotulo="Valor (€)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          <Campo rotulo="Data" type="date" max={new Date().toISOString().slice(0, 10)} value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <span className="lv-sobretitulo">Método</span>
        <div className="lg-ficha__metricas" role="radiogroup" aria-label="Método">
          {METODOS.map((m) => <Chip key={m.id} role="radio" aria-checked={metodo === m.id} ativo={metodo === m.id} onClick={() => setMetodo(m.id)}>{m.rotulo}</Chip>)}
        </div>
        <div className="lv-linha-lista" style={{ cursor: 'default' }}>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Fatura emitida fora do LunaOS</span><span className="lv-legenda">No teu faturador</span></span>
          <Interruptor rotulo="Fatura emitida" ligado={comFatura} onMudar={setComFatura} />
        </div>
        {comFatura && <Campo rotulo="N.º da fatura" placeholder="Ex.: FT 2026/131" value={fatura} onChange={(e) => setFatura(e.target.value)} />}
        <Campo rotulo="Nota · só a equipa vê" value={nota} onChange={(e) => setNota(e.target.value)} />
        <Nota icone={ShieldCheck}>O LunaOS não cobra nem emite faturas. Fica registado com o teu nome e não se apaga.</Nota>
      </div>
    </Janela>
  );
}

export function PacksCliente({ linkId, nome, soLeitura }: { linkId: string; nome: string; soLeitura: boolean }) {
  const [itens, setItens] = useState<ItemCliente[] | null>(null);
  const [pags, setPags] = useState<PagamentoRegistado[]>([]);
  const [vender, setVender] = useState(false);
  const [registar, setRegistar] = useState<AlvoPagamento | null>(null);
  const [corrigir, setCorrigir] = useState<PagamentoRegistado | null>(null);
  const [partilhar, setPartilhar] = useState<ItemCliente | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchItensCliente(client, linkId).then(setItens).catch(() => setItens([]));
    void fetchPagamentosCliente(client, linkId).then(setPags).catch(() => setPags([]));
  }, [linkId]);
  useEffect(() => carregar(), [carregar]);
  const mes = mesAtual();
  const pagoMes = (m: ItemCliente) => pags.some((p) => p.atual && p.tipo === 'mensalidade' && p.periodo === mes.periodo && p.alvo === m.nome);
  const hoje = new Date().toISOString().slice(0, 10);
  const terminar = async (i: ItemCliente) => {
    const c = getSupabaseClient();
    if (!c) return;
    const ok = await confirmarDestrutivo({ titulo: `Terminar ${i.nome}?`, verbo: 'Terminar', manter: 'Manter', efeitos: ['Deixa de aparecer em "Quem me deve" a partir de hoje'],
      motivo: { rotulo: 'Motivo', placeholder: 'Ex.: passou para pack' }, acao: (m) => terminarMensalidade(c, i.id, m ?? '') });
    if (ok) carregar();
  };
  return (
    <section className="lv-lista" aria-label="Packs e pagamentos">
      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Packs e pagamentos</h3>
        {!soLeitura && <Botao variante="secundario" icone={Plus} onClick={() => setVender(true)}>Vender</Botao>}</div>
      {!itens ? <Esqueleto linhas={2} /> : itens.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada vendido. As {t('sessao', { plural: true })} ficam por pagar.</p> : itens.map((i) => {
        const pago = i.tipo === 'mensalidade' ? 0 : pagoEm(pags, (p) => p.alvo === i.nome && p.tipo === i.tipo);
        const falta = i.tipo === 'mensalidade' ? (pagoMes(i) || i.ate ? 0 : i.precoCent) : Math.max(0, i.precoCent - pago);
        const fora = i.tipo === 'pack' && !!i.validoAte && i.validoAte < hoje;
        return (
          <div key={`${i.tipo}-${i.id}`} className="lg-pagamento">
            <div className="lv-lista__cabeca">
              <b>{i.nome}{i.partilhadoCom ? ` · partilhado (${i.partilhadoCom + 1})` : ''}</b>
              {falta > 0 ? <Estado tom="aviso">Falta {euros(falta)}</Estado> : <Estado tom="ok">{i.tipo === 'mensalidade' ? (i.ate ? 'Terminada' : 'Em dia') : 'Pago'}</Estado>}
            </div>
            <dl className="lg-conta__dados">
              {i.tipo === 'pack' && <><dt>Por usar</dt><dd>{i.restam} de {i.total}</dd><dt>Validade</dt><dd>{fora ? 'Expirou ' : ''}{dia(i.validoAte!)}</dd></>}
              {i.tipo === 'mensalidade' && <><dt>Paga-se</dt><dd>Dia {i.diaPagamento}{i.ate ? ` · terminou ${dia(i.ate)}` : ''}</dd><dt>{mes.nome}</dt><dd>{pagoMes(i) ? 'Pago' : i.ate ? '—' : `Por pagar · ${euros(i.precoCent)}`}</dd></>}
              <dt>Preço</dt><dd>{euros(i.precoCent)}{i.tipo === 'mensalidade' ? ' por mês' : ''}</dd>
              {i.tipo !== 'mensalidade' && <><dt>Registado</dt><dd>{euros(pago)}</dd></>}
            </dl>
            {!soLeitura && (
              <span style={{ display: 'flex', gap: 'var(--espaco-8)', flexWrap: 'wrap' }}>
                {falta > 0 && <Botao icone={Wallet} onClick={() => setRegistar({ linkId, nome, tipo: i.tipo, alvo: i.id, periodo: i.tipo === 'mensalidade' ? mes.periodo : null, item: i.tipo === 'mensalidade' ? `${i.nome} · ${mes.nome}` : i.nome, falta })}>
                  {i.tipo === 'mensalidade' ? `Registar ${mes.nome}` : 'Registar pagamento'}</Botao>}
                {i.tipo === 'pack' && !fora && <Botao variante="secundario" onClick={() => setPartilhar(i)}>Partilhar</Botao>}
                {i.tipo === 'mensalidade' && !i.ate && <Botao variante="secundario" onClick={() => void terminar(i)}>Terminar</Botao>}
              </span>
            )}
          </div>
        );
      })}
      {pags.length > 0 && (
        <>
          <span className="lv-sobretitulo">Pagamentos registados</span>
          {pags.map((p) => (
            <div key={p.id} className="lv-linha-lista" style={{ cursor: 'default', opacity: p.atual ? 1 : 0.6 }}>
              <span className={`lg-conta__ponto${p.atual ? ' lg-conta__ponto--ativo' : ''}`} aria-hidden />
              <span className="lv-linha-lista__corpo">
                <span className="lv-linha-lista__titulo">{p.corrige ? 'Corrigido para ' : ''}{euros(p.valorCent)} · {rotuloMetodo(p.metodo)}{p.atual ? '' : ' · original'}</span>
                <span className="lv-legenda">{[p.alvo + (p.periodo ? ` ${p.periodo}` : ''), dia(p.pagoEm), p.fatura && `fatura ${p.fatura}`, p.quem, p.motivo && `motivo: ${p.motivo}`].filter(Boolean).join(' · ')}</span>
                {p.nota && <span className="lv-legenda">Nota interna: {p.nota}</span>}
              </span>
              {p.atual && !soLeitura && <Botao variante="secundario" onClick={() => setCorrigir(p)}>Corrigir</Botao>}
            </div>
          ))}
        </>
      )}
      <Vender aberta={vender} linkId={linkId} nome={nome} onFechar={() => setVender(false)} onFeito={() => { setVender(false); carregar(); }} />
      <RegistarPagamento alvo={registar} onFechar={() => setRegistar(null)} onFeito={() => { setRegistar(null); carregar(); }} />
      <Corrigir p={corrigir} onFechar={() => setCorrigir(null)} onFeito={() => { setCorrigir(null); carregar(); }} />
      <PartilharPack pack={partilhar} donoId={linkId} onFechar={() => setPartilhar(null)} onFeito={() => { setPartilhar(null); carregar(); }} />
    </section>
  );
}

function Vender({ aberta, linkId, nome, onFechar, onFeito }: { aberta: boolean; linkId: string; nome: string; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [tipo, setTipo] = useState<'pack' | 'mensalidade' | 'programa'>('pack');
  const [packs, setPacks] = useState<PackProduto[]>([]);
  const [mens, setMens] = useState<Mensalidade[]>([]);
  const [progs, setProgs] = useState<Programa[]>([]);
  const [escolha, setEscolha] = useState<string | null>(null);
  useEffect(() => {
    const c = getSupabaseClient();
    if (!c || !aberta) return;
    setEscolha(null);
    void fetchPackProdutos(c, scope).then((l) => setPacks(l.filter((x) => !x.arquivado)));
    void fetchMensalidades(c, scope).then((l) => setMens(l.filter((x) => !x.arquivado)));
    void fetchProgramas(c, scope).then((l) => setProgs(l.filter((x) => !x.arquivado)));
  }, [aberta, scope]);
  const opcoes = tipo === 'pack' ? packs.map((p) => ({ id: p.id, nome: p.nome, preco: p.precoCent, sub: `${p.sessoes} ${t('sessao', { plural: p.sessoes !== 1 })} · válido ${p.validadeDias} dias` }))
    : tipo === 'mensalidade' ? mens.map((m) => ({ id: m.id, nome: m.nome, preco: m.precoCent, sub: `por mês · paga-se ao dia ${m.diaPagamento}` }))
    : progs.map((p) => ({ id: p.id, nome: p.nome, preco: p.precoCent, sub: 'Atribui o plano do programa' }));
  const sel = opcoes.find((o) => o.id === escolha);
  const confirmar = async () => {
    const c = getSupabaseClient();
    if (!c || !escolha) return;
    try {
      if (tipo === 'pack') await venderPack(c, linkId, escolha);
      else if (tipo === 'mensalidade') await venderMensalidade(c, linkId, escolha);
      else await venderPrograma(c, linkId, escolha);
      toast({ variant: 'success', title: 'Vendido', description: `${sel?.nome} · ${nome}. Regista o pagamento quando o receberes.` });
      onFeito();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível vender', description: erroDe(e) }); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo={`Vender a ${nome}`}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao disabled={!escolha} onClick={() => void confirmar()}>{sel ? `Vender por ${euros(sel.preco)}` : 'Vender'}</Botao></>}>
      <div className="lg-ficha__metricas" role="radiogroup" aria-label="Tipo">
        {([['pack', 'Pack'], ['mensalidade', 'Mensalidade'], ['programa', 'Programa']] as const).map(([k, r]) => <Chip key={k} ativo={tipo === k} onClick={() => { setTipo(k); setEscolha(null); }}>{r}</Chip>)}
      </div>
      {opcoes.length === 0 ? <Nota>Ainda não há nada deste tipo à venda. Cria em Planos e preços.</Nota> : (
        <div role="radiogroup" aria-label="Escolher" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)', marginTop: 'var(--espaco-12)' }}>
          {opcoes.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={escolha === o.id} className="lg-juntar__cartao" onClick={() => setEscolha(o.id)}>
              <span style={{ display: 'flex', justifyContent: 'space-between' }}><b>{o.nome}</b><b>{euros(o.preco)}</b></span>
              <span className="lv-legenda">{o.sub}</span>
            </button>
          ))}
        </div>
      )}
    </Janela>
  );
}

function Corrigir({ p, onFechar, onFeito }: { p: PagamentoRegistado | null; onFechar: () => void; onFeito: () => void }) {
  const [valor, setValor] = useState('');
  const [motivo, setMotivo] = useState<string | null>(null);
  const [outro, setOutro] = useState('');
  useEffect(() => { setValor(p ? euroTexto(p.valorCent) : ''); setMotivo(null); setOutro(''); }, [p]);
  if (!p) return null;
  const m = motivo === 'Outro' ? outro.trim() : motivo;
  const cent = lerEuros(valor);
  const gravar = async () => {
    const c = getSupabaseClient();
    if (!c || cent == null || !m) return;
    try { await corrigirPagamento(c, p.id, cent, m); toast({ variant: 'success', title: 'Corrigido', description: 'O original fica no histórico.' }); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível corrigir', description: erroDe(e) }); }
  };
  return (
    <Janela aberta onFechar={onFechar} titulo={`Corrigir o pagamento de ${dia(p.pagoEm)}`}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao disabled={cent == null || !m} onClick={() => void gravar()}>Guardar correção</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div className="lg-conta__prefs">
          <Campo rotulo="Estava" value={euros(p.valorCent)} readOnly />
          <Campo rotulo="Fica (€)" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </div>
        <span className="lv-sobretitulo">Motivo</span>
        <div className="lg-ficha__metricas">{['Engano no valor', 'Devolvido', 'Outro'].map((x) => <Chip key={x} ativo={motivo === x} onClick={() => setMotivo(x)}>{x}</Chip>)}</div>
        {motivo === 'Outro' && <Campo rotulo="Qual?" value={outro} onChange={(e) => setOutro(e.target.value)} />}
      </div>
    </Janela>
  );
}

function PartilharPack({ pack, donoId, onFechar, onFeito }: { pack: ItemCliente | null; donoId: string; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [cl, setCl] = useState<ClientRow[]>([]);
  const [quem, setQuem] = useState('');
  useEffect(() => { const c = getSupabaseClient(); if (c && pack) void fetchClients(c, scope).then(setCl); }, [pack, scope]);
  if (!pack) return null;
  return (
    <Janela aberta onFechar={onFechar} titulo={`Partilhar ${pack.nome}`} sub={`Desconta de quem treinar; todos veem o saldo. Até 4 ${vocab.pessoa({ plural: true })}.`}
      acoes={<Botao disabled={!quem} onClick={() => { const c = getSupabaseClient(); if (c) void partilharPack(c, pack.id, quem).then(() => { toast({ variant: 'success', title: 'Pack partilhado' }); onFeito(); }).catch((e) => toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) })); }}>Partilhar</Botao>}>
      <label className="lv-campo"><span className="lv-campo-rotulo">Com</span>
        <select className="lv-campo-input" value={quem} onChange={(e) => setQuem(e.target.value)}>
          <option value="">Escolher</option>{cl.filter((c) => c.id !== donoId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select></label>
    </Janela>
  );
}
