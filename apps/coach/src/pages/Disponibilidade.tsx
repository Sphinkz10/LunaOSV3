import { useCallback, useEffect, useState } from 'react';
import {
  fetchDisponibilidade, fetchRegras, guardarRegras, juntarJanela, marcarAusencia, REGRAS_PADRAO, salasAgora, tirarJanela, toast,
  type DisponibilidadeMembro, type RegrasMarcacao, type SalaAgora,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, Estado, EstadoPagina, Janela, Nota } from '@luna/ui/v3';
import { CoachShell } from '../app/CoachShell';
import { VoltarA } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../lib/vocab';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDEM = [1, 2, 3, 4, 5, 6, 0];
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Disponibilidade, salas e equipamentos (G-11, Figma 69:302): turnos e
 * janelas em que cada PT aceita marcações (é isso que o cliente vê na app),
 * férias e folgas que bloqueiam e avisam, salas agora e regras de marcação.
 * Equipamentos e manutenção chegam com o plano Ginásio (F2).
 */
export function Disponibilidade() {
  const scope = useScope();
  const gere = scope.permissions.includes('schedule.read_all');
  const [semana] = useState(() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d; });
  const dias = Array.from({ length: 7 }, (_, i) => { const d = new Date(semana); d.setUTCDate(d.getUTCDate() + i); return d; });
  const [equipa, setEquipa] = useState<DisponibilidadeMembro[] | null>(null);
  const [salas, setSalas] = useState<SalaAgora[] | null>(null);
  const [regras, setRegras] = useState<RegrasMarcacao>(REGRAS_PADRAO);
  const [erro, setErro] = useState<string | null>(null);
  const [editar, setEditar] = useState<DisponibilidadeMembro | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchDisponibilidade(client, scope, iso(dias[0]), iso(dias[6]))
      .then((l) => setEquipa(gere ? l : l.filter((m) => m.membershipId === scope.membershipId))).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void salasAgora(client, scope).then(setSalas).catch(() => setSalas([]));
    void fetchRegras(client, scope).then(setRegras).catch(() => undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, gere]);
  useEffect(() => carregar(), [carregar]);
  return (
    <CoachShell headStrong="Disponibilidade" headSub={`Semana de ${dias[0].getUTCDate()} a ${dias[6].getUTCDate()}`} legado={false} topActions={<VoltarA omissao={{ rotulo: 'ao Horário', href: '/schedule' }} />}>
      <div className="lv-root lg-ficha__grelha">
        <section className="lv-lista" aria-label="Equipa">
          {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} /> : !equipa ? <Esqueleto /> : (
            <>
              <div className="lg-disp__linha lg-matriz__cabeca"><span />{ORDEM.map((d, i) => <span key={d}>{DIAS[d]} {dias[i].getUTCDate()}</span>)}</div>
              {equipa.map((m) => (
                <button key={m.membershipId} type="button" className="lg-disp__linha lg-disp__membro" onClick={() => setEditar(m)}>
                  <span className="lg-seg__quem"><Avatar nome={m.nome} tamanho={32} /><span><b>{m.nome}</b><span className="lv-legenda" style={{ display: 'block' }}>{m.papel}</span></span></span>
                  {ORDEM.map((d, i) => {
                    const aus = m.ausencias.find((a) => a.data === iso(dias[i]));
                    const js = m.janelas.filter((j) => j.weekday === d);
                    return (
                      <span key={d} className="lg-disp__dia">
                        {aus ? <span className="lg-disp__chip lg-disp__chip--off">{aus.tipo === 'vacation' ? 'Férias' : 'Folga'}</span>
                          : js.length === 0 ? <span className="lg-disp__chip lg-disp__chip--off">Folga</span>
                          : js.map((j) => <span key={j.id} className={`lg-disp__chip lg-disp__chip--${j.kind}`}>{j.start_time.replace(':00', '')}–{j.end_time.replace(':00', '')}</span>)}
                      </span>
                    );
                  })}
                </button>
              ))}
              <div className="lg-clientes__chips" style={{ padding: 'var(--espaco-12)' }}>
                <span className="lg-disp__chip lg-disp__chip--turno">Turno</span><span className="lg-disp__chip lg-disp__chip--marcacoes">Aceita marcações de PT</span><span className="lg-disp__chip lg-disp__chip--off">Folga ou férias</span>
              </div>
            </>
          )}
        </section>
        <aside className="lg-ficha__coluna">
          <section className="lv-lista" aria-label="Salas agora">
            <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Salas agora</h3>
            {!salas ? <Esqueleto linhas={2} /> : salas.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem salas. Cria-as em Definições › Ginásio.</p> : salas.map((s) => (
              <div key={s.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{s.nome}</span>
                  <span className="lv-legenda">{s.ocupadaAte ? `${s.com ?? 'Sessão'} até ${new Date(s.ocupadaAte).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : s.lotacao ? `${s.lotacao} lugares` : 'Livre'}</span></span>
                <Estado tom={s.ocupadaAte ? 'aviso' : 'ok'}>{s.ocupadaAte ? 'Ocupada' : 'Livre'}</Estado>
              </div>
            ))}
          </section>
          {scope.permissions.includes('org.manage') && <RegrasForm regras={regras} onGuardado={setRegras} />}
          <Nota>A disponibilidade de PT é o que o cliente vê para marcar na app.</Nota>
        </aside>
      </div>
      <EditarDisponibilidade membro={editar} onFechar={() => setEditar(null)} onFeito={() => { setEditar(null); carregar(); }} />
    </CoachShell>
  );
}

function RegrasForm({ regras, onGuardado }: { regras: RegrasMarcacao; onGuardado: (r: RegrasMarcacao) => void }) {
  const scope = useScope();
  const [r, setR] = useState(regras);
  useEffect(() => setR(regras), [regras]);
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await guardarRegras(client, scope, r); onGuardado(r); toast({ variant: 'success', title: 'Regras guardadas' }); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: e instanceof Error ? e.message : undefined }); }
  };
  return (
    <section className="lv-lista" aria-label="Regras de marcação">
      <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Regras de marcação</h3>
      <div className="lg-conta__prefs">
        <Campo rotulo={`Duração da ${t('sessao')} (min)`} type="number" min={15} max={240} step={15} value={r.slot_minutes} onChange={(e) => setR({ ...r, slot_minutes: Number(e.target.value) || 60 })} />
        <Campo rotulo="Antecedência mínima (h)" type="number" min={0} max={168} value={r.min_notice_hours} onChange={(e) => setR({ ...r, min_notice_hours: Number(e.target.value) })} />
        <Campo rotulo="Desmarcar sem contar até (h antes)" type="number" min={0} max={168} value={r.cancel_hours} onChange={(e) => setR({ ...r, cancel_hours: Number(e.target.value) })} />
        <Campo rotulo="Marcar até (dias)" type="number" min={1} max={90} value={r.horizon_days} onChange={(e) => setR({ ...r, horizon_days: Number(e.target.value) || 21 })} />
      </div>
      <label className="lv-legenda" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={r.auto_confirm} onChange={() => setR({ ...r, auto_confirm: !r.auto_confirm })} />Confirmar logo as marcações feitas na app</label>
      <Botao variante="secundario" onClick={() => void guardar()}>Guardar regras</Botao>
    </section>
  );
}

function EditarDisponibilidade({ membro, onFechar, onFeito }: { membro: DisponibilidadeMembro | null; onFechar: () => void; onFeito: () => void }) {
  const scope = useScope();
  const [dia, setDia] = useState(1); const [de, setDe] = useState('07:00'); const [ate, setAte] = useState('13:00'); const [kind, setKind] = useState<'turno' | 'marcacoes'>('marcacoes');
  const [ausDe, setAusDe] = useState(''); const [ausAte, setAusAte] = useState(''); const [ausTipo, setAusTipo] = useState<'vacation' | 'off'>('vacation');
  if (!membro) return null;
  const juntar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await juntarJanela(client, scope, membro.membershipId, dia, de, ate, kind); onFeito(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível juntar', description: e instanceof Error ? e.message : undefined }); }
  };
  const ausencia = async () => {
    const client = getSupabaseClient();
    if (!client || !ausDe) return;
    try {
      const n = await marcarAusencia(client, scope, membro.membershipId, ausDe, ausAte || ausDe, ausTipo);
      toast({ variant: n ? 'warning' : 'success', title: ausTipo === 'vacation' ? 'Férias marcadas' : 'Folga marcada', description: n ? `Já há ${n} ${t('sessao', { plural: n !== 1 })} nesses dias: remarca-as no horário.` : undefined });
      onFeito();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível marcar', description: e instanceof Error ? e.message : undefined }); }
  };
  return (
    <Janela aberta onFechar={onFechar} titulo={`Disponibilidade de ${membro.nome}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        {ORDEM.map((d) => membro.janelas.filter((j) => j.weekday === d).map((j) => (
          <div key={j.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{DIAS[d]} · {j.start_time}–{j.end_time}</span><span className="lv-legenda">{j.kind === 'turno' ? 'Turno' : 'Aceita marcações'}</span></span>
            <Botao variante="secundario" onClick={() => { const c = getSupabaseClient(); if (c) void tirarJanela(c, j.id!).then(onFeito); }}>Tirar</Botao>
          </div>
        )))}
        <span className="lv-sobretitulo">Juntar</span>
        <div className="lg-ficha__metricas">{ORDEM.map((d) => <Chip key={d} ativo={dia === d} onClick={() => setDia(d)}>{DIAS[d]}</Chip>)}</div>
        <div className="lg-conta__prefs">
          <Campo rotulo="De" type="time" value={de} onChange={(e) => setDe(e.target.value)} />
          <Campo rotulo="Até" type="time" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        <div className="lg-ficha__metricas"><Chip ativo={kind === 'marcacoes'} onClick={() => setKind('marcacoes')}>Aceita marcações</Chip><Chip ativo={kind === 'turno'} onClick={() => setKind('turno')}>Turno</Chip></div>
        <Botao variante="secundario" disabled={de >= ate} onClick={() => void juntar()}>Juntar janela</Botao>
        <span className="lv-sobretitulo">Férias ou folga</span>
        <div className="lg-conta__prefs">
          <Campo rotulo="De" type="date" value={ausDe} onChange={(e) => setAusDe(e.target.value)} />
          <Campo rotulo="Até" type="date" value={ausAte} onChange={(e) => setAusAte(e.target.value)} />
        </div>
        <div className="lg-ficha__metricas"><Chip ativo={ausTipo === 'vacation'} onClick={() => setAusTipo('vacation')}>Férias</Chip><Chip ativo={ausTipo === 'off'} onClick={() => setAusTipo('off')}>Folga</Chip></div>
        <Botao variante="secundario" disabled={!ausDe} onClick={() => void ausencia()}>Marcar</Botao>
      </div>
    </Janela>
  );
}
