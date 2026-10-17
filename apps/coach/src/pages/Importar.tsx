import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CAMPOS_IMPORT, falhasEmCsv, importarClientes, lerCsv, reconhecerColuna, toast, validarImport, verificarDuplicadosImport,
  type CampoImport, type LinhaImport, type ResultadoImport,
} from '@luna/core';
import { Botao, Esqueleto, Estado, EstadoPagina, Nota } from '@luna/ui/v3';
import { ArrowLeft, ClipboardText, UploadSimple } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { SairSemGuardar, VoltarA } from '../app/Estados';
import { useScope } from '../app/ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';
import { vocab } from '../lib/vocab';

const PP = vocab.pessoa({ plural: true, maiuscula: true });
const pp = vocab.pessoa({ plural: true });
type Passo = 'ficheiro' | 'mapear' | 'validar' | 'duplicados' | 'importar' | 'feito';
const PASSOS: { id: Passo; rotulo: string }[] = [
  { id: 'ficheiro', rotulo: 'Ficheiro' }, { id: 'mapear', rotulo: 'Mapear colunas' }, { id: 'validar', rotulo: 'Validar' },
  { id: 'duplicados', rotulo: 'Duplicados' }, { id: 'importar', rotulo: 'Importar' },
];

/**
 * Importar clientes (G-05, Figma 68:236), plano Treinador: de Excel (CSV) ou
 * de outra app de PT. Mapear, validar e resolver duplicados no aparelho; nada
 * entra antes do último passo. No fim fica o comprovativo com as falhas.
 * Saldos de packs entram com os packs (tarefa 26 parte A); contratos e
 * mandatos com o plano Ginásio.
 */
export function Importar() {
  const navigate = useNavigate();
  const scope = useScope();
  const [passo, setPasso] = useState<Passo>('ficheiro');
  const [ficheiro, setFicheiro] = useState<string>('');
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<CampoImport[]>([]);
  const [dups, setDups] = useState<Map<number, string> | null>(null);
  const [saltar, setSaltar] = useState<Set<number>>(new Set());
  const [resultado, setResultado] = useState<ResultadoImport | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const validadas = useMemo(() => (mapa.length ? validarImport(linhas, mapa) : []), [linhas, mapa]);
  const comErro = validadas.filter((l) => l.erros.length > 0);
  const comAviso = validadas.filter((l) => l.erros.length === 0 && l.avisos.length > 0);
  const prontas = validadas.filter((l) => l.erros.length === 0);
  const aImportar: LinhaImport[] = prontas.filter((l) => !saltar.has(l.linha));
  const temNome = mapa.includes('nome');
  const idx = PASSOS.findIndex((p) => p.id === passo);

  const ler = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setErro(null);
    if (!/\.(csv|txt)$/i.test(f.name)) { setErro('Usa um ficheiro CSV. No Excel: Ficheiro › Guardar como › CSV.'); return; }
    if (f.size > 5 * 1024 * 1024) { setErro('O ficheiro passa de 5 MB. Divide-o em partes.'); return; }
    const r = new FileReader();
    r.onload = () => {
      const { cabecalho: c, linhas: l } = lerCsv(String(r.result ?? ''));
      if (c.length === 0 || l.length === 0) { setErro('O ficheiro está vazio ou sem linha de títulos.'); return; }
      if (l.length > 5000) { setErro('Mais de 5000 linhas: divide o ficheiro em partes.'); return; }
      setFicheiro(f.name); setCabecalho(c); setLinhas(l);
      // Cada campo só uma vez: a primeira coluna que o reconhece fica com ele
      const usados = new Set<CampoImport>();
      setMapa(c.map((h) => { const k = reconhecerColuna(h); if (k !== 'ignorar' && usados.has(k)) return 'ignorar'; usados.add(k); return k; }));
      setPasso('mapear');
    };
    r.readAsText(f, 'utf-8');
  };

  useEffect(() => {
    if (passo !== 'duplicados' || dups) return;
    const client = getSupabaseClient();
    if (!client) return;
    void verificarDuplicadosImport(client, scope, prontas).then((m) => { setDups(m); setSaltar(new Set(m.keys())); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Não foi possível verificar duplicados.'));
  }, [passo, dups, prontas, scope]);

  const importar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    setAGravar(true); setErro(null);
    try {
      const r = await importarClientes(client, scope, ficheiro, aImportar);
      // As linhas com erro que ficaram de fora também vão para o comprovativo
      setResultado({ ...r, falhas: [...comErro.map((l) => ({ linha: l.linha, nome: l.nome || null, motivo: l.erros.join(', ') })),
        ...[...saltar].map((n) => ({ linha: n, nome: prontas.find((p) => p.linha === n)?.nome ?? null, motivo: dups?.get(n) ?? 'Saltada' })), ...r.falhas]
        .sort((a, b) => a.linha - b.linha) });
      setPasso('feito');
      toast({ variant: 'success', title: `${r.ok} ${pp} importados` });
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível importar.'); }
    finally { setAGravar(false); }
  };

  const descarregarFalhas = () => {
    if (!resultado) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${falhasEmCsv(resultado.falhas)}`], { type: 'text/csv;charset=utf-8' }));
    a.download = `falhas-${ficheiro.replace(/\.\w+$/, '')}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  };

  const resumo = (
    <aside className="lv-lista lg-ficha__lado" aria-label="Ficheiro">
      <div className="lv-linha-lista" style={{ cursor: 'default', padding: 0 }}>
        <ClipboardText size={20} aria-hidden />
        <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{ficheiro || 'Sem ficheiro'}</span>
          <span className="lv-legenda">{linhas.length} linhas · {cabecalho.length} colunas</span></span>
      </div>
      {mapa.length > 0 && (
        <div className="lg-clientes__numeros">
          <div><span className="lv-legenda">Prontas</span><b>{prontas.length - (dups ? saltar.size : 0)}</b></div>
          <div><span className="lv-legenda">Com aviso</span><b>{comAviso.length}</b></div>
          <div><span className="lv-legenda">Com erro</span><b>{comErro.length}</b></div>
          {dups && <div><span className="lv-legenda">Já existem</span><b>{dups.size}</b></div>}
        </div>
      )}
      <Nota>Nada entra no LunaOS antes do último passo. Até lá podes voltar atrás quantas vezes quiseres.</Nota>
    </aside>
  );

  return (
    <CoachShell headStrong={`Importar ${pp}`} headSub={PP} legado={false} topActions={<VoltarA omissao={{ rotulo: PP, href: '/clients' }} />}>
      <div className="lv-root lg-ficha">
        {passo !== 'feito' && (
          <ol className="lg-passos" aria-label="Passos">
            {PASSOS.map((p, i) => (
              <li key={p.id} className={i < idx ? 'lg-passos--feito' : i === idx ? 'lg-passos--atual' : undefined} aria-current={i === idx ? 'step' : undefined}>{p.rotulo}</li>
            ))}
          </ol>
        )}
        {erro && <p className="lv-campo-erro" role="alert" style={{ margin: 0 }}>{erro}</p>}

        {passo === 'ficheiro' && (
          <section className="lv-lista lg-import__ficheiro" aria-label="Ficheiro">
            <UploadSimple size={32} aria-hidden />
            <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Escolhe o ficheiro</h2>
            <p className="lv-legenda" style={{ margin: 0, textAlign: 'center' }}>CSV exportado do Excel ou de outra app de PT, com uma linha de títulos.</p>
            <label className="lv-btn lv-btn--principal" style={{ cursor: 'pointer' }}>
              Escolher ficheiro<input type="file" accept=".csv,.txt,text/csv" onChange={ler} className="sr-only" />
            </label>
          </section>
        )}

        {passo === 'mapear' && (
          <div className="lg-ficha__grelha">
            <section className="lv-lista lg-tabela" aria-label="Mapear colunas">
              <div className="lg-import__linha lg-tabela__cabeca"><span>Coluna no ficheiro</span><span>Campo no LunaOS</span><span>Exemplo</span><span>Estado</span></div>
              {cabecalho.map((h, i) => (
                <div key={i} className="lg-import__linha">
                  <span className="lv-pill">{h || `Coluna ${i + 1}`}</span>
                  <select className="lv-campo-input" aria-label={`Campo para ${h}`} value={mapa[i]} onChange={(e) => setMapa(mapa.map((m, j) => (j === i ? e.target.value as CampoImport : (e.target.value !== 'ignorar' && m === e.target.value ? 'ignorar' : m))))}>
                    {CAMPOS_IMPORT.map((c) => <option key={c.id} value={c.id}>{c.rotulo}</option>)}
                  </select>
                  <span className="lv-legenda" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{linhas[0]?.[i] ?? ''}</span>
                  {mapa[i] === 'ignorar' ? <span className="lv-pill">Ignorada</span> : <Estado tom="ok">{reconhecerColuna(h) === mapa[i] ? 'Reconhecida' : 'Escolhida'}</Estado>}
                </div>
              ))}
              <div className="lg-import__acoes">
                <Botao variante="secundario" icone={ArrowLeft} onClick={() => setPasso('ficheiro')}>Voltar</Botao>
                <Botao disabled={!temNome} onClick={() => setPasso('validar')}>Validar {linhas.length} linhas</Botao>
              </div>
              {!temNome && <Nota>Escolhe a coluna do nome para continuar.</Nota>}
            </section>
            {resumo}
          </div>
        )}

        {passo === 'validar' && (
          <div className="lg-ficha__grelha">
            <section className="lv-lista" aria-label="Validar">
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{comErro.length ? `${comErro.length} linhas com erro ficam de fora` : 'Todas as linhas têm o essencial'}</h2>
              {[...comErro, ...comAviso].slice(0, 50).map((l) => (
                <div key={l.linha} className="lv-linha-lista" style={{ cursor: 'default' }}>
                  <span className="lv-pill">Linha {l.linha}</span>
                  <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{l.nome || 'Sem nome'}</span>
                    <span className="lv-legenda">{[...l.erros, ...l.avisos].join(' · ')}</span></span>
                  <Estado tom={l.erros.length ? 'erro' : 'aviso'}>{l.erros.length ? 'Erro' : 'Aviso'}</Estado>
                </div>
              ))}
              {comErro.length + comAviso.length > 50 && <p className="lv-legenda">E mais {comErro.length + comAviso.length - 50}; ficam todas no comprovativo.</p>}
              <div className="lg-import__acoes">
                <Botao variante="secundario" icone={ArrowLeft} onClick={() => setPasso('mapear')}>Voltar</Botao>
                <Botao disabled={prontas.length === 0} onClick={() => { setDups(null); setPasso('duplicados'); }}>Ver duplicados</Botao>
              </div>
            </section>
            {resumo}
          </div>
        )}

        {passo === 'duplicados' && (
          <div className="lg-ficha__grelha">
            <section className="lv-lista" aria-label="Duplicados">
              {!dups ? <Esqueleto linhas={3} /> : dups.size === 0 ? <EstadoPagina tipo="vazio" titulo="Sem duplicados" texto={`Nenhum destes ${pp} existe já.`} /> : (
                <>
                  <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>{dups.size} já existem</h2>
                  <p className="lv-legenda" style={{ margin: 0 }}>Por omissão ficam de fora. Para os juntar depois, usa Juntar com outro na ficha.</p>
                  {[...dups.entries()].map(([n, motivo]) => (
                    <div key={n} className="lv-linha-lista">
                      <input type="checkbox" aria-label={`Importar mesmo assim a linha ${n}`} checked={!saltar.has(n)}
                        onChange={() => setSaltar((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x; })} />
                      <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{prontas.find((p) => p.linha === n)?.nome}</span>
                        <span className="lv-legenda">Linha {n} · {motivo}</span></span>
                    </div>
                  ))}
                </>
              )}
              <div className="lg-import__acoes">
                <Botao variante="secundario" icone={ArrowLeft} onClick={() => setPasso('validar')}>Voltar</Botao>
                <Botao disabled={!dups} onClick={() => setPasso('importar')}>Continuar</Botao>
              </div>
            </section>
            {resumo}
          </div>
        )}

        {passo === 'importar' && (
          <div className="lg-ficha__grelha">
            <section className="lv-lista" aria-label="Importar">
              <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Importar {aImportar.length} {pp}?</h2>
              <ul className="lg-massa">
                <li><span><b>{aImportar.length} entram</b> como {pp} teus, sem conta na app (podes convidar depois).</span></li>
                {comErro.length > 0 && <li><span><b>{comErro.length}</b> com erro ficam de fora.</span></li>}
                {saltar.size > 0 && <li><span><b>{saltar.size}</b> que já existem ficam de fora.</span></li>}
              </ul>
              <Nota>Saldos de packs de sessões entram quando os packs estiverem ligados.</Nota>
              <div className="lg-import__acoes">
                <Botao variante="secundario" icone={ArrowLeft} onClick={() => setPasso('duplicados')}>Voltar</Botao>
                <Botao aCarregar={aGravar} disabled={aImportar.length === 0} onClick={() => void importar()}>Importar {aImportar.length}</Botao>
              </div>
            </section>
            {resumo}
          </div>
        )}

        {passo === 'feito' && resultado && (
          <section className="lv-lista" aria-label="Comprovativo">
            <h2 className="lv-titulo-ecra" style={{ margin: 0 }}>{resultado.ok} {pp} importados</h2>
            <p className="lv-legenda" style={{ margin: 0 }}>{ficheiro} · {new Date().toLocaleString('pt-PT')} · {resultado.falhas.length} linhas por resolver</p>
            {resultado.falhas.slice(0, 20).map((f) => (
              <div key={`${f.linha}-${f.motivo}`} className="lv-linha-lista" style={{ cursor: 'default' }}>
                <span className="lv-pill">Linha {f.linha}</span>
                <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{f.nome || 'Sem nome'}</span><span className="lv-legenda">{f.motivo}</span></span>
              </div>
            ))}
            <div className="lg-import__acoes">
              {resultado.falhas.length > 0 && <Botao variante="secundario" onClick={descarregarFalhas}>Descarregar as falhas (CSV)</Botao>}
              <Botao onClick={() => navigate('/clients')}>Ver {pp}</Botao>
            </div>
          </section>
        )}
      </div>
      <SairSemGuardar sujo={passo !== 'ficheiro' && passo !== 'feito'} resumo="O ficheiro ainda não foi importado. Se saíres, tens de o escolher de novo." />
    </CoachShell>
  );
}
