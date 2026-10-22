import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  abrirConversaComMeuPT, enviarAnexo, enviarFilaMensagens, enviarMensagem, fetchConversas, fetchMensagens, fetchMinhasLigacoes, janelaDeResposta,
  marcarLida, ouvirConversa, toast, urlDoAnexo, type Conversa, type Mensagem,
} from '@luna/core';
import { Avatar, Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { ArrowLeft, ChatCircle, Lock, UploadSimple, UsersThree } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { useSessao } from '../sessao';
import { t } from '../vocab';

const quando = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
};

/** C-18 · As conversas: o meu PT, a turma e o ginásio; os avisos só se leem. */
export function MensagensCliente() {
  const navigate = useNavigate();
  const [lista, setLista] = useState<Conversa[] | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'porler' | 'avisos'>('todas');
  const [semPT, setSemPT] = useState<{ linkId: string; nome: string }[]>([]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void enviarFilaMensagens(client).catch(() => undefined);
    void fetchConversas(client).then(setLista).catch(() => setLista([]));
    void fetchMinhasLigacoes(client).then((l) => setSemPT(l.filter((x) => x.responsavel).map((x) => ({ linkId: x.linkId, nome: x.responsavel! })))).catch(() => setSemPT([]));
  }, []);
  const falarCom = async (linkId: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { navigate(`/mensagens/${await abrirConversaComMeuPT(client, linkId)}`); }
    catch { toast({ variant: 'danger', title: 'Não foi possível abrir a conversa' }); }
  };
  const vis = (lista ?? []).filter((c) => filtro === 'todas' || (filtro === 'porler' ? c.porLer > 0 : c.tipo === 'aviso'));
  const porComecar = semPT.filter((p) => !(lista ?? []).some((c) => c.tipo === 'pt' && c.titulo === p.nome));
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => navigate('/hoje')}><ArrowLeft size={18} aria-hidden /></button>
        <div style={{ flex: 1 }}><h1 className="lc-cabeca__titulo">Mensagens</h1></div>
      </header>
      <div className="lc-filtros" aria-label="Filtro">
        {([['todas', 'Todas'], ['porler', `Por ler ${(lista ?? []).filter((c) => c.porLer).length || ''}`], ['avisos', 'Avisos']] as const).map(([k, r]) => (
          <button key={k} type="button" aria-pressed={filtro === k} className="lv-chip" onClick={() => setFiltro(k)}>{r}</button>
        ))}
      </div>
      {!lista ? <Esqueleto /> : (
        <section className="lc-lista" aria-label="Conversas">
          {porComecar.map((p) => (
            <button key={p.linkId} type="button" className="lc-lista__linha" onClick={() => void falarCom(p.linkId)}>
              <Avatar nome={p.nome} tamanho={40} />
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{p.nome}</span><span className="lv-legenda">O teu {t('responsavel')} · começar conversa</span></span>
            </button>
          ))}
          {vis.length === 0 && porComecar.length === 0 ? <EstadoPagina tipo="vazio" icone={ChatCircle} titulo="Sem mensagens" texto={`Quando o teu ${t('responsavel')} te escrever, aparece aqui.`} /> : vis.map((c) => (
            <button key={c.id} type="button" className="lc-lista__linha" onClick={() => navigate(`/mensagens/${c.id}`)}>
              {c.tipo === 'grupo' || c.tipo === 'aviso' ? <span className="lc-lista__icone"><UsersThree size={18} aria-hidden /></span> : <Avatar nome={c.titulo} tamanho={40} />}
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.titulo}</span>
                <span className="lv-legenda lc-reticencias">{c.ultimaLado === 'cliente' ? 'Tu: ' : ''}{c.ultima ?? ''}</span></span>
              <span className="lc-conversa__lado"><span className="lv-legenda">{quando(c.ultimaEm)}</span>{c.porLer > 0 && <span className="lc-conversa__n">{c.porLer}</span>}</span>
            </button>
          ))}
        </section>
      )}
      <Nota icone={Lock}>O que falas com o teu {t('responsavel')} fica entre vocês.</Nota>
    </main>
  );
}

/** C-18 · Uma conversa: resultados, áudio e anexos; fora do horário diz quando responde. */
export function ConversaCliente() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { sessao } = useSessao();
  const meu = sessao?.user.id ?? null;
  const [c, setC] = useState<Conversa | null>(null);
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null);
  const [janela, setJanela] = useState<{ dentro: boolean; texto?: string } | null>(null);
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMensagens(client, id, meu).then((m) => { setMsgs(m); void marcarLida(client, id); }).catch(() => setMsgs([]));
  }, [id, meu]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    carregar();
    void fetchConversas(client).then((l) => setC(l.find((x) => x.id === id) ?? null));
    void janelaDeResposta(client, id).then(setJanela);
    const parar = ouvirConversa(client, id, carregar);
    const i = setInterval(carregar, 15000);
    return () => { parar(); clearInterval(i); };
  }, [id, carregar]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);
  const enviar = async () => {
    const tx = texto.trim();
    if (!tx) return;
    setTexto('');
    try {
      const r = await enviarMensagem(getSupabaseClient(), id, tx, 'cliente');
      if (r === 'na_fila') toast({ variant: 'warning', title: 'Sem rede', description: 'Segue quando a rede voltar.' });
      carregar();
    } catch { setTexto(tx); toast({ variant: 'danger', title: 'Não foi enviada' }); }
  };
  const aviso = c?.tipo === 'aviso';
  return (
    <main className="lc-ecra lc-conversa">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => navigate('/mensagens')}><ArrowLeft size={18} aria-hidden /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="lv-legenda">{c?.tipo === 'pt' ? `O teu ${t('responsavel')}${janela?.texto ? ` · ${janela.texto.toLocaleLowerCase('pt-PT')}` : ''}` : c?.tipo === 'aviso' ? 'Avisos do ginásio' : c?.tipo === 'grupo' ? 'Grupo' : ''}</span>
          <h1 className="lc-cabeca__titulo">{c?.titulo ?? 'Conversa'}</h1>
        </div>
      </header>
      {janela && !janela.dentro && <Nota>{janela.texto}. Podes escrever na mesma: lê quando voltar.</Nota>}
      <div className="lc-msgs" aria-live="polite">
        {!msgs ? <Esqueleto linhas={3} /> : msgs.map((m) => <BolhaCliente key={m.id} m={m} />)}
        <div ref={fim} />
      </div>
      {aviso ? <Nota>Os avisos só se leem.</Nota> : (
        <form className="lc-escrever" onSubmit={(e) => { e.preventDefault(); void enviar(); }}>
          <label className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Anexar">
            <UploadSimple size={18} aria-hidden />
            <input type="file" className="sr-only" accept="image/*,application/pdf,audio/*" onChange={(e) => {
              const f = e.target.files?.[0]; const client = getSupabaseClient();
              if (f && client) void enviarAnexo(client, id, f, f.name, f.type.startsWith('audio') ? 'audio' : 'anexo').then(carregar).catch(() => toast({ variant: 'danger', title: 'O anexo não foi enviado' }));
              e.target.value = '';
            }} />
          </label>
          <input className="lv-campo-input" aria-label="Mensagem" placeholder="Mensagem" value={texto} onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="lv-btn lv-btn--principal" disabled={!texto.trim()}>Enviar</button>
        </form>
      )}
    </main>
  );
}

function BolhaCliente({ m }: { m: Mensagem }) {
  const navigate = useNavigate();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => { const c = getSupabaseClient(); if (c && m.anexo) void urlDoAnexo(c, m.anexo).then(setUrl); }, [m.anexo]);
  const minha = m.lado === 'cliente';
  return (
    <div className={`lc-bolha${minha ? ' lc-bolha--minha' : ''}${m.aEnviar ? ' lc-bolha--fila' : ''}`}>
      {m.tipo === 'resultado' && (
        <button type="button" className="lc-bolha__resultado" onClick={() => navigate(m.meta.rota ?? '/progresso')}>
          <b>{m.meta.titulo}</b>{m.meta.resumo && <span className="lv-legenda">{m.meta.resumo}</span>}
        </button>
      )}
      {m.tipo === 'audio' && (url ? <audio controls src={url} aria-label="Áudio"><track kind="captions" /></audio> : <span className="lv-legenda">Áudio…</span>)}
      {m.tipo === 'anexo' && (url ? (m.meta.mime?.startsWith('image') ? <img src={url} alt={m.meta.nome ?? 'Imagem'} className="lc-bolha__img" /> : <a href={url} target="_blank" rel="noreferrer">{m.meta.nome ?? 'Anexo'}</a>) : <span className="lv-legenda">Anexo…</span>)}
      {m.texto && <span>{m.texto}</span>}
      <span className="lc-bolha__hora">{m.aEnviar ? 'Por enviar' : quando(m.em)}</span>
    </div>
  );
}
