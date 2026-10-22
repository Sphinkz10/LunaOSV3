import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  abrirPedido, checkinDeHoje, checkinDiario, enviarFoto, enviarRespostas, erroResposta, fetchMeusPedidos, fetchMinhasAvaliacoes, perguntaVisivel,
  responderPedido, toast, type MeuPedido, type MinhaAvaliacao, type PedidoAberto, type Pergunta, type Respostas,
} from '@luna/core';
import { BotaoFixo, Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { ArrowLeft, CaretRight, ChartLineUp, ClipboardText, Heartbeat, Lock, X } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../vocab';
import { EscolherFoto } from './Permissoes';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro');

/** Em Hoje: o check-in diário (se ainda não fez) e o que o PT pediu (C-08, C-15). */
export function PedidosHoje() {
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState<MeuPedido[]>([]);
  const [feito, setFeito] = useState<boolean | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void enviarRespostas(client).catch(() => undefined);
    void fetchMeusPedidos(client).then(setPedidos).catch(() => setPedidos([]));
    void checkinDeHoje(client).then((c) => setFeito(!!c)).catch(() => setFeito(null));
  }, []);
  if (feito === null && pedidos.length === 0) return null;
  return (
    <section className="lc-lista" aria-label="Para responder">
      {feito === false && (
        <button type="button" className="lc-lista__linha" onClick={() => navigate('/checkin')}>
          <span className="lc-lista__icone"><Heartbeat size={18} aria-hidden /></span>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Como estás hoje?</span><span className="lv-legenda">Check-in em três toques</span></span>
          <CaretRight size={16} aria-hidden />
        </button>
      )}
      {pedidos.map((p) => (
        <button key={p.id} type="button" className="lc-lista__linha" onClick={() => navigate(`/pedido/${p.id}`)}>
          <span className="lc-lista__icone"><ClipboardText size={18} aria-hidden /></span>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{p.nome}</span>
            <span className="lv-legenda">{[p.de && `Pedido por ${p.de.split(' ')[0]}`, `${p.perguntas} perguntas`, p.prazo && `até ${new Date(p.prazo).toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric' })}`].filter(Boolean).join(' · ')}</span></span>
          <CaretRight size={16} aria-hidden />
        </button>
      ))}
    </section>
  );
}

/* ── C-08 · Check-in diário em três toques ──────────────────────────────── */
export function CheckinDiario() {
  const navigate = useNavigate();
  const [sono, setSono] = useState<number | null>(null);
  const [energia, setEnergia] = useState<number | null>(null);
  const [dor, setDor] = useState<boolean | null>(null);
  const [onde, setOnde] = useState('');
  const [aEnviar, setAEnviar] = useState(false);
  const enviar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAEnviar(true);
    try { await checkinDiario(client, { sono, energia, dor: !!dor, onde }); toast({ variant: 'success', title: 'Obrigado', description: dor ? `O teu ${t('responsavel')} foi avisado da dor.` : undefined }); navigate('/hoje'); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível enviar', description: erroDe(e) }); }
    finally { setAEnviar(false); }
  };
  const Escala = ({ v, set, de, ate, rotulo }: { v: number | null; set: (n: number) => void; de: string; ate: string; rotulo: string }) => (
    <div className="lc-escala" role="radiogroup" aria-label={rotulo}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={v === n} className="lc-escala__n" onClick={() => set(n)}>
          <b>{n}</b>{n === 1 && <span>{de}</span>}{n === 5 && <span>{ate}</span>}
        </button>
      ))}
    </div>
  );
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Fechar" onClick={() => navigate('/hoje')}><X size={18} aria-hidden /></button>
        <div style={{ flex: 1 }}><span className="lv-legenda">Check-in de hoje</span><h1 className="lc-cabeca__titulo">Como estás?</h1></div>
      </header>
      <h2 className="lv-sobretitulo">Dormiste</h2>
      <Escala v={sono} set={setSono} de="Mal" ate="Bem" rotulo="Dormiste" />
      <h2 className="lv-sobretitulo">Energia</h2>
      <Escala v={energia} set={setEnergia} de="Nada" ate="Muita" rotulo="Energia" />
      <h2 className="lv-sobretitulo">Alguma dor?</h2>
      <div className="lc-par">
        <button type="button" className="lc-opcao" aria-pressed={dor === false} onClick={() => setDor(false)}>Não</button>
        <button type="button" className="lc-opcao" aria-pressed={dor === true} onClick={() => setDor(true)}>Sim</button>
      </div>
      {dor && (
        <label className="lv-campo"><span className="lv-campo-rotulo">Onde?</span>
          <input className="lv-campo-input" value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="Ex.: joelho direito" /></label>
      )}
      <BotaoFixo aCarregar={aEnviar} disabled={!sono || !energia || dor === null} onClick={() => void enviar()}>Enviar</BotaoFixo>
    </main>
  );
}

/* ── C-15 · Questionário, uma pergunta de cada vez (guarda sem rede) ────── */
export function ResponderPedido() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [p, setP] = useState<PedidoAberto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [r, setR] = useState<Respostas>(() => { try { return JSON.parse(localStorage.getItem(`luna.rascunho.pedido.${id}`) ?? '{}') as Respostas; } catch { return {}; } });
  const [i, setI] = useState(0);
  const [aEnviar, setAEnviar] = useState(false);
  const [fotos, setFotos] = useState(0);
  useEffect(() => {
    const client = getSupabaseClient();
    if (client) void abrirPedido(client, id).then(setP).catch((e) => setErro(erroDe(e)));
  }, [id]);
  // Rascunho no telemóvel: fechar a app não perde as respostas
  useEffect(() => { try { localStorage.setItem(`luna.rascunho.pedido.${id}`, JSON.stringify(r)); } catch { /* conveniência */ } }, [id, r]);
  if (erro) return <main className="lc-ecra"><EstadoPagina tipo="erro" titulo="Não foi possível abrir" texto={erro} acao={{ rotulo: 'Voltar', onClick: () => navigate('/hoje') }} /></main>;
  if (!p) return <main className="lc-ecra"><Esqueleto /></main>;
  if (p.estado !== 'pendente') return <main className="lc-ecra"><EstadoPagina tipo="vazio" icone={ClipboardText} titulo="Já está respondido" texto="Obrigado. O teu PT já recebeu." acao={{ rotulo: 'Voltar', onClick: () => navigate('/hoje') }} /></main>;
  const vis = p.perguntas.filter((q) => perguntaVisivel(q, r));
  const q: Pergunta | undefined = vis[i];
  const falha = q ? erroResposta(q, r[q.id] ?? null) : null;
  const ultima = i === vis.length - 1;
  const enviar = async () => {
    setAEnviar(true);
    try {
      const so = Object.fromEntries(Object.entries(r).filter(([k]) => vis.some((x) => x.id === k)));
      const res = await responderPedido(getSupabaseClient(), id, so);
      try { localStorage.removeItem(`luna.rascunho.pedido.${id}`); } catch { /* idem */ }
      toast({ variant: 'success', title: res === 'enviada' ? 'Enviado' : 'Guardado', description: res === 'enviada' ? undefined : 'Sem rede: envia sozinho quando voltar.' });
      navigate('/hoje');
    } catch (e) { toast({ variant: 'danger', title: 'Ainda falta algo', description: erroDe(e) }); }
    finally { setAEnviar(false); }
  };
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => (i > 0 ? setI(i - 1) : navigate('/hoje'))}><ArrowLeft size={18} aria-hidden /></button>
        <div style={{ flex: 1, minWidth: 0 }}><span className="lv-legenda">{p.nome} · pergunta {i + 1} de {vis.length}</span><h1 className="lc-cabeca__titulo">Questionário</h1></div>
      </header>
      <div className="lc-progresso" aria-hidden>{vis.map((x, k) => <i key={x.id} className={k <= i ? 'feito' : ''} />)}</div>
      {i === 0 && <Nota icone={Lock}>{p.quem_ve}</Nota>}
      {q && (
        <>
          <h2 className="lc-pergunta">{q.texto}</h2>
          <RespostaCampo q={q} v={r[q.id] ?? null} onMudar={(v) => setR({ ...r, [q.id]: v })}
            foto={q.tipo === 'foto' ? <EscolherFoto rotulo={fotos ? `Juntar outra foto (${fotos})` : 'Tirar ou escolher foto'} privado="tirares as fotos do check-in"
              onFoto={(f) => {
                const client = getSupabaseClient();
                if (!client) return;
                void enviarFoto(client, { ficheiro: f, personId: p.person_id, linkId: p.link_id, origem: 'checkin', ref: id, pose: null })
                  .then(() => { setFotos((n) => n + 1); setR((x) => ({ ...x, [q.id]: true })); })
                  .catch(() => toast({ variant: 'danger', title: 'A foto não foi enviada', description: 'Tenta outra vez com rede.' }));
              }} /> : null} />
          {q.tipo === 'foto' && <Nota icone={Lock}>Só o teu {t('responsavel')} vê estas fotos.</Nota>}
          {falha && r[q.id] != null && <p className="lv-legenda" role="alert" style={{ margin: 0 }}>{falha}</p>}
        </>
      )}
      <BotaoFixo aCarregar={aEnviar} disabled={!!falha} onClick={() => (ultima ? void enviar() : setI(i + 1))}>{ultima ? 'Enviar' : 'Seguinte'}</BotaoFixo>
    </main>
  );
}

function RespostaCampo({ q, v, onMudar, foto }: { q: Pergunta; v: Respostas[string]; onMudar: (v: Respostas[string]) => void; foto: React.ReactNode }) {
  if (q.tipo === 'escala') {
    const de = q.min ?? 1; const ate = q.max ?? 5;
    return <div className="lc-escala" role="radiogroup" aria-label={q.texto}>{Array.from({ length: ate - de + 1 }, (_, k) => de + k).map((n) => <button key={n} type="button" role="radio" aria-checked={v === n} className="lc-escala__n" onClick={() => onMudar(n)}><b>{n}</b></button>)}</div>;
  }
  if (q.tipo === 'sim_nao') return <div className="lc-opcoes"><button type="button" className="lc-opcao" aria-pressed={v === false} onClick={() => onMudar(false)}>Não</button><button type="button" className="lc-opcao" aria-pressed={v === true} onClick={() => onMudar(true)}>Sim</button></div>;
  if (q.tipo === 'escolha') return <div className="lc-opcoes">{(q.opcoes ?? []).filter(Boolean).map((o) => <button key={o} type="button" className="lc-opcao" aria-pressed={v === o} onClick={() => onMudar(o)}>{o}</button>)}</div>;
  if (q.tipo === 'escolha_multipla') {
    const a = Array.isArray(v) ? v : [];
    return <div className="lc-opcoes">{(q.opcoes ?? []).filter(Boolean).map((o) => <button key={o} type="button" className="lc-opcao" aria-pressed={a.includes(o)} onClick={() => onMudar(a.includes(o) ? a.filter((x) => x !== o) : [...a, o])}>{o}</button>)}</div>;
  }
  if (q.tipo === 'foto') return <>{foto}</>;
  const tipo = q.tipo === 'numero' ? 'number' : q.tipo === 'data' ? 'date' : q.tipo === 'hora' ? 'time' : 'text';
  return (
    <label className="lv-campo"><span className="lv-campo-rotulo">{q.unidade ? `Em ${q.unidade}` : 'A tua resposta'}</span>
      {q.tipo === 'texto'
        ? <textarea className="lv-campo-input" rows={3} value={v == null ? '' : String(v)} onChange={(e) => onMudar(e.target.value)} />
        : <input className="lv-campo-input" type={tipo} inputMode={q.tipo === 'numero' ? 'decimal' : undefined} value={v == null ? '' : String(v)}
            onChange={(e) => onMudar(q.tipo === 'numero' ? (e.target.value === '' ? null : Number(e.target.value.replace(',', '.'))) : e.target.value)} />}
    </label>
  );
}

/* ── C-16 · Avaliações no Progresso ─────────────────────────────────────── */
export function AvaliacoesProgresso() {
  const [l, setL] = useState<MinhaAvaliacao[] | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (client) void fetchMinhasAvaliacoes(client).then(setL).catch(() => setL([]));
  }, []);
  if (!l || l.length === 0) return null;
  return (
    <section className="lc-grupo" aria-label="Avaliações físicas">
      <h2 className="lv-sobretitulo"><ChartLineUp size={14} aria-hidden /> Avaliações físicas</h2>
      {l.map((a) => (
        <div key={a.id} className="lc-cartao">
          <span className="lc-cartao__rotulo">{a.nome} · {new Date(a.em).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</span>
          {a.linhas.filter((x) => x.estado === 'ok').map((x) => (
            <div key={x.chave} className="lc-medida">
              <span>{x.nome}</span>
              <b>{x.agora?.toLocaleString('pt-PT')} {x.unidade}</b>
              {x.mudou != null && <span className={x.melhor ? 'lc-medida__bom' : 'lc-medida__mau'}>{x.mudou > 0 ? '+' : ''}{x.mudou.toLocaleString('pt-PT')}</span>}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
