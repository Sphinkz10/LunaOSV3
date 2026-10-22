import { useCallback, useEffect, useState } from 'react';
import {
  apagarDocumento, apagarNota, confirmarDestrutivo, estadoDocumento, fetchNotas, guardarDocumento, guardarNota, TIPOS_DOCUMENTO, toast,
  validadePorOmissao, type NotaPrivada, type NovoDocumento, type TipoDocumento,
} from '@luna/core';
import { Botao, Campo, Chip, Esqueleto, Estado, Janela, Nota, type EstadoTom } from '@luna/ui/v3';
import { Lock } from '@luna/icons';
import { useScope } from './ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : undefined);
const dia = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });

/** G-06: notas privadas do PT. O cliente nunca as vê (nem na app, nem na exportação). */
export function NotasPrivadas({ linkId }: { linkId: string }) {
  const scope = useScope();
  const [notas, setNotas] = useState<NotaPrivada[] | null>(null);
  const [texto, setTexto] = useState('');
  const [editar, setEditar] = useState<NotaPrivada | null>(null);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchNotas(client, linkId).then(setNotas).catch(() => setNotas([]));
  }, [linkId]);
  useEffect(() => carregar(), [carregar]);
  const guardar = async (t: string, id?: string) => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await guardarNota(client, scope, linkId, t, id); setTexto(''); setEditar(null); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
  };
  const apagar = async (n: NotaPrivada) => {
    const client = getSupabaseClient();
    if (!client) return;
    const ok = await confirmarDestrutivo({ titulo: 'Apagar esta nota?', verbo: 'Apagar', manter: 'Manter', efeitos: ['Deixa de existir para toda a equipa'], acao: () => apagarNota(client, n.id) });
    if (ok) carregar();
  };
  return (
    <section className="lv-lista" aria-label="Notas privadas">
      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao"><Lock size={16} aria-hidden /> Notas privadas</h3></div>
      <label className="lv-campo"><span className="lv-campo-rotulo">Nova nota</span>
        <textarea className="lv-campo-input" rows={2} maxLength={2000} placeholder="Só tu e a equipa veem isto." value={texto} onChange={(e) => setTexto(e.target.value)} /></label>
      <Botao variante="secundario" disabled={!texto.trim()} onClick={() => void guardar(texto)}>Guardar nota</Botao>
      {!notas ? <Esqueleto linhas={2} /> : notas.map((n) => (
        <div key={n.id} className="lv-linha-lista" style={{ cursor: 'default', alignItems: 'flex-start' }}>
          <span className="lv-linha-lista__corpo">
            <span style={{ whiteSpace: 'pre-wrap' }}>{n.texto}</span>
            <span className="lv-legenda">{dia(n.em)}{n.editadaEm.slice(0, 16) !== n.em.slice(0, 16) ? ' · editada' : ''}</span>
          </span>
          <Botao variante="secundario" onClick={() => setEditar(n)}>Editar</Botao>
          <Botao variante="secundario" className="lg-perigo" onClick={() => void apagar(n)}>Apagar</Botao>
        </div>
      ))}
      <Janela aberta={!!editar} onFechar={() => setEditar(null)} titulo="Editar nota">
        {editar && <EditarNota nota={editar} onGuardar={(t) => void guardar(t, editar.id)} />}
      </Janela>
    </section>
  );
}

function EditarNota({ nota, onGuardar }: { nota: NotaPrivada; onGuardar: (t: string) => void }) {
  const [t, setT] = useState(nota.texto);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
      <textarea className="lv-campo-input" rows={5} maxLength={2000} aria-label="Nota" value={t} onChange={(e) => setT(e.target.value)} />
      <Botao disabled={!t.trim()} onClick={() => onGuardar(t)}>Guardar</Botao>
    </div>
  );
}

const DOC: Record<'valid' | 'expiring' | 'expired', { tom: EstadoTom; texto: string }> = {
  valid: { tom: 'ok', texto: 'Válido' }, expiring: { tom: 'aviso', texto: 'A expirar' }, expired: { tom: 'erro', texto: 'Expirado' },
};
export interface DocumentoFicha { id: string; name: string; docType: string | null; expiresOn: string | null }

/** G-06: atestado (com validade), termo de responsabilidade e consentimento de fotografias. */
export function DocumentosCliente({ linkId, documentos, onMudou }: { linkId: string; documentos: DocumentoFicha[]; onMudou: () => void }) {
  const scope = useScope();
  const [novo, setNovo] = useState<NovoDocumento | null>(null);
  const falta = (['atestado', 'termo'] as TipoDocumento[]).filter((t) => !documentos.some((d) => d.docType === t && estadoDocumento(d.expiresOn) !== 'expired'));
  const guardar = async () => {
    const client = getSupabaseClient();
    if (!client || !novo) return;
    try { await guardarDocumento(client, scope, linkId, novo); setNovo(null); onMudou(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: erroDe(e) }); }
  };
  const apagar = async (d: DocumentoFicha) => {
    const client = getSupabaseClient();
    if (!client) return;
    const ok = await confirmarDestrutivo({ titulo: `Tirar "${d.name}"?`, verbo: 'Tirar', manter: 'Manter', efeitos: [], acao: () => apagarDocumento(client, d.id) });
    if (ok) onMudou();
  };
  const hoje = new Date().toISOString().slice(0, 10);
  const abrir = (tipo: TipoDocumento, d?: DocumentoFicha) => setNovo(d
    ? { id: d.id, tipo: (d.docType as TipoDocumento) ?? 'outro', nome: d.name, emitidoEm: null, expiraEm: d.expiresOn }
    : { tipo, nome: '', emitidoEm: hoje, expiraEm: validadePorOmissao(tipo, hoje) });
  return (
    <section className="lv-lista" aria-label="Documentos">
      <div className="lv-lista__cabeca"><h3 className="lv-titulo-cartao">Documentos</h3><Botao variante="secundario" onClick={() => abrir('atestado')}>Juntar</Botao></div>
      {falta.length > 0 && (
        <Nota>Falta: {falta.map((t) => TIPOS_DOCUMENTO.find((x) => x.id === t)?.rotulo.toLocaleLowerCase('pt-PT')).join(' e ')}.</Nota>
      )}
      {documentos.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem documentos.</p> : documentos.map((x) => {
        const e = DOC[estadoDocumento(x.expiresOn)];
        return (
          <div key={x.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
            <span className="lv-linha-lista__corpo">
              <span className="lv-linha-lista__titulo">{x.name}</span>
              <span className="lv-legenda">{TIPOS_DOCUMENTO.find((t) => t.id === x.docType)?.rotulo ?? x.docType ?? 'Documento'}{x.expiresOn ? ` · válido até ${dia(x.expiresOn)}` : ''}</span>
            </span>
            <Estado tom={e.tom}>{e.texto}</Estado>
            <Botao variante="secundario" onClick={() => abrir('outro', x)}>Editar</Botao>
            <Botao variante="secundario" className="lg-perigo" onClick={() => void apagar(x)}>Tirar</Botao>
          </div>
        );
      })}
      <Janela aberta={!!novo} onFechar={() => setNovo(null)} titulo={novo?.id ? 'Editar documento' : 'Juntar documento'}>
        {novo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
            {!novo.id && (
              <div className="lg-ficha__metricas">
                {TIPOS_DOCUMENTO.map((t) => <Chip key={t.id} ativo={novo.tipo === t.id}
                  onClick={() => setNovo({ ...novo, tipo: t.id, expiraEm: validadePorOmissao(t.id, novo.emitidoEm ?? hoje) })}>{t.rotulo}</Chip>)}
              </div>
            )}
            <Campo rotulo="Nome (opcional)" placeholder={TIPOS_DOCUMENTO.find((t) => t.id === novo.tipo)?.rotulo} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
            <div className="lg-conta__prefs">
              {!novo.id && <Campo rotulo="Emitido em" type="date" value={novo.emitidoEm ?? ''}
                onChange={(e) => setNovo({ ...novo, emitidoEm: e.target.value || null, expiraEm: validadePorOmissao(novo.tipo, e.target.value) ?? novo.expiraEm })} />}
              <Campo rotulo="Válido até" type="date" value={novo.expiraEm ?? ''} onChange={(e) => setNovo({ ...novo, expiraEm: e.target.value || null })}
                ajuda={novo.tipo === 'atestado' ? 'Avisamos 30 dias antes' : 'Deixa vazio se não expira'} />
            </div>
            <Nota>Guarda o papel assinado no ginásio; aqui fica o registo e a validade.</Nota>
            <Botao onClick={() => void guardar()}>Guardar</Botao>
          </div>
        )}
      </Janela>
    </section>
  );
}
