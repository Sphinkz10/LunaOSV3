import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  AREAS_PERMISSAO, cancelarConvite, confirmarDestrutivo, convidarMembro, desativarMembro, fetchEquipa, fetchPapeis, fetchTitulos,
  gerarCodigoRecuperacao, guardarTitulo, LugaresEsgotadosError, mudarPapeis, reativarMembro, sincronizarTitulos, toast,
  type ConviteEquipa, type EventoEquipa, type MembroEquipa, type PapelCatalogo, type TituloMembro,
  contarClientesDe, passarClientes,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, MenuAcoes, Nota, SemPermissao } from '@luna/ui/v3';
import { CheckCircle, Copy, IdentificationCard, Key, Lock, UsersThree, XCircle } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { ComMenuDefinicoes } from '../app/MenuDefinicoes';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';

type Dados = Awaited<ReturnType<typeof fetchEquipa>>;
const CONVITE: Record<ConviteEquipa['estado'], { texto: string; tom: 'ok' | 'aviso' | 'erro' | 'neutro' }> = {
  pendente: { texto: 'Pendente', tom: 'aviso' }, aceite: { texto: 'Aceite', tom: 'ok' },
  cancelado: { texto: 'Cancelado', tom: 'neutro' }, expirado: { texto: 'Expirado', tom: 'neutro' },
};
const ACAO: Record<string, string> = {
  desativado: 'Desativado', reativado: 'Reativado', convidado: 'Convidado', entrou: 'Entrou', convite_cancelado: 'Convite cancelado',
};
const MOTIVOS_SAIDA = ['Saiu da equipa', 'Pausa', 'Outro'];
const dia = (iso: string) => new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
const diasAte = (iso: string) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86_400_000));

/**
 * Equipa: convites, histórico e acessos (G-44, Figma 180:188). Convite vale 7
 * dias e cancelar invalida a ligação logo; desativar corta o acesso em todos os
 * aparelhos já e pede motivo; reativar pede motivo e devolve o mesmo papel. O
 * histórico do que a pessoa fez fica intacto. Recuperação assistida: um código
 * de uso único, 30 minutos, mostrado só uma vez.
 */
export function Equipa() {
  const scope = useScope();
  const pode = scope.permissions.includes('team.manage');
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [convidar, setConvidar] = useState(false);
  const [desativar, setDesativar] = useState<MembroEquipa | null>(null);
  const [reativar, setReativar] = useState<MembroEquipa | null>(null);
  const [passar, setPassar] = useState<MembroEquipa | null>(null);
  const [codigo, setCodigo] = useState<{ nome: string; codigo: string } | null>(null);
  const [titulos, setTitulos] = useState<Map<string, TituloMembro>>(new Map());
  const [catalogo, setCatalogo] = useState<PapelCatalogo[]>([]);
  const [papelVer, setPapelVer] = useState('coach');
  const [editar, setEditar] = useState<MembroEquipa | null>(null);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !pode) return;
    setErro(null);
    void fetchEquipa(client, scope).then(setDados).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchTitulos(client, scope).then((t) => setTitulos(new Map(t.map((x) => [x.membershipId, x])))).catch(() => setTitulos(new Map()));
    void fetchPapeis(client).then(setCatalogo).catch(() => setCatalogo([]));
    // Título a expirar: avisa a gerência 30 dias antes
    void sincronizarTitulos(client, scope).catch(() => undefined);
  }, [scope, pode]);
  useEffect(() => carregar(), [carregar]);

  const cancelar = async (c: ConviteEquipa) => {
    const client = getSupabaseClient();
    if (!client) return;
    const ok = await confirmarDestrutivo({
      titulo: `Cancelar o convite a ${c.email}?`, verbo: 'Cancelar convite', manter: 'Manter',
      efeitos: ['A ligação deixa de abrir já', 'Fica no histórico de convites'],
      acao: () => cancelarConvite(client, c.id),
    });
    if (ok) carregar();
  };

  const gerarCodigo = async (m: MembroEquipa) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { setCodigo({ nome: m.nome, codigo: await gerarCodigoRecuperacao(client, m.id) }); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível gerar o código', description: e instanceof Error ? e.message : undefined }); }
  };

  if (!pode) {
    return (
      <CoachShell headStrong="Equipa e acessos" headSub="Definições" legado={false}>
        <div className="lv-root"><SemPermissao area="a equipa e os acessos" /></div>
      </CoachShell>
    );
  }

  const ativos = dados?.membros.filter((m) => m.estado !== 'left') ?? [];
  const desativados = dados?.membros.filter((m) => m.estado === 'left') ?? [];
  const nomeDe = (id: string) => dados?.membros.find((m) => m.id === id)?.nome ?? '—';

  return (
    <CoachShell headStrong="Equipa e acessos" headSub="Definições" legado={false}
      topActions={<Botao onClick={() => setConvidar(true)}>Convidar</Botao>}>
      <ComMenuDefinicoes><div className="lv-root lg-conta">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !dados ? <div className="lv-lista"><Esqueleto /></div>
          : (
            <div className="lg-conta__grelha">
              <div className="lg-conta__coluna">
                <h2 className="lv-sobretitulo">Equipa{dados.lugares ? ` · ${dados.lugares.ocupados} de ${dados.lugares.lugares} lugares` : ''}</h2>
                <section className="lv-lista" aria-label="Equipa">
                  {ativos.map((m) => (
                    <div key={m.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                      <Avatar nome={m.nome} tamanho={36} />
                      <span className="lv-linha-lista__corpo">
                        <span className="lv-linha-lista__titulo">{m.nome}{m.souEu ? ' (tu)' : ''}</span>
                        <span className="lv-legenda">{m.papeis.map((p) => p.nome).join(' · ') || 'Sem papel'}{m.email ? ` · ${m.email}` : ''}</span>
                      </span>
                      <EstadoTitulo t={titulos.get(m.id)} precisa={m.papeis.some((p) => p.ocupaLugar)} />
                      {!m.souEu && (
                        <MenuAcoes rotulo={`Ações para ${m.nome}`} acoes={[
                          { rotulo: 'Papéis e título', icone: IdentificationCard, onClick: () => setEditar(m) },
                          { rotulo: 'Gerar código de recuperação', icone: Key, onClick: () => void gerarCodigo(m) },
                          { rotulo: 'Passar os clientes', icone: UsersThree, onClick: () => setPassar(m) },
                          { rotulo: 'Desativar acesso', icone: Lock, perigo: true, onClick: () => setDesativar(m) },
                        ]} />
                      )}
                    </div>
                  ))}
                </section>
              </div>

              <div className="lg-conta__coluna">
                <h2 className="lv-sobretitulo">Convites</h2>
                <section className="lv-lista" aria-label="Convites">
                  {dados.convites.filter((c) => c.estado === 'pendente').length === 0
                    ? <p className="lv-legenda" style={{ margin: 0 }}>Sem convites pendentes.</p>
                    : dados.convites.filter((c) => c.estado === 'pendente').map((c) => (
                      <div key={c.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                        <span className="lv-linha-lista__corpo">
                          <span className="lv-linha-lista__titulo">{c.email}</span>
                          <span className="lv-legenda">{c.papel} · expira em {diasAte(c.expiraEm)} dias</span>
                        </span>
                        <Botao variante="secundario" onClick={() => void cancelar(c)}>Cancelar</Botao>
                      </div>
                    ))}
                </section>
                <h2 className="lv-sobretitulo">Histórico de convites</h2>
                <section className="lv-lista" aria-label="Histórico de convites">
                  {dados.convites.filter((c) => c.estado !== 'pendente').slice(0, 10).map((c) => (
                    <div key={c.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                      <span className="lv-linha-lista__corpo">
                        <span className="lv-linha-lista__titulo">{c.email}</span>
                        <span className="lv-legenda">{c.papel} · {dia(c.criadoEm)}</span>
                      </span>
                      <Estado tom={CONVITE[c.estado].tom}>{CONVITE[c.estado].texto}</Estado>
                    </div>
                  ))}
                  {dados.convites.every((c) => c.estado === 'pendente') && <p className="lv-legenda" style={{ margin: 0 }}>Ainda sem histórico.</p>}
                </section>
              </div>

              <div className="lg-conta__coluna">
                <h2 className="lv-sobretitulo">O que cada papel pode fazer</h2>
                <section className="lv-lista" aria-label="Permissões por papel">
                  <div role="radiogroup" aria-label="Papel" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
                    {catalogo.map((p) => <Chip key={p.key} role="radio" aria-checked={papelVer === p.key} ativo={papelVer === p.key} onClick={() => setPapelVer(p.key)}>{p.nome}</Chip>)}
                  </div>
                  <div className="lg-matriz" role="table" aria-label="Ver e mudar">
                    <div role="row" className="lg-matriz__linha lg-matriz__cabeca"><span role="columnheader">Área</span><span role="columnheader">Ver</span><span role="columnheader">Mudar</span></div>
                    {AREAS_PERMISSAO.map((a) => {
                      const perms = catalogo.find((p) => p.key === papelVer)?.permissoes ?? [];
                      const ver = a.ver.some((x) => perms.includes(x)); const mudar = ver && a.mudar.some((x) => perms.includes(x));
                      return (
                        <div key={a.area} role="row" className="lg-matriz__linha">
                          <span role="cell">{a.area}</span>
                          <span role="cell">{ver ? <CheckCircle size={18} aria-label="Sim" className="lg-matriz__sim" /> : <XCircle size={18} aria-label="Não" className="lg-matriz__nao" />}</span>
                          <span role="cell">{mudar ? <CheckCircle size={18} aria-label="Sim" className="lg-matriz__sim" /> : <XCircle size={18} aria-label="Não" className="lg-matriz__nao" />}</span>
                        </div>
                      );
                    })}
                  </div>
                  <Nota>A saúde do cliente só aparece se o cliente a partilhou e com dois fatores.</Nota>
                </section>
                <h2 className="lv-sobretitulo">Desativados</h2>
                {desativados.length === 0
                  ? <section className="lv-lista"><p className="lv-legenda" style={{ margin: 0 }}>Ninguém desativado.</p></section>
                  : desativados.map((m) => {
                    const ultimo = dados.eventos.find((e) => e.membershipId === m.id && e.acao === 'desativado');
                    return (
                      <section key={m.id} className="lv-lista" aria-label={m.nome}>
                        <div className="lv-lista__cabeca">
                          <h3 className="lv-titulo-cartao">{m.nome}</h3>
                          <Estado tom="neutro">Desativado</Estado>
                        </div>
                        <dl className="lg-conta__dados">
                          <dt>Papel</dt><dd>{m.papeis.map((p) => p.nome).join(' · ') || '—'}</dd>
                          {ultimo && <><dt>Desde</dt><dd>{dia(ultimo.em)} · {ultimo.motivo}</dd></>}
                        </dl>
                        <Botao onClick={() => setReativar(m)}>Reativar com motivo</Botao>
                      </section>
                    );
                  })}
                <Nota>Reativar devolve o mesmo papel e ocupa um lugar outra vez.</Nota>
                <h2 className="lv-sobretitulo">Acessos</h2>
                <section className="lv-lista" aria-label="Histórico de acessos">
                  {dados.eventos.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem alterações.</p>
                    : dados.eventos.slice(0, 10).map((e: EventoEquipa) => (
                      <div key={e.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                        <span className="lv-linha-lista__corpo">
                          <span className="lv-linha-lista__titulo">{ACAO[e.acao] ?? e.acao} · {nomeDe(e.membershipId)}</span>
                          <span className="lv-legenda">{e.motivo ? `${e.motivo} · ` : ''}{dia(e.em)}</span>
                        </span>
                      </div>
                    ))}
                </section>
              </div>
            </div>
          )}
      </div>

      <EditarMembro membro={editar} catalogo={catalogo} titulo={editar ? titulos.get(editar.id) ?? null : null}
        onFechar={() => setEditar(null)} onFeito={carregar} />
      <Convidar aberta={convidar} papeis={dados?.papeis ?? []} lugares={dados?.lugares ?? null} onFechar={() => setConvidar(false)} onConvidado={carregar} />
      <PedirMotivo membro={desativar} titulo={(n) => `Desativar o acesso de ${n}?`} verbo="Desativar" perigo
        texto="Sai já de todos os aparelhos. O que fez fica no histórico."
        onFechar={() => setDesativar(null)} onConfirmar={async (m, motivo) => {
          const client = getSupabaseClient();
          if (client) { await desativarMembro(client, m.id, motivo); toast({ variant: 'success', title: `${m.nome} já não tem acesso` }); carregar(); }
        }} />
      <PassarClientes membro={passar} equipa={(dados?.membros ?? []).filter((x) => x.estado === 'active' && x.id !== passar?.id)}
        onFechar={() => setPassar(null)} onFeito={() => { setPassar(null); carregar(); }} />
      <PedirMotivo membro={reativar} titulo={(n) => `Reativar o acesso de ${n}?`} verbo="Reativar"
        texto="Volta com o mesmo papel e ocupa um lugar." motivos={['Voltou à equipa', 'Fim da pausa', 'Outro']}
        onFechar={() => setReativar(null)} onConfirmar={async (m, motivo) => {
          const client = getSupabaseClient();
          if (client) { await reativarMembro(client, m.id, motivo); toast({ variant: 'success', title: `${m.nome} tem acesso outra vez` }); carregar(); }
        }} />
      <Janela aberta={!!codigo} onFechar={() => setCodigo(null)} titulo="Código de recuperação"
        sub={codigo ? `Dá este código a ${codigo.nome}. Só aparece agora.` : undefined}>
        {codigo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <output className="lg-codigo" aria-label="Código">{codigo.codigo}</output>
            <Nota>Vale 30 minutos e serve uma vez. Em Entrar, a pessoa escolhe Tenho um código e define uma palavra-passe nova. Cinco tentativas erradas bloqueiam o código e avisam a gerência.</Nota>
            <Botao variante="secundario" icone={Copy} onClick={() => void navigator.clipboard.writeText(codigo.codigo).then(() => toast({ variant: 'success', title: 'Código copiado' }))}>Copiar código</Botao>
          </div>
        )}
      </Janela></ComMenuDefinicoes>
    </CoachShell>
  );
}

function Convidar({ aberta, papeis, lugares, onFechar, onConvidado }: {
  aberta: boolean; papeis: { key: string; nome: string; ocupaLugar: boolean }[]; lugares: { lugares: number; ocupados: number } | null;
  onFechar: () => void; onConvidado: () => void;
}) {
  const scope = useScope();
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState('coach');
  const [ligacao, setLigacao] = useState<string | null>(null);
  const [lugarExtra, setLugarExtra] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (aberta) { setEmail(''); setLigacao(null); setErro(null); setLugarExtra(false); } }, [aberta]);

  // J33: o efeito no lugar aparece antes de confirmar
  const ocupa = papeis.find((p) => p.key === papel)?.ocupaLugar ?? false;
  const acima = ocupa && lugares != null && lugares.ocupados >= lugares.lugares;
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true); setErro(null);
    try { setLigacao(await convidarMembro(client, scope, email.trim(), papel, lugarExtra || acima)); onConvidado(); }
    catch (err) {
      if (err instanceof LugaresEsgotadosError) setLugarExtra(true);
      setErro(err instanceof Error ? err.message : 'Não foi possível convidar.');
    } finally { setAGravar(false); }
  };

  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Convidar para a equipa" sub="O convite vale 7 dias.">
      {ligacao ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <Nota>Convite criado para {email}. Envia esta ligação por email ou mensagem; só aparece agora.</Nota>
          <output className="lg-codigo lg-codigo--ligacao">{ligacao}</output>
          <Botao icone={Copy} onClick={() => void navigator.clipboard.writeText(ligacao).then(() => toast({ variant: 'success', title: 'Ligação copiada' }))}>Copiar ligação</Botao>
        </div>
      ) : (
        <form onSubmit={(e) => void enviar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
          <Campo rotulo="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
          <div role="radiogroup" aria-label="Papel" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
            {papeis.map((p) => <Chip key={p.key} role="radio" aria-checked={papel === p.key} ativo={papel === p.key} onClick={() => setPapel(p.key)}>{p.nome}</Chip>)}
          </div>
          {lugares && (acima
            ? <Nota>Os {lugares.lugares} lugares contratados estão ocupados. Este convite acrescenta um lugar: passas a {lugares.lugares + 1}. Só quem gere a subscrição pode confirmar.</Nota>
            : <span className="lv-legenda">{ocupa ? `Ocupa um lugar: ${lugares.ocupados + 1} de ${lugares.lugares}.` : 'Este papel não ocupa lugar.'}</span>)}
          {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
          <Botao type="submit" aCarregar={aGravar}>{lugarExtra || acima ? 'Convidar com lugar extra' : 'Criar convite'}</Botao>
        </form>
      )}
    </Janela>
  );
}

function PedirMotivo({ membro, titulo, texto, verbo, perigo, motivos = MOTIVOS_SAIDA, onFechar, onConfirmar }: {
  membro: MembroEquipa | null; titulo: (nome: string) => string; texto: string; verbo: string; perigo?: boolean;
  motivos?: string[]; onFechar: () => void; onConfirmar: (m: MembroEquipa, motivo: string) => Promise<void>;
}) {
  const [escolha, setEscolha] = useState(motivos[0]);
  const [outro, setOutro] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const primeiro = motivos[0];
  useEffect(() => { setEscolha(primeiro); setOutro(''); setErro(null); }, [membro, primeiro]);
  const motivo = escolha === 'Outro' ? outro.trim() : escolha;
  const confirmar = async () => {
    if (!membro || !motivo) return;
    setAGravar(true); setErro(null);
    try { await onConfirmar(membro, motivo); onFechar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível gravar.'); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={!!membro} onFechar={onFechar} titulo={membro ? titulo(membro.nome.split(' ')[0]) : ''} sub={texto}
      acoes={<>
        <Botao variante="secundario" onClick={onFechar}>Voltar</Botao>
        <Botao className={perigo ? 'lv-btn--perigo' : undefined} aCarregar={aGravar} disabled={!motivo} onClick={() => void confirmar()}>{verbo}</Botao>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <span className="lv-sobretitulo">Motivo</span>
        <div role="radiogroup" aria-label="Motivo" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {motivos.map((m) => <Chip key={m} role="radio" aria-checked={escolha === m} ativo={escolha === m} onClick={() => setEscolha(m)}>{m}</Chip>)}
        </div>
        {escolha === 'Outro' && <Campo rotulo="Qual?" value={outro} onChange={(e) => setOutro(e.target.value)} />}
        {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
      </div>
    </Janela>
  );
}

/** Título profissional: válido, a expirar (30 dias) ou por confirmar. */
function EstadoTitulo({ t, precisa }: { t: TituloMembro | undefined; precisa: boolean }) {
  if (!precisa) return <span className="lv-legenda lg-equipa__titulo">Não precisa</span>;
  if (!t?.titulo) return <span className="lv-pill lg-equipa__titulo">Por confirmar</span>;
  if (!t.validoAte) return <span className="lg-equipa__titulo"><Estado tom="ok">{t.titulo}</Estado></span>;
  const dias = Math.ceil((Date.parse(`${t.validoAte}T23:59:59Z`) - Date.now()) / 86_400_000);
  const data = new Date(`${t.validoAte}T12:00:00Z`).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: dias > 365 ? 'numeric' : undefined });
  return (
    <span className="lg-equipa__titulo">
      <Estado tom={dias < 0 ? 'erro' : dias <= 30 ? 'aviso' : 'ok'}>{dias < 0 ? `Expirou a ${data}` : dias <= 30 ? `Expira a ${data}` : `Válido até ${data}`}</Estado>
    </span>
  );
}

function EditarMembro({ membro, catalogo, titulo, onFechar, onFeito }: {
  membro: MembroEquipa | null; catalogo: PapelCatalogo[]; titulo: TituloMembro | null; onFechar: () => void; onFeito: () => void;
}) {
  const scope = useScope();
  const [papeis, setPapeis] = useState<string[]>([]);
  const [t, setT] = useState(''); const [ate, setAte] = useState('');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    if (!membro) return;
    setPapeis(membro.papeis.map((p) => p.key)); setT(titulo?.titulo ?? ''); setAte(titulo?.validoAte ?? '');
  }, [membro, titulo]);
  const gravar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !membro) return;
    if (papeis.length === 0) { toast({ variant: 'warning', title: 'Escolhe pelo menos um papel' }); return; }
    setAGravar(true);
    try {
      await mudarPapeis(client, scope, membro.id, membro.papeis.map((p) => p.key), papeis);
      await guardarTitulo(client, membro.id, t.trim() || null, ate || null);
      toast({ variant: 'success', title: `${membro.nome} atualizado` }); onFechar(); onFeito();
    } catch (err) { toast({ variant: 'danger', title: 'Não foi possível gravar', description: err instanceof Error ? err.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={!!membro} onFechar={onFechar} titulo={`Papéis e título de ${membro?.nome ?? ''}`} sub="Os papéis decidem o que vê e muda; o título profissional é pedido a quem dá treino.">
      <form onSubmit={(e) => void gravar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <div role="group" aria-label="Papéis" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--espaco-8)' }}>
          {catalogo.filter((p) => p.key !== 'owner').map((p) => (
            <Chip key={p.key} ativo={papeis.includes(p.key)} onClick={() => setPapeis((x) => (x.includes(p.key) ? x.filter((y) => y !== p.key) : [...x, p.key]))}>{p.nome}</Chip>
          ))}
        </div>
        <Campo rotulo="Título profissional" value={t} onChange={(e) => setT(e.target.value)} placeholder="Ex.: Cédula de Treinador de Desporto, TPTE" />
        <Campo rotulo="Válido até" type="date" value={ate} onChange={(e) => setAte(e.target.value)} ajuda="Avisamos a gerência 30 dias antes" />
        <Botao type="submit" aCarregar={aGravar}>Guardar</Botao>
      </form>
    </Janela>
  );
}

/** G-46: passar os clientes de quem sai (ou muda de funções) para outra pessoa, com registo na ficha. */
function PassarClientes({ membro, equipa, onFechar, onFeito }: {
  membro: MembroEquipa | null; equipa: MembroEquipa[]; onFechar: () => void; onFeito: () => void;
}) {
  const scope = useScope();
  const [n, setN] = useState<number | null>(null);
  const [para, setPara] = useState('');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    setPara(''); setN(null);
    const client = getSupabaseClient();
    if (!client || !membro) return;
    void contarClientesDe(client, scope, membro.id).then(setN).catch(() => setN(null));
  }, [membro, scope]);
  if (!membro) return null;
  const destino = equipa.find((x) => x.id === para);
  const passarJa = async () => {
    const client = getSupabaseClient();
    if (!client || !para) return;
    setAGravar(true);
    try {
      const feitos = await passarClientes(client, scope, membro.id, para);
      toast({ variant: 'success', title: `${feitos} ${feitos === 1 ? 'cliente passou' : 'clientes passaram'} para ${destino?.nome ?? 'a nova pessoa'}` });
      onFeito();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível passar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta onFechar={onFechar} titulo={`Passar os clientes de ${membro.nome}`}
      sub={n == null ? undefined : n === 0 ? 'Não tem clientes a seu cargo.' : `${n} ${n === 1 ? 'cliente' : 'clientes'} a seu cargo.`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <label className="lv-campo"><span className="lv-campo-rotulo">Para quem</span>
          <select className="lv-campo-input" value={para} onChange={(e) => setPara(e.target.value)}>
            <option value="">Escolher</option>{equipa.map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select></label>
        <Nota>Planos, packs e histórico ficam como estão. Cada ficha regista a mudança e a nova pessoa passa a ver as marcações.</Nota>
        <div className="lg-import__acoes" style={{ padding: 0 }}>
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao aCarregar={aGravar} disabled={!para || n === 0} onClick={() => void passarJa()}>Passar {n ? `os ${n}` : ''}</Botao>
        </div>
      </div>
    </Janela>
  );
}
