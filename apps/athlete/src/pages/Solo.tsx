import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  codigoValido, comecarSozinho, convidarTreinador, desligarDoTreinador, fetchMeusTreinadores, NIVEIS, normalizarCodigo, OBJETIVOS, pedirLigacao,
  procurarCodigo, toast, type MeuTreinador, type Nivel, type ObjetivoSolo,
} from '@luna/core';
import { BotaoFixo, ConfirmarDestrutivo, Esqueleto, Interruptor, Nota } from '@luna/ui/v3';
import { ArrowLeft, Barbell, ChartLineUp, CheckCircle, Fire, Heartbeat, QrCode } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { t } from '../vocab';

const erroDe = (e: unknown) => (e instanceof Error ? e.message : 'Erro');
const ICONE = { forca: Barbell, peso: Fire, mexer: Heartbeat, prova: ChartLineUp } as const;

/** C-26 · Começar sozinho: objetivo, nível, dias e onde; plano feito de modelos, sem ginásio nem pagamento. */
export function ComecarSozinho() {
  const navigate = useNavigate();
  const [passo, setPasso] = useState(1);
  const [objetivo, setObjetivo] = useState<ObjetivoSolo | null>(null);
  const [nivel, setNivel] = useState<Nivel | null>(null);
  const [dias, setDias] = useState(3);
  const [onde, setOnde] = useState<'casa' | 'ginasio' | null>(null);
  const [aCriar, setACriar] = useState(false);
  const pronto = passo === 1 ? !!objetivo : passo === 2 ? !!nivel : passo === 3 ? dias >= 2 : !!onde;
  const seguinte = async () => {
    if (passo < 4) { setPasso(passo + 1); return; }
    const client = getSupabaseClient();
    if (!client || !objetivo || !nivel || !onde) return;
    setACriar(true);
    try { await comecarSozinho(client, { objetivo, nivel, dias, onde }); toast({ variant: 'success', title: 'O teu plano está pronto' }); navigate('/hoje'); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível criar o plano', description: erroDe(e) }); }
    finally { setACriar(false); }
  };
  const TITULO = ['Qual é o teu objetivo?', 'Como estás a treinar?', 'Quantos dias por semana?', 'Onde vais treinar?'];
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => (passo > 1 ? setPasso(passo - 1) : navigate('/hoje'))}><ArrowLeft size={18} aria-hidden /></button>
        <div style={{ flex: 1 }}><span className="lv-legenda">Passo {passo} de 4</span><h1 className="lc-cabeca__titulo">{TITULO[passo - 1]}</h1></div>
      </header>
      <div className="lc-progresso" aria-hidden>{[1, 2, 3, 4].map((n) => <i key={n} className={n <= passo ? 'feito' : ''} />)}</div>
      <div className="lc-opcoes" role="radiogroup" aria-label={TITULO[passo - 1]}>
        {passo === 1 && OBJETIVOS.map((o) => {
          const Ic = ICONE[o.id];
          return (
            <button key={o.id} type="button" role="radio" aria-checked={objetivo === o.id} className="lc-opcao lc-opcao--grande" disabled={o.embreve} onClick={() => setObjetivo(o.id)}>
              <span><b>{o.titulo}</b><span className="lv-legenda" style={{ display: 'block' }}>{o.texto}</span></span><Ic size={20} aria-hidden />
            </button>
          );
        })}
        {passo === 2 && NIVEIS.map((n) => (
          <button key={n.id} type="button" role="radio" aria-checked={nivel === n.id} className="lc-opcao lc-opcao--grande" onClick={() => setNivel(n.id)}>
            <span><b>{n.titulo}</b><span className="lv-legenda" style={{ display: 'block' }}>{n.texto}</span></span>
          </button>
        ))}
        {passo === 3 && (
          <div className="lc-escala" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
            {[2, 3, 4, 5, 6].map((n) => <button key={n} type="button" role="radio" aria-checked={dias === n} className="lc-escala__n" onClick={() => setDias(n)}><b>{n}</b><span>dias</span></button>)}
          </div>
        )}
        {passo === 4 && ([['casa', 'Em casa', 'Peso do corpo e um elástico'], ['ginasio', 'No ginásio', 'Barras, halteres e máquinas']] as const).map(([k, tt, tx]) => (
          <button key={k} type="button" role="radio" aria-checked={onde === k} className="lc-opcao lc-opcao--grande" onClick={() => setOnde(k)}>
            <span><b>{tt}</b><span className="lv-legenda" style={{ display: 'block' }}>{tx}</span></span>
          </button>
        ))}
      </div>
      {passo === 4 && <Nota>É de graça e é teu. Quando quiseres, ligas-te a um {t('responsavel')} e ele passa a acompanhar-te.</Nota>}
      <BotaoFixo aCarregar={aCriar} disabled={!pronto} onClick={() => void seguinte()}>{passo < 4 ? 'Continuar' : 'Criar o meu plano'}</BotaoFixo>
    </main>
  );
}

/** C-27 · Ligar a um treinador: código, QR ou convite; escolher o que partilha; desligar sem perder o histórico. */
export function LigarTreinador() {
  const navigate = useNavigate();
  const [meus, setMeus] = useState<MeuTreinador[] | null>(null);
  const [codigo, setCodigo] = useState(() => new URLSearchParams(window.location.search).get('codigo') ?? '');
  const [quem, setQuem] = useState<{ nome: string; org: string; papel: string } | null>(null);
  const [partilhas, setPartilhas] = useState<string[]>(['training']);
  const [convidar, setConvidar] = useState(false);
  const [canal, setCanal] = useState<'email' | 'sms'>('email');
  const [destino, setDestino] = useState('');
  const [desligar, setDesligar] = useState<MeuTreinador | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const carregar = () => { const c = getSupabaseClient(); if (c) void fetchMeusTreinadores(c).then(setMeus).catch(() => setMeus([])); };
  useEffect(() => carregar(), []);
  useEffect(() => {
    setQuem(null);
    const c = getSupabaseClient();
    if (!c || !codigoValido(codigo)) return;
    void procurarCodigo(c, codigo).then(setQuem);
  }, [codigo]);
  const alternar = (k: string) => setPartilhas((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  const pedir = async () => {
    const c = getSupabaseClient();
    if (!c) return;
    setAEnviar(true);
    try {
      if (convidar) { await convidarTreinador(c, canal, destino, partilhas as never); toast({ variant: 'success', title: 'Convite enviado', description: 'Quando ele criar a conta, ficam ligados.' }); }
      else { await pedirLigacao(c, codigo, partilhas as never); toast({ variant: 'success', title: 'Pedido enviado', description: `O teu ${t('responsavel')} aceita na app dele.` }); }
      setCodigo(''); setDestino(''); setConvidar(false); carregar();
    } catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) }); }
    finally { setAEnviar(false); }
  };
  const fazerDesligar = async () => {
    const c = getSupabaseClient();
    if (!c || !desligar) return;
    try { await desligarDoTreinador(c, desligar.linkId); toast({ variant: 'success', title: 'Desligado', description: 'O teu histórico ficou contigo.' }); setDesligar(null); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível', description: erroDe(e) }); }
  };
  const PARTILHAS: [string, string][] = [['training', 'Treinos e progresso'], ['measurements', 'Medidas e fotos'], ['checkins', 'Check-ins'], ['health', 'Saúde']];
  return (
    <main className="lc-ecra">
      <header className="lc-cabeca">
        <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={() => navigate('/eu')}><ArrowLeft size={18} aria-hidden /></button>
        <div style={{ flex: 1 }}><span className="lv-legenda">Eu</span><h1 className="lc-cabeca__titulo">Ligar a um {t('responsavel')}</h1></div>
      </header>
      {!meus ? <Esqueleto linhas={2} /> : meus.length > 0 && (
        <section className="lc-lista" aria-label="Os meus treinadores">
          {meus.map((m) => (
            <div key={m.linkId} className="lc-lista__linha" style={{ cursor: 'default' }}>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{m.treinador ?? m.org}</span>
                <span className="lv-legenda">{m.org}{m.estado === 'pending' ? ' · à espera que aceite' : ''}</span></span>
              {m.estado === 'active' ? <button type="button" className="lc-link" onClick={() => setDesligar(m)}>Desligar</button> : <span className="lv-pill">Pedido</span>}
            </div>
          ))}
        </section>
      )}
      {!convidar ? (
        <>
          <h2 className="lv-sobretitulo">Código do {t('responsavel')}</h2>
          <label className="lv-campo"><span className="sr-only">Código</span>
            <input className="lv-campo-input lc-codigo" inputMode="text" autoCapitalize="characters" placeholder="TR · 4821" value={codigo}
              onChange={(e) => setCodigo(e.target.value)} onBlur={() => setCodigo((c) => (codigoValido(c) ? normalizarCodigo(c) : c))} /></label>
          {quem && (
            <div className="lc-lista__linha" style={{ cursor: 'default' }}>
              <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{quem.nome}</span><span className="lv-legenda">{quem.papel} · {quem.org}</span></span>
              <CheckCircle size={20} aria-hidden />
            </div>
          )}
          {codigoValido(codigo) && !quem && <p className="lv-legenda" style={{ margin: 0 }}>Não encontrámos este código. Confirma com o teu {t('responsavel')}.</p>}
          <button type="button" className="lc-link" onClick={() => setConvidar(true)}><QrCode size={14} aria-hidden /> O meu {t('responsavel')} ainda não usa o LunaOS</button>
        </>
      ) : (
        <>
          <h2 className="lv-sobretitulo">Convidar o teu {t('responsavel')}</h2>
          <div className="lc-filtros">
            <button type="button" className="lv-chip" aria-pressed={canal === 'email'} onClick={() => setCanal('email')}>Email</button>
            <button type="button" className="lv-chip" aria-pressed={canal === 'sms'} onClick={() => setCanal('sms')}>SMS</button>
          </div>
          <label className="lv-campo"><span className="lv-campo-rotulo">{canal === 'email' ? 'Email dele' : 'Telemóvel dele'}</span>
            <input className="lv-campo-input" type={canal === 'email' ? 'email' : 'tel'} value={destino} onChange={(e) => setDestino(e.target.value)} /></label>
          <Nota>Ele recebe um convite para experimentar o LunaOS 30 dias; quando criar a conta, ficam ligados.</Nota>
          <button type="button" className="lc-link" onClick={() => setConvidar(false)}>Tenho um código</button>
        </>
      )}
      <h2 className="lv-sobretitulo">O que partilhas{quem ? ` com o ${quem.nome.split(' ')[0]}` : ''}</h2>
      <section className="lc-escolhas" aria-label="O que partilhas">
        {PARTILHAS.map(([k, r]) => (
          <div key={k} className="lc-escolha"><span>{r}</span><Interruptor rotulo={r} ligado={partilhas.includes(k)} onMudar={() => alternar(k)} /></div>
        ))}
      </section>
      <p className="lv-legenda">Mudas isto quando quiseres em Privacidade. Se desligares, o que registaste fica contigo, com uma cópia do plano.</p>
      <BotaoFixo aCarregar={aEnviar} disabled={convidar ? !destino.trim() : !quem} onClick={() => void pedir()}>{convidar ? 'Enviar convite' : 'Pedir para ligar'}</BotaoFixo>
      <ConfirmarDestrutivo aberta={!!desligar} titulo={`Desligar de ${desligar?.treinador ?? desligar?.org ?? ''}?`} verbo="Desligar" manter="Manter"
        texto="Ele deixa de ver os teus dados já. O teu histórico fica contigo e o plano dele passa para uma cópia tua."
        onConfirmar={() => void fazerDesligar()} onFechar={() => setDesligar(null)} />
    </main>
  );
}
