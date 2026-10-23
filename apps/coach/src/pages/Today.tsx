import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchClientesAtencao, fetchDashboardKpis, fetchDinheiro, fetchEquipaHoje, fetchInbox, fetchResumoAvaliacao, fetchSaldo, fetchTodayBookings, sincronizarAtrasos,
  useAuthStore, wallClock,
  type ClienteAtencao, type DashboardBooking, type DashboardKpis, type Dinheiro, type Pendencia, type ResumoAvaliacao, type SaldoPack, type SessoesPorPt,
} from '@luna/core';
import { AvisoSecao, Avatar, Botao, Esqueleto, Estado, EstadoPagina, Tema, type EstadoTom } from '@luna/ui/v3';
import { eFeminino, g } from '@luna/modalidades';
import { CalendarBlank, CaretRight, Fire, Heartbeat, ListChecks, Play, Plus, Users, Wallet } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { ParaComecar } from '../app/ParaComecar';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { captureEvent } from '../lib/observability';
import { t, vocab } from '../lib/vocab';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const TIPO: Record<string, string> = {
  training: t('sessao', { maiuscula: true }), consultation: 'Consulta', class: t('aula', { maiuscula: true }), assessment: 'Avaliação', other: 'Marcação',
};
const ESTADO: Record<DashboardBooking['status'], { texto: string; tom: EstadoTom }> = {
  pending: { texto: 'Por confirmar', tom: 'aviso' }, confirmed: { texto: 'Confirmada', tom: 'ok' }, cancelled: { texto: 'Cancelada', tom: 'neutro' },
  completed: { texto: 'Feita', tom: 'neutro' }, no_show: { texto: 'Faltou', tom: 'erro' }, waitlisted: { texto: 'Em espera', tom: 'aviso' },
};
const LOCAL: Record<string, string> = { estudio: 'Presencial', casa_cliente: 'Em casa', parque: 'Parque', online: 'Online' };
const saudacao = (h: number) => (h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite');
type Secao<T> = { dados: T | null; erro: string | null };
const vazio = <T,>(): Secao<T> => ({ dados: null, erro: null });

/**
 * Hoje (G-01, Figma 62:8) na versão do PT: contagens que levam à lista já
 * filtrada, 3 pendências da Inbox, clientes em atenção com o motivo (4 regras
 * de D18) e a agenda do dia. Sem gráficos. O dono de estúdio pequeno vê ainda
 * o bloco da equipa (sessões de hoje por PT), no tema Esboço até ser desenhado.
 * Cada secção falha sozinha: o resto do ecrã continua a funcionar.
 */
export function Today() {
  const navigate = useNavigate();
  const scope = useScope();
  const me = useAuthStore((s) => s.me);
  const dono = scope.roles.includes('owner') || scope.permissions.includes('clients.read_all');
  const [kpis, setKpis] = useState<Secao<DashboardKpis>>(vazio);
  const [agenda, setAgenda] = useState<Secao<DashboardBooking[]>>(vazio);
  const [atencao, setAtencao] = useState<Secao<ClienteAtencao[]>>(vazio);
  const [pendencias, setPendencias] = useState<Secao<Pendencia[]>>(vazio);
  const [equipa, setEquipa] = useState<Secao<SessoesPorPt[]>>(vazio);
  const [avaliacao, setAvaliacao] = useState<Secao<ResumoAvaliacao>>(vazio);
  const [dinheiro, setDinheiro] = useState<Secao<Dinheiro>>(vazio);
  const [packs, setPacks] = useState<Map<string, SaldoPack[]>>(new Map());

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    const correr = <T,>(p: Promise<T>, set: (s: Secao<T>) => void) =>
      void p.then((dados) => set({ dados, erro: null })).catch((e) => set({ dados: null, erro: e instanceof Error ? e.message : 'Erro' }));
    correr(fetchDashboardKpis(client, scope).then((k) => { captureEvent('dashboard_loaded', { today: k.today, pending: k.pending }); return k; }), setKpis);
    correr(fetchTodayBookings(client, scope), setAgenda);
    correr(fetchClientesAtencao(client, scope), setAtencao);
    // Revisões e marcos em atraso passam a pendências antes de ler a Inbox
    correr(sincronizarAtrasos(client, scope).catch(() => undefined).then(() => fetchInbox(client, scope)), setPendencias);
    if (dono) correr(fetchEquipaHoje(client, scope), setEquipa);
    correr(fetchResumoAvaliacao(client, scope), setAvaliacao);
    correr(fetchDinheiro(client, scope), setDinheiro);
  }, [scope, dono]);
  useEffect(() => carregar(), [carregar]);
  // O pack de cada cliente com sessão hoje: "Sessão 6 de 8" e o fim do pack (Figma 199:108)
  useEffect(() => {
    const client = getSupabaseClient();
    const ids = [...new Set((agenda.dados ?? []).map((b) => b.linkId).filter((x): x is string => !!x))];
    if (!client || !ids.length) return;
    void Promise.all(ids.map((id) => fetchSaldo(client, id).then((sl): [string, SaldoPack[]] => [id, sl]).catch((): [string, SaldoPack[]] => [id, []])))
      .then((pares) => setPacks(new Map(pares)));
  }, [agenda.dados]);

  const w = wallClock(new Date(), scope.timezone);
  const dia = `${DIAS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()]}, ${w.day} de ${MESES[w.month - 1]}`;
  const primeiroNome = me?.name?.split(' ')[0] ?? '';
  const agora = `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
  const proxima = agenda.dados?.find((b) => (b.status === 'confirmed' || b.status === 'pending') && b.time >= agora);
  const n = (v: number | undefined | null, erro: string | null) => (erro ? '—' : v ?? '…');
  const PP = vocab.pessoa({ plural: true, maiuscula: true });
  const SS = t('sessao', { plural: true, maiuscula: true });

  const ss = vocab.sessao();
  const atrasados = (atencao.dados ?? []).every((c) => c.motivos.every((m) => m === 'sem_treinar_7d'));
  const contagens: { rotulo: string; icone: typeof Fire; valor: string | number; sufixo?: string; legenda: string; to: string; tom?: 'acao' | 'aviso' }[] = [
    { rotulo: `${SS} hoje`, icone: CalendarBlank, valor: n(kpis.dados?.today, kpis.erro),
      legenda: kpis.dados ? `${kpis.dados.pending} por confirmar` : '…', to: '/schedule', tom: 'acao' },
    { rotulo: 'Check-ins por rever', icone: ListChecks, valor: n(avaliacao.dados?.por_ler, avaliacao.erro),
      legenda: avaliacao.dados ? `${avaliacao.dados.por_responder} por responder` : '…', to: '/assessment' },
    { rotulo: 'Pagamentos por registar', icone: Wallet, valor: n(dinheiro.dados?.quem_deve.length, dinheiro.erro),
      legenda: dinheiro.dados ? `Packs a acabar: ${dinheiro.dados.a_acabar.length}` : '…', to: '/business/dinheiro', tom: 'aviso' },
    { rotulo: `${PP} em atenção`, icone: Fire, valor: n(atencao.dados?.length, atencao.erro),
      legenda: atrasados ? 'Sem treinar há mais de 7 dias' : 'Parados, faltas e packs a acabar', to: '/clients?filtro=attention' },
  ];
  const daqui = { state: { voltar: { rotulo: 'Hoje', href: '/today' } } };

  return (
    <CoachShell headStrong="Hoje" headSub={dia} legado={false}>
      <div className="lv-root lg-hoje">
        <section className="lg-hoje__ola" aria-label="Saudação">
          <h2 className="lv-titulo-ecra" style={{ margin: 0 }}>{saudacao(w.hour)}{primeiroNome ? `, ${primeiroNome}` : ''}</h2>
          <p style={{ margin: 0 }}>
            {agenda.dados ? `${agenda.dados.length} ${t('sessao', { plural: agenda.dados.length !== 1 })} hoje` : scope.orgName}
            {proxima?.client ? ` · ${g(ss, 'a próxima', 'o próximo')} é com ${eFeminino(proxima.client.split(' ')[0]) ? 'a' : 'o'} ${proxima.client} às ${proxima.time}` : ''}
          </p>
          <div className="lg-hoje__acoes">
            {/* Como no Figma do PT (199:108): iniciar em destaque; novo cliente e marcar em texto */}
            <button type="button" className="lg-hoje__principal" onClick={() => navigate('/live')}><Play size={16} aria-hidden />Iniciar {ss}</button>
            <button type="button" className="lg-hoje__link" onClick={() => navigate('/clients?novo=1')}><Plus size={16} aria-hidden />Novo {vocab.pessoa()}</button>
            <button type="button" className="lg-hoje__link" onClick={() => navigate('/schedule?nova=1')}><CalendarBlank size={16} aria-hidden />Marcar</button>
          </div>
        </section>

        <div className="lg-hoje__contagens">
          {contagens.map((c) => (
            <button key={c.rotulo} type="button" className={`lg-contagem${c.tom ? ` lg-contagem--${c.tom}` : ''}`} onClick={() => navigate(c.to)}>
              <span className="lg-contagem__rotulo"><c.icone size={16} aria-hidden />{c.rotulo}</span>
              <span className="lv-numero-grande">{c.valor}</span>
              <span className="lg-contagem__legenda">{c.legenda}</span>
            </button>
          ))}
        </div>

        <div className="lg-hoje__grelha">
          <section className="lv-lista" aria-label={`${SS} de hoje`}>
            <div className="lv-lista__cabeca">
              <h2 className="lv-titulo-cartao">{SS} de hoje</h2>
              <button type="button" className="lg-link" onClick={() => navigate('/schedule')}>Ver horário <CaretRight size={16} aria-hidden /></button>
            </div>
            {agenda.erro ? <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar a agenda: ${agenda.erro}`} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
              : !agenda.dados ? <Esqueleto linhas={4} />
              : agenda.dados.length === 0 ? <EstadoPagina tipo="vazio" titulo={`Sem ${t('sessao', { plural: true })} hoje`} texto="Usa Marcar para pôr uma no horário." />
              : agenda.dados.map((b) => {
                const pack = b.linkId ? (packs.get(b.linkId) ?? []).find((x) => x.estado !== 'expirado') : undefined;
                const usadas = pack ? pack.total - pack.restam : 0;
                const esta = pack ? Math.min(pack.total, usadas + (b.status === 'completed' ? 0 : 1)) : 0;
                const fim = pack && esta >= pack.total;
                return (
                  <button key={b.id} type="button" className="lg-hoje__sessao" onClick={() => navigate(b.type === 'training' && b.status === 'confirmed' ? `/live/${b.id}` : '/schedule')}>
                    <span className="lg-hoje__hora">{b.time}</span>
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{b.client ?? b.title ?? TIPO[b.type]}</span>
                      <span className="lv-legenda">{[LOCAL[b.local ?? ''] ?? (b.local ? b.local : null), b.client ? b.title : TIPO[b.type]].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="lg-hoje__pack">
                      {pack ? <>
                        <span className="lg-barra" aria-hidden><i style={{ width: `${(esta / pack.total) * 100}%` }} /></span>
                        <span className="lv-legenda">{t('sessao', { maiuscula: true })} {esta} de {pack.total}</span>
                      </> : <span className="lv-legenda">Sem pack</span>}
                    </span>
                    {fim && b.status === 'confirmed' ? <Estado tom="aviso">Fim do pack</Estado> : <Estado tom={ESTADO[b.status].tom}>{ESTADO[b.status].texto}</Estado>}
                  </button>
                );
              })}
          </section>

          <div className="lg-hoje__lado">
            <section className="lv-lista" aria-label="Pendências">
              <div className="lv-lista__cabeca">
                <h2 className="lv-titulo-cartao">Pendências</h2>
                <button type="button" className="lg-link" onClick={() => navigate('/inbox')}>Abrir Inbox <CaretRight size={16} aria-hidden /></button>
              </div>
              {pendencias.erro ? <AvisoSecao tipo="falha-parcial" texto="Não foi possível carregar as pendências." acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
                : !pendencias.dados ? <Esqueleto linhas={3} />
                : pendencias.dados.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada à tua espera.</p>
                : pendencias.dados.slice(0, 3).map((p) => (
                  <div key={p.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <span className={`lg-hoje__pend lg-hoje__pend--${p.categoria}`} aria-hidden>{p.categoria === 'saude' ? <Heartbeat size={18} /> : <Users size={18} />}</span>
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{p.cliente} · {p.titulo}</span>
                      <span className="lv-legenda">{p.origem}</span>
                    </span>
                    <Botao variante="secundario" onClick={() => navigate(p.acao.to, daqui)}>{p.acao.rotulo}</Botao>
                  </div>
                ))}
            </section>

          </div>
        </div>

        <ParaComecar />

        {dono && (equipa.dados?.length ?? 0) > 1 && (
          <Tema tema="esboco">
            <section className="lv-lista lg-hoje__equipa" aria-label="Equipa hoje">
              <div className="lv-lista__cabeca">
                <h2 className="lv-titulo-cartao">Equipa hoje</h2>
              </div>
              {equipa.erro ? <AvisoSecao tipo="falha-parcial" texto="Não foi possível carregar a equipa." acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
                : !equipa.dados ? <Esqueleto linhas={2} />
                : equipa.dados.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ninguém da equipa tem {t('sessao', { plural: true })} hoje.</p>
                : equipa.dados.map((p) => (
                  <div key={p.membershipId} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <Avatar nome={p.nome} tamanho={32} />
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{p.nome}</span>
                      <span className="lv-legenda">{p.feitas} de {p.total} feitas{p.proxima ? ` · próxima às ${p.proxima}` : ''}</span>
                    </span>
                  </div>
                ))}
            </section>
          </Tema>
        )}
      </div>
    </CoachShell>
  );
}
