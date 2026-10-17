import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  cancelarConvite, confirmarDestrutivo, convidarMembro, desativarMembro, fetchEquipa, gerarCodigoRecuperacao,
  LugaresEsgotadosError, reativarMembro, toast,
  type ConviteEquipa, type EventoEquipa, type MembroEquipa,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, MenuAcoes, Nota, SemPermissao } from '@luna/ui/v3';
import { Copy, Key, Lock } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
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
  const [codigo, setCodigo] = useState<{ nome: string; codigo: string } | null>(null);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !pode) return;
    setErro(null);
    void fetchEquipa(client, scope).then(setDados).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
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
      <div className="lv-root lg-conta">
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
                      {!m.souEu && (
                        <MenuAcoes rotulo={`Ações para ${m.nome}`} acoes={[
                          { rotulo: 'Gerar código de recuperação', icone: Key, onClick: () => void gerarCodigo(m) },
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

      <Convidar aberta={convidar} papeis={dados?.papeis ?? []} onFechar={() => setConvidar(false)} onConvidado={carregar} />
      <PedirMotivo membro={desativar} titulo={(n) => `Desativar o acesso de ${n}?`} verbo="Desativar" perigo
        texto="Sai já de todos os aparelhos. O que fez fica no histórico."
        onFechar={() => setDesativar(null)} onConfirmar={async (m, motivo) => {
          const client = getSupabaseClient();
          if (client) { await desativarMembro(client, m.id, motivo); toast({ variant: 'success', title: `${m.nome} já não tem acesso` }); carregar(); }
        }} />
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
      </Janela>
    </CoachShell>
  );
}

function Convidar({ aberta, papeis, onFechar, onConvidado }: {
  aberta: boolean; papeis: { key: string; nome: string }[]; onFechar: () => void; onConvidado: () => void;
}) {
  const scope = useScope();
  const [email, setEmail] = useState('');
  const [papel, setPapel] = useState('coach');
  const [ligacao, setLigacao] = useState<string | null>(null);
  const [lugarExtra, setLugarExtra] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (aberta) { setEmail(''); setLigacao(null); setErro(null); setLugarExtra(false); } }, [aberta]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true); setErro(null);
    try { setLigacao(await convidarMembro(client, scope, email.trim(), papel, lugarExtra)); onConvidado(); }
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
          {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}
          <Botao type="submit" aCarregar={aGravar}>{lugarExtra ? 'Convidar com lugar extra' : 'Criar convite'}</Botao>
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
