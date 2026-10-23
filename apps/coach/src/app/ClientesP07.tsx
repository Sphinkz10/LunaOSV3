import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  avisar, convidarParaApp, desfazerJuntar, fetchClients, juntarClientes, toast,
  type CanalConvite, type ClientRow, type Duplicado,
} from '@luna/core';
import { Avatar, Botao, Chip, Esqueleto, Janela, Nota } from '@luna/ui/v3';
import { ChatCircle, Check, Copy, EnvelopeSimple, QrCode, Users, X } from '@luna/icons';
import qrcode from 'qrcode-generator';
import { useScope } from './ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

/**
 * Clientes · avisos e confirmações (P-07, Figma 141:2 e 141:118): convidar
 * para a app, cliente duplicado, juntar com desfazer e ações em massa que
 * mostram antes a quem chegam e quem fica de fora e porquê.
 */
const p1 = vocab.pessoa();

/* ── Convidar para a app ───────────────────────────────────────────────── */
export interface ParaConvidar { id: string; nome: string; email: string | null; telefone: string | null }

export function ConvidarApp({ cliente, onFechar }: { cliente: ParaConvidar | null; onFechar: () => void }) {
  const [canal, setCanal] = useState<CanalConvite>('sms');
  const [codigo, setCodigo] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!cliente) return;
    setCodigo(null); setErro(null);
    setCanal(cliente.telefone ? 'sms' : cliente.email ? 'email' : 'codigo');
  }, [cliente]);
  if (!cliente) return null;
  const primeiro = cliente.nome.split(' ')[0];
  const enviar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true); setErro(null);
    try {
      const token = await convidarParaApp(client, cliente.id, canal);
      if (canal === 'codigo') setCodigo(token);
      else { toast({ variant: 'success', title: canal === 'sms' ? 'Convite enviado por SMS' : 'Convite enviado por email', description: cliente.nome }); onFechar(); }
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível convidar.'); }
    finally { setAGravar(false); }
  };
  const ligacao = codigo ? `${enderecoAppCliente()}/convite/${codigo}` : '';
  return (
    <Janela aberta onFechar={onFechar} titulo={`Convidar ${cliente.nome}`}
      sub={`Com a app, ${primeiro} vê o treino, marca ${vocab.sessao({ plural: true })} e regista o progresso.`}
      acoes={codigo ? <Botao onClick={onFechar}>Feito</Botao> : <>
        <Botao variante="secundario" onClick={onFechar}>Agora não</Botao>
        <Botao aCarregar={aGravar} onClick={() => void enviar()}>{canal === 'sms' ? 'Enviar SMS' : canal === 'email' ? 'Enviar email' : 'Mostrar código'}</Botao>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        {!codigo && (
          <div role="radiogroup" aria-label="Como enviar" style={{ display: 'flex', gap: 'var(--espaco-8)', flexWrap: 'wrap' }}>
            <Chip role="radio" aria-checked={canal === 'sms'} ativo={canal === 'sms'} disabled={!cliente.telefone} onClick={() => setCanal('sms')}><ChatCircle size={16} aria-hidden />SMS</Chip>
            <Chip role="radio" aria-checked={canal === 'email'} ativo={canal === 'email'} disabled={!cliente.email} onClick={() => setCanal('email')}><EnvelopeSimple size={16} aria-hidden />Email</Chip>
            <Chip role="radio" aria-checked={canal === 'codigo'} ativo={canal === 'codigo'} onClick={() => setCanal('codigo')}><QrCode size={16} aria-hidden />Código</Chip>
          </div>
        )}
        <div className="lg-convite__codigo">
          <div className="lg-convite__qr">
            {codigo ? <CodigoQr texto={ligacao} rotulo={`Código QR do convite de ${cliente.nome}`} /> : <QrCode size={56} aria-hidden />}
          </div>
          <ul className="lg-convite__lista">
            <li><Check size={16} aria-hidden />Liga à conta que já tiver</li>
            <li><Check size={16} aria-hidden />Vale 7 dias</li>
            <li><Check size={16} aria-hidden />Fica no perfil quem convidou</li>
          </ul>
        </div>
        {codigo && (
          <>
            <output className="lg-codigo lg-codigo--ligacao">{ligacao}</output>
            <Botao variante="secundario" icone={Copy} onClick={() => void navigator.clipboard.writeText(ligacao).then(() => toast({ variant: 'success', title: 'Ligação copiada' }))}>Copiar ligação</Botao>
          </>
        )}
        {!cliente.telefone && !cliente.email && !codigo && <Nota>Sem telemóvel nem email: usa o código e mostra-o no telemóvel de {primeiro}.</Nota>}
        {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
      </div>
    </Janela>
  );
}

/**
 * Onde abre o convite: a app do cliente, não a de gestão. Em produção vem de
 * VITE_ATHLETE_URL; em desenvolvimento a app do cliente corre na porta a seguir.
 */
function enderecoAppCliente(local: Location = window.location): string {
  const fixo = (import.meta.env.VITE_ATHLETE_URL as string | undefined)?.trim().replace(/\/+$/, '');
  if (fixo) return fixo;
  const porta = Number(local.port);
  if (/^(localhost|127\.0\.0\.1)$/.test(local.hostname) && porta) return `${local.protocol}//${local.hostname}:${porta + 1}`;
  return local.origin;
}

/** QR que o telemóvel do cliente lê para abrir o convite; desenhado na cor do texto, sem imagem. */
function CodigoQr({ texto, rotulo }: { texto: string; rotulo: string }) {
  const caminho = useMemo(() => {
    const qr = qrcode(0, 'L');
    qr.addData(texto);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { d, n };
  }, [texto]);
  return (
    <svg role="img" aria-label={rotulo} viewBox={`-2 -2 ${caminho.n + 4} ${caminho.n + 4}`} width={96} height={96} shapeRendering="crispEdges">
      <rect x={-2} y={-2} width={caminho.n + 4} height={caminho.n + 4} fill="var(--cor-superficie)" />
      <path d={caminho.d} fill="var(--cor-texto)" />
    </svg>
  );
}

/* ── Cliente duplicado (ao escrever) ───────────────────────────────────── */
const MOTIVO: Record<Duplicado['motivo'], string> = { telefone: 'O telemóvel', email: 'O email', nif: 'O NIF' };
export function AvisoDuplicado({ duplicados, onAbrir }: { duplicados: Duplicado[]; onAbrir: (id: string) => void }) {
  if (duplicados.length === 0) return null;
  const d = duplicados[0];
  return (
    <div className="lg-duplicado" role="alert">
      <Users size={18} aria-hidden />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b>{d.visivel ? `Já existe ${d.nome}` : `Já existe um ${p1} com estes dados`}</b>
        <span className="lv-legenda" style={{ display: 'block' }}>
          {MOTIVO[d.motivo]} é o mesmo{d.arquivado ? ' (arquivado)' : ''}{d.visivel ? ` · ${d.sessoes} ${vocab.sessao({ plural: d.sessoes !== 1 })}` : '. Pede à gerência para o ver.'}
        </span>
      </div>
      {d.visivel && d.linkId && <Botao variante="secundario" onClick={() => onAbrir(d.linkId!)}>Abrir ficha</Botao>}
    </div>
  );
}

/* ── Juntar dois clientes ──────────────────────────────────────────────── */
export function JuntarClientes({ cliente, onFechar, onFeito }: {
  cliente: { id: string; nome: string } | null; onFechar: () => void; onFeito: (manter: string) => void;
}) {
  const scope = useScope();
  const [todos, setTodos] = useState<ClientRow[] | null>(null);
  const [q, setQ] = useState('');
  const [outro, setOutro] = useState<ClientRow | null>(null);
  const [manter, setManter] = useState<'este' | 'outro'>('este');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (!cliente) return;
    setOutro(null); setQ(''); setManter('este');
    const client = getSupabaseClient();
    if (client) void fetchClients(client, scope).then(setTodos).catch(() => setTodos([]));
  }, [cliente, scope]);
  const este = todos?.find((c) => c.id === cliente?.id) ?? null;
  const opcoes = useMemo(() => {
    const termo = q.trim().toLocaleLowerCase('pt-PT');
    return (todos ?? []).filter((c) => c.id !== cliente?.id && (!termo || c.name.toLocaleLowerCase('pt-PT').includes(termo))).slice(0, 8);
  }, [todos, q, cliente]);
  if (!cliente) return null;
  const juntar = async () => {
    const client = getSupabaseClient();
    if (!client || !outro) return;
    const [keep, drop] = manter === 'este' ? [cliente.id, outro.id] : [outro.id, cliente.id];
    const nomeFica = manter === 'este' ? cliente.nome : outro.name;
    setAGravar(true);
    try {
      const id = await juntarClientes(client, keep, drop);
      onFechar(); onFeito(keep);
      avisar({
        tom: 'ok', texto: `${nomeFica} juntado. O histórico dos dois fica aqui.`,
        acao: { rotulo: 'Desfazer', fn: () => void desfazerJuntar(client, id).then(() => onFeito(cliente.id)).catch(() => toast({ variant: 'danger', title: 'Não foi possível desfazer' })) },
      });
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível juntar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  const Cartao = ({ c, qual }: { c: ClientRow; qual: 'este' | 'outro' }) => (
    <button type="button" role="radio" aria-checked={manter === qual} className="lg-juntar__cartao" onClick={() => setManter(qual)}>
      <span style={{ display: 'flex', gap: 'var(--espaco-8)', alignItems: 'center' }}><Avatar nome={c.name} tamanho={32} /><b>{c.name}</b></span>
      <span className="lv-legenda">{c.hasAccount ? 'Usa a app' : 'Sem app'}{c.planName ? ` · ${c.planName}` : ''}</span>
      <dl className="lg-conta__dados"><dt>Email</dt><dd>{c.email ?? '—'}</dd><dt>Telemóvel</dt><dd>{c.phone ?? '—'}</dd></dl>
    </button>
  );
  return (
    <Janela aberta onFechar={onFechar} titulo={outro ? 'Quem fica?' : `Juntar ${cliente.nome} com…`}
      sub={outro ? 'O histórico dos dois junta-se no que fica; o outro fica arquivado. Podes desfazer.' : `Escolhe o ${p1} repetido.`}
      acoes={outro ? <>
        <Botao variante="secundario" onClick={() => setOutro(null)}>Escolher outro</Botao>
        <Botao aCarregar={aGravar} onClick={() => void juntar()}>Juntar</Botao>
      </> : undefined}>
      {!todos ? <Esqueleto linhas={3} />
        : outro && este ? (
          <div role="radiogroup" aria-label="Quem fica" className="lg-juntar">
            <Cartao c={este} qual="este" />
            <Cartao c={outro} qual="outro" />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
            <input className="lv-campo-input" type="search" placeholder={`Procurar ${p1}`} aria-label={`Procurar ${p1}`} value={q} onChange={(e) => setQ(e.target.value)} />
            {opcoes.map((c) => (
              <button key={c.id} type="button" className="lv-linha-lista" onClick={() => setOutro(c)}>
                <Avatar nome={c.name} tamanho={32} />
                <span className="lv-linha-lista__corpo">
                  <span className="lv-linha-lista__titulo">{c.name}</span>
                  <span className="lv-legenda">{[c.email, c.phone].filter(Boolean).join(' · ') || 'Sem contactos'}</span>
                </span>
              </button>
            ))}
          </div>
        )}
    </Janela>
  );
}

/* ── Ações em massa: antes de agir, a quem chega e quem fica de fora ──── */
export interface ForaDeAlcance { nome: string; motivo: string }
export function PreviaMassa({ aberta, titulo, recebem, fora, nota, verbo, onConfirmar, onFechar, children }: {
  aberta: boolean; titulo: string; recebem: number; fora: ForaDeAlcance[]; nota?: string; verbo: string;
  onConfirmar: () => Promise<void>; onFechar: () => void; children?: ReactNode;
}) {
  const [aGravar, setAGravar] = useState(false);
  const motivos = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const f of fora) m.set(f.motivo, [...(m.get(f.motivo) ?? []), f.nome]);
    return [...m.entries()];
  }, [fora]);
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo={titulo}
      acoes={<>
        <Botao variante="secundario" onClick={onFechar}>Rever a lista</Botao>
        <Botao aCarregar={aGravar} disabled={recebem === 0} onClick={() => {
          setAGravar(true);
          void onConfirmar().finally(() => setAGravar(false));
        }}>{verbo} a {recebem}</Botao>
      </>}>
      <ul className="lg-massa">
        <li><Check size={16} aria-hidden /><span><b>{recebem} {recebem === 1 ? 'recebe' : 'recebem'}</b></span></li>
        {motivos.map(([motivo, nomes]) => (
          <li key={motivo}><X size={16} aria-hidden /><span><b>{nomes.length} {nomes.length === 1 ? 'fica' : 'ficam'} de fora</b>: {motivo}
            <span className="lv-legenda" style={{ display: 'block' }}>{nomes.slice(0, 4).join(', ')}{nomes.length > 4 ? ` e mais ${nomes.length - 4}` : ''}</span></span></li>
        ))}
        {nota && <li><Users size={16} aria-hidden /><span>{nota}</span></li>}
      </ul>
      {children}
    </Janela>
  );
}

