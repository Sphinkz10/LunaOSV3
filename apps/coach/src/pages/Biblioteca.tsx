import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CATEGORIA_EXERCICIO, duplicarExercicioBase, fetchBibliotecaBase, fetchExerciciosOrg, fetchPlanos, fetchTreinos, filtrarExercicios, NIVEL, toast,
  type ExercicioBase, type ExercicioOrg, type PlanoResumo, type TreinoResumo,
} from '@luna/core';
import { Botao, Chip, Esqueleto, Estado, EstadoPagina, MenuAcoes, Nota } from '@luna/ui/v3';
import { Barbell, CalendarBlank, ClipboardText, Play, SlidersHorizontal } from '@luna/icons';
import { NovoTreinoOuPlano } from './Treino';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { modalidade } from '../lib/vocab';

type Origem = 'lunaos' | 'meus';
interface Cartao {
  id: string; origem: Origem; name: string; category: string; muscles: string[]; equipment: string[]; level: string | null;
  instructions: string | null; record_fields: string[]; alternatives: string[]; video_url: string | null; image_url: string | null;
  versao: string; chave: string | null; inativo?: boolean;
}
const NOME_METRICA: Record<string, string> = { carga: 'Kg', repeticoes: 'Repetições', tempo: 'Tempo', distancia: 'Distância', esforco: 'RPE', fc: 'Frequência cardíaca' };
const METRICA = (id: string) => NOME_METRICA[id] ?? id;

const deBase = (e: ExercicioBase): Cartao => ({
  id: `base:${e.key}`, origem: 'lunaos', name: e.name, category: e.category, muscles: e.muscles, equipment: e.equipment, level: e.level,
  instructions: e.instructions, record_fields: e.record_fields, alternatives: e.alternatives, video_url: e.video_url, image_url: e.image_url,
  versao: `LunaOS · versão ${e.version}`, chave: e.key,
});
const deOrg = (e: ExercicioOrg): Cartao => ({
  id: e.id, origem: 'meus', name: e.name, category: e.category, muscles: e.muscles, equipment: e.equipment, level: e.level,
  instructions: e.description, record_fields: e.record_fields, alternatives: [], video_url: e.video_url, image_url: e.image_url,
  versao: e.copied_from ? `Cópia de ${e.copied_from.replace('@', ' · versão ')}` : `Do ginásio · versão ${e.version}`, chave: null, inativo: e.inactive,
});

/**
 * Biblioteca (G-15, Figma 108:2), parte de exercícios: os modelos do LunaOS
 * (só de leitura; duplicam-se para mudar) e os do ginásio. Treinos, planos e
 * programas entram com a tarefa 12.
 */
/** Foto provisória do Figma (DS-03) enquanto o exercício não tem imagem própria; escolhida pelo material ou pela categoria. */
function fotoDe(c: { image_url?: string | null; equipment: string[]; category: string }): string {
  if (c.image_url) return c.image_url;
  const m = c.equipment.join(' ').toLocaleLowerCase('pt-PT');
  if (/kettlebell/.test(m)) return '/media/ex-kettlebell.jpg';
  if (/el[aá]stic/.test(m)) return '/media/ex-elastico.jpg';
  if (/halter/.test(m)) return '/media/ex-halteres.jpg';
  if (c.category === 'mobilidade' || c.category === 'reabilitacao') return '/media/ex-mobilidade.jpg';
  if (c.category === 'cardio') return '/media/ex-cardio.jpg';
  return '/media/ex-forca.jpg';
}

export function Biblioteca() {
  const navigate = useNavigate();
  const scope = useScope();
  const [tipo, setTipo] = useState<'exercicios' | 'treinos' | 'planos'>(() => (new URLSearchParams(window.location.search).get('tipo') as 'treinos' | 'planos' | null) ?? 'exercicios');
  const [treinos, setTreinos] = useState<TreinoResumo[] | null>(null);
  const [planos, setPlanos] = useState<PlanoResumo[] | null>(null);
  const [params] = useSearchParams();
  const [criar, setCriar] = useState<'treino' | 'plano' | null>(() => (params.get('novo') === 'treino' || params.get('novo') === 'plano' ? params.get('novo') as 'treino' | 'plano' : null));
  const pode = scope.permissions.includes('training.write');
  const [base, setBase] = useState<ExercicioBase[] | null>(null);
  const [meus, setMeus] = useState<ExercicioOrg[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [origem, setOrigem] = useState<Origem | 'tudo'>('tudo');
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [estado, setEstado] = useState<'todos' | 'inativos' | 'incompletos' | 'sem_publicacao'>('todos');
  const [aberto, setAberto] = useState<Cartao | null>(null);
  const [filtros, setFiltros] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void fetchBibliotecaBase(client).then(setBase).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchExerciciosOrg(client, scope).then(setMeus).catch(() => setMeus([]));
    void fetchTreinos(client, scope).then(setTreinos).catch(() => setTreinos([]));
    void fetchPlanos(client, scope).then(setPlanos).catch(() => setPlanos([]));
  }, [scope]);
  useEffect(() => carregar(), [carregar]);

  const todos = useMemo(() => [...(meus ?? []).map(deOrg), ...(base ?? []).map(deBase)], [base, meus]);
  const lista = useMemo(() => filtrarExercicios(todos.filter((c) => origem === 'tudo' || c.origem === origem)
    .filter((c) => estado === 'todos' || (estado === 'inativos' ? c.inativo : estado === 'incompletos' ? c.origem === 'meus' && (!c.instructions || c.record_fields.length === 0) : true)), { q, categoria }), [todos, origem, q, categoria, estado]);
  const nomeDe = (chave: string) => base?.find((b) => b.key === chave)?.name ?? chave;

  const duplicar = async (c: Cartao) => {
    const client = getSupabaseClient();
    if (!client || !c.chave) return;
    setAGravar(true);
    try {
      await duplicarExercicioBase(client, scope, c.chave);
      toast({ variant: 'success', title: 'Cópia criada no ginásio', description: 'Fica com a origem; o modelo do LunaOS não muda.' });
      setOrigem('meus'); carregar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível duplicar', description: e instanceof Error ? e.message : undefined }); }
    finally { setAGravar(false); }
  };

  return (
    <CoachShell headStrong="Biblioteca" headSub="Treino" legado={false}
      topActions={pode ? <MenuAcoes rotulo="Novo" acoes={[
        { rotulo: 'Exercício', icone: Barbell, onClick: () => navigate('/training/exercicio/novo') },
        { rotulo: 'Treino', icone: ClipboardText, onClick: () => setCriar('treino') },
        { rotulo: 'Plano', icone: CalendarBlank, onClick: () => setCriar('plano') },
      ]} /> : undefined}>
      <div className="lv-root lg-ficha">
        <div className="lg-clientes__barra">
          <div className="lg-clientes__chips">
            <Chip ativo={tipo === 'exercicios'} onClick={() => setTipo('exercicios')} contagem={todos.length}>Exercícios</Chip>
            <Chip ativo={tipo === 'treinos'} onClick={() => setTipo('treinos')} contagem={treinos?.length}>Treinos</Chip>
            <Chip ativo={tipo === 'planos'} onClick={() => setTipo('planos')} contagem={planos?.length}>Planos</Chip>
            {tipo !== 'exercicios' && <Chip ativo={estado === 'sem_publicacao'} onClick={() => setEstado(estado === 'sem_publicacao' ? 'todos' : 'sem_publicacao')}>Sem publicação</Chip>}
            <button type="button" className="lg-link" onClick={() => navigate('/training/sessoes')}>Sessões da equipa</button>
          </div>
          <div className="lg-clientes__chips">
            <input className="lv-campo-input lg-clientes__procura" type="search" placeholder="Procurar exercício ou músculo" aria-label="Procurar exercício"
              value={q} onChange={(e) => setQ(e.target.value)} />
            {tipo === 'exercicios' && (
              <button type="button" className="lv-chip" aria-expanded={filtros} onClick={() => setFiltros((f) => !f)}>
                <SlidersHorizontal size={16} aria-hidden />{categoria ? (CATEGORIA_EXERCICIO[categoria] ?? categoria) : 'Filtros'}
              </button>
            )}
          </div>
        </div>
        {filtros && <div className="lg-clientes__chips">
          <Chip ativo={origem === 'tudo'} onClick={() => setOrigem('tudo')}>Todos</Chip>
          <Chip ativo={origem === 'meus'} onClick={() => setOrigem('meus')} contagem={meus?.length}>Do ginásio</Chip>
          <Chip ativo={origem === 'lunaos'} onClick={() => setOrigem('lunaos')} contagem={base?.length}>Do LunaOS</Chip>
          <span style={{ width: 'var(--espaco-16)' }} />
          <Chip ativo={estado === 'inativos'} onClick={() => setEstado(estado === 'inativos' ? 'todos' : 'inativos')}>Inativos</Chip>
          <Chip ativo={estado === 'incompletos'} onClick={() => setEstado(estado === 'incompletos' ? 'todos' : 'incompletos')}>Incompletos</Chip>
          {modalidade.categorias_biblioteca.map((c) => (
            <Chip key={c} ativo={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>{CATEGORIA_EXERCICIO[c] ?? c}</Chip>
          ))}
        </div>}

        {tipo !== 'exercicios' ? (
          <section className="lv-lista" aria-label={tipo === 'treinos' ? 'Treinos' : 'Planos'}>
            {!(tipo === 'treinos' ? treinos : planos) ? <Esqueleto /> : (tipo === 'treinos' ? treinos! : planos!).length === 0
              ? <EstadoPagina tipo="vazio" icone={ClipboardText} titulo={tipo === 'treinos' ? 'Ainda sem treinos' : 'Ainda sem planos'} texto="Cria o primeiro em Novo." acao={pode ? { rotulo: tipo === 'treinos' ? 'Novo treino' : 'Novo plano', onClick: () => setCriar(tipo === 'treinos' ? 'treino' : 'plano') } : undefined} />
              : (tipo === 'treinos' ? treinos! : planos!).filter((x) => estado !== 'sem_publicacao' || x.versao === 0).filter((x) => !q.trim() || x.nome.toLocaleLowerCase('pt-PT').includes(q.trim().toLocaleLowerCase('pt-PT'))).map((x) => (
                <div key={x.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                  <button type="button" className="lg-inbox__corpo" onClick={() => navigate(`/training/${tipo === 'treinos' ? 'treino' : 'plano'}/${x.id}`)}>
                    <span className="lv-linha-lista__titulo">{x.nome}</span>
                    <span className="lv-legenda">{'semanas' in x ? `${x.semanas ?? '—'} semanas` : x.duracao ? `${x.duracao} min` : 'Duração por definir'}</span>
                  </button>
                  <Estado tom={x.versao ? 'ok' : 'neutro'}>{x.versao ? `Versão ${x.versao}` : 'Rascunho'}</Estado>
                  {pode && x.versao > 0 && <Botao variante="secundario" onClick={() => navigate(`/training/atribuir?${tipo === 'treinos' ? 'treino' : 'plano'}=${x.id}`)}>Atribuir</Botao>}
                </div>
              ))}
          </section>
        ) : erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar a biblioteca" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !base ? <Esqueleto />
          : lista.length === 0 ? <EstadoPagina tipo="vazio" icone={Barbell} titulo="Nenhum exercício" texto="Muda a procura ou os filtros." />
          : (
            <div className="lg-bib">
              <div className="lg-bib__grelha">
                {lista.map((c) => (
                  <button key={c.id} type="button" className={`lg-bib__cartao${aberto?.id === c.id ? ' lg-bib__cartao--aberto' : ''}`} onClick={() => setAberto(c)}>
                    <img src={fotoDe(c)} alt="" className="lg-bib__foto" />
                    <span className="lg-bib__corpo">
                      <span className="lv-linha-lista__titulo">{c.name}</span>
                      <span className="lv-legenda">{c.equipment.join(', ') || 'Peso do corpo'}{c.origem === 'meus' ? ' · do ginásio' : ''}</span>
                      <span className="lg-ficha__pills" style={{ marginTop: 'var(--espaco-4)' }}>
                        <span className="lv-pill">{CATEGORIA_EXERCICIO[c.category] ?? c.category}</span>
                        {c.muscles.slice(0, 2).map((m) => <span key={m} className="lv-pill">{m}</span>)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {aberto && (
                <aside className="lv-lista lg-ficha__lado lg-bib__detalhe" aria-label={aberto.name}>
                  {aberto.video_url
                    ? <a className="lg-bib__foto lg-bib__foto--vazia" href={aberto.video_url} target="_blank" rel="noreferrer" aria-label="Ver vídeo"><Play size={28} /></a>
                    : <img src={fotoDe(aberto)} alt="" className="lg-bib__foto" />}
                  <h2 className="lg-bib__titulo">{aberto.name}</h2>
                  <span className="lv-legenda">{aberto.versao}{aberto.level ? ` · ${NIVEL[aberto.level] ?? aberto.level}` : ''}</span>
                  {aberto.record_fields.length > 0 && (
                    <>
                      <span className="lv-sobretitulo">Regista</span>
                      <div className="lg-ficha__pills">{aberto.record_fields.map((r) => <span key={r} className="lv-pill">{METRICA(r)}</span>)}</div>
                    </>
                  )}
                  {aberto.instructions && <p style={{ margin: 0 }}>{aberto.instructions}</p>}
                  {aberto.alternatives.length > 0 && (
                    <>
                      <span className="lv-sobretitulo">Se a máquina estiver ocupada</span>
                      {aberto.alternatives.map((a) => (
                        <button key={a} type="button" className="lv-linha-lista" onClick={() => setAberto(todos.find((t) => t.chave === a) ?? aberto)}>
                          <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{nomeDe(a)}</span></span>
                        </button>
                      ))}
                    </>
                  )}
                  {aberto.origem === 'lunaos' && <Nota>Os modelos do LunaOS não se editam: duplica para fazer a tua versão.</Nota>}
                  {pode && (
                    <div className="lg-bib__acoes">
                      {aberto.origem === 'lunaos' && <Botao variante="secundario" aCarregar={aGravar} onClick={() => void duplicar(aberto)}>Duplicar</Botao>}
                      {aberto.origem !== 'lunaos' && <Botao onClick={() => navigate(`/training/exercicio/${aberto.id}`)}>Editar</Botao>}
                    </div>
                  )}
                </aside>
              )}
            </div>
          )}
      </div>
      <NovoTreinoOuPlano tipo={criar} onFechar={() => setCriar(null)} />
    </CoachShell>
  );
}
