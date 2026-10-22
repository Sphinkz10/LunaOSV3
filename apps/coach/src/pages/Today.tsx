import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchClientesAtencao, fetchDashboardKpis, fetchEquipaHoje, fetchInbox, fetchTodayBookings, MOTIVO_ATENCAO, sincronizarAtrasos, useAuthStore, wallClock,
  type ClienteAtencao, type DashboardBooking, type DashboardKpis, type Pendencia, type SessoesPorPt,
} from '@luna/core';
import { AvisoSecao, Avatar, Botao, Esqueleto, Estado, EstadoPagina, Tema, type EstadoTom } from '@luna/ui/v3';
import { Wallet, Barbell, CalendarBlank, Clock, Heartbeat, ListChecks, Package, Play, Plus, Users, Warning } from '@luna/icons';
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
  }, [scope, dono]);
  useEffect(() => carregar(), [carregar]);

  const w = wallClock(new Date(), scope.timezone);
  const dia = `${DIAS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()]}, ${w.day} de ${MESES[w.month - 1]}`;
  const primeiroNome = me?.name?.split(' ')[0] ?? '';
  const proxima = agenda.dados?.find((b) => b.status === 'confirmed' || b.status === 'pending');
  const n = (v: number | undefined | null, erro: string | null) => (erro ? '—' : v ?? '…');
  const PP = vocab.pessoa({ plural: true, maiuscula: true });
  const SS = t('sessao', { plural: true, maiuscula: true });

  const contagens: { rotulo: string; icone: typeof Clock; valor: string | number; legenda: string; to: string; tom?: 'acao' | 'aviso' }[] = [
    { rotulo: `${SS} hoje`, icone: CalendarBlank, valor: n(kpis.dados?.today, kpis.erro),
      legenda: proxima ? `Próxima: ${proxima.client ?? proxima.title ?? TIPO[proxima.type]} às ${proxima.time}` : 'Sem mais hoje', to: '/schedule', tom: 'acao' },
    { rotulo: 'Por confirmar', icone: Clock, valor: n(kpis.dados?.pending, kpis.erro), legenda: 'Marcações à espera de resposta', to: '/schedule?estado=pendente' },
    { rotulo: `${PP} em atenção`, icone: Heartbeat, valor: n(atencao.dados?.length, atencao.erro),
      legenda: 'Parados, faltas e packs a acabar', to: '/clients?filtro=attention', tom: (atencao.dados?.length ?? 0) > 0 ? 'aviso' : undefined },
    { rotulo: 'Pendências', icone: ListChecks, valor: n(pendencias.dados?.length, pendencias.erro), legenda: 'Na Inbox, por resolver', to: '/inbox' },
  ];
  const daqui = { state: { voltar: { rotulo: 'Hoje', href: '/today' } } };

  return (
    <CoachShell headStrong="Hoje" headSub={dia} legado={false}>
      <div className="lv-root lg-hoje">
        <section className="lg-hoje__ola" aria-label="Saudação">
          <h2 className="lv-titulo-ecra" style={{ margin: 0 }}>{saudacao(w.hour)}{primeiroNome ? `, ${primeiroNome}` : ''}</h2>
          <p style={{ margin: 0 }}>
            {agenda.dados ? `${agenda.dados.length} ${t('sessao', { plural: agenda.dados.length !== 1 })} hoje` : scope.orgName}
            {atencao.dados && atencao.dados.length > 0 ? ` · ${atencao.dados.length} ${vocab.pessoa({ plural: atencao.dados.length !== 1 })} em atenção` : ''}
          </p>
          <div className="lg-hoje__acoes">
            <Botao icone={CalendarBlank} onClick={() => navigate('/schedule?nova=1')}>Marcar</Botao>
            <Botao variante="secundario" icone={Plus} onClick={() => navigate('/clients?novo=1')}>Novo {vocab.pessoa()}</Botao>
            <Botao variante="secundario" icone={Play} onClick={() => navigate('/live')}>Iniciar {vocab.sessao()}</Botao>
            <Botao variante="secundario" icone={Barbell} onClick={() => navigate('/training/biblioteca?novo=treino')}>Novo treino</Botao>
            <Botao variante="secundario" icone={Package} onClick={() => navigate('/business/packs')}>Vender pack</Botao>
            <Botao variante="secundario" icone={Wallet} onClick={() => navigate('/business/dinheiro')}>Registar pagamento</Botao>
          </div>
        </section>

        <ParaComecar />

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
              <button type="button" className="lg-link" onClick={() => navigate('/schedule')}>Ver horário</button>
            </div>
            {agenda.erro ? <AvisoSecao tipo="falha-parcial" texto={`Não foi possível carregar a agenda: ${agenda.erro}`} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
              : !agenda.dados ? <Esqueleto linhas={4} />
              : agenda.dados.length === 0 ? <EstadoPagina tipo="vazio" titulo={`Sem ${t('sessao', { plural: true })} hoje`} texto="Usa Marcar para pôr uma no horário." />
              : agenda.dados.map((b) => (
                <div key={b.id} className="lg-hoje__sessao">
                  <span className="lg-hoje__hora">{b.time}</span>
                  <span className="lv-linha-lista__corpo">
                    <span className="lv-linha-lista__titulo">{b.client ?? b.title ?? TIPO[b.type]}</span>
                    <span className="lv-legenda">{TIPO[b.type] ?? b.type}</span>
                  </span>
                  <Estado tom={ESTADO[b.status].tom}>{ESTADO[b.status].texto}</Estado>
                  {b.type === 'training' && b.status === 'confirmed'
                    ? <Botao variante="secundario" icone={Play} onClick={() => navigate(`/live/${b.id}`)}>Iniciar</Botao>
                    : <Botao variante="secundario" onClick={() => navigate('/schedule')}>Ver</Botao>}
                </div>
              ))}
          </section>

          <div className="lg-hoje__lado">
            <section className="lv-lista" aria-label="Pendências">
              <div className="lv-lista__cabeca">
                <h2 className="lv-titulo-cartao">Pendências</h2>
                <button type="button" className="lg-link" onClick={() => navigate('/inbox')}>Abrir Inbox</button>
              </div>
              {pendencias.erro ? <AvisoSecao tipo="falha-parcial" texto="Não foi possível carregar as pendências." acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
                : !pendencias.dados ? <Esqueleto linhas={3} />
                : pendencias.dados.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Nada à tua espera.</p>
                : pendencias.dados.slice(0, 3).map((p) => (
                  <div key={p.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                    {p.categoria === 'saude' ? <Heartbeat size={18} aria-hidden /> : <Users size={18} aria-hidden />}
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{p.cliente} · {p.titulo}</span>
                      <span className="lv-legenda">{p.origem}</span>
                    </span>
                    <Botao variante="secundario" onClick={() => navigate(p.acao.to, daqui)}>{p.acao.rotulo}</Botao>
                  </div>
                ))}
            </section>

            <section className="lv-lista" aria-label={`${PP} em atenção`}>
              <div className="lv-lista__cabeca">
                <h2 className="lv-titulo-cartao">{PP} em atenção</h2>
                <button type="button" className="lg-link" onClick={() => navigate('/clients?filtro=attention')}>Ver todos</button>
              </div>
              {atencao.erro ? <AvisoSecao tipo="falha-parcial" texto="Não foi possível ver quem está em atenção." acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
                : !atencao.dados ? <Esqueleto linhas={3} />
                : atencao.dados.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Ninguém em atenção.</p>
                : atencao.dados.slice(0, 5).map((c) => (
                  <button key={c.linkId} type="button" className="lv-linha-lista" onClick={() => navigate(`/clients/${c.linkId}`, daqui)}>
                    <Avatar nome={c.nome} tamanho={32} />
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">{c.nome}</span>
                      <span className="lv-legenda">{c.motivos.map((m) => MOTIVO_ATENCAO[m]).join(' · ')}</span>
                    </span>
                    <Warning size={16} aria-hidden className="lg-hoje__aviso" />
                  </button>
                ))}
            </section>
          </div>
        </div>

        {dono && (
          <Tema tema="esboco">
            <section className="lv-lista lg-hoje__equipa" aria-label="Equipa hoje">
              <div className="lv-lista__cabeca">
                <h2 className="lv-titulo-cartao">Equipa hoje</h2>
                <span className="lv-legenda">Provisório, ainda por desenhar</span>
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
