import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  EscolherQuemPerdeError, PLANOS, fetchSubscricao, fornecedorFalso, mudarSubscricao, preverMudanca, rotuloEstado, toast, diasAte,
  type EfeitoMudanca, type PlanoLuna, type Subscricao as DadosSubscricao,
} from '@luna/core';
import { Avatar, Botao, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { CheckCircle, CreditCard, Info, Minus, Plus, UsersThree, Warning } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { ComMenuDefinicoes } from '../app/MenuDefinicoes';
import { useScope } from '../app/ModuleLayout';
import { esquecerSubscricao } from '../app/AvisoSubscricao';
import { getSupabaseClient } from '../lib/supabase';

const NOME_MODULO: Record<string, string> = {
  today: 'Hoje', clients: 'Clientes', schedule: 'Horário', training: 'Treino', settings: 'Definições', assessment: 'Avaliação',
  messages: 'Mensagens', entries: 'Entradas e balcão', billing: 'Cobranças, faturas e loja', units: 'Várias unidades',
};
const nomeModulo = (m: string) => NOME_MODULO[m] ?? m;
const TOM: Record<DadosSubscricao['estado'], EstadoTom> = { trial: 'neutro', active: 'ok', grace: 'aviso', read_only: 'erro', cancelled: 'erro' };
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' });

/**
 * G-47 · Subscrição e lugares (J32, J33, J34). Quem ocupa lugar, plano e
 * lugares com o efeito antes de confirmar, e o pagamento da subscrição
 * (fornecedor falso: nunca cobra; o real espera pela decisão N8).
 */
export function Subscricao() {
  const scope = useScope();
  const navigate = useNavigate();
  const [s, setS] = useState<DadosSubscricao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [plano, setPlano] = useState<PlanoLuna>('treinador');
  const [lugares, setLugares] = useState(1);
  const [efeito, setEfeito] = useState<EfeitoMudanca | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [cancelar, setCancelar] = useState(false);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchSubscricao(client, scope).then((x) => { setS(x); setPlano(x.plano); setLugares(x.lugares); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope]);
  useEffect(() => carregar(), [carregar]);

  // O efeito aparece antes de confirmar, sempre que o plano ou os lugares mudam
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !s || (plano === s.plano && lugares === s.lugares)) { setEfeito(null); return; }
    let vivo = true;
    void preverMudanca(client, scope, plano, lugares).then((e) => vivo && setEfeito(e)).catch(() => undefined);
    return () => { vivo = false; };
  }, [scope, s, plano, lugares]);

  const metodo = async (acao: 'metodo' | 'retomar') => {
    const client = getSupabaseClient();
    if (!client) return;
    try {
      if (acao === 'metodo') await fornecedorFalso.adicionarMetodo(client, scope.orgId);
      else await fornecedorFalso.retomar(client, scope.orgId);
      esquecerSubscricao();
      toast({ variant: 'success', title: acao === 'metodo' ? 'Método de pagamento guardado' : 'Subscrição retomada' });
      carregar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: e instanceof Error ? e.message : undefined }); }
  };

  const soLer = s?.estado === 'read_only' || s?.estado === 'cancelled';
  const restam = s ? diasAte(s.experimentalAte) : null;

  return (
    <CoachShell headStrong="Subscrição" headSub="Definições" legado={false}
      topActions={s?.gere && !soLer && <Botao icone={Plus} onClick={() => setLugares((n) => n + 1)}>Acrescentar lugar</Botao>}>
      <ComMenuDefinicoes><div className="lv-root lg-vivo">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !s ? <Esqueleto /> : (
          <>
            <div className="lg-hoje__contagens">
              <div className={`lg-contagem${s.ocupados > s.lugares ? ' lg-contagem--aviso' : ' lg-contagem--acao'}`}>
                <span className="lg-contagem__rotulo"><UsersThree size={16} aria-hidden />Lugares ocupados</span>
                <span><span className="lv-numero-grande">{s.ocupados}</span> <span className="lv-legenda">de {s.lugares}</span></span>
                <span className="lg-contagem__legenda">{s.convites.filter((c) => c.ocupa).length ? `${s.convites.filter((c) => c.ocupa).length} convite à espera` : 'Ocupa lugar quem treina'}</span>
              </div>
              <div className="lg-contagem">
                <span className="lg-contagem__rotulo">Plano</span>
                <span className="lv-numero-grande">{PLANOS[s.plano].nome}</span>
                <span className="lg-contagem__legenda"><Estado tom={TOM[s.estado]}>{rotuloEstado(s.estado)}</Estado>
                  {s.estado === 'trial' && restam != null && ` · ${restam} ${restam === 1 ? 'dia' : 'dias'}`}
                  {s.estado === 'grace' && s.gracaAte && ` · até ${dia(s.gracaAte)}`}</span>
              </div>
              <div className="lg-contagem">
                <span className="lg-contagem__rotulo">Clientes</span>
                <span className="lv-numero-grande">{s.clientes.toLocaleString('pt-PT')}</span>
                <span className="lg-contagem__legenda">Ilimitados em todos os planos</span>
              </div>
            </div>

            <div className="lg-hoje__grelha">
              <section className="lv-lista" aria-label="Quem ocupa lugar">
                <span className="lc-par" style={{ justifyContent: 'space-between' }}>
                  <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Quem ocupa lugar</h2>
                  <button type="button" className="lg-entrar__link" onClick={() => navigate('/settings/equipa')}>Muda em Equipa</button>
                </span>
                {s.pessoas.map((p) => (
                  <div key={p.membershipId} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <Avatar nome={p.nome} tamanho={32} />
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{p.nome}</span>
                      <span className="lv-legenda">{[p.papeis.join(', '), p.titulo].filter(Boolean).join(' · ')}</span></span>
                    {p.ocupa ? <Estado tom="ok">Lugar</Estado> : <span className="lv-pill">Sem lugar</span>}
                  </div>
                ))}
                {s.convites.map((c) => (
                  <div key={c.email} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <Avatar nome={c.email} tamanho={32} />
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.email}</span>
                      <span className="lv-legenda">{c.papel} · convidado {dia(c.criado)}</span></span>
                    {c.ocupa ? <Estado tom="aviso">Ao aceitar</Estado> : <span className="lv-pill">Sem lugar</span>}
                  </div>
                ))}
                <Nota>Ocupa lugar quem tem clientes ou aulas; gerente e receção não ocupam.</Nota>
              </section>

              <aside className="lv-lista" aria-label="Mudar de plano">
                <span className="lc-par" style={{ justifyContent: 'space-between' }}>
                  <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Mudar de plano</h2>
                  <span className="lv-legenda">O efeito aparece antes</span>
                </span>
                {s.gere ? (
                  <>
                    <div role="radiogroup" aria-label="Plano" style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
                      {(Object.keys(PLANOS) as PlanoLuna[]).map((k) => (
                        <Chip key={k} role="radio" aria-checked={plano === k} ativo={plano === k} disabled={soLer} onClick={() => setPlano(k)}>{PLANOS[k].nome}</Chip>
                      ))}
                    </div>
                    {PLANOS[plano].inclui.map((x) => (
                      <span key={x} className="lc-par lg-sub__inclui"><span>{x}</span><CheckCircle size={16} aria-hidden /></span>
                    ))}
                    <span className="lc-par" style={{ justifyContent: 'space-between' }}>
                      <span>Lugares</span>
                      <span className="lc-par">
                        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Menos um lugar" disabled={soLer || lugares <= 1} onClick={() => setLugares((n) => Math.max(1, n - 1))}><Minus size={16} aria-hidden /></button>
                        <output className="lv-numero-grande" aria-live="polite">{lugares}</output>
                        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Mais um lugar" disabled={soLer} onClick={() => setLugares((n) => n + 1)}><Plus size={16} aria-hidden /></button>
                      </span>
                    </span>
                    {efeito && <EfeitoNota efeito={efeito} />}
                    {efeito && <Botao onClick={() => setConfirmar(true)}>Rever e confirmar</Botao>}
                  </>
                ) : <Nota>Só quem gere a subscrição muda o plano e os lugares.</Nota>}
                <Nota icone={Info}>O preço por lugar ainda está por decidir; esta parte está só pensada.</Nota>
              </aside>
            </div>

            <section className="lv-lista" aria-label="Pagamento da subscrição">
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Pagamento da subscrição</h2>
              <span className="lc-par"><CreditCard size={18} aria-hidden />
                <span>{s.temMetodo ? `${fornecedorFalso.nome}: guardado. Nunca é cobrado.` : 'Sem método de pagamento.'}
                  {s.estado === 'trial' && !s.temMetodo && s.experimentalAte && ` No fim do período experimental (${dia(s.experimentalAte)}) a organização fica só de leitura.`}</span></span>
              {s.gere && (
                <span className="lc-par" style={{ flexWrap: 'wrap' }}>
                  {!s.temMetodo && <Botao variante="secundario" icone={CreditCard} onClick={() => void metodo('metodo')}>Acrescentar método de teste</Botao>}
                  {soLer && <Botao onClick={() => void metodo('retomar')}>Retomar subscrição</Botao>}
                  {!soLer && <Botao variante="secundario" onClick={() => setCancelar(true)}>Cancelar subscrição</Botao>}
                </span>
              )}
              <Nota icone={Warning}>Se o pagamento falhar: aviso, 7 dias de graça e depois só leitura. Nada se apaga e os clientes continuam na app.</Nota>
              {s.historico.length > 0 && (
                <details>
                  <summary className="lv-legenda">Histórico da subscrição</summary>
                  <ul className="lg-sub__historico">
                    {s.historico.map((h, i) => <li key={i} className="lv-legenda">{dia(h.em)} · {descreverEvento(h)}</li>)}
                  </ul>
                </details>
              )}
            </section>
          </>
        )}
      </div>
      {s && efeito && <ConfirmarMudanca aberta={confirmar} s={s} efeito={efeito} onFechar={() => setConfirmar(false)}
        onFeito={(x) => { setConfirmar(false); esquecerSubscricao(); setS(x); setPlano(x.plano); setLugares(x.lugares); toast({ variant: 'success', title: 'Subscrição atualizada' }); }} />}
      <CancelarSubscricao aberta={cancelar} onFechar={() => setCancelar(false)} onFeito={() => { setCancelar(false); esquecerSubscricao(); carregar(); }} /></ComMenuDefinicoes>
    </CoachShell>
  );
}

function descreverEvento(h: DadosSubscricao['historico'][number]): string {
  const estado = (x: string | null) => (x ? rotuloEstado(x as DadosSubscricao['estado']).toLowerCase() : '');
  switch (h.tipo) {
    case 'plano': return `Plano ${PLANOS[h.de as PlanoLuna]?.nome ?? h.de} → ${PLANOS[h.para as PlanoLuna]?.nome ?? h.para}`;
    case 'lugares': return `Lugares ${h.de} → ${h.para}`;
    case 'estado': return `Passou a ${estado(h.para)}${h.motivo ? ` (${h.motivo})` : ''}`;
    case 'metodo': return 'Método de pagamento guardado';
    case 'pagamento_ok': return 'Pagamento recebido';
    case 'pagamento_falhou': return 'Pagamento falhou';
    case 'perdeu_lugar': return `Alguém perdeu o lugar${h.motivo ? ` (${h.motivo})` : ''}`;
    default: return h.tipo;
  }
}

function EfeitoNota({ efeito }: { efeito: EfeitoMudanca }) {
  return (
    <div className="lg-sub__efeito" role="status">
      {efeito.lugaresPara !== efeito.lugaresDe && <p>Lugares: {efeito.lugaresDe} → {efeito.lugaresPara} ({efeito.ocupados} ocupados).</p>}
      {efeito.entram.length > 0 && <p>Entram: {efeito.entram.map(nomeModulo).join(', ')}.</p>}
      {efeito.soLeitura.length > 0 && <p>Ficam só de leitura: {efeito.soLeitura.map(nomeModulo).join(', ')}. Nada se apaga.</p>}
      {efeito.liberta > 0 && <p><b>Tens de escolher {efeito.liberta === 1 ? 'quem perde o lugar' : `${efeito.liberta} pessoas que perdem o lugar`}</b> (ou cancelar convites em Equipa).</p>}
    </div>
  );
}

function ConfirmarMudanca({ aberta, s, efeito, onFechar, onFeito }: {
  aberta: boolean; s: DadosSubscricao; efeito: EfeitoMudanca; onFechar: () => void; onFeito: (s: DadosSubscricao) => void;
}) {
  const scope = useScope();
  const [sai, setSai] = useState<string[]>([]);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { if (aberta) { setSai([]); setErro(null); } }, [aberta]);
  const elegiveis = s.pessoas.filter((p) => p.ocupa && !p.dono);
  const falta = Math.max(0, efeito.liberta - sai.length);
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true); setErro(null);
    try { onFeito(await mudarSubscricao(client, scope, efeito.planoPara, efeito.lugaresPara, sai, sai.length ? 'Perdeu o lugar na mudança de plano' : undefined)); }
    catch (e) { setErro(e instanceof EscolherQuemPerdeError || e instanceof Error ? e.message : 'Não foi possível mudar.'); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo={`${PLANOS[efeito.planoPara].nome} com ${efeito.lugaresPara} ${efeito.lugaresPara === 1 ? 'lugar' : 'lugares'}`} sub="Confirma o efeito antes de mudar.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <EfeitoNota efeito={efeito} />
        {efeito.liberta > 0 && (
          <fieldset className="lg-sub__quem">
            <legend className="lv-sobretitulo">Quem perde o lugar</legend>
            {elegiveis.map((p) => (
              <label key={p.membershipId} className="lc-par">
                <input type="checkbox" checked={sai.includes(p.membershipId)}
                  onChange={(e) => setSai((x) => (e.target.checked ? [...x, p.membershipId] : x.filter((y) => y !== p.membershipId)))} />
                <span>{p.nome} <span className="lv-legenda">· {p.papeis.join(', ')}</span></span>
              </label>
            ))}
            <Nota>Quem perde o lugar deixa de entrar; os clientes dele passam para outro treinador em Equipa. Fica registado.</Nota>
          </fieldset>
        )}
        {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
        <Botao onClick={() => void confirmar()} aCarregar={aGravar} disabled={falta > 0}>{falta > 0 ? `Escolhe mais ${falta}` : 'Confirmar mudança'}</Botao>
      </div>
    </Janela>
  );
}

function CancelarSubscricao({ aberta, onFechar, onFeito }: { aberta: boolean; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [motivo, setMotivo] = useState('Deixei de precisar');
  const [aGravar, setAGravar] = useState(false);
  const motivos = ['Deixei de precisar', 'Muito caro', 'Mudei de ferramenta', 'Outro'];
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true);
    try { await fornecedorFalso.cancelar(client, scope.orgId, motivo); toast({ variant: 'success', title: 'Subscrição cancelada' }); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível cancelar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Cancelar a subscrição" sub="A organização fica só de leitura. Nada se apaga e os clientes continuam na app.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div role="radiogroup" aria-label="Motivo" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {motivos.map((m) => <Chip key={m} role="radio" aria-checked={motivo === m} ativo={motivo === m} onClick={() => setMotivo(m)}>{m}</Chip>)}
        </div>
        <Botao variante="secundario" onClick={() => void confirmar()} aCarregar={aGravar}>Cancelar subscrição</Botao>
      </div>
    </Janela>
  );
}
