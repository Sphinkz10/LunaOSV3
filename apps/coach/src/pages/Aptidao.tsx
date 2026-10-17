import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import {
  confirmarDestrutivo, fetchAptidao, fetchClientProfile, registarRestricao, revogarRestricao, toast,
  type Aptidao, type TipoRestricao,
} from '@luna/core';
import { Botao, Campo, Esqueleto, EstadoPagina, Estado, Nota, SemPermissao } from '@luna/ui/v3';
import { CheckCircle, Warning, X } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { SairSemGuardar, VoltarA } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const ESTADO: Record<Aptidao['estado'], { texto: string; tom: 'ok' | 'aviso' | 'erro' }> = {
  livre: { texto: 'Pode treinar', tom: 'ok' },
  restricao: { texto: 'Treina com restrições', tom: 'aviso' },
  bloqueado: { texto: 'Não pode treinar', tom: 'erro' },
  atestado_em_falta: { texto: 'Atestado em falta (PAR-Q)', tom: 'erro' },
};
const TIPO: Record<Exclude<TipoRestricao, 'atestado'>, { titulo: string; texto: string; icone: typeof CheckCircle }> = {
  permitir: { titulo: 'Permitir', texto: 'Treina normal', icone: CheckCircle },
  adaptar: { titulo: 'Adaptar', texto: 'Treina com cuidado nesta zona', icone: Warning },
  bloquear: { titulo: 'Bloquear', texto: 'Zona sem treino', icone: X },
};

/**
 * Restrição e aptidão (G-29, Figma 118:641): o que o cliente pode treinar, por
 * zona, com o atestado quando o PAR-Q o pede. A causa fica só com o papel
 * clínico (com dois fatores); o resto da equipa vê o efeito.
 */
export function Aptidao() {
  const { id = '' } = useParams<{ id: string }>();
  const scope = useScope();
  const clinico = scope.permissions.includes('health.read');
  const [nome, setNome] = useState<string | null>(null);
  const [dados, setDados] = useState<Aptidao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Exclude<TipoRestricao, 'atestado'>>('adaptar');
  const [zona, setZona] = useState('');
  const [notas, setNotas] = useState('');
  const [reverEm, setReverEm] = useState('');
  const [validade, setValidade] = useState('');
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void Promise.all([fetchAptidao(client, scope, id), fetchClientProfile(client, scope, id)])
      .then(([a, c]) => { setDados(a); setNome(c.profile.name); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [scope, id]);
  useEffect(() => carregar(), [carregar]);

  const gravar = async (r: Parameters<typeof registarRestricao>[2], ok: string): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client) return false;
    setAGravar(true);
    try { await registarRestricao(client, id, r); toast({ variant: 'success', title: ok }); carregar(); return true; }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: e instanceof Error ? e.message : undefined }); return false; }
    finally { setAGravar(false); }
  };

  const guardarZona = (e: FormEvent) => {
    e.preventDefault();
    void gravar({ tipo, zona: zona.trim() || null, notas, reverEm: reverEm || null }, 'Restrição guardada')
      .then((ok) => { if (ok) { setZona(''); setNotas(''); setReverEm(''); } });
  };
  const guardarAtestado = (e: FormEvent) => {
    e.preventDefault();
    void gravar({ tipo: 'atestado', notas, validaAte: validade || null }, 'Atestado registado')
      .then((ok) => { if (ok) { setNotas(''); setValidade(''); } });
  };
  const revogar = async (rid: string, rotulo: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    const ok = await confirmarDestrutivo({
      titulo: `Retirar ${rotulo}?`, verbo: 'Retirar', manter: 'Manter',
      efeitos: ['Deixa de valer a partir de agora; o registo fica no histórico'],
      acao: () => revogarRestricao(client, rid),
    });
    if (ok) carregar();
  };

  const estado = dados ? ESTADO[dados.estado] : null;
  const atestados = dados?.registos?.filter((r) => r.kind === 'atestado') ?? [];
  const zonas = dados?.registos?.filter((r) => r.kind !== 'atestado') ?? null;
  const fmt = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  return (
    <CoachShell headStrong={nome ? `${nome} · aptidão` : 'Aptidão'} headSub={`${vocab.pessoa({ plural: true, maiuscula: true })} · Saúde`} legado={false}
      topActions={<VoltarA omissao={{ rotulo: 'à ficha', href: `/clients/${id}` }} />}>
      <div className="lv-root lg-aptidao">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !dados ? <div className="lv-lista"><Esqueleto /></div>
          : (
            <>
              <section className="lv-lista" aria-label="Estado">
                <div className="lv-lista__cabeca">
                  <h2 className="lv-titulo-cartao">Estado</h2>
                  {estado && <Estado tom={estado.tom}>{estado.texto}</Estado>}
                </div>
                {dados.pendenteParq && <Nota>O PAR-Q pediu atestado. A primeira {vocab.sessao()} fica bloqueada até haver atestado ou restrição registada.</Nota>}
                {dados.efeitos.length === 0
                  ? <p className="lv-legenda" style={{ margin: 0 }}>Sem restrições registadas.</p>
                  : dados.efeitos.map((e) => (
                    <div key={`${e.zona}-${e.tipo}`} className="lv-linha-lista" style={{ cursor: 'default' }}>
                      <span className="lv-linha-lista__corpo">
                        <span className="lv-linha-lista__titulo">{e.zona ?? 'Geral'}</span>
                        <span className="lv-legenda">{TIPO[e.tipo as keyof typeof TIPO]?.texto ?? e.tipo}{e.reverEm ? ` · rever a ${fmt(e.reverEm)}` : ''}</span>
                      </span>
                      <Estado tom={e.tipo === 'bloquear' ? 'erro' : e.tipo === 'adaptar' ? 'aviso' : 'ok'}>{TIPO[e.tipo as keyof typeof TIPO]?.titulo}</Estado>
                    </div>
                  ))}
              </section>

              {!clinico ? (
                <SemPermissao area="o detalhe clínico" />
              ) : zonas === null ? (
                <EstadoPagina tipo="sem-permissao" titulo="Entra com dois fatores" texto="O detalhe clínico só abre com a sessão de dois fatores." />
              ) : (
                <div className="lg-aptidao__grelha">
                  <section className="lv-lista" aria-label="Por zona">
                    <h2 className="lv-titulo-cartao">Por zona</h2>
                    <form onSubmit={guardarZona} className="lc-campos" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
                      <div role="radiogroup" aria-label="O que pode fazer" className="lg-aptidao__tipos">
                        {(Object.keys(TIPO) as (keyof typeof TIPO)[]).map((k) => {
                          const T = TIPO[k];
                          return (
                            <button key={k} type="button" role="radio" aria-checked={tipo === k} className="lg-aptidao__tipo" onClick={() => setTipo(k)}>
                              <span><T.icone size={16} aria-hidden /> <b>{T.titulo}</b></span>
                              <span className="lv-legenda">{T.texto}</span>
                            </button>
                          );
                        })}
                      </div>
                      <Campo rotulo="Zona" placeholder="Ex.: joelho esquerdo (vazio = geral)" value={zona} onChange={(e) => setZona(e.target.value)} />
                      <Campo rotulo="Causa (só papel clínico)" placeholder="Ex.: rotura do LCA" value={notas} onChange={(e) => setNotas(e.target.value)} />
                      <Campo rotulo="Rever em" type="date" value={reverEm} onChange={(e) => setReverEm(e.target.value)} />
                      <Botao type="submit" aCarregar={aGravar}>Guardar restrição</Botao>
                    </form>
                    {zonas.map((r) => (
                      <div key={r.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                        <span className="lv-linha-lista__corpo">
                          <span className="lv-linha-lista__titulo">{r.zone ?? 'Geral'} · {TIPO[r.kind as keyof typeof TIPO]?.titulo}</span>
                          <span className="lv-legenda">{r.notes ?? 'Sem causa registada'} · desde {fmt(r.created_at.slice(0, 10))}</span>
                        </span>
                        <Botao variante="secundario" onClick={() => void revogar(r.id, 'esta restrição')}>Retirar</Botao>
                      </div>
                    ))}
                  </section>

                  <section className="lv-lista" aria-label="Atestado">
                    <h2 className="lv-titulo-cartao">Atestado</h2>
                    {atestados.length === 0
                      ? <p className="lv-legenda" style={{ margin: 0 }}>Sem atestado registado.</p>
                      : atestados.map((a) => (
                        <div key={a.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                          <span className="lv-linha-lista__corpo">
                            <span className="lv-linha-lista__titulo">Atestado médico</span>
                            <span className="lv-legenda">{a.notes ?? '—'} · válido até {fmt(a.valid_until)}</span>
                          </span>
                          <Estado tom={a.valid_until && a.valid_until < new Date().toISOString().slice(0, 10) ? 'erro' : 'ok'}>
                            {a.valid_until && a.valid_until < new Date().toISOString().slice(0, 10) ? 'Caducado' : 'Válido'}
                          </Estado>
                        </div>
                      ))}
                    <form onSubmit={guardarAtestado} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
                      <Campo rotulo="Médico e data" placeholder="Ex.: Dr.ª Inês Paiva · 10 out" value={notas} onChange={(e) => setNotas(e.target.value)} />
                      <Campo rotulo="Válido até" type="date" value={validade} onChange={(e) => setValidade(e.target.value)} required />
                      <Botao type="submit" variante="secundario" aCarregar={aGravar}>Registar atestado</Botao>
                    </form>
                    <Nota>O documento fica nos documentos do {vocab.pessoa()}, visível só a quem tem papel clínico.</Nota>
                  </section>
                </div>
              )}
            </>
          )}
      </div>
      <SairSemGuardar sujo={!!(zona.trim() || notas.trim() || reverEm || validade)} resumo="A restrição ou o atestado que estavas a escrever não foi guardado." />
    </CoachShell>
  );
}
