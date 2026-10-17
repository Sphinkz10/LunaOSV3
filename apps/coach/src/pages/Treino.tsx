import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  atribuirVersao, CATEGORIA_EXERCICIO, criarPlano, criarTreino, duracaoPrevista, ESCALAS, fetchClients, fetchExerciciosOrg, fetchExercicio,
  fetchPlano, fetchTreino, fetchTreinos, guardarExercicio, guardarPlano, guardarTreino, MODOS, previaAtribuir, publicarPlano, publicarTreino,
  toast, ultimaVersaoPlano, ultimaVersaoTreino,
  type BlocoTreino, type ClientRow, type Escala, type ExercicioEditavel, type ExercicioOrg, type LinhaTreino, type ModoBloco, type O_que,
  type Plano, type PreviaAtribuir, type Treino, type TreinoResumo,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, EstadoPagina, Janela, Nota } from '@luna/ui/v3';
import { ArrowLeft, Check, Plus, UploadSimple, Warning, X } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { SairSemGuardar, VoltarA } from '../app/Estados';
import { useAtalhoGuardar } from '../app/Atalhos';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { modalidade, vocab } from '../lib/vocab';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];
const METRICAS: Record<string, string> = { carga: 'Kg', repeticoes: 'Repetições', tempo: 'Tempo', distancia: 'Distância', esforco: 'RPE', fc: 'Frequência cardíaca' };
const VOLTAR_BIB = { rotulo: 'à Biblioteca', href: '/training/biblioteca' };
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : undefined);

/* ── G-16 Construtor de exercício ──────────────────────────────────────── */
export function ConstrutorExercicio() {
  const { id = 'novo' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [e, setE] = useState<ExercicioEditavel | null>(null);
  const [todos, setTodos] = useState<ExercicioOrg[]>([]);
  const [sujo, setSujo] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchExerciciosOrg(client, scope).then(setTodos).catch(() => setTodos([]));
    if (id === 'novo') setE({ nome: '', categoria: 'forca', descricao: '', video: '', musculos: [], material: [], padrao: '', nivel: 'iniciante', registar: ['carga', 'repeticoes'], alternativas: [] });
    else void fetchExercicio(client, id).then(setE).catch((err) => toast({ variant: 'danger', title: 'Não foi possível abrir', description: erroTexto(err) }));
  }, [id, scope]);
  const mudar = (p: Partial<ExercicioEditavel>) => { setE((x) => (x ? { ...x, ...p } : x)); setSujo(true); };
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client || !e || !e.nome.trim()) return;
    setAGravar(true);
    try { const novo = await guardarExercicio(client, scope, e); setSujo(false); toast({ variant: 'success', title: 'Exercício guardado' }); if (id === 'novo') navigate(`/training/exercicio/${novo}`, { replace: true }); }
    catch (err) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroTexto(err) }); }
    finally { setAGravar(false); }
  };
  useAtalhoGuardar(() => void guardar());
  const lista = (v: string) => v.split(',').map((x) => x.trim()).filter(Boolean);
  if (!e) return <CoachShell headStrong="Exercício" headSub="Treino" legado={false}><div className="lv-root"><Esqueleto /></div></CoachShell>;
  return (
    <CoachShell headStrong={e.nome || 'Exercício novo'} headSub="Treino · exercício do ginásio" legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}><VoltarA omissao={VOLTAR_BIB} /><Botao aCarregar={aGravar} disabled={!e.nome.trim()} onClick={() => void guardar()}>Guardar</Botao></span>}>
      <div className="lv-root lg-ficha__grelha">
        <section className="lv-lista" aria-label="Exercício">
          <Campo rotulo="Nome" value={e.nome} onChange={(x) => mudar({ nome: x.target.value })} required />
          <div role="radiogroup" aria-label="Categoria" className="lg-ficha__metricas">
            {modalidade.categorias_biblioteca.map((c) => <Chip key={c} role="radio" aria-checked={e.categoria === c} ativo={e.categoria === c} onClick={() => mudar({ categoria: c })}>{CATEGORIA_EXERCICIO[c] ?? c}</Chip>)}
          </div>
          <label className="lv-campo"><span className="lv-campo-rotulo">Instruções</span>
            <textarea className="lv-campo-input" rows={4} value={e.descricao} onChange={(x) => mudar({ descricao: x.target.value })} placeholder="O essencial da técnica, em duas ou três frases" /></label>
          <Campo rotulo="Vídeo (ligação)" value={e.video} onChange={(x) => mudar({ video: x.target.value })} placeholder="https://…" ajuda="Carregar vídeos no LunaOS chega com o alojamento de vídeo (ADR-0005)" />
          <div className="lg-conta__prefs">
            <Campo rotulo="Músculos" value={e.musculos.join(', ')} onChange={(x) => mudar({ musculos: lista(x.target.value) })} placeholder="quadríceps, glúteos" />
            <Campo rotulo="Material" value={e.material.join(', ')} onChange={(x) => mudar({ material: lista(x.target.value) })} placeholder="barra, banco" />
          </div>
          <label className="lv-campo"><span className="lv-campo-rotulo">Padrão de movimento</span>
            <select className="lv-campo-input" value={e.padrao} onChange={(x) => mudar({ padrao: x.target.value })}>
              <option value="">Outro</option>
              {['agachar', 'dobrar a anca', 'unilateral', 'empurrar horizontal', 'empurrar vertical', 'puxar horizontal', 'puxar vertical', 'saltar', 'cíclico', 'transportar', 'isolamento', 'mobilidade'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select></label>
          <Nota>O padrão diz que articulações carrega; é com isso que as restrições trocam o exercício pela alternativa.</Nota>
        </section>
        <aside className="lv-lista" aria-label="Registo e alternativas">
          <span className="lv-sobretitulo">Regista</span>
          <div className="lg-ficha__metricas">
            {modalidade.metricas.map((m) => <Chip key={m.id} ativo={e.registar.includes(m.id)} onClick={() => mudar({ registar: e.registar.includes(m.id) ? e.registar.filter((r) => r !== m.id) : [...e.registar, m.id] })}>{METRICAS[m.id] ?? m.id}</Chip>)}
          </div>
          <span className="lv-sobretitulo">Alternativas autorizadas</span>
          {e.alternativas.map((a) => (
            <div key={a.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{a.nome}</span></span>
              <Chip ativo={a.semelhanca === 'igual'} onClick={() => mudar({ alternativas: e.alternativas.map((x) => (x.id === a.id ? { ...x, semelhanca: x.semelhanca === 'igual' ? 'parecido' : 'igual' } : x)) })}>{a.semelhanca === 'igual' ? 'Igual' : 'Parecido'}</Chip>
              <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label={`Tirar ${a.nome}`} onClick={() => mudar({ alternativas: e.alternativas.filter((x) => x.id !== a.id) })}><X size={16} aria-hidden /></button>
            </div>
          ))}
          <select className="lv-campo-input" aria-label="Acrescentar alternativa" value="" onChange={(x) => {
            const t = todos.find((y) => y.id === x.target.value);
            if (t) mudar({ alternativas: [...e.alternativas, { id: t.id, nome: t.name, semelhanca: 'parecido' }] });
          }}>
            <option value="">Acrescentar alternativa…</option>
            {todos.filter((t) => t.id !== e.id && !e.alternativas.some((a) => a.id === t.id)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <Nota>Se a máquina estiver ocupada, o cliente só vê estas. Para usar um do LunaOS, duplica-o primeiro na Biblioteca.</Nota>
        </aside>
      </div>
      <SairSemGuardar sujo={sujo} resumo="O exercício tem alterações por guardar." onGuardar={async () => { await guardar(); return true; }} />
    </CoachShell>
  );
}

/* ── G-17 Construtor de treino ─────────────────────────────────────────── */
export function ConstrutorTreino() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [t, setT] = useState<Treino | null>(null);
  const [exercicios, setExercicios] = useState<ExercicioOrg[]>([]);
  const [aberto, setAberto] = useState(0);
  const [escala, setEscala] = useState<Escala>('intermedio');
  const [sujo, setSujo] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchTreino(client, id).then((x) => { setT(x); setSujo(false); }).catch((e) => toast({ variant: 'danger', title: 'Não foi possível abrir', description: erroTexto(e) }));
    void fetchExerciciosOrg(client, scope).then(setExercicios).catch(() => setExercicios([]));
  }, [id, scope]);
  useEffect(() => carregar(), [carregar]);
  const mudarT = (p: Partial<Treino>) => { setT((x) => (x ? { ...x, ...p } : x)); setSujo(true); };
  const mudarBloco = (i: number, p: Partial<BlocoTreino>) => mudarT({ blocos: t!.blocos.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const mudarLinha = (i: number, k: number, p: Partial<LinhaTreino>) => mudarBloco(i, { linhas: t!.blocos[i].linhas.map((l, j) => (j === k ? { ...l, ...p } : l)) });
  const guardar = async (): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !t) return false;
    setAGravar(true);
    try { await guardarTreino(client, scope, { ...t, duracao: t.duracao ?? duracaoPrevista(t.blocos) }); setSujo(false); toast({ variant: 'success', title: 'Rascunho guardado', description: 'Quem já tem este treino continua com a versão publicada.' }); return true; }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroTexto(e) }); return false; }
    finally { setAGravar(false); }
  };
  useAtalhoGuardar(() => void guardar());
  const publicar = async () => {
    const client = getSupabaseClient();
    if (!client || !t) return;
    if (sujo && !(await guardar())) return;
    try { await publicarTreino(client, t.id); toast({ variant: 'success', title: `Versão ${t.versao + 1} publicada` }); navigate(`/training/atribuir?treino=${t.id}`); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível publicar', description: erroTexto(e) }); }
  };
  if (!t) return <CoachShell headStrong="Treino" headSub="Treino" legado={false}><div className="lv-root"><Esqueleto /></div></CoachShell>;
  const b = t.blocos[aberto];
  const nExercicios = t.blocos.reduce((s, x) => s + x.linhas.length, 0);
  return (
    <CoachShell headStrong={t.nome} headSub={`Treino · Biblioteca · ${t.versao ? `versão ${t.versao} publicada${sujo ? ' · rascunho com alterações' : ''}` : 'rascunho'}`} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <VoltarA omissao={VOLTAR_BIB} />
        <Botao variante="secundario" aCarregar={aGravar} onClick={() => void guardar()}>Guardar</Botao>
        <Botao icone={UploadSimple} onClick={() => void publicar()}>Publicar</Botao>
      </span>}>
      <div className="lv-root lg-ficha__grelha">
        <div className="lg-ficha__coluna">
          <Campo rotulo="Nome do treino" value={t.nome} onChange={(e) => mudarT({ nome: e.target.value })} />
          {t.blocos.map((bl, i) => (
            <section key={i} className={`lv-lista lg-bloco${i === aberto ? ' lg-bloco--aberto' : ''}`} aria-label={bl.rotulo}>
              <button type="button" className="lg-bloco__cabeca" onClick={() => setAberto(i)}>
                <span className="lg-objetivo__n lg-bloco__letra">{String.fromCharCode(65 + i)}</span>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{bl.rotulo}</span>
                  <span className="lv-legenda">{MODOS.find((m) => m.id === bl.modo)?.rotulo}{bl.voltas ? ` · ${bl.voltas} voltas` : ''}{bl.minutos ? ` · ${bl.minutos} min` : ''}</span></span>
                <span className="lv-legenda">{duracaoPrevista([bl])} min</span>
              </button>
              {bl.linhas.length > 0 && (
                <div className="lg-presc" role="table" aria-label={`Exercícios de ${bl.rotulo}`}>
                  <div role="row" className="lg-presc__linha lg-matriz__cabeca"><span>Exercício</span><span>Séries</span><span>Reps</span><span>Carga</span><span>RPE</span><span>Descanso</span><span /></div>
                  {bl.linhas.map((l, k) => (
                    <div key={k} role="row" className="lg-presc__linha">
                      <span className="lv-linha-lista__titulo">{String.fromCharCode(65 + i)}{k + 1} · {l.nome}</span>
                      <input className="lv-campo-input" aria-label="Séries" inputMode="numeric" value={l.series ?? ''} onChange={(e) => mudarLinha(i, k, { series: Number(e.target.value) || null })} />
                      <input className="lv-campo-input" aria-label="Repetições" value={escala === 'intermedio' ? l.reps : l.escalas[escala]?.reps ?? ''} placeholder={l.reps}
                        onChange={(e) => (escala === 'intermedio' ? mudarLinha(i, k, { reps: e.target.value }) : mudarLinha(i, k, { escalas: { ...l.escalas, [escala]: { ...l.escalas[escala], reps: e.target.value } } }))} />
                      <input className="lv-campo-input" aria-label="Carga" value={escala === 'intermedio' ? l.carga : l.escalas[escala]?.carga ?? ''} placeholder={l.carga || '70% 1RM'}
                        onChange={(e) => (escala === 'intermedio' ? mudarLinha(i, k, { carga: e.target.value }) : mudarLinha(i, k, { escalas: { ...l.escalas, [escala]: { ...l.escalas[escala], carga: e.target.value } } }))} />
                      <input className="lv-campo-input" aria-label="RPE" inputMode="decimal" value={l.rpe ?? ''} onChange={(e) => mudarLinha(i, k, { rpe: Number(e.target.value.replace(',', '.')) || null })} />
                      <input className="lv-campo-input" aria-label="Descanso em segundos" inputMode="numeric" value={l.descanso ?? ''} onChange={(e) => mudarLinha(i, k, { descanso: Number(e.target.value) || null })} />
                      <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label={`Tirar ${l.nome}`} onClick={() => mudarBloco(i, { linhas: bl.linhas.filter((_, j) => j !== k) })}><X size={16} aria-hidden /></button>
                    </div>
                  ))}
                </div>
              )}
              {i === aberto && (
                <select className="lv-campo-input" aria-label="Acrescentar exercício" value="" onChange={(e) => {
                  const x = exercicios.find((y) => y.id === e.target.value);
                  if (x) mudarBloco(i, { linhas: [...bl.linhas, { exerciseId: x.id, nome: x.name, series: 3, reps: '10', carga: '', rpe: null, descanso: 60, notas: '', escalas: {} }] });
                }}>
                  <option value="">Acrescentar exercício…</option>
                  {exercicios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </section>
          ))}
          <button type="button" className="lv-lista lg-bloco__novo" onClick={() => { mudarT({ blocos: [...t.blocos, { rotulo: `Bloco ${String.fromCharCode(65 + t.blocos.length)}`, modo: 'normal', voltas: null, minutos: null, notas: '', linhas: [] }] }); setAberto(t.blocos.length); }}>
            <Plus size={18} aria-hidden /><span><b>Acrescentar bloco</b><span className="lv-legenda" style={{ display: 'block' }}>Aquecimento, força, condicionamento…</span></span>
          </button>
          {exercicios.length === 0 && <Nota>Ainda não há exercícios no ginásio. Duplica ou usa os do LunaOS na Biblioteca.</Nota>}
        </div>
        <aside className="lv-lista lg-ficha__lado" aria-label="Bloco">
          {b ? (
            <>
              <Campo rotulo="Nome do bloco" value={b.rotulo} onChange={(e) => mudarBloco(aberto, { rotulo: e.target.value })} />
              <span className="lv-sobretitulo">Modo</span>
              <div role="radiogroup" aria-label="Modo" className="lg-ficha__metricas">
                {MODOS.map((m) => <Chip key={m.id} role="radio" aria-checked={b.modo === m.id} ativo={b.modo === m.id} onClick={() => mudarBloco(aberto, { modo: m.id as ModoBloco })}>{m.rotulo}</Chip>)}
              </div>
              <div className="lg-conta__prefs">
                <Campo rotulo="Voltas" inputMode="numeric" value={b.voltas ?? ''} onChange={(e) => mudarBloco(aberto, { voltas: Number(e.target.value) || null })} />
                <Campo rotulo="Minutos" inputMode="numeric" value={b.minutos ?? ''} onChange={(e) => mudarBloco(aberto, { minutos: Number(e.target.value) || null })} />
              </div>
              <span className="lv-sobretitulo">Escala a editar</span>
              <div role="radiogroup" aria-label="Escala" className="lg-ficha__metricas">
                {ESCALAS.map((s) => <Chip key={s.id} role="radio" aria-checked={escala === s.id} ativo={escala === s.id} onClick={() => setEscala(s.id)}>{s.rotulo}</Chip>)}
              </div>
              <button type="button" className="lg-link" onClick={() => { mudarT({ blocos: t.blocos.filter((_, j) => j !== aberto) }); setAberto(0); }}>Tirar este bloco</button>
            </>
          ) : <p className="lv-legenda">Acrescenta um bloco para começar.</p>}
          <dl className="lg-conta__dados">
            <dt>Duração prevista</dt><dd>{duracaoPrevista(t.blocos)} min</dd>
            <dt>Exercícios</dt><dd>{nExercicios}</dd>
          </dl>
          <Nota>Clientes com restrição recebem a alternativa autorizada do exercício, sem mudar o treino dos outros.</Nota>
        </aside>
      </div>
      <SairSemGuardar sujo={sujo} resumo="O treino tem alterações por guardar." onGuardar={guardar} />
    </CoachShell>
  );
}

/* ── G-18 Construtor de plano ──────────────────────────────────────────── */
export function ConstrutorPlano() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scope = useScope();
  const [p, setP] = useState<Plano | null>(null);
  const [treinos, setTreinos] = useState<TreinoResumo[]>([]);
  const [celula, setCelula] = useState<{ semana: number; dia: number } | null>(null);
  const [sujo, setSujo] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchPlano(client, id).then(setP).catch((e) => toast({ variant: 'danger', title: 'Não foi possível abrir', description: erroTexto(e) }));
    void fetchTreinos(client, scope).then(setTreinos).catch(() => setTreinos([]));
  }, [id, scope]);
  const mudar = (x: Partial<Plano>) => { setP((y) => (y ? { ...y, ...x } : y)); setSujo(true); };
  const guardar = async (): Promise<boolean> => {
    const client = getSupabaseClient();
    if (!client || !p) return false;
    try { await guardarPlano(client, scope, p); setSujo(false); toast({ variant: 'success', title: 'Plano guardado' }); return true; }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroTexto(e) }); return false; }
  };
  useAtalhoGuardar(() => void guardar());
  const publicar = async () => {
    const client = getSupabaseClient();
    if (!client || !p) return;
    if (sujo && !(await guardar())) return;
    try { await publicarPlano(client, p.id); toast({ variant: 'success', title: `Versão ${p.versao + 1} publicada` }); navigate(`/training/atribuir?plano=${p.id}`); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível publicar', description: erroTexto(e) }); }
  };
  if (!p) return <CoachShell headStrong="Plano" headSub="Treino" legado={false}><div className="lv-root"><Esqueleto /></div></CoachShell>;
  // Dias sem semana valem para todas as semanas
  const noDia = (s: number, d: number) => p.dias.filter((x) => x.dia === d && (x.semana === s || x.semana == null));
  const porSemana = new Set(p.dias.map((x) => `${x.semana ?? '*'}-${x.dia}`)).size;
  return (
    <CoachShell headStrong={p.nome} headSub={`Treino · Planos · ${p.versao ? `versão ${p.versao}` : 'rascunho'}`} legado={false}
      topActions={<span style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
        <VoltarA omissao={VOLTAR_BIB} />
        <Botao variante="secundario" onClick={() => void guardar()}>Guardar</Botao>
        <Botao icone={UploadSimple} onClick={() => void publicar()}>Publicar</Botao>
      </span>}>
      <div className="lv-root lg-ficha__grelha">
        <section className="lv-lista" aria-label="Semanas">
          <div className="lg-conta__prefs">
            <Campo rotulo="Nome" value={p.nome} onChange={(e) => mudar({ nome: e.target.value })} />
            <Campo rotulo="Semanas" type="number" min={1} max={52} value={p.semanas} onChange={(e) => mudar({ semanas: Math.max(1, Number(e.target.value) || 1) })} />
          </div>
          <div className="lg-semana" role="table" aria-label="Plano por semanas">
            <div role="row" className="lg-semana__linha lg-matriz__cabeca"><span />{ORDEM_DIAS.map((d) => <span key={d}>{DIAS[d]}</span>)}</div>
            {Array.from({ length: p.semanas }, (_, s) => s + 1).map((s) => (
              <div key={s} role="row" className="lg-semana__linha">
                <span><b>Semana {s}</b><span className="lv-legenda" style={{ display: 'block' }}>{s === p.descargaSemana ? 'Descarga' : s === 1 ? 'Base' : p.progressao.subirKg ? `+${p.progressao.subirKg} kg` : ''}</span></span>
                {ORDEM_DIAS.map((d) => {
                  const ts = noDia(s, d);
                  return (
                    <button key={d} type="button" className={`lg-semana__dia${ts.length ? ' lg-semana__dia--cheio' : ''}`} onClick={() => setCelula({ semana: s, dia: d })} aria-label={`Semana ${s}, ${DIAS[d]}: ${ts.map((x) => x.nome).join(', ') || 'sem treino'}`}>
                      {ts.length ? ts.map((x) => x.nome).join(' · ') : '—'}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </section>
        <aside className="lg-ficha__coluna">
          <section className="lv-lista" aria-label="Progressão">
            <h3 className="lv-titulo-cartao" style={{ margin: 0 }}>Progressão</h3>
            <Campo rotulo="Subir carga (kg)" inputMode="decimal" value={p.progressao.subirKg ?? ''} onChange={(e) => mudar({ progressao: { ...p.progressao, subirKg: Number(e.target.value.replace(',', '.')) || undefined } })} />
            <Campo rotulo="Quando o RPE fica até" inputMode="decimal" value={p.progressao.quandoRpeMax ?? ''} onChange={(e) => mudar({ progressao: { ...p.progressao, quandoRpeMax: Number(e.target.value.replace(',', '.')) || undefined } })} ajuda="em todas as séries" />
            <div className="lg-conta__prefs">
              <Campo rotulo="Descarga na semana" type="number" min={1} max={p.semanas} value={p.descargaSemana ?? ''} onChange={(e) => mudar({ descargaSemana: Number(e.target.value) || null })} />
              <Campo rotulo="Menos volume (%)" type="number" min={1} max={90} value={p.descargaPct ?? ''} onChange={(e) => mudar({ descargaPct: Number(e.target.value) || null })} />
            </div>
          </section>
          <div className="lg-clientes__numeros">
            <div><span className="lv-legenda">Por semana</span><b>{porSemana} treinos</b></div>
            <div><span className="lv-legenda">Duração</span><b>{p.semanas} semanas</b></div>
          </div>
          <Nota>Vender como programa online chega com a loja (F2).</Nota>
        </aside>
      </div>
      <Janela aberta={!!celula} onFechar={() => setCelula(null)} titulo={celula ? `Semana ${celula.semana} · ${DIAS[celula.dia]}` : ''}>
        {celula && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-8)' }}>
            {noDia(celula.semana, celula.dia).map((x, i) => (
              <div key={i} className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.nome}</span><span className="lv-legenda">{x.semana == null ? 'Todas as semanas' : `Só a semana ${x.semana}`}</span></span>
                <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label={`Tirar ${x.nome}`} onClick={() => mudar({ dias: p.dias.filter((y) => y !== x) })}><X size={16} aria-hidden /></button>
              </div>
            ))}
            <label className="lv-campo"><span className="lv-campo-rotulo">Acrescentar treino</span>
              <select className="lv-campo-input" value="" onChange={(e) => {
                const t = treinos.find((y) => y.id === e.target.value);
                if (t) mudar({ dias: [...p.dias, { semana: celula.semana, dia: celula.dia, treinoId: t.id, nome: t.nome }] });
              }}>
                <option value="">Escolher…</option>
                {treinos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select></label>
            <Botao variante="secundario" onClick={() => {
              const nova = p.dias.filter((x) => x.dia !== celula.dia || (x.semana !== celula.semana && x.semana != null));
              const destes = noDia(celula.semana, celula.dia).map((x) => ({ ...x, semana: null }));
              mudar({ dias: [...nova, ...destes] });
            }}>Repetir em todas as semanas</Botao>
          </div>
        )}
      </Janela>
      <SairSemGuardar sujo={sujo} resumo="O plano tem alterações por guardar." onGuardar={guardar} />
    </CoachShell>
  );
}

/* ── G-19 Publicar e atribuir ──────────────────────────────────────────── */
export function Atribuir() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const scope = useScope();
  const treinoId = params.get('treino'); const planoId = params.get('plano'); const pre = params.get('cliente');
  const [o, setO] = useState<{ nome: string; versao: number; alvo: O_que } | null>(null);
  const [passo, setPasso] = useState(2);
  const [clientes, setClientes] = useState<ClientRow[]>([]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set(pre ? [pre] : []));
  const [inicio, setInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [previa, setPrevia] = useState<PreviaAtribuir[] | null>(null);
  const [conflito, setConflito] = useState<'manter' | 'substituir' | 'depois'>('depois');
  const [feito, setFeito] = useState<number | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchClients(client, scope).then(setClientes).catch(() => setClientes([]));
    if (treinoId) void Promise.all([fetchTreino(client, treinoId), ultimaVersaoTreino(client, treinoId)]).then(([t, v]) => v && setO({ nome: t.nome, versao: v.versao, alvo: { treinoVersao: v.id } }));
    if (planoId) void Promise.all([fetchPlano(client, planoId), ultimaVersaoPlano(client, planoId)]).then(([p, v]) => v && setO({ nome: p.nome, versao: v.versao, alvo: { planoVersao: v.id } }));
  }, [scope, treinoId, planoId]);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !o || sel.size === 0) { setPrevia(null); return; }
    void previaAtribuir(client, scope, [...sel], o.alvo, inicio).then(setPrevia).catch(() => setPrevia([]));
  }, [o, sel, inicio, scope]);
  const lista = useMemo(() => {
    const termo = q.trim().toLocaleLowerCase('pt-PT');
    return clientes.filter((c) => !termo || c.name.toLocaleLowerCase('pt-PT').includes(termo)).slice(0, 30);
  }, [clientes, q]);
  const confirmar = async () => {
    const client = getSupabaseClient();
    if (!client || !o) return;
    setAGravar(true);
    try { setFeito(await atribuirVersao(client, scope, [...sel], o.alvo, inicio, conflito)); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível atribuir', description: erroTexto(e) }); }
    finally { setAGravar(false); }
  };
  const PASSOS = [
    { n: 1, t: 'O quê', s: o ? `${o.nome} · v${o.versao}` : '…' },
    { n: 2, t: 'Para quem', s: sel.size ? clientes.filter((c) => sel.has(c.id)).map((c) => c.name).slice(0, 2).join(', ') + (sel.size > 2 ? ` e mais ${sel.size - 2}` : '') : 'Escolher' },
    { n: 3, t: 'Quando', s: `Começa ${new Date(`${inicio}T12:00:00Z`).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })}` },
    { n: 4, t: 'Confirmar', s: 'Restrições e conflitos' },
  ];
  const comConflito = previa?.filter((x) => x.conflito) ?? [];
  if (!treinoId && !planoId) return <CoachShell headStrong="Atribuir" headSub="Treino" legado={false}><div className="lv-root"><EstadoPagina tipo="vazio" titulo="Escolhe um treino ou um plano" texto="Abre-o na Biblioteca e publica." acao={{ rotulo: 'Ir para a Biblioteca', onClick: () => navigate('/training/biblioteca') }} /></div></CoachShell>;
  return (
    <CoachShell headStrong={planoId ? 'Atribuir plano' : 'Atribuir treino'} headSub={o ? `${o.nome} · versão ${o.versao}` : 'Treino'} legado={false} topActions={<VoltarA omissao={VOLTAR_BIB} />}>
      <div className="lv-root lg-ficha__grelha">
        <div className="lg-ficha__coluna">
          {PASSOS.map((x) => (
            <button key={x.n} type="button" className={`lv-lista lg-passo${passo === x.n ? ' lg-passo--atual' : ''}`} disabled={x.n === 1 || feito != null} onClick={() => setPasso(x.n)}>
              <span className={`lg-objetivo__n${x.n < passo || x.n === 1 ? ' lg-passo__feito' : ''}`}>{x.n < passo || x.n === 1 ? <Check size={14} aria-hidden /> : x.n}</span>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{x.t}</span><span className="lv-legenda">{x.s}</span></span>
            </button>
          ))}
        </div>
        <section className="lv-lista lg-atribuir" aria-label="Passo">
          {!o ? <Esqueleto /> : feito != null ? (
            <>
              <h2 className="lv-titulo-ecra" style={{ margin: 0 }}>Atribuído a {feito}</h2>
              <p className="lv-legenda" style={{ margin: 0 }}>{o.nome} · versão {o.versao} · {new Date().toLocaleString('pt-PT')}. Cada {vocab.pessoa()} recebe uma notificação.</p>
              {previa?.filter((x) => x.trocas.length).map((x) => (
                <Nota key={x.linkId} icone={Warning}>{x.nome}: {x.trocas.map((t) => (t.para ? `${t.de} passa a ${t.para}` : `${t.de} fica de fora`)).join('; ')}.</Nota>
              ))}
              {feito < sel.size && <Nota>{sel.size - feito} ficaram de fora (bloqueados, arquivados ou com plano por decidir).</Nota>}
              <Botao onClick={() => navigate('/training/biblioteca')}>Voltar à Biblioteca</Botao>
            </>
          ) : passo === 2 ? (
            <>
              <span className="lv-sobretitulo">Passo 2 de 4</span>
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Para quem?</h2>
              <input className="lv-campo-input" type="search" placeholder={`Procurar ${vocab.pessoa()}`} aria-label={`Procurar ${vocab.pessoa()}`} value={q} onChange={(e) => setQ(e.target.value)} />
              {lista.map((c) => (
                <div key={c.id} className="lv-linha-lista">
                  <Avatar nome={c.name} tamanho={32} />
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.name}</span><span className="lv-legenda">{c.planName ?? 'Sem plano'}</span></span>
                  <input type="checkbox" aria-label={`Escolher ${c.name}`} checked={sel.has(c.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} />
                </div>
              ))}
              <Previa previa={previa} />
              <div className="lg-import__acoes"><Botao disabled={sel.size === 0} onClick={() => setPasso(3)}>Continuar</Botao></div>
            </>
          ) : passo === 3 ? (
            <>
              <span className="lv-sobretitulo">Passo 3 de 4</span>
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Quando começa?</h2>
              <Campo rotulo="Início" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              <div className="lg-import__acoes"><Botao variante="secundario" icone={ArrowLeft} onClick={() => setPasso(2)}>Voltar</Botao><Botao onClick={() => setPasso(4)}>Continuar</Botao></div>
            </>
          ) : (
            <>
              <span className="lv-sobretitulo">Passo 4 de 4</span>
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Confirmar</h2>
              <Previa previa={previa} />
              {comConflito.length > 0 && (
                <>
                  <span className="lv-sobretitulo">{comConflito.length} com plano a meio: o que fazer?</span>
                  <div role="radiogroup" aria-label="Conflito" className="lg-ficha__metricas">
                    <Chip role="radio" aria-checked={conflito === 'depois'} ativo={conflito === 'depois'} onClick={() => setConflito('depois')}>Começar quando o atual acabar</Chip>
                    <Chip role="radio" aria-checked={conflito === 'substituir'} ativo={conflito === 'substituir'} onClick={() => setConflito('substituir')}>Substituir o atual</Chip>
                    <Chip role="radio" aria-checked={conflito === 'manter'} ativo={conflito === 'manter'} onClick={() => setConflito('manter')}>Deixar de fora</Chip>
                  </div>
                </>
              )}
              <div className="lg-import__acoes"><Botao variante="secundario" icone={ArrowLeft} onClick={() => setPasso(3)}>Voltar</Botao>
                <Botao aCarregar={aGravar} onClick={() => void confirmar()}>Atribuir a {sel.size}</Botao></div>
            </>
          )}
        </section>
      </div>
    </CoachShell>
  );
}

function Previa({ previa }: { previa: PreviaAtribuir[] | null }) {
  if (!previa || previa.length === 0) return null;
  const comAlgo = previa.filter((x) => x.trocas.length || x.conflito);
  return (
    <>
      <span className="lv-sobretitulo">O que muda</span>
      {comAlgo.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem restrições nem conflitos.</p> : comAlgo.map((x) => (
        <div key={x.linkId} className="lg-previa">
          <b>{x.nome}</b>
          {x.trocas.map((t, i) => <span key={i} className="lv-legenda"><Warning size={14} aria-hidden className="lg-hoje__aviso" /> Restrição ativa: {t.para ? `${t.de} passa a ${t.para}, a alternativa autorizada.` : `${t.de} fica de fora (sem alternativa autorizada).`}</span>)}
          {x.conflito && <span className="lv-legenda">{x.conflito}.</span>}
        </div>
      ))}
    </>
  );
}

/* ── Criar a partir da Biblioteca ──────────────────────────────────────── */
export function NovoTreinoOuPlano({ tipo, onFechar }: { tipo: 'treino' | 'plano' | null; onFechar: () => void }) {
  const navigate = useNavigate();
  const scope = useScope();
  const [nome, setNome] = useState(''); const [semanas, setSemanas] = useState(4);
  useEffect(() => { setNome(''); setSemanas(4); }, [tipo]);
  const criar = async () => {
    const client = getSupabaseClient();
    if (!client || !tipo) return;
    try {
      if (tipo === 'treino') navigate(`/training/treino/${await criarTreino(client, scope, nome)}`);
      else navigate(`/training/plano/${await criarPlano(client, scope, nome, semanas)}`);
      onFechar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível criar', description: erroTexto(e) }); }
  };
  return (
    <Janela aberta={!!tipo} onFechar={onFechar} titulo={tipo === 'plano' ? 'Novo plano' : 'Novo treino'}
      acoes={<><Botao variante="secundario" onClick={onFechar}>Voltar</Botao><Botao disabled={!nome.trim()} onClick={() => void criar()}>Criar</Botao></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === 'plano' ? 'Ex.: Força em 6 semanas' : 'Ex.: Força A'} />
        {tipo === 'plano' && <Campo rotulo="Semanas" type="number" min={1} max={52} value={semanas} onChange={(e) => setSemanas(Number(e.target.value) || 4)} />}
      </div>
    </Janela>
  );
}
