import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CATEGORIA_EXERCICIO, duplicarExercicioBase, fetchBibliotecaBase, fetchExerciciosOrg, filtrarExercicios, NIVEL, toast,
  type ExercicioBase, type ExercicioOrg,
} from '@luna/core';
import { Botao, Chip, Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { Barbell, Play } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { modalidade } from '../lib/vocab';

type Origem = 'lunaos' | 'meus';
interface Cartao {
  id: string; origem: Origem; name: string; category: string; muscles: string[]; equipment: string[]; level: string | null;
  instructions: string | null; record_fields: string[]; alternatives: string[]; video_url: string | null; image_url: string | null;
  versao: string; chave: string | null;
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
  versao: e.copied_from ? `Cópia de ${e.copied_from.replace('@', ' · versão ')}` : 'Do ginásio', chave: null,
});

/**
 * Biblioteca (G-15, Figma 108:2), parte de exercícios: os modelos do LunaOS
 * (só de leitura; duplicam-se para mudar) e os do ginásio. Treinos, planos e
 * programas entram com a tarefa 12.
 */
export function Biblioteca() {
  const scope = useScope();
  const pode = scope.permissions.includes('training.write');
  const [base, setBase] = useState<ExercicioBase[] | null>(null);
  const [meus, setMeus] = useState<ExercicioOrg[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [origem, setOrigem] = useState<Origem | 'tudo'>('tudo');
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Cartao | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    setErro(null);
    void fetchBibliotecaBase(client).then(setBase).catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
    void fetchExerciciosOrg(client, scope).then(setMeus).catch(() => setMeus([]));
  }, [scope]);
  useEffect(() => carregar(), [carregar]);

  const todos = useMemo(() => [...(meus ?? []).map(deOrg), ...(base ?? []).map(deBase)], [base, meus]);
  const lista = useMemo(() => filtrarExercicios(todos.filter((c) => origem === 'tudo' || c.origem === origem), { q, categoria }), [todos, origem, q, categoria]);
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
    <CoachShell headStrong="Biblioteca" headSub="Treino" legado={false}>
      <div className="lv-root lg-ficha">
        <div className="lg-clientes__barra">
          <div className="lg-clientes__chips">
            <Chip ativo contagem={todos.length}>Exercícios</Chip>
            <span className="lv-legenda">Treinos, planos e programas chegam com o módulo de treino.</span>
          </div>
          <input className="lv-campo-input lg-clientes__procura" type="search" placeholder="Procurar exercício ou músculo" aria-label="Procurar exercício"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="lg-clientes__chips">
          <Chip ativo={origem === 'tudo'} onClick={() => setOrigem('tudo')}>Todos</Chip>
          <Chip ativo={origem === 'meus'} onClick={() => setOrigem('meus')} contagem={meus?.length}>Do ginásio</Chip>
          <Chip ativo={origem === 'lunaos'} onClick={() => setOrigem('lunaos')} contagem={base?.length}>Do LunaOS</Chip>
          <span style={{ width: 'var(--espaco-16)' }} />
          {modalidade.categorias_biblioteca.map((c) => (
            <Chip key={c} ativo={categoria === c} onClick={() => setCategoria(categoria === c ? null : c)}>{CATEGORIA_EXERCICIO[c] ?? c}</Chip>
          ))}
        </div>

        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar a biblioteca" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !base ? <Esqueleto />
          : lista.length === 0 ? <EstadoPagina tipo="vazio" icone={Barbell} titulo="Nenhum exercício" texto="Muda a procura ou os filtros." />
          : (
            <div className="lg-bib">
              <div className="lg-bib__grelha">
                {lista.map((c) => (
                  <button key={c.id} type="button" className={`lg-bib__cartao${aberto?.id === c.id ? ' lg-bib__cartao--aberto' : ''}`} onClick={() => setAberto(c)}>
                    {c.image_url ? <img src={c.image_url} alt="" className="lg-bib__foto" />
                      : <span className="lg-bib__foto lg-bib__foto--vazia" aria-hidden><Barbell size={28} /></span>}
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
                    : aberto.image_url ? <img src={aberto.image_url} alt="" className="lg-bib__foto" />
                    : <span className="lg-bib__foto lg-bib__foto--vazia" aria-hidden><Barbell size={28} /></span>}
                  <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{aberto.name}</h2>
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
                  {aberto.origem === 'lunaos'
                    ? <Nota>Os modelos do LunaOS não se editam: duplica para fazer a tua versão.</Nota>
                    : <Nota>Editar exercícios do ginásio chega com o módulo de treino.</Nota>}
                  {pode && aberto.origem === 'lunaos' && (
                    <Botao variante="secundario" aCarregar={aGravar} onClick={() => void duplicar(aberto)}>Duplicar</Botao>
                  )}
                </aside>
              )}
            </div>
          )}
      </div>
    </CoachShell>
  );
}
