import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  fetchAptidao, fetchAssiduidade, fetchClientesAtencao, fetchClientProfile, MOTIVO_ATENCAO,
  type Aptidao, type Assiduidade, type ClientDetail, type Section,
} from '@luna/core';
import { AvisoSecao, Avatar, Botao, Esqueleto, Estado, EstadoPagina, Nota, SemPermissao, type EstadoTom } from '@luna/ui/v3';
import { Barbell, CalendarBlank, Heartbeat, Play } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { VoltarA } from '../app/Estados';
import { getSupabaseClient } from '../lib/supabase';
import { t, vocab } from '../lib/vocab';

const PP = vocab.pessoa({ plural: true, maiuscula: true });
const p1 = vocab.pessoa();

const ESTADO: Record<string, { texto: string; tom: EstadoTom }> = {
  active: { texto: 'Ativo', tom: 'ok' }, blocked: { texto: 'Bloqueado', tom: 'erro' }, return_to_play: { texto: 'Regresso ao treino', tom: 'aviso' },
  injured: { texto: 'Lesionado', tom: 'aviso' }, inactive: { texto: 'Inativo', tom: 'neutro' },
};
const APTIDAO: Record<Aptidao['estado'], { texto: string; tom: EstadoTom }> = {
  livre: { texto: 'Pode treinar', tom: 'ok' }, restricao: { texto: 'Treina com restrições', tom: 'aviso' },
  bloqueado: { texto: 'Não pode treinar', tom: 'erro' }, atestado_em_falta: { texto: 'Atestado em falta', tom: 'erro' },
};
const TIPO: Record<string, string> = {
  training: t('sessao', { maiuscula: true }), assessment: 'Avaliação', consultation: 'Consulta', class: t('aula', { maiuscula: true }), other: 'Marcação',
};
const MARCACAO: Record<string, { texto: string; tom: EstadoTom }> = {
  pending: { texto: 'Por confirmar', tom: 'aviso' }, confirmed: { texto: 'Confirmada', tom: 'ok' }, completed: { texto: 'Feita', tom: 'neutro' },
  cancelled: { texto: 'Cancelada', tom: 'neutro' }, no_show: { texto: 'Faltou', tom: 'erro' }, waitlisted: { texto: 'Em espera', tom: 'aviso' },
};
const ATRIBUICAO: Record<string, string> = { active: 'Ativo', scheduled: 'Agendado', completed: 'Concluído', cancelled: 'Cancelado' };
const GRAVIDADE: Record<string, string> = { critical: 'Crítica', severe: 'Grave', moderate: 'Moderada', mild: 'Ligeira' };
const DOC: Record<string, { texto: string; tom: EstadoTom }> = {
  valid: { texto: 'Válido', tom: 'ok' }, expiring: { texto: 'A expirar', tom: 'aviso' }, expired: { texto: 'Expirado', tom: 'erro' },
  missing: { texto: 'Em falta', tom: 'erro' }, pending: { texto: 'Pendente', tom: 'aviso' },
};

type Separador = 'geral' | 'treino' | 'avaliacoes' | 'saude' | 'documentos';
const dia = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const diaHora = (iso: string) => new Date(iso).toLocaleString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const idade = (nasc: string | null) => {
  if (!nasc) return null;
  const n = new Date(`${nasc}T12:00:00Z`); const h = new Date();
  return h.getUTCFullYear() - n.getUTCFullYear() - (h < new Date(Date.UTC(h.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate())) ? 1 : 0);
};

/** Secção que pode falhar sozinha (X-02): em falta nunca é zero. */
function Secao<T>({ s, o, children }: { s: Section<T>; o: string; children: (d: T) => ReactNode }) {
  if (s.state === 'ok') return <>{children(s.data)}</>;
  if (s.state === 'no_permission') return <SemPermissao area={o} />;
  if (s.state === 'not_shared') return <Nota>O {p1} não partilhou {o} com a organização.</Nota>;
  return <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar ${o}: ${s.message}`} />;
}

/**
 * Perfil do cliente (G-06, Figma 64:90), na F1a: Visão geral, Treino,
 * Avaliações, Saúde (por permissão) e Documentos. Contrato, pagamentos e
 * entradas chegam com o plano Ginásio (F2). Cada secção falha sozinha.
 */
export function Client360() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [data, setData] = useState<ClientDetail | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apt, setApt] = useState<Aptidao | null>(null);
  const [assid, setAssid] = useState<Assiduidade | null>(null);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [sep, setSep] = useState<Separador>('geral');

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !id) return;
    setErro(null);
    void fetchClientProfile(client, scope, id).then(setData).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchAptidao(client, scope, id).then(setApt).catch(() => setApt(null));
    void fetchAssiduidade(client, scope).then((m) => setAssid(m.get(id) ?? null)).catch(() => setAssid(null));
    void fetchClientesAtencao(client, scope)
      .then((r) => setMotivos(r.find((x) => x.linkId === id)?.motivos.map((m) => MOTIVO_ATENCAO[m]) ?? []))
      .catch(() => setMotivos([]));
  }, [scope, id]);
  useEffect(() => carregar(), [carregar]);

  const p = data?.profile;
  const agora = Date.now();
  const proximas = data?.bookings.state === 'ok'
    ? data.bookings.data.filter((b) => Date.parse(b.startsAt) >= agora && b.status !== 'cancelled').sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : [];
  const passadas = data?.bookings.state === 'ok' ? data.bookings.data.filter((b) => Date.parse(b.startsAt) < agora) : [];
  const ativa = data?.assignments.state === 'ok' ? data.assignments.data.find((a) => a.status === 'active') : undefined;
  const daqui = { state: { voltar: { rotulo: `à ficha de ${p?.name.split(' ')[0] ?? p1}`, href: `/clients/${id}` } } };
  const anos = idade(p?.birthDate ?? null);
  const separadores: { id: Separador; rotulo: string }[] = [
    { id: 'geral', rotulo: 'Visão geral' }, { id: 'treino', rotulo: 'Treino' }, { id: 'avaliacoes', rotulo: 'Avaliações' },
    { id: 'saude', rotulo: 'Saúde' }, { id: 'documentos', rotulo: 'Documentos' },
  ];

  return (
    <CoachShell headStrong={p?.name ?? `Ficha do ${p1}`} headSub={PP} legado={false}
      topActions={<VoltarA omissao={{ rotulo: PP, href: '/clients' }} />}>
      <div className="lv-root lg-ficha">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar a ficha" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !data || !p ? <div className="lv-lista"><Esqueleto /></div>
          : (
            <>
              <header className="lg-ficha__cabeca">
                <Avatar nome={p.name} foto={p.avatarUrl} tamanho={72} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h2 className="lv-titulo-ecra" style={{ margin: 0 }}>{p.name}</h2>
                  <div className="lg-ficha__pills">
                    <Estado tom={ESTADO[p.status]?.tom ?? 'neutro'}>{ESTADO[p.status]?.texto ?? p.status}</Estado>
                    {anos != null && <span className="lv-pill">{anos} anos</span>}
                    {p.groupName && <span className="lv-pill">{p.groupName}</span>}
                    <span className="lv-pill">{p.hasAccount ? 'Usa a app' : 'Sem conta na app'}</span>
                    <span className="lv-pill">Desde {dia(p.createdAt)}</span>
                  </div>
                </div>
                <div className="lg-ficha__acoes">
                  <Botao variante="secundario" icone={CalendarBlank} onClick={() => navigate(`/schedule?nova=1&cliente=${id}`)}>Marcar</Botao>
                  <Botao icone={Play} onClick={() => navigate('/live')}>Iniciar {vocab.sessao()}</Botao>
                </div>
              </header>

              {motivos.length > 0 && <Nota>Em atenção: {motivos.join(' · ')}</Nota>}

              <div className="lg-separadores" role="tablist" aria-label="Secções da ficha">
                {separadores.map((s) => (
                  <button key={s.id} type="button" role="tab" aria-selected={sep === s.id} onClick={() => setSep(s.id)}>{s.rotulo}</button>
                ))}
              </div>

              {sep === 'geral' && (
                <div className="lg-ficha__grelha">
                  <div className="lg-ficha__coluna">
                    <div className="lg-ficha__par">
                      <section className="lv-lista" aria-label="Plano de treino">
                        <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Plano de treino</h3></div>
                        {ativa ? (
                          <>
                            <span className="lv-linha-lista__titulo" style={{ fontSize: 18 }}>{ativa.planName ?? 'Plano'}</span>
                            <span className="lv-legenda">Desde {dia(ativa.startsOn)}{ativa.endsOn ? ` até ${dia(ativa.endsOn)}` : ''}</span>
                          </>
                        ) : <p className="lv-legenda" style={{ margin: 0 }}>Sem plano ativo.</p>}
                        <button type="button" className="lg-link" onClick={() => setSep('treino')}>Ver treino</button>
                      </section>
                      <section className="lv-lista" aria-label="Assiduidade">
                        <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Assiduidade</h3><span className="lv-legenda">últimas 8 semanas</span></div>
                        {assid ? (
                          <div className="lg-ficha__barras" role="img" aria-label={`Por semana: ${assid.semanas.join(', ')}`}>
                            {assid.semanas.map((n, i) => (
                              <span key={i} className={i === 7 ? 'lg-ficha__barra lg-ficha__barra--agora' : 'lg-ficha__barra'}>
                                <b>{n}</b><i style={{ height: 6 + n * 10 }} />
                              </span>
                            ))}
                          </div>
                        ) : <p className="lv-legenda" style={{ margin: 0 }}>Sem dados de assiduidade.</p>}
                      </section>
                    </div>
                    <section className="lv-lista" aria-label="Atividade">
                      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Atividade</h3></div>
                      <Secao s={data.bookings} o="a atividade">
                        {() => passadas.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ainda sem atividade.</p>
                          : passadas.slice(0, 6).map((b) => (
                            <div key={b.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                              <Barbell size={18} aria-hidden />
                              <span className="lv-linha-lista__corpo">
                                <span className="lv-linha-lista__titulo">{b.title ?? TIPO[b.type] ?? b.type}</span>
                                <span className="lv-legenda">{diaHora(b.startsAt)}{b.location ? ` · ${b.location}` : ''}</span>
                              </span>
                              <Estado tom={MARCACAO[b.status]?.tom ?? 'neutro'}>{MARCACAO[b.status]?.texto ?? b.status}</Estado>
                            </div>
                          ))}
                      </Secao>
                    </section>
                  </div>

                  <aside className="lv-lista lg-ficha__lado" aria-label="Resumo">
                    <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Resumo</h3>
                    <dl className="lg-conta__dados">
                      <dt>Plano</dt><dd>{p.planName ?? 'Sem plano'}</dd>
                      <dt>Próxima {vocab.sessao()}</dt><dd>{proximas[0] ? diaHora(proximas[0].startsAt) : '—'}</dd>
                      <dt>Email</dt><dd>{p.email ?? '—'}</dd>
                      <dt>Telemóvel</dt><dd>{p.phone ?? '—'}</dd>
                    </dl>
                    <button type="button" className="lg-ficha__aptidao" onClick={() => navigate(`/clients/${id}/aptidao`, daqui)}>
                      <Heartbeat size={18} aria-hidden />
                      <span style={{ flex: 1 }}>
                        <b>Restrição e aptidão</b>
                        <span className="lv-legenda" style={{ display: 'block' }}>O detalhe clínico só aparece à equipa clínica.</span>
                      </span>
                      {apt && <Estado tom={APTIDAO[apt.estado].tom}>{APTIDAO[apt.estado].texto}</Estado>}
                    </button>
                  </aside>
                </div>
              )}

              {sep === 'treino' && (
                <div className="lg-ficha__grelha">
                  <section className="lv-lista" aria-label="Atribuições">
                    <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Planos atribuídos</h3></div>
                    <Secao s={data.assignments} o="os planos">
                      {(lista) => lista.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem planos atribuídos. Atribui um na lista de {PP.toLowerCase()}.</p>
                        : lista.map((a) => (
                          <div key={a.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                            <span className="lv-linha-lista__corpo">
                              <span className="lv-linha-lista__titulo">{a.planName ?? 'Plano'}</span>
                              <span className="lv-legenda">{dia(a.startsOn)}{a.endsOn ? ` a ${dia(a.endsOn)}` : ''}{a.notes ? ` · ${a.notes}` : ''}</span>
                            </span>
                            <Estado tom={a.status === 'active' ? 'ok' : 'neutro'}>{ATRIBUICAO[a.status] ?? a.status}</Estado>
                          </div>
                        ))}
                    </Secao>
                  </section>
                  <section className="lv-lista" aria-label="Próximas">
                    <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Próximas {vocab.sessao({ plural: true })}</h3></div>
                    <Secao s={data.bookings} o={`as ${vocab.sessao({ plural: true })}`}>
                      {() => proximas.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada marcado.</p>
                        : proximas.slice(0, 8).map((b) => (
                          <div key={b.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                            <span className="lv-linha-lista__corpo">
                              <span className="lv-linha-lista__titulo">{diaHora(b.startsAt)}</span>
                              <span className="lv-legenda">{TIPO[b.type] ?? b.type}{b.location ? ` · ${b.location}` : ''}</span>
                            </span>
                            <Estado tom={MARCACAO[b.status]?.tom ?? 'neutro'}>{MARCACAO[b.status]?.texto ?? b.status}</Estado>
                          </div>
                        ))}
                    </Secao>
                  </section>
                </div>
              )}

              {sep === 'avaliacoes' && (
                <section className="lv-lista" aria-label="Medidas">
                  <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Medidas</h3></div>
                  <Secao s={data.metrics} o="as medidas">
                    {(m) => m.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem medidas registadas.</p>
                      : m.map((x) => (
                        <div key={x.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                          <span className="lv-linha-lista__corpo">
                            <span className="lv-linha-lista__titulo">{x.metricKey}</span>
                            <span className="lv-legenda">{dia(x.recordedAt)} · {x.source === 'app' ? 'registado na app' : 'registado pela equipa'}</span>
                          </span>
                          <b className="lg-num">{x.value ?? x.textValue ?? '—'} {x.unit ?? ''}</b>
                        </div>
                      ))}
                  </Secao>
                </section>
              )}

              {sep === 'saude' && (
                <div className="lg-ficha__grelha">
                  <section className="lv-lista" aria-label="Alergias">
                    <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Alergias</h3></div>
                    <Secao s={data.allergies} o="a saúde">
                      {(a) => a.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem alergias registadas.</p>
                        : a.map((x) => (
                          <div key={x.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                            <span className="lv-linha-lista__corpo">
                              <span className="lv-linha-lista__titulo">{x.allergen}</span>
                              <span className="lv-legenda">{x.reaction ?? x.notes ?? '—'}</span>
                            </span>
                            <Estado tom={x.severity === 'severe' || x.severity === 'critical' ? 'erro' : 'aviso'}>{GRAVIDADE[x.severity] ?? x.severity}</Estado>
                          </div>
                        ))}
                    </Secao>
                  </section>
                  <aside className="lv-lista" aria-label="Aptidão">
                    <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Restrição e aptidão</h3>
                    {apt ? <Estado tom={APTIDAO[apt.estado].tom}>{APTIDAO[apt.estado].texto}</Estado> : <Esqueleto linhas={1} />}
                    <Botao variante="secundario" onClick={() => navigate(`/clients/${id}/aptidao`, daqui)}>Abrir aptidão</Botao>
                  </aside>
                </div>
              )}

              {sep === 'documentos' && (
                <section className="lv-lista" aria-label="Documentos">
                  <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Documentos</h3></div>
                  <Secao s={data.documents} o="os documentos">
                    {(d) => d.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem documentos.</p>
                      : d.map((x) => (
                        <div key={x.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                          <span className="lv-linha-lista__corpo">
                            <span className="lv-linha-lista__titulo">{x.name}</span>
                            <span className="lv-legenda">{x.docType ?? 'Documento'}{x.expiresOn ? ` · válido até ${dia(x.expiresOn)}` : ''}</span>
                          </span>
                          <Estado tom={DOC[x.status]?.tom ?? 'neutro'}>{DOC[x.status]?.texto ?? x.status}</Estado>
                        </div>
                      ))}
                  </Secao>
                </section>
              )}
            </>
          )}
      </div>
    </CoachShell>
  );
}
