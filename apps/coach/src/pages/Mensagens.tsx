import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  abrirConversaCliente, apagarRespostaRapida, contextoConversa, enviarAnexo, enviarFilaMensagens, enviarMensagem, fetchClients, fetchConversas,
  fetchHorarioResposta, fetchMensagens, fetchRespostasRapidas, guardarHorarioResposta, guardarRespostaRapida, marcarLida, ouvirConversa,
  RESPOSTAS_SUGERIDAS, toast, urlDoAnexo, useAuthStore,
  type ClientRow, type ContextoConversa, type Conversa, type HorarioResposta, type Mensagem,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, EstadoPagina, Janela, Nota } from '@luna/ui/v3';
import { ArrowLeft, ChatCircle, Clock, Lock, Plus, UploadSimple, UsersThree } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro');
const quando = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  if (d.toDateString() === ontem.toDateString()) return 'ontem';
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
};
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Mensagens (G-31): conversas 1:1 com o cliente (só tu e ele as veem), do
 * ginásio, de grupo e avisos; respostas rápidas, áudio e anexos; o contexto
 * do cliente ao lado; horário de resposta (fora dele não és notificado).
 */
export function Mensagens() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [lista, setLista] = useState<Conversa[] | null>(null);
  const [filtro, setFiltro] = useState<'todas' | 'responder' | 'grupos'>('todas');
  const [erro, setErro] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [horario, setHorario] = useState(false);
  const [h, setH] = useState<HorarioResposta | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void enviarFilaMensagens(client).catch(() => undefined);
    void fetchConversas(client, scope).then(setLista).catch((e) => setErro(erroDe(e)));
  }, [scope]);
  useEffect(() => {
    carregar();
    const i = setInterval(carregar, 20000);
    const c = getSupabaseClient(); if (c && scope.membershipId) void fetchHorarioResposta(c, scope.membershipId).then(setH);
    return () => clearInterval(i);
  }, [carregar, scope.membershipId]);
  const vis = (lista ?? []).filter((c) => filtro === 'todas' || (filtro === 'responder' ? c.porResponder : c.tipo === 'grupo' || c.tipo === 'aviso'));
  const aberta = (lista ?? []).find((c) => c.id === id) ?? null;
  const porResponder = (lista ?? []).filter((c) => c.porResponder).length;
  return (
    <CoachShell headStrong="Mensagens" headSub={`${porResponder} por responder${h ? ` · respondes das ${h.inicio} às ${h.fim}` : ''}`} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <Botao variante="secundario" icone={Clock} onClick={() => setHorario(true)}>Horário de resposta</Botao>
        <Botao icone={Plus} onClick={() => setNova(true)}>Nova mensagem</Botao>
      </span>}>
      <div className={`lv-root lg-mensagens${id ? ' lg-mensagens--aberta' : ''}`}>
        <section className="lv-lista lg-mensagens__lista" aria-label="Conversas">
          <div className="lg-ficha__metricas">
            <Chip ativo={filtro === 'todas'} onClick={() => setFiltro('todas')}>Todas</Chip>
            <Chip ativo={filtro === 'responder'} onClick={() => setFiltro('responder')}>Por responder {porResponder || ''}</Chip>
            <Chip ativo={filtro === 'grupos'} onClick={() => setFiltro('grupos')}>Grupos</Chip>
          </div>
          {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !lista ? <Esqueleto linhas={4} /> : vis.length === 0
            ? <p className="lv-legenda" style={{ margin: 0 }}>{filtro === 'responder' ? 'Nada por responder.' : 'Ainda sem conversas. Começa em Nova mensagem.'}</p>
            : vis.map((c) => (
              <button key={c.id} type="button" className="lg-conversa" aria-current={c.id === id} onClick={() => navigate(`/messages/${c.id}`)}>
                {c.tipo === 'grupo' || c.tipo === 'aviso' ? <span className="lg-pergunta__n"><UsersThree size={16} aria-hidden /></span> : <Avatar nome={c.titulo} tamanho={36} />}
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.titulo}</span>
                  <span className="lv-legenda">{c.ultimaLado === 'equipa' ? 'Tu: ' : ''}{c.ultima ?? 'Sem mensagens'}</span></span>
                <span className="lg-conversa__lado"><span className="lv-legenda">{quando(c.ultimaEm)}</span>{c.porLer > 0 && <span className="lg-conversa__n">{c.porLer}</span>}</span>
              </button>
            ))}
        </section>
        {aberta ? <Fio key={aberta.id} c={aberta} onMudou={carregar} onVoltar={() => navigate('/messages')} />
          : <EstadoPagina tipo="vazio" icone={ChatCircle} titulo="Escolhe uma conversa" texto="O que falas com cada cliente fica entre os dois; a receção não vê." />}
      </div>
      <NovaConversa aberta={nova} onFechar={() => setNova(false)} onAberta={(cid) => { setNova(false); carregar(); navigate(`/messages/${cid}`); }} />
      <HorarioRespostaJanela aberta={horario} atual={h} onFechar={() => setHorario(false)} onGuardado={(x) => { setH(x); setHorario(false); }} />
    </CoachShell>
  );
}

function Fio({ c, onMudou, onVoltar }: { c: Conversa; onMudou: () => void; onVoltar: () => void }) {
  const scope = useScope();
  const meuId = useAuthStore((s) => s.userId);
  const navigate = useNavigate();
  const [msgs, setMsgs] = useState<Mensagem[] | null>(null);
  const [texto, setTexto] = useState('');
  const [ctx, setCtx] = useState<ContextoConversa | null>(null);
  const [rapidas, setRapidas] = useState<{ id: string; texto: string }[]>([]);
  const [editarRapidas, setEditarRapidas] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMensagens(client, c.id, meuId ?? null).then((m) => { setMsgs(m); void marcarLida(client, c.id).then(onMudou); }).catch(() => setMsgs([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id, meuId]);
  useEffect(() => {
    carregar();
    const client = getSupabaseClient();
    if (!client) return;
    void contextoConversa(client, c.id).then(setCtx);
    if (scope.membershipId) void fetchRespostasRapidas(client, scope.membershipId).then(setRapidas);
    const parar = ouvirConversa(client, c.id, carregar);
    const i = setInterval(carregar, 15000);
    return () => { parar(); clearInterval(i); };
  }, [c.id, carregar, scope.membershipId]);
  useEffect(() => { fim.current?.scrollIntoView({ block: 'end' }); }, [msgs?.length]);
  const enviar = async (t: string) => {
    if (!t.trim()) return;
    setTexto('');
    try {
      const r = await enviarMensagem(getSupabaseClient(), c.id, t, 'equipa');
      if (r === 'na_fila') toast({ variant: 'warning', title: 'Sem rede', description: 'A mensagem segue quando a rede voltar.' });
      carregar();
    } catch (e) { setTexto(t); toast({ variant: 'danger', title: 'Não foi enviada', description: erroDe(e) }); }
  };
  const anexar = async (f: File) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await enviarAnexo(client, c.id, f, f.name, f.type.startsWith('audio') ? 'audio' : 'anexo'); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'O anexo não foi enviado', description: erroDe(e) }); }
  };
  const lista = rapidas.length ? rapidas.map((r) => r.texto) : RESPOSTAS_SUGERIDAS;
  return (
    <>
      <section className="lv-lista lg-fio" aria-label={`Conversa com ${c.titulo}`}>
        <div className="lv-lista__cabeca">
          <span className="lg-seg__quem">
            <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone lg-fio__voltar" aria-label="Voltar às conversas" onClick={onVoltar}><ArrowLeft size={16} aria-hidden /></button>
            <Avatar nome={c.titulo} tamanho={36} /><span><b>{c.titulo}</b>
              <span className="lv-legenda" style={{ display: 'block' }}>{c.tipo === 'pt' ? 'Só tu e o cliente veem esta conversa' : c.tipo === 'ginasio' ? 'Conversa do ginásio' : c.tipo === 'grupo' ? 'Grupo' : 'Avisos'}</span></span></span>
        </div>
        <div className="lg-fio__msgs" aria-live="polite">
          {!msgs ? <Esqueleto linhas={3} /> : msgs.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ainda sem mensagens.</p> : msgs.map((m) => <Bolha key={m.id} m={m} />)}
          <div ref={fim} />
        </div>
        <>
            <div className="lg-fio__rapidas">
              {lista.map((r) => <Chip key={r} onClick={() => void enviar(r)}>{r}</Chip>)}
              <button type="button" className="lg-link" onClick={() => setEditarRapidas(true)}>Editar</button>
            </div>
            <form className="lg-fio__escrever" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
              <label className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Anexar ficheiro ou áudio">
                <UploadSimple size={16} aria-hidden />
                <input type="file" className="sr-only" accept="image/*,audio/*,application/pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) void anexar(f); e.target.value = ''; }} />
              </label>
              <Gravar onAudio={(b, d) => { const cl = getSupabaseClient(); if (cl) void enviarAnexo(cl, c.id, b, 'audio.webm', 'audio', d).then(carregar).catch((e) => toast({ variant: 'danger', title: 'O áudio não foi enviado', description: erroDe(e) })); }} />
              <input className="lv-campo-input" aria-label="Mensagem" placeholder={`Escrever${c.tipo === 'pt' ? ` a ${c.titulo.split(' ')[0]}` : ''}…`} value={texto} onChange={(e) => setTexto(e.target.value)} />
              <Botao type="submit" disabled={!texto.trim()}>Enviar</Botao>
            </form>
        </>
      </section>
      <aside className="lg-ficha__coluna lg-fio__lado" aria-label="Contexto">
        {ctx ? (
          <section className="lv-lista">
            <span className="lg-seg__quem"><Avatar nome={ctx.nome} tamanho={44} /><span><b>{ctx.nome}</b>
              <span className="lv-legenda" style={{ display: 'block' }}>{vocab.pessoa({ maiuscula: true })} desde {new Date(ctx.desde).toLocaleDateString('pt-PT', { month: 'long', year: 'numeric' })}</span></span></span>
            <dl className="lg-conta__dados">
              <dt>Próxima sessão</dt><dd>{ctx.proxima ? new Date(ctx.proxima).toLocaleString('pt-PT', { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
              <dt>Plano</dt><dd>{ctx.plano ?? '—'}</dd>
              <dt>Restrição</dt><dd>{ctx.zonas.length ? `${ctx.zonas.join(', ')} · adaptar` : 'Nenhuma'}</dd>
              <dt>Último check-in</dt><dd>{ctx.checkin ? `${quando(ctx.checkin.dia)} · energia ${ctx.checkin.energia ?? '—'} de 5${ctx.checkin.dor ? ' · dor' : ''}` : '—'}</dd>
              <dt>Pack</dt><dd>{ctx.pack ? `${ctx.pack.nome} · restam ${ctx.pack.restam}` : '—'}</dd>
            </dl>
            <Botao variante="secundario" onClick={() => navigate(`/clients/${ctx.link_id}`)}>Abrir ficha</Botao>
          </section>
        ) : null}
        {c.tipo === 'pt' && <Nota icone={Lock}>Só tu e {c.titulo.split(' ')[0]} veem esta conversa.</Nota>}
      </aside>
      <RespostasRapidas aberta={editarRapidas} atuais={rapidas} onFechar={() => setEditarRapidas(false)} onMudou={setRapidas} />
    </>
  );
}

function Bolha({ m }: { m: Mensagem }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const c = getSupabaseClient();
    if (c && m.anexo) void urlDoAnexo(c, m.anexo).then(setUrl);
  }, [m.anexo]);
  return (
    <div className={`lg-bolha${m.lado === 'equipa' ? ' lg-bolha--minha' : ''}${m.aEnviar ? ' lg-bolha--fila' : ''}`}>
      {m.tipo === 'resultado' && <span className="lg-bolha__resultado"><b>{m.meta.titulo}</b>{m.meta.resumo && <span className="lv-legenda">{m.meta.resumo}</span>}</span>}
      {m.tipo === 'audio' && (url ? <audio controls src={url} aria-label="Áudio"><track kind="captions" /></audio> : <span className="lv-legenda">Áudio…</span>)}
      {m.tipo === 'anexo' && (url ? (m.meta.mime?.startsWith('image') ? <img src={url} alt={m.meta.nome ?? 'Imagem'} className="lg-bolha__img" /> : <a href={url} target="_blank" rel="noreferrer">{m.meta.nome ?? 'Anexo'}</a>) : <span className="lv-legenda">Anexo…</span>)}
      {m.texto && <span>{m.texto}</span>}
      <span className="lg-bolha__hora">{m.aEnviar ? 'Por enviar' : quando(m.em)}</span>
    </div>
  );
}

/** Gravar áudio (MediaRecorder); sem microfone, o botão não aparece. */
function Gravar({ onAudio }: { onAudio: (b: Blob, segundos: number) => void }) {
  const [a, setA] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const inicio = useRef(0);
  if (typeof window === 'undefined' || !('MediaRecorder' in window) || !navigator.mediaDevices) return null;
  const alternar = async () => {
    if (a && rec.current) { rec.current.stop(); setA(false); return; }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(s); const partes: BlobPart[] = [];
      r.ondataavailable = (e) => partes.push(e.data);
      r.onstop = () => { s.getTracks().forEach((t) => t.stop()); onAudio(new Blob(partes, { type: r.mimeType || 'audio/webm' }), Math.round((Date.now() - inicio.current) / 1000)); };
      rec.current = r; inicio.current = Date.now(); r.start(); setA(true);
    } catch { toast({ variant: 'warning', title: 'Sem acesso ao microfone', description: 'Liga o microfone nas definições do browser, ou escreve.' }); }
  };
  return <button type="button" className={`lv-btn lv-btn--secundario${a ? ' lg-gravar--ativo' : ''}`} aria-pressed={a} onClick={() => void alternar()}>{a ? 'Parar e enviar' : 'Áudio'}</button>;
}

function NovaConversa({ aberta, onFechar, onAberta }: { aberta: boolean; onFechar: () => void; onAberta: (id: string) => void }) {
  const scope = useScope();
  const [cl, setCl] = useState<ClientRow[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { const c = getSupabaseClient(); if (aberta && c) void fetchClients(c, scope).then(setCl).catch(() => setCl([])); }, [aberta, scope]);
  const f = q.trim().toLocaleLowerCase('pt-PT');
  const abrir = async (id: string) => {
    const c = getSupabaseClient();
    if (!c) return;
    try { onAberta(await abrirConversaCliente(c, id)); } catch (e) { toast({ variant: 'danger', title: 'Não foi possível abrir', description: erroDe(e) }); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Nova mensagem">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
        <Campo rotulo="Para" type="search" placeholder={`Nome do ${vocab.pessoa()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {!cl ? <Esqueleto linhas={3} /> : cl.filter((c) => !f || c.name.toLocaleLowerCase('pt-PT').includes(f)).slice(0, 20).map((c) => (
          <button key={c.id} type="button" className="lv-linha-lista" onClick={() => void abrir(c.id)}>
            <Avatar nome={c.name} tamanho={32} /><span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.name}</span>
              <span className="lv-legenda">{c.hasAccount ? 'Usa a app' : 'Ainda sem app: vê a mensagem quando entrar'}</span></span>
          </button>
        ))}
      </div>
    </Janela>
  );
}

function HorarioRespostaJanela({ aberta, atual, onFechar, onGuardado }: { aberta: boolean; atual: HorarioResposta | null; onFechar: () => void; onGuardado: (h: HorarioResposta) => void }) {
  const scope = useScope();
  const [h, setH] = useState<HorarioResposta>(atual ?? { inicio: '08:00', fim: '20:00', dias: [1, 2, 3, 4, 5, 6] });
  useEffect(() => { if (aberta) setH(atual ?? { inicio: '08:00', fim: '20:00', dias: [1, 2, 3, 4, 5, 6] }); }, [aberta, atual]);
  const guardar = async () => {
    const c = getSupabaseClient();
    if (!c || !scope.membershipId) return;
    try { await guardarHorarioResposta(c, scope.membershipId, h); toast({ variant: 'success', title: 'Horário guardado' }); onGuardado(h); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Horário de resposta" sub="Fora dele não recebes notificações e o cliente vê quando vais responder.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div className="lg-ficha__metricas">{[1, 2, 3, 4, 5, 6, 0].map((d) => <Chip key={d} ativo={h.dias.includes(d)} onClick={() => setH({ ...h, dias: h.dias.includes(d) ? h.dias.filter((x) => x !== d) : [...h.dias, d] })}>{DIAS[d]}</Chip>)}</div>
        <div className="lg-conta__prefs">
          <Campo rotulo="Das" type="time" value={h.inicio} onChange={(e) => setH({ ...h, inicio: e.target.value })} />
          <Campo rotulo="Às" type="time" value={h.fim} onChange={(e) => setH({ ...h, fim: e.target.value })} />
        </div>
        <Botao disabled={h.inicio >= h.fim || !h.dias.length} onClick={() => void guardar()}>Guardar</Botao>
      </div>
    </Janela>
  );
}

function RespostasRapidas({ aberta, atuais, onFechar, onMudou }: { aberta: boolean; atuais: { id: string; texto: string }[]; onFechar: () => void; onMudou: (l: { id: string; texto: string }[]) => void }) {
  const scope = useScope();
  const [t, setT] = useState('');
  const recarregar = async () => { const c = getSupabaseClient(); if (c && scope.membershipId) onMudou(await fetchRespostasRapidas(c, scope.membershipId)); };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Respostas rápidas">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
        {atuais.length === 0 && <p className="lv-legenda" style={{ margin: 0 }}>Ainda usas as sugeridas. Junta as tuas.</p>}
        {atuais.map((r) => (
          <div key={r.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className="lv-linha-lista__corpo">{r.texto}</span>
            <Botao variante="secundario" onClick={() => { const c = getSupabaseClient(); if (c) void apagarRespostaRapida(c, r.id).then(recarregar); }}>Tirar</Botao>
          </div>
        ))}
        <Campo rotulo="Nova resposta" value={t} maxLength={200} onChange={(e) => setT(e.target.value)} />
        <Botao disabled={!t.trim()} onClick={() => { const c = getSupabaseClient(); if (c && scope.membershipId) void guardarRespostaRapida(c, scope.membershipId, t).then(() => { setT(''); void recarregar(); }); }}>Juntar</Botao>
      </div>
    </Janela>
  );
}
