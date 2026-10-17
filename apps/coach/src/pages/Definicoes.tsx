import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  arquivarSala, definirDiretorTecnico, descreverAcao, fetchMarca, fetchSeguranca, fetchStaff, fetchUnidades, guardarMarca, guardarSala,
  guardarUnidade, toast, useAuthStore,
  type Acao, type AcessoSaude, type DoisFatoresMembro, type EntradaEquipa, type MarcaOrg, type StaffLite, type Unidade,
} from '@luna/core';
import { Avatar, Botao, Campo, Esqueleto, Estado, EstadoPagina, Janela, Nota, SemPermissao } from '@luna/ui/v3';
import {
  CaretRight, ClipboardText, Fingerprint, Gear, Heartbeat, LockKey, MapPin, Palette, Plug, ShieldCheck, Sliders, UploadSimple, UserCircle, UsersThree, Wallet,
} from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const quando = (iso: string) => {
  const d = new Date(iso); const hoje = new Date().toDateString();
  const ontem = new Date(Date.now() - 86_400_000).toDateString();
  const h = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === hoje ? `hoje ${h}` : d.toDateString() === ontem ? `ontem ${h}` : `${d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })} ${h}`;
};

/* ── Definições (entrada) ──────────────────────────────────────────────── */
export function Definicoes() {
  const navigate = useNavigate();
  const scope = useScope();
  const pode = (p: string) => scope.permissions.includes(p);
  const itens: { icone: typeof Gear; titulo: string; texto: string; to: string; ver: boolean }[] = [
    { icone: UsersThree, titulo: 'Equipa e acessos', texto: 'Quem faz o quê, convites, títulos e diretor técnico', to: '/settings/equipa', ver: pode('team.manage') },
    { icone: ShieldCheck, titulo: 'Segurança e auditoria', texto: 'Quem fez o quê, acessos à saúde e dois fatores', to: '/settings/seguranca', ver: pode('org.manage') },
    { icone: Sliders, titulo: 'Ginásio e preferências', texto: 'Unidades e salas, horários, marca da app e módulos', to: '/settings/ginasio', ver: pode('org.manage') },
    { icone: Wallet, titulo: 'Planos e preços', texto: 'Packs de sessões: criar, preço e validade', to: '/business/packs', ver: pode('clients.write') },
    { icone: UploadSimple, titulo: `Importar ${vocab.pessoa({ plural: true })}`, texto: 'De Excel ou de outra app, com relatório de falhas', to: '/clients/importar', ver: pode('clients.write') },
    { icone: UserCircle, titulo: 'A minha conta', texto: 'Perfil, palavra-passe, sessões e preferências', to: '/conta', ver: true },
  ];
  return (
    <CoachShell headStrong="Definições" headSub={scope.orgName} legado={false}>
      <div className="lv-root">
        <nav className="lv-lista" aria-label="Definições">
          {itens.filter((i) => i.ver).map((i) => (
            <button key={i.to} type="button" className="lv-linha-lista" onClick={() => navigate(i.to)}>
              <span className="lc-lista__icone lg-def__icone"><i.icone size={18} aria-hidden /></span>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{i.titulo}</span><span className="lv-legenda">{i.texto}</span></span>
              <CaretRight size={16} aria-hidden />
            </button>
          ))}
        </nav>
      </div>
    </CoachShell>
  );
}

/* ── G-45 Segurança e auditoria ────────────────────────────────────────── */
type SepSeg = 'acoes' | 'saude' | 'sessoes' | 'dois';
export function Seguranca() {
  const scope = useScope();
  const pode = scope.permissions.includes('org.manage');
  const [dados, setDados] = useState<{ acoes: Acao[]; saude: AcessoSaude[]; entradas: EntradaEquipa[]; doisFatores: DoisFatoresMembro[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sep, setSep] = useState<SepSeg>('acoes');
  const [aberto, setAberto] = useState<AcessoSaude | Acao | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !pode) return;
    void fetchSeguranca(client, scope).then(setDados).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope, pode]);
  useEffect(() => carregar(), [carregar]);
  if (!pode) return <CoachShell headStrong="Segurança e auditoria" headSub="Definições" legado={false}><div className="lv-root"><SemPermissao area="a auditoria" /></div></CoachShell>;
  const faltam = dados?.doisFatores.filter((d) => d.obrigatorio && !d.ativo) ?? [];
  return (
    <CoachShell headStrong="Segurança e auditoria" headSub="Definições" legado={false}>
      <div className="lv-root lg-ficha">
        <div className="lg-separadores" role="tablist" aria-label="Segurança">
          {([['acoes', 'Registo de ações', dados?.acoes.length], ['saude', 'Acessos à saúde', dados?.saude.length], ['sessoes', 'Sessões', dados?.entradas.length], ['dois', 'Dois fatores', null]] as const).map(([id, r, n]) => (
            <button key={id} type="button" role="tab" aria-selected={sep === id} onClick={() => { setSep(id); setAberto(null); }}>{r}{n != null && <span>{n}</span>}</button>
          ))}
        </div>
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !dados ? <div className="lv-lista"><Esqueleto /></div>
          : (
            <div className="lg-ficha__grelha">
              <section className="lv-lista lg-tabela" aria-label="Registo">
                {sep === 'acoes' && (dados.acoes.length === 0 ? <p className="lv-legenda" style={{ padding: 'var(--espaco-16)' }}>Ainda sem ações registadas.</p>
                  : dados.acoes.map((a, i) => (
                    <button key={i} type="button" className={`lg-seg__linha${aberto === a ? ' lg-tabela__linha--sel' : ''}`} onClick={() => setAberto(a)}>
                      <span className="lg-num" style={{ textAlign: 'left' }}>{quando(a.em)}</span>
                      <span className="lg-seg__quem"><Avatar nome={a.quem} tamanho={28} />{a.quem}</span>
                      <span className="lv-linha-lista__titulo">{descreverAcao(a)}</span>
                    </button>
                  )))}
                {sep === 'saude' && (dados.saude.length === 0 ? <p className="lv-legenda" style={{ padding: 'var(--espaco-16)' }}>Ninguém abriu dados de saúde.</p>
                  : dados.saude.map((s, i) => (
                    <button key={i} type="button" className={`lg-seg__linha${aberto === s ? ' lg-tabela__linha--sel' : ''}`} onClick={() => setAberto(s)}>
                      <span className="lg-num" style={{ textAlign: 'left' }}>{quando(s.em)}</span>
                      <span className="lg-seg__quem"><Avatar nome={s.quem} tamanho={28} />{s.quem}</span>
                      <span><span className="lv-linha-lista__titulo" style={{ display: 'block' }}>Abriu a saúde de {s.cliente}</span>
                        <span className="lv-legenda">{s.foraDaCarteira ? 'Fora da carteira · motivo indicado' : 'Da sua carteira'}</span></span>
                    </button>
                  )))}
                {sep === 'sessoes' && (dados.entradas.length === 0 ? <p className="lv-legenda" style={{ padding: 'var(--espaco-16)' }}>Sem entradas registadas.</p>
                  : dados.entradas.map((e, i) => (
                    <div key={i} className="lg-seg__linha">
                      <span className="lg-num" style={{ textAlign: 'left' }}>{quando(e.em)}</span>
                      <span className="lg-seg__quem"><Avatar nome={e.quem} tamanho={28} />{e.quem}</span>
                      <span>{e.sucesso ? 'Entrou na Gestão' : 'Tentativa falhada'} · {e.aparelho ?? 'aparelho desconhecido'}</span>
                    </div>
                  )))}
                {sep === 'dois' && dados.doisFatores.map((d) => (
                  <div key={d.membershipId} className="lg-seg__linha">
                    <span className="lg-seg__quem"><Avatar nome={d.nome} tamanho={28} />{d.nome}</span>
                    <span className="lv-legenda">{d.obrigatorio ? 'Obrigatório' : 'Opcional'}</span>
                    <Estado tom={d.ativo ? 'ok' : d.obrigatorio ? 'aviso' : 'neutro'}>{d.ativo ? 'Ativo' : 'Ainda não ativou'}</Estado>
                  </div>
                ))}
              </section>
              <div className="lg-ficha__coluna">
                {aberto && 'cliente' in aberto && (
                  <aside className="lv-lista" aria-label="Detalhe">
                    <span className="lv-sobretitulo lg-seg__saude"><Heartbeat size={14} aria-hidden />Acesso à saúde</span>
                    <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{aberto.quem} abriu a saúde de {aberto.cliente}</h3>
                    {aberto.motivo ? <Nota icone={ClipboardText}>Motivo indicado: “{aberto.motivo}”</Nota> : <p className="lv-legenda" style={{ margin: 0 }}>Da carteira de quem abriu: sem motivo pedido.</p>}
                  </aside>
                )}
                {aberto && 'acao' in aberto && (
                  <aside className="lv-lista" aria-label="Detalhe">
                    <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{descreverAcao(aberto)}</h3>
                    <dl className="lg-conta__dados"><dt>Quem</dt><dd>{aberto.quem}</dd><dt>Quando</dt><dd>{quando(aberto.em)}</dd></dl>
                  </aside>
                )}
                <aside className="lv-lista" aria-label="Dois fatores">
                  <div className="lv-lista__cabeca">
                    <h3 className="lv-titulo-cartao">Dois fatores</h3>
                    <span className="lv-legenda">{dados.doisFatores.filter((d) => d.ativo).length} de {dados.doisFatores.length} ativos</span>
                  </div>
                  {faltam.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Todos os obrigatórios estão ativos.</p>
                    : faltam.map((d) => (
                      <div key={d.membershipId} className="lv-linha-lista" style={{ cursor: 'default' }}>
                        <Fingerprint size={18} aria-hidden className="lg-hoje__aviso" />
                        <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{d.nome}</span><span className="lv-legenda">Obrigatório · ainda não ativou</span></span>
                      </div>
                    ))}
                  <Nota icone={LockKey}>Quem gere ou vê saúde só entra com dois fatores; o pedido aparece na próxima entrada.</Nota>
                </aside>
                <Nota>O registo não se pode editar nem apagar, nem pela gerência.</Nota>
              </div>
            </div>
          )}
      </div>
    </CoachShell>
  );
}

/* ── G-46 Ginásio e preferências ───────────────────────────────────────── */
type SepGin = 'unidades' | 'horarios' | 'regulamento' | 'marca' | 'pagamentos' | 'modulos' | 'integracoes';
const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const DIAS_K = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MODULOS: Record<string, string> = { today: 'Hoje', clients: vocab.pessoa({ plural: true, maiuscula: true }), schedule: 'Horário', training: 'Treino', settings: 'Definições' };

export function Ginasio() {
  const scope = useScope();
  const modules = useAuthStore((s) => s.modules);
  const pode = scope.permissions.includes('org.manage');
  const [sep, setSep] = useState<SepGin>('unidades');
  const [unidades, setUnidades] = useState<Unidade[] | null>(null);
  const [equipa, setEquipa] = useState<StaffLite[]>([]);
  const [marca, setMarca] = useState<MarcaOrg | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novaUnidade, setNovaUnidade] = useState(false);
  const [salaPara, setSalaPara] = useState<Unidade | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !pode) return;
    void fetchUnidades(client, scope).then(setUnidades).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchStaff(client, scope).then(setEquipa).catch(() => setEquipa([]));
    void fetchMarca(client, scope).then(setMarca).catch(() => setMarca(null));
  }, [scope, pode]);
  useEffect(() => carregar(), [carregar]);
  if (!pode) return <CoachShell headStrong="Ginásio" headSub="Definições" legado={false}><div className="lv-root"><SemPermissao area="as definições do ginásio" /></div></CoachShell>;

  const secoes: { id: SepGin; rotulo: string; icone: typeof Gear; nota?: string }[] = [
    { id: 'unidades', rotulo: 'Unidades e salas', icone: MapPin }, { id: 'horarios', rotulo: 'Horários de abertura', icone: ClipboardText },
    { id: 'regulamento', rotulo: 'Regulamento e contrato', icone: ClipboardText, nota: 'F2' }, { id: 'marca', rotulo: 'Marca da app', icone: Palette },
    { id: 'pagamentos', rotulo: 'Pagamentos e faturação', icone: Wallet, nota: 'Por ligar' }, { id: 'modulos', rotulo: 'Módulos', icone: Sliders },
    { id: 'integracoes', rotulo: 'Integrações', icone: Plug },
  ];
  const mudarTema = async (tema: string) => {
    const client = getSupabaseClient();
    if (!client || !marca) return;
    setMarca({ ...marca, tema });
    try {
      await guardarMarca(client, scope, { tema });
      document.documentElement.dataset.tema = useAuthStore.getState().me?.tema ?? tema;
      toast({ variant: 'success', title: 'Modelo de cor mudado', description: 'Muda a app do cliente, a página pública e o balcão.' });
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível mudar', description: e instanceof Error ? e.message : undefined }); }
  };

  return (
    <CoachShell headStrong="Ginásio" headSub="Definições" legado={false}>
      <div className="lv-root lg-gin">
        <nav className="lg-gin__menu" aria-label="Secções">
          {secoes.map((s) => (
            <button key={s.id} type="button" aria-current={sep === s.id ? 'page' : undefined} onClick={() => setSep(s.id)}>
              <s.icone size={16} aria-hidden /><span style={{ flex: 1 }}>{s.rotulo}</span>{s.nota && <span className="lv-legenda">{s.nota}</span>}
            </button>
          ))}
        </nav>
        <div className="lg-ficha__coluna">
          {erro && <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />}
          {sep === 'unidades' && (!unidades ? <Esqueleto /> : (
            <>
              {unidades.map((u) => (
                <section key={u.id} className="lv-lista" aria-label={u.name}>
                  <div className="lv-lista__cabeca">
                    <h3 className="lv-titulo-cartao">{u.name}</h3>
                    <Botao variante="secundario" onClick={() => setSalaPara(u)}>Sala</Botao>
                  </div>
                  {u.address && <span className="lv-legenda">{u.address}</span>}
                  <label className="lv-campo">
                    <span className="lv-campo-rotulo">Diretor técnico</span>
                    <select className="lv-campo-input" value={u.technical_director ?? ''} onChange={(e) => {
                      const client = getSupabaseClient();
                      if (client) void definirDiretorTecnico(client, u.id, e.target.value || null).then(carregar);
                    }}>
                      <option value="">Sem diretor técnico</option>
                      {equipa.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  {!u.technical_director && <Nota>Cada unidade precisa de um diretor técnico com título válido.</Nota>}
                  {u.salas.map((s) => (
                    <div key={s.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                      <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{s.name}</span><span className="lv-legenda">{s.capacity ? `${s.capacity} lugares` : 'Sem lotação'}</span></span>
                      <Botao variante="secundario" onClick={() => { const c = getSupabaseClient(); if (c) void arquivarSala(c, s.id).then(carregar); }}>Arquivar</Botao>
                    </div>
                  ))}
                </section>
              ))}
              <Botao variante="secundario" onClick={() => setNovaUnidade(true)}>Nova unidade</Botao>
            </>
          ))}
          {sep === 'horarios' && (!unidades ? <Esqueleto /> : unidades.map((u) => <Horarios key={u.id} unidade={u} onGuardado={carregar} />))}
          {sep === 'regulamento' && <EstadoPagina tipo="vazio" titulo="Regulamento e contrato-modelo" texto="Chegam com o plano Ginásio (contratos e adesões)." />}
          {sep === 'marca' && (!marca ? <Esqueleto /> : (
            <>
              <section className="lv-lista" aria-label="Modelo de cor">
                <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Modelo de cor</h3><span className="lv-legenda">Muda a app do cliente, a página pública e o balcão</span></div>
                <div className="lg-conta__temas" role="radiogroup" aria-label="Modelo de cor">
                  {([['oceano', 'Oceano', 'Claro · azul e âmbar'], ['ouro', 'Ouro', 'Claro · azul-noite e ouro'], ['limao', 'Limão', 'Escuro · ardósia e limão']] as const).map(([id, nome, sub]) => (
                    <button key={id} type="button" role="radio" aria-checked={marca.tema === id} className="lg-conta__tema lg-gin__tema" onClick={() => void mudarTema(id)}>
                      <span data-tema={id} className="lg-gin__amostra" aria-hidden><i /><i /><i /></span>
                      {nome}<span className="lv-legenda">{sub}</span>
                    </button>
                  ))}
                </div>
              </section>
              <MarcaForm marca={marca} onGuardado={carregar} />
              <Nota>Fotos: do próprio ginásio ou de banco com licença comercial.</Nota>
            </>
          ))}
          {sep === 'pagamentos' && <EstadoPagina tipo="vazio" icone={Wallet} titulo="Pagamentos e faturação por ligar" texto="Ficam por ligar até decidirmos os fornecedores. Os packs de sessões registam-se à mão." />}
          {sep === 'modulos' && (
            <section className="lv-lista" aria-label="Módulos">
              {modules.map((m) => <div key={m} className="lv-linha-lista" style={{ cursor: 'default' }}><span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{MODULOS[m] ?? m}</span></span><Estado tom="ok">Ligado</Estado></div>)}
              <Nota>Os módulos vêm da subscrição; mudam em Subscrição e lugares.</Nota>
            </section>
          )}
          {sep === 'integracoes' && <EstadoPagina tipo="vazio" icone={Plug} titulo="Integrações" texto="Calendário e relógios ligam-se na conta de cada pessoa da equipa." />}
        </div>
      </div>
      <NovaUnidade aberta={novaUnidade} onFechar={() => setNovaUnidade(false)} onFeito={carregar} />
      <NovaSala unidade={salaPara} onFechar={() => setSalaPara(null)} onFeito={carregar} />
    </CoachShell>
  );
}

function Horarios({ unidade, onGuardado }: { unidade: Unidade; onGuardado: () => void }) {
  const scope = useScope();
  const inicial = (unidade.opening_hours ?? {}) as Record<string, { abre: string; fecha: string } | null>;
  const [h, setH] = useState(inicial);
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await guardarUnidade(client, scope, { id: unidade.id, nome: unidade.name, morada: unidade.address, horario: h }); toast({ variant: 'success', title: 'Horário guardado' }); onGuardado(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: e instanceof Error ? e.message : undefined }); }
  };
  return (
    <section className="lv-lista" aria-label={`Horário de ${unidade.name}`}>
      <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>{unidade.name}</h3>
      {DIAS.map((d, i) => {
        const v = h[DIAS_K[i]];
        return (
          <div key={d} className="lg-gin__dia">
            <span style={{ minWidth: 80 }}>{d}</span>
            <label className="lv-legenda" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={!!v} onChange={(e) => setH({ ...h, [DIAS_K[i]]: e.target.checked ? { abre: '07:00', fecha: '21:00' } : null })} />Aberto
            </label>
            {v && <>
              <input className="lv-campo-input" type="time" aria-label={`${d} abre`} value={v.abre} onChange={(e) => setH({ ...h, [DIAS_K[i]]: { ...v, abre: e.target.value } })} />
              <input className="lv-campo-input" type="time" aria-label={`${d} fecha`} value={v.fecha} onChange={(e) => setH({ ...h, [DIAS_K[i]]: { ...v, fecha: e.target.value } })} />
            </>}
          </div>
        );
      })}
      <Botao variante="secundario" onClick={() => void guardar()}>Guardar horário</Botao>
    </section>
  );
}

function MarcaForm({ marca, onGuardado }: { marca: MarcaOrg; onGuardado: () => void }) {
  const scope = useScope();
  const [nome, setNome] = useState(marca.nome); const [logo, setLogo] = useState(marca.logotipo ?? ''); const [capa, setCapa] = useState(marca.capa ?? '');
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    try { await guardarMarca(client, scope, { nome, logotipo: logo || null, capa: capa || null }); toast({ variant: 'success', title: 'Marca guardada' }); onGuardado(); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: err instanceof Error ? err.message : undefined }); }
  };
  return (
    <form className="lv-lista" onSubmit={(e) => void guardar(e)} aria-label="Logótipo, nome e capa">
      <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Logótipo, nome e capa</h3>
      <div className="lg-gin__marca">
        {logo ? <img src={logo} alt="" width={56} height={56} /> : <span className="lg-gin__logo" aria-hidden>{nome.slice(0, 1)}</span>}
        <span className="lv-legenda">PNG ou SVG, fundo transparente</span>
      </div>
      <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
      <Campo rotulo="Logótipo (ligação)" value={logo} onChange={(e) => setLogo(e.target.value)} placeholder="https://…" />
      <Campo rotulo="Foto de capa (ligação)" value={capa} onChange={(e) => setCapa(e.target.value)} placeholder="https://…" />
      {capa && <img src={capa} alt="" className="lg-gin__capa" />}
      <Botao type="submit" variante="secundario">Guardar marca</Botao>
    </form>
  );
}

function NovaUnidade({ aberta, onFechar, onFeito }: { aberta: boolean; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [nome, setNome] = useState(''); const [morada, setMorada] = useState('');
  useEffect(() => { if (aberta) { setNome(''); setMorada(''); } }, [aberta]);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    try { await guardarUnidade(client, scope, { nome, morada }); onFechar(); onFeito(); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível criar', description: err instanceof Error ? err.message : undefined }); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Nova unidade">
      <form onSubmit={(e) => void criar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Alvalade" />
        <Campo rotulo="Morada" value={morada} onChange={(e) => setMorada(e.target.value)} />
        <Botao type="submit">Criar unidade</Botao>
      </form>
    </Janela>
  );
}

function NovaSala({ unidade, onFechar, onFeito }: { unidade: Unidade | null; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [nome, setNome] = useState(''); const [lot, setLot] = useState('');
  useEffect(() => { setNome(''); setLot(''); }, [unidade]);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !unidade) return;
    try { await guardarSala(client, scope, unidade.id, nome, lot ? Number(lot) : null); onFechar(); onFeito(); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível criar', description: err instanceof Error ? err.message : undefined }); }
  };
  return (
    <Janela aberta={!!unidade} onFechar={onFechar} titulo={`Nova sala em ${unidade?.name ?? ''}`}>
      <form onSubmit={(e) => void criar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required placeholder="Ex.: Estúdio" />
        <Campo rotulo="Lotação" type="number" min={1} value={lot} onChange={(e) => setLot(e.target.value)} />
        <Botao type="submit">Criar sala</Botao>
      </form>
    </Janela>
  );
}
