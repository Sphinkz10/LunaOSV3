import { g, eFeminino } from '@luna/modalidades';
import { useCallback, useEffect, useState } from 'react';
import {
  arquivarLocal, fetchCalendario, fetchLocais, fetchRegras, guardarLocal, guardarRegras, novaLigacaoCalendario, REGRAS_PADRAO,
  TIPOS_LOCAL, toast, type EstadoCalendario, type LocalPT, type RegrasMarcacao, type TipoLocal,
} from '@luna/core';
import { Botao, Campo, Chip, Esqueleto, Interruptor, Janela, Nota } from '@luna/ui/v3';
import { CoachShell } from '../app/CoachShell';
import { VoltarA } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../lib/vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : undefined);

/**
 * Regras, lembretes, locais e calendário do PT (G-11, tarefa 29 parte A).
 * As regras são do negócio (só quem gere muda); locais e calendário são de
 * cada PT. O cliente vê na app o aviso que aqui se pré-visualiza.
 */
export function RegrasPT() {
  const scope = useScope();
  const gere = scope.permissions.includes('org.manage');
  return (
    <CoachShell headStrong="Regras e lembretes" headSub="Marcações, desmarcações, avisos e o teu calendário" legado={false}
      topActions={<VoltarA omissao={{ rotulo: 'ao Horário', href: '/schedule' }} />}>
      <div className="lv-root lg-ficha__grelha">
        <div className="lg-ficha__coluna">
          {gere ? <RegrasForm /> : <Nota>As regras de marcação são definidas por quem gere o negócio.</Nota>}
        </div>
        <aside className="lg-ficha__coluna">
          {scope.membershipId && <Locais membershipId={scope.membershipId} />}
          {scope.membershipId && <Calendario membershipId={scope.membershipId} />}
        </aside>
      </div>
    </CoachShell>
  );
}

function RegrasForm() {
  const scope = useScope();
  const [r, setR] = useState<RegrasMarcacao | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchRegras(client, scope).then((x) => setR({ ...REGRAS_PADRAO, ...x })).catch(() => setR(REGRAS_PADRAO));
  }, [scope]);
  if (!r) return <section className="lv-lista"><Esqueleto linhas={6} /></section>;
  const num = (v: string, omissao: number) => (v === '' ? omissao : Number(v));
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await guardarRegras(client, scope, r); toast({ variant: 'success', title: 'Regras guardadas' }); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
  };
  const sessao = t('sessao');
  return (
    <>
      <section className="lv-lista" aria-label="Marcações">
        <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Marcações</h3>
        <div className="lv-linha-lista" style={{ cursor: 'default' }}>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">O cliente marca na app</span>
            <span className="lv-legenda">Desligado, só tu marcas; o cliente vê {g(t('sessao', { plural: true }), 'as', 'os')} {eFeminino(t('sessao')) ? 'marcadas' : 'marcados'}.</span></span>
          <Interruptor rotulo="O cliente marca na app" ligado={r.client_can_book} onMudar={(v) => setR({ ...r, client_can_book: v })} />
        </div>
        <div className="lg-conta__prefs">
          <Campo rotulo={`Duração da ${sessao} (min)`} type="number" min={15} max={240} step={15} value={r.slot_minutes} onChange={(e) => setR({ ...r, slot_minutes: num(e.target.value, 60) })} />
          <Campo rotulo="Antecedência mínima (h)" type="number" min={0} max={168} value={r.min_notice_hours} onChange={(e) => setR({ ...r, min_notice_hours: num(e.target.value, 0) })} />
          <Campo rotulo="Marcar até (dias)" type="number" min={1} max={90} value={r.horizon_days} onChange={(e) => setR({ ...r, horizon_days: num(e.target.value, 21) })} />
          <Campo rotulo="Máximo por semana" type="number" min={1} max={14} placeholder="Sem limite" value={r.max_per_week ?? ''}
            onChange={(e) => setR({ ...r, max_per_week: e.target.value === '' ? null : Number(e.target.value) })} />
        </div>
        <div className="lv-linha-lista" style={{ cursor: 'default' }}>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Confirmar logo</span>
            <span className="lv-legenda">Desligado, cada marcação da app fica à espera da tua confirmação.</span></span>
          <Interruptor rotulo="Confirmar logo" ligado={r.auto_confirm} onMudar={(v) => setR({ ...r, auto_confirm: v })} />
        </div>
      </section>
      <section className="lv-lista" aria-label="Desmarcações">
        <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Desmarcações e faltas</h3>
        <div className="lg-conta__prefs">
          <Campo rotulo="Desmarcar sem contar até (h antes)" type="number" min={0} max={168} value={r.cancel_hours} onChange={(e) => setR({ ...r, cancel_hours: num(e.target.value, 24) })} />
        </div>
        <div className="lv-linha-lista" style={{ cursor: 'default' }}>
          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Falta desconta do pack</span>
            <span className="lv-legenda">Se o cliente não aparecer, a {sessao} conta como feita.</span></span>
          <Interruptor rotulo="Falta desconta do pack" ligado={r.no_show_counts} onMudar={(v) => setR({ ...r, no_show_counts: v })} />
        </div>
        <span className="lv-sobretitulo">O cliente vê assim</span>
        <Nota>
          Podes desmarcar sem custo até {r.cancel_hours} h antes. Depois disso, ou se faltares{r.no_show_counts ? '' : ' (a falta não conta)'}, a {sessao} conta como feita.
        </Nota>
      </section>
      <section className="lv-lista" aria-label="Lembretes">
        <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Lembretes ao cliente</h3>
        {([['remind_24h', '24 horas antes', 'Na véspera, fora das horas de silêncio (22h às 8h).'],
          ['remind_2h', '2 horas antes', 'Para quem se esquece no próprio dia.'],
          ['remind_sms', 'Também por SMS', 'Só para quem não tem a app. Pode ter custo.'],
          ['notify_pt', 'Avisar-me quando o cliente marca ou desmarca', 'Chega aos teus avisos.']] as const).map(([k, titulo, texto]) => (
          <div key={k} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{titulo}</span><span className="lv-legenda">{texto}</span></span>
            <Interruptor rotulo={titulo} ligado={r[k]} onMudar={(v) => setR({ ...r, [k]: v })} />
          </div>
        ))}
        <Botao onClick={() => void guardar()}>Guardar regras</Botao>
      </section>
    </>
  );
}

function Locais({ membershipId }: { membershipId: string }) {
  const scope = useScope();
  const [locais, setLocais] = useState<LocalPT[] | null>(null);
  const [editar, setEditar] = useState<Partial<LocalPT> | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchLocais(client, scope, membershipId).then(setLocais).catch(() => setLocais([]));
  }, [scope, membershipId]);
  useEffect(() => carregar(), [carregar]);
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client || !editar?.nome?.trim()) return;
    try {
      await guardarLocal(client, scope, { id: editar.id, membershipId, tipo: editar.tipo ?? 'estudio', nome: editar.nome, morada: editar.morada ?? null });
      setEditar(null); carregar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
  };
  const tirar = async (id: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await arquivarLocal(client, id); carregar(); } catch (e) { toast({ variant: 'danger', title: 'Não foi possível tirar', description: erroDe(e) }); }
  };
  return (
    <section className="lv-lista" aria-label="Os meus locais">
      <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Os meus locais</h3>
      {!locais ? <Esqueleto linhas={2} /> : locais.length === 0
        ? <p className="lv-legenda" style={{ margin: 0 }}>Junta onde dás {t('sessao', { plural: true })}: estúdio, parque, casa do cliente ou online.</p>
        : locais.map((l) => (
          <div key={l.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{l.nome}</span>
              <span className="lv-legenda">{TIPOS_LOCAL.find((x) => x.id === l.tipo)?.rotulo}{l.morada ? ` · ${l.morada}` : ''}</span></span>
            <Botao variante="secundario" onClick={() => setEditar(l)}>Editar</Botao>
            <Botao variante="secundario" onClick={() => void tirar(l.id)}>Tirar</Botao>
          </div>
        ))}
      <Botao variante="secundario" onClick={() => setEditar({ tipo: 'estudio' })}>Juntar local</Botao>
      <Janela aberta={!!editar} onFechar={() => setEditar(null)} titulo={editar?.id ? 'Editar local' : 'Novo local'}>
        {editar && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            <div className="lg-ficha__metricas">
              {TIPOS_LOCAL.map((x) => <Chip key={x.id} ativo={editar.tipo === x.id} onClick={() => setEditar({ ...editar, tipo: x.id as TipoLocal })}>{x.rotulo}</Chip>)}
            </div>
            <Campo rotulo="Nome" placeholder="Ex.: Parque da Cidade" value={editar.nome ?? ''} onChange={(e) => setEditar({ ...editar, nome: e.target.value })} />
            {editar.tipo !== 'online' && editar.tipo !== 'casa_cliente' && (
              <Campo rotulo="Morada" value={editar.morada ?? ''} onChange={(e) => setEditar({ ...editar, morada: e.target.value })} />
            )}
            {editar.tipo === 'casa_cliente' && <Nota>A morada de cada cliente vem da ficha dele.</Nota>}
            <Botao disabled={!editar.nome?.trim()} onClick={() => void guardar()}>Guardar</Botao>
          </div>
        )}
      </Janela>
    </section>
  );
}

function Calendario({ membershipId }: { membershipId: string }) {
  const scope = useScope();
  const [estado, setEstado] = useState<EstadoCalendario | null>(null);
  const [nomes, setNomes] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchCalendario(client, membershipId).then((e) => { setEstado(e); setNomes(e.mostrarNomes); }).catch(() => setEstado({ ativo: false, desde: null, mostrarNomes: false }));
  }, [membershipId]);
  const gerar = async () => {
    const client = getSupabaseClient();
    const base = import.meta.env.VITE_SUPABASE_URL?.trim();
    if (!client || !base) return;
    try {
      const u = await novaLigacaoCalendario(client, scope, base, nomes);
      setUrl(u); setEstado({ ativo: true, desde: new Date().toISOString(), mostrarNomes: nomes });
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível gerar', description: erroDe(e) }); }
  };
  const copiar = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); toast({ variant: 'success', title: 'Ligação copiada' }); }
    catch { toast({ variant: 'warning', title: 'Copia à mão', description: url }); }
  };
  return (
    <section className="lv-lista" aria-label="Ligar ao calendário">
      <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Ligar ao teu calendário</h3>
      <p className="lv-legenda" style={{ margin: 0 }}>{g(t('sessao', { plural: true }), 'As tuas', 'Os teus')} aparecem no Google Calendar, no iPhone ou no Outlook. Só de leitura.</p>
      {!estado ? <Esqueleto linhas={2} /> : (
        <>
          <div className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">Mostrar o nome do cliente</span>
              <span className="lv-legenda">Desligado, aparece só "Sessão". Mais seguro se o calendário for partilhado.</span></span>
            <Interruptor rotulo="Mostrar o nome do cliente" ligado={nomes} onMudar={setNomes} />
          </div>
          {url ? (
            <>
              <Campo rotulo="A tua ligação" readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <Botao onClick={() => void copiar()}>Copiar</Botao>
              <Nota>Guarda-a agora: por segurança só a mostramos esta vez. No Google: Outros calendários › A partir do URL.</Nota>
            </>
          ) : estado.ativo ? (
            <Nota>Ligação ativa desde {new Date(estado.desde!).toLocaleDateString('pt-PT')}. Para a ver outra vez, gera uma nova: a antiga deixa de funcionar.</Nota>
          ) : null}
          <Botao variante={estado.ativo || url ? 'secundario' : 'principal'} onClick={() => void gerar()}>{estado.ativo || url ? 'Gerar nova ligação' : 'Gerar ligação'}</Botao>
        </>
      )}
    </section>
  );
}
