import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  desmarcar, fetchMeusPacks, fetchMinhasLigacoes, horasLivres, marcarComPT, minhasMarcacoes, toast,
  type MeuPack, type MinhaLigacao, type MinhaMarcacao,
} from '@luna/core';
import { BotaoFixo, ConfirmarDestrutivo, Esqueleto, EstadoPagina, Nota } from '@luna/ui/v3';
import { CalendarBlank, CaretRight } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../vocab';

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGO = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hora = (s: string) => new Date(s).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

/**
 * Marcar com o meu PT (C-06, Figma 122:570): as horas livres vêm da
 * disponibilidade dele; marcar em 2 toques (dia e hora). Desmarcar respeita
 * a regra do ginásio: fora do prazo, avisa que a sessão conta.
 */
export function MarcarPT() {
  const [ligacoes, setLigacoes] = useState<MinhaLigacao[] | null>(null);
  const [link, setLink] = useState<MinhaLigacao | null>(null);
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return d; }), []);
  const [dia, setDia] = useState(iso(dias[0]));
  const [horas, setHoras] = useState<{ inicio: string; fim: string }[] | null>(null);
  const [escolha, setEscolha] = useState<string | null>(null);
  const [marcadas, setMarcadas] = useState<MinhaMarcacao[]>([]);
  const [desm, setDesm] = useState<MinhaMarcacao | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [packs, setPacks] = useState<MeuPack[]>([]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchMinhasLigacoes(client).then((l) => { setLigacoes(l); setLink(l.find((x) => x.responsavel) ?? l[0] ?? null); }).catch(() => setLigacoes([]));
  }, []);
  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !link) return;
    setHoras(null); setEscolha(null);
    void horasLivres(client, link.linkId, iso(dias[0]), 7).then(setHoras).catch(() => setHoras([]));
    void minhasMarcacoes(client).then(setMarcadas).catch(() => setMarcadas([]));
    void fetchMeusPacks(client).then(setPacks).catch(() => setPacks([]));
  }, [link, dias]);
  useEffect(() => carregar(), [carregar]);

  const doDia = (horas ?? []).filter((h) => iso(new Date(h.inicio)) === dia);
  const marcar = async () => {
    const client = getSupabaseClient();
    if (!client || !link || !escolha) return;
    setAGravar(true);
    try { await marcarComPT(client, link.linkId, escolha); toast({ variant: 'success', title: 'Marcado', description: `O teu ${t('responsavel')} recebeu o pedido.` }); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível marcar', description: e instanceof Error ? e.message : undefined }); carregar(); }
    finally { setAGravar(false); }
  };
  const fazerDesmarcar = async () => {
    const client = getSupabaseClient();
    if (!client || !desm) return;
    try {
      const r = await desmarcar(client, desm.id);
      toast({ variant: r === 'conta' ? 'warning' : 'success', title: 'Desmarcada', description: r === 'conta' ? 'Foi fora do prazo: esta sessão conta.' : undefined });
      setDesm(null); carregar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível desmarcar', description: e instanceof Error ? e.message : undefined }); }
  };

  if (ligacoes === null) return <main className="lc-ecra"><Esqueleto /></main>;
  if (!link) return <main className="lc-ecra"><EstadoPagina tipo="vazio" icone={CalendarBlank} titulo={`Ainda sem ${t('responsavel')}`} texto={`Quando aceitares o convite do teu ${t('responsavel')}, marcas aqui.`} /></main>;
  const d = new Date(`${dia}T12:00:00`);
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca"><div style={{ flex: 1 }}><span className="lv-legenda">{(() => { const pk = packs.find((x) => x.org === link.org && x.restam > 0 && x.validoAte >= iso(new Date())); return pk ? `${pk.nome} · ${pk.restam} de ${pk.total} ${t('sessao', { plural: true })}` : link.org; })()}</span>
        <h1 className="lc-cabeca__titulo">Marcar{link.responsavel ? ` com o ${link.responsavel.split(' ')[0]}` : ''}</h1></div></header>
      {(!packs.some((x) => x.org === link.org && x.restam > 0 && x.validoAte >= iso(new Date()))
        && <Nota>Não tens pack com {t('sessao', { plural: true })} válido: a {t('sessao')} fica por pagar ao teu {t('responsavel')}.</Nota>)}
      {ligacoes.length > 1 && (
        <div className="lg-ficha__metricas">{ligacoes.map((l) => <button key={l.linkId} type="button" className="lv-chip" aria-pressed={l.linkId === link.linkId} onClick={() => setLink(l)}>{l.org}</button>)}</div>
      )}
      <div className="lc-dias" role="radiogroup" aria-label="Dia">
        {dias.map((x) => {
          const k = iso(x); const tem = (horas ?? []).some((h) => iso(new Date(h.inicio)) === k);
          return (
            <button key={k} type="button" role="radio" aria-checked={dia === k} className="lc-dia" onClick={() => { setDia(k); setEscolha(null); }}>
              <span className="lv-legenda">{DIAS[x.getDay()]}</span><b>{x.getDate()}</b>{tem && <i aria-hidden />}
            </button>
          );
        })}
      </div>
      <span className="lv-sobretitulo">Livre na {DIAS_LONGO[d.getDay()]}</span>
      {!horas ? <Esqueleto linhas={2} /> : doDia.length === 0 ? <p className="lv-legenda" style={{ margin: 0 }}>Sem horas livres neste dia.</p> : (
        <div className="lc-horas" role="radiogroup" aria-label="Hora">
          {doDia.map((h) => <button key={h.inicio} type="button" role="radio" aria-checked={escolha === h.inicio} className="lc-hora" onClick={() => setEscolha(h.inicio)}>{hora(h.inicio)}</button>)}
        </div>
      )}
      {marcadas.length > 0 && (
        <section className="lc-lista" aria-label="Marcadas">
          {marcadas.map((m) => (
            <button key={m.id} type="button" className="lc-lista__linha" onClick={() => setDesm(m)}>
              <span className="lc-lista__icone"><CalendarBlank size={18} aria-hidden /></span>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{new Date(m.inicio).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric' })} · {hora(m.inicio)}</span>
                <span className="lv-legenda">{m.estado === 'pending' ? 'Por confirmar' : 'Marcada'}{m.com ? ` · ${m.com}` : ''}</span></span>
              <CaretRight size={16} aria-hidden />
            </button>
          ))}
        </section>
      )}
      <Nota>Desmarcar até ao prazo do ginásio não conta; depois disso, a sessão conta.</Nota>
      {escolha && <BotaoFixo aCarregar={aGravar} onClick={() => void marcar()}>Marcar {DIAS_LONGO[d.getDay()]} às {hora(escolha)}</BotaoFixo>}
      <ConfirmarDestrutivo aberta={!!desm} titulo="Desmarcar esta sessão?" verbo="Desmarcar" manter="Manter"
        texto={desm ? (desm.semContar ? 'Ainda estás dentro do prazo: não conta.' : 'Já passou o prazo do ginásio: esta sessão conta.') : undefined}
        onConfirmar={() => void fazerDesmarcar()} onFechar={() => setDesm(null)} />
    </main>
  );
}
