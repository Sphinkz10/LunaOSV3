import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  arquivarGrupo, criarGrupo, fetchClients, fetchGrupos, fetchHistoricoGrupo, fetchMembrosGrupo, fetchStaff, juntarAoGrupo, mudarResponsavelGrupo,
  reporGrupo, sairDoGrupo, toast, type ClientRow, type EventoGrupo, type Grupo, type MembroGrupo, type StaffLite,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota } from '@luna/ui/v3';
import { Plus, ShieldCheck, UsersThree } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro');
const dia = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * Grupos (G-08): pesquisa, ativos e arquivados, membros por datas, arquivar e
 * repor com motivo e histórico. O responsável recebe os avisos do grupo; não
 * muda as permissões de ninguém.
 */
export function Grupos() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [equipa, setEquipa] = useState<StaffLite[]>([]);
  const [q, setQ] = useState('');
  const [arquivados, setArquivados] = useState(false);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchGrupos(client, scope).then(setGrupos).catch((e) => setErro(erroDe(e)));
  }, [scope]);
  useEffect(() => { carregar(); const c = getSupabaseClient(); if (c) void fetchStaff(c, scope).then(setEquipa).catch(() => setEquipa([])); }, [carregar, scope]);
  const visiveis = (grupos ?? []).filter((g) => g.arquivado === arquivados && (!q.trim() || g.nome.toLocaleLowerCase('pt-PT').includes(q.trim().toLocaleLowerCase('pt-PT'))));
  const aberto = grupos?.find((g) => g.id === id) ?? null;
  const criar = async () => {
    const client = getSupabaseClient();
    if (!client || !nome.trim()) return;
    try { const nid = await criarGrupo(client, scope, nome, scope.membershipId); setNovo(false); setNome(''); carregar(); navigate(`/groups/${nid}`); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível criar', description: erroDe(e) }); }
  };
  return (
    <CoachShell headStrong="Grupos" headSub={grupos ? `${grupos.filter((g) => !g.arquivado).length} ativos` : undefined} legado={false}
      topActions={<Botao icone={Plus} onClick={() => setNovo(true)}>Novo grupo</Botao>}>
      <div className="lv-root lg-grupos">
        <section className="lv-lista" aria-label="Grupos">
          <Campo rotulo="Pesquisar grupo" type="search" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="lg-ficha__metricas">
            <Chip ativo={!arquivados} onClick={() => setArquivados(false)}>Ativos {grupos?.filter((g) => !g.arquivado).length ?? ''}</Chip>
            <Chip ativo={arquivados} onClick={() => setArquivados(true)}>Arquivados {grupos?.filter((g) => g.arquivado).length ?? ''}</Chip>
          </div>
          {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !grupos ? <Esqueleto linhas={3} /> : visiveis.length === 0
            ? <p className="lv-legenda" style={{ margin: 0 }}>{arquivados ? 'Nenhum grupo arquivado.' : 'Ainda sem grupos. Cria um para enviar check-ins a todos de uma vez.'}</p>
            : visiveis.map((g) => (
              <button key={g.id} type="button" className="lv-linha-lista" aria-current={g.id === id} onClick={() => navigate(`/groups/${g.id}`)}>
                <span className="lg-pergunta__n">{g.nome.slice(0, 2).toUpperCase()}</span>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{g.nome}</span>
                  <span className="lv-legenda">{g.membros} {g.membros === 1 ? 'membro' : 'membros'}{g.responsavelId ? ` · ${equipa.find((m) => m.id === g.responsavelId)?.name ?? ''}` : ''}</span></span>
              </button>
            ))}
        </section>
        {aberto ? <DetalheGrupo key={aberto.id} g={aberto} equipa={equipa} onMudou={carregar} />
          : <EstadoPagina tipo="vazio" icone={UsersThree} titulo="Escolhe um grupo" texto="Vês os membros com as datas, o responsável e o histórico." />}
      </div>
      <Janela aberta={novo} onFechar={() => setNovo(false)} titulo="Novo grupo">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <Campo rotulo="Nome" placeholder="Ex.: Pilates manhã" value={nome} onChange={(e) => setNome(e.target.value)} />
          <Nota>Ficas como responsável: recebes os avisos do grupo.</Nota>
          <Botao disabled={!nome.trim()} onClick={() => void criar()}>Criar</Botao>
        </div>
      </Janela>
    </CoachShell>
  );
}

function DetalheGrupo({ g, equipa, onMudou }: { g: Grupo; equipa: StaffLite[]; onMudou: () => void }) {
  const scope = useScope();
  const [membros, setMembros] = useState<MembroGrupo[] | null>(null);
  const [hist, setHist] = useState<EventoGrupo[]>([]);
  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [juntar, setJuntar] = useState(false);
  const [quem, setQuem] = useState(''); const [desde, setDesde] = useState(hoje());
  const [sair, setSair] = useState<MembroGrupo | null>(null);
  const [motivo, setMotivo] = useState(''); const [em, setEm] = useState(hoje());
  const [arquivo, setArquivo] = useState(false);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMembrosGrupo(client, g.id).then(setMembros).catch(() => setMembros([]));
    void fetchHistoricoGrupo(client, g.id).then(setHist).catch(() => setHist([]));
  }, [g.id]);
  useEffect(() => { carregar(); const c = getSupabaseClient(); if (c) void fetchClients(c, scope).then(setClientes).catch(() => setClientes([])); }, [carregar, scope]);
  const correr = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); toast({ variant: 'success', title: ok }); carregar(); onMudou(); return true; }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) }); return false; }
  };
  const client = getSupabaseClient();
  const motivos = g.arquivado ? ['Época nova', 'Voltou a abrir', 'Outro'] : ['Fim da época', 'Juntou-se a outro', 'Outro'];
  return (
    <div className="lg-ficha__coluna">
      <section className="lv-lista" aria-label={`Membros de ${g.nome}`}>
        <div className="lv-lista__cabeca"><h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{g.nome}</h2>
          {g.arquivado ? <Estado tom="neutro">Arquivado</Estado> : null}</div>
        {g.arquivado && g.motivoArquivo && <Nota>Arquivado: {g.motivoArquivo}</Nota>}
        {!membros ? <Esqueleto linhas={3} /> : membros.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem membros.</p> : membros.map((m) => (
          <div key={m.linkId} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <Avatar nome={m.nome} tamanho={32} />
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{m.nome}</span>
              <span className="lv-legenda">{m.saiu ? `${dia(m.desde)} a ${dia(m.saiu)} · ${m.motivo}` : `Desde ${dia(m.desde)}`}</span></span>
            {m.saiu ? <Estado tom="neutro">Saiu</Estado> : <><Estado tom="ok">Ativo</Estado>
              {!g.arquivado && <Botao variante="secundario" onClick={() => { setSair(m); setMotivo(''); setEm(hoje()); }}>Saiu</Botao>}</>}
          </div>
        ))}
        {!g.arquivado && <Botao variante="secundario" icone={Plus} onClick={() => setJuntar(true)}>Juntar com data</Botao>}
        <label className="lv-campo"><span className="lv-campo-rotulo">Responsável</span>
          <select className="lv-campo-input" value={g.responsavelId ?? ''} onChange={(e) => client && void correr(() => mudarResponsavelGrupo(client, g.id, e.target.value || null), 'Responsável mudado')}>
            <option value="">Ninguém</option>{equipa.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></label>
        <Nota icone={ShieldCheck}>O responsável recebe os avisos do grupo. Isto não muda as permissões de ninguém.</Nota>
        <Botao variante="secundario" className={g.arquivado ? undefined : 'lg-perigo'} onClick={() => { setArquivo(true); setMotivo(''); }}>{g.arquivado ? 'Repor grupo' : 'Arquivar grupo'}</Botao>
      </section>
      <section className="lv-lista" aria-label="Histórico do grupo">
        <span className="lv-sobretitulo">Histórico do grupo</span>
        {hist.map((h, i) => (
          <div key={i} className="lv-linha-lista" style={{ cursor: 'default', alignItems: 'flex-start' }}>
            <span className="lg-conta__ponto" aria-hidden />
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{h.oque}</span><span className="lv-legenda">{[h.detalhe, dia(h.em)].filter(Boolean).join(' · ')}</span></span>
          </div>
        ))}
      </section>
      <Janela aberta={juntar} onFechar={() => setJuntar(false)} titulo={`Juntar a ${g.nome}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <label className="lv-campo"><span className="lv-campo-rotulo">{vocab.pessoa({ maiuscula: true })}</span>
            <select className="lv-campo-input" value={quem} onChange={(e) => setQuem(e.target.value)}><option value="">Escolher</option>
              {clientes.filter((c) => !membros?.some((m) => m.linkId === c.id && !m.saiu)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <Campo rotulo="Desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <Botao disabled={!quem} onClick={() => client && void correr(() => juntarAoGrupo(client, g.id, quem, desde), 'Juntou-se ao grupo').then((ok) => ok && setJuntar(false))}>Juntar</Botao>
        </div>
      </Janela>
      <Janela aberta={!!sair} onFechar={() => setSair(null)} titulo={`${sair?.nome ?? ''} saiu do grupo?`} sub="Fica no histórico do grupo e da ficha.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <Campo rotulo="Motivo" placeholder="Ex.: mudou de horário" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <Campo rotulo="Em" type="date" value={em} onChange={(e) => setEm(e.target.value)} />
          <Botao disabled={!motivo.trim()} onClick={() => client && sair && void correr(() => sairDoGrupo(client, g.id, sair.linkId, motivo, em), 'Registado').then((ok) => ok && setSair(null))}>Confirmar saída</Botao>
        </div>
      </Janela>
      <Janela aberta={arquivo} onFechar={() => setArquivo(false)} titulo={g.arquivado ? `Repor ${g.nome}?` : `Arquivar ${g.nome}?`}
        sub={g.arquivado ? undefined : `Os ${membros?.filter((m) => !m.saiu).length ?? 0} membros ficam no histórico. Os check-ins recorrentes para o grupo param.`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <span className="lv-sobretitulo">Motivo</span>
          <div className="lg-ficha__metricas">{motivos.map((x) => <Chip key={x} ativo={motivo === x} onClick={() => setMotivo(x)}>{x}</Chip>)}</div>
          {motivo === 'Outro' && <Campo rotulo="Qual?" onChange={(e) => setMotivo(e.target.value || 'Outro')} />}
          <Botao disabled={!motivo.trim()} onClick={() => client && void correr(
            () => (g.arquivado ? reporGrupo(client, g.id, motivo) : arquivarGrupo(client, g.id, motivo)), g.arquivado ? 'Grupo reposto' : 'Grupo arquivado',
          ).then((ok) => ok && setArquivo(false))}>{g.arquivado ? 'Repor' : 'Arquivar'}</Botao>
        </div>
      </Janela>
    </div>
  );
}
