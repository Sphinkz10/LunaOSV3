import { g } from '@luna/modalidades';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  aceitarConviteCliente, criarContaCliente, enviarParq, minhaConta,
  pedirEncarregado, registarConsentimento, signInWithPassword, type MinhaConta, type Partilha,
} from '@luna/core';
import { Botao, Campo, Interruptor, Nota } from '@luna/ui/v3';
import { ArrowLeft } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { guardarPendente, lerPendente, limparPendente, useSessao } from '../sessao';
import { PARQ } from '../parq';
import { t } from '../vocab';

/* ── Moldura comum dos passos (C-01, Figma 82:38) ───────────────────────── */
export function Passo({ sobre, titulo, passo, total, onVoltar, children, acao }: {
  sobre?: string; titulo: string; passo?: number; total?: number; onVoltar?: () => void; children: ReactNode; acao?: ReactNode;
}) {
  return (
    <main className="lc-passo">
      <header className="lc-passo__cabeca">
        {onVoltar && (
          <button type="button" className="lv-btn lv-btn--secundario lv-btn--icone" aria-label="Voltar" onClick={onVoltar}>
            <ArrowLeft size={18} aria-hidden />
          </button>
        )}
        <div>
          {sobre && <span className="lv-legenda">{sobre}</span>}
          <h1 className="lc-passo__titulo">{titulo}</h1>
        </div>
      </header>
      {passo != null && total != null && (
        <div className="lc-progresso" role="progressbar" aria-label="Progresso" aria-valuemin={1} aria-valuemax={total} aria-valuenow={passo}>
          {Array.from({ length: total }, (_, i) => <span key={i} className={i < passo ? 'lc-progresso--feito' : undefined} />)}
        </div>
      )}
      <div className="lc-passo__corpo">{children}</div>
      {acao && <div className="lc-passo__acao">{acao}</div>}
    </main>
  );
}

/* ── Boas-vindas (convite) ─────────────────────────────────────────────── */
export function BoasVindas() {
  const { token } = useParams<{ token?: string }>();
  const navigate = useNavigate();
  const { sessao } = useSessao();
  useEffect(() => { if (token) guardarPendente({ convite: token }); }, [token]);
  return (
    <main className="lc-passo">
      <section className="lc-boasvindas">
        {token && <span className="lc-boasvindas__selo">Recebeste um convite</span>}
        <h1 className="lc-boasvindas__titulo">Olá. Bem-vindo.</h1>
        <p style={{ margin: 0 }}>A tua conta fica pronta em 3 minutos.</p>
      </section>
      <Nota>Só os termos são obrigatórios. A partilha de saúde e as novidades são escolhas tuas, e podes mudar quando quiseres.</Nota>
      <div className="lc-passo__acao">
        <Botao fixo onClick={() => navigate(sessao ? '/conta/consentimentos' : '/criar-conta')}>
          {sessao ? 'Continuar' : 'Criar a minha conta'}
        </Botao>
        {!sessao && <Botao variante="secundario" fixo onClick={() => navigate('/entrar')}>Já tenho conta</Botao>}
      </div>
    </main>
  );
}

/* ── Criar conta / entrar ──────────────────────────────────────────────── */
export function CriarContaCliente() {
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviado, setEnviado] = useState(false);
  const [aCarregar, setACarregar] = useState(false);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try {
      await criarContaCliente(client, { nome, email, password, nascimento, redirectTo: `${window.location.origin}/conta/consentimentos` });
      setEnviado(true);
    } catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível criar a conta.'); }
    finally { setACarregar(false); }
  };
  if (enviado) {
    return (
      <Passo titulo="Confirma o teu email" onVoltar={() => navigate('/')}>
        <p role="status">Enviámos um link para {email}. Abre-o neste telemóvel para continuar.</p>
      </Passo>
    );
  }
  return (
    <Passo sobre="Passo 1 de 4" titulo="A tua conta" passo={1} total={4} onVoltar={() => navigate('/')}
      acao={<Botao type="submit" form="lc-criar" fixo aCarregar={aCarregar}>Continuar</Botao>}>
      <form id="lc-criar" onSubmit={(e) => void criar(e)} className="lc-campos">
        <Campo rotulo="Nome" autoComplete="name" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Data de nascimento" type="date" value={nascimento} onChange={(e) => setNascimento(e.target.value)} required
          ajuda="Se tiveres menos de 18 anos, pedimos o consentimento ao teu encarregado de educação." />
        <Campo rotulo="Palavra-passe" type="password" autoComplete="new-password" minLength={10} value={password}
          onChange={(e) => setPassword(e.target.value)} ajuda="Pelo menos 10 caracteres." required />
        {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
      </form>
    </Passo>
  );
}

/** Para onde seguir depois de entrar: o pedido do encarregado ou os consentimentos. */
// Com convite ou pedido de encarregado por acabar, segue esse caminho; senão abre a app
const depoisDeEntrar = () => {
  const p = lerPendente();
  return p.tutela ? `/encarregado/${p.tutela}` : p.convite ? '/conta/consentimentos' : '/hoje';
};

// Entrar (X-01, C-01): email e palavra-passe logo à primeira, como na Gestão.
// O código por email ficou de fora: confundia e ainda não há envio de email.
export function EntrarCliente() {
  return <EntrarComPalavraPasse />;
}

function EntrarComPalavraPasse() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try { await signInWithPassword(client, email, password); navigate(depoisDeEntrar()); }
    catch { setErro('Email ou palavra-passe errados.'); }
    finally { setACarregar(false); }
  };
  return (
    <Passo titulo="Entrar" onVoltar={() => navigate('/')}
      acao={<Botao type="submit" form="lc-entrar" fixo aCarregar={aCarregar}>Entrar</Botao>}>
      <form id="lc-entrar" onSubmit={(e) => void entrar(e)} className="lc-campos">
        <Campo rotulo="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Palavra-passe" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
      </form>
    </Passo>
  );
}

/* ── Consentimentos separados ──────────────────────────────────────────── */
export function Consentimentos() {
  const navigate = useNavigate();
  const [termos, setTermos] = useState(false);
  const [saude, setSaude] = useState(true);
  const [novidades, setNovidades] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const continuar = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    if (!termos) { setErro('Para usar a app tens de aceitar os termos e o regulamento.'); return; }
    setACarregar(true); setErro(null);
    try {
      await registarConsentimento(client, 'termos', true);
      await registarConsentimento(client, 'privacidade', true);
      await registarConsentimento(client, 'dados_saude', saude);
      await registarConsentimento(client, 'comunicacoes', novidades);
      navigate(lerPendente().convite ? '/conta/partilhas' : '/conta/parq');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
    finally { setACarregar(false); }
  };
  return (
    <Passo sobre="Passo 2 de 4" titulo="O que aceitas" passo={2} total={4}
      acao={<Botao fixo onClick={() => void continuar()} aCarregar={aCarregar}>Continuar</Botao>}>
      <div className="lc-escolhas">
        <Escolha titulo="Termos e regulamento" texto="Obrigatório: contrato, regulamento e privacidade." ligado={termos} onMudar={setTermos} />
        <Escolha titulo={`Saúde com o meu ${t('responsavel')}`} texto="Guardar o questionário de saúde para adaptar o treino." ligado={saude} onMudar={setSaude} />
        <Escolha titulo="Novidades e campanhas" texto="Por email e na app. Podes mudar quando quiseres." ligado={novidades} onMudar={setNovidades} />
      </div>
      {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
    </Passo>
  );
}

function Escolha({ titulo, texto, ligado, onMudar }: { titulo: string; texto: string; ligado: boolean; onMudar: (v: boolean) => void }) {
  return (
    <div className="lc-escolha">
      <div><b>{titulo}</b><p className="lv-legenda" style={{ margin: 0 }}>{texto}</p></div>
      <Interruptor ligado={ligado} onMudar={onMudar} rotulo={ligado ? 'Ligado' : 'Desligado'} />
    </div>
  );
}

/* ── O que partilhas com quem te convidou ──────────────────────────────── */
const PARTILHAS: { id: Partilha; titulo: string; texto: string }[] = [
  { id: 'training', titulo: 'Treinos feitos', texto: 'Séries, cargas e sessões.' },
  { id: 'measurements', titulo: 'Medidas', texto: 'Peso, perímetros e testes.' },
  { id: 'checkins', titulo: 'Check-ins', texto: 'Como te sentes, sono e energia.' },
  { id: 'photos', titulo: 'Fotos de progresso', texto: 'Só para quem te acompanha.' },
  { id: 'health', titulo: 'Saúde', texto: 'Alergias, lesões e restrições, para quem tem papel clínico.' },
];

export function Partilhas() {
  const navigate = useNavigate();
  const [escolhas, setEscolhas] = useState<Set<Partilha>>(new Set(['training', 'measurements', 'checkins']));
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const continuar = async () => {
    const client = getSupabaseClient();
    const token = lerPendente().convite;
    if (!client || !token) { navigate('/conta/parq'); return; }
    setACarregar(true); setErro(null);
    try {
      const r = await aceitarConviteCliente(client, token, [...escolhas]);
      limparPendente('convite');
      navigate(r === 'a_espera_encarregado' ? '/conta/encarregado' : '/conta/parq');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível aceitar o convite.'); }
    finally { setACarregar(false); }
  };
  return (
    <Passo sobre="Passo 3 de 4" titulo="O que partilhas" passo={3} total={4}
      acao={<Botao fixo onClick={() => void continuar()} aCarregar={aCarregar}>Continuar</Botao>}>
      <p className="lv-legenda" style={{ margin: 0 }}>Quem te convidou vê só o que ligares. Podes mudar ou desligar a qualquer momento.</p>
      <div className="lc-escolhas">
        {PARTILHAS.map((p) => (
          <Escolha key={p.id} titulo={p.titulo} texto={p.texto} ligado={escolhas.has(p.id)}
            onMudar={(v) => setEscolhas((s) => { const n = new Set(s); if (v) n.add(p.id); else n.delete(p.id); return n; })} />
        ))}
      </div>
      {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
    </Passo>
  );
}

/* ── Menor: pedir o encarregado (J31) ──────────────────────────────────── */
export function PedirEncarregado() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [telefone, setTelefone] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try { await pedirEncarregado(client, email, telefone); setEnviado(true); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível enviar o pedido.'); }
    finally { setACarregar(false); }
  };
  return enviado ? (
    <Passo titulo="Pedido enviado" acao={<Botao fixo onClick={() => navigate('/conta/parq')}>Continuar</Botao>}>
      <p role="status">O teu encarregado recebe um email{telefone ? ' e um SMS' : ''}. A ligação fica à espera até ele autorizar; entretanto podes responder ao questionário de saúde.</p>
    </Passo>
  ) : (
    <Passo titulo="O teu encarregado de educação"
      acao={<Botao type="submit" form="lc-enc" fixo aCarregar={aCarregar}>Enviar pedido</Botao>}>
      <Nota>Tens menos de 18 anos: precisamos do consentimento do teu encarregado. Ele autoriza com a conta dele e vê só o que escolheres partilhar.</Nota>
      <form id="lc-enc" onSubmit={(e) => void enviar(e)} className="lc-campos">
        <Campo rotulo="Email do encarregado" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Campo rotulo="Telemóvel do encarregado (opcional)" type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
        {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
      </form>
    </Passo>
  );
}

/* ── PAR-Q: uma pergunta por ecrã ──────────────────────────────────────── */
export function Parq() {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, boolean>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(false);
  const q = PARQ[i];
  const resposta = respostas[q.id];
  const seguinte = async () => {
    if (i < PARQ.length - 1) { setI(i + 1); return; }
    const client = getSupabaseClient();
    if (!client) return;
    setACarregar(true); setErro(null);
    try {
      const risco = await enviarParq(client, respostas);
      navigate(risco ? '/conta/pronto?atestado=1' : '/conta/pronto');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível guardar.'); }
    finally { setACarregar(false); }
  };
  return (
    <Passo sobre={`Questionário de saúde · ${i + 1} de ${PARQ.length}`} titulo="PAR-Q" passo={i + 1} total={PARQ.length}
      onVoltar={i > 0 ? () => setI(i - 1) : undefined}
      acao={<Botao fixo disabled={resposta === undefined} aCarregar={aCarregar} onClick={() => void seguinte()}>
        {i < PARQ.length - 1 ? 'Seguinte' : 'Concluir'}</Botao>}>
      <fieldset className="lc-pergunta">
        <legend className="lc-pergunta__texto">{q.pergunta}</legend>
        {[false, true].map((v) => (
          <label key={String(v)} className={`lc-opcao${resposta === v ? ' lc-opcao--on' : ''}`}>
            <input type="radio" name={q.id} checked={resposta === v} onChange={() => setRespostas((r) => ({ ...r, [q.id]: v }))} />
            {v ? 'Sim' : 'Não'}
          </label>
        ))}
      </fieldset>
      {resposta === true && <Nota>Vais precisar de um atestado médico antes de treinar. Podes enviá-lo depois, aqui na app.</Nota>}
      {erro && <p className="lv-campo-erro" role="alert">{erro}</p>}
    </Passo>
  );
}

/* ── Pronto ────────────────────────────────────────────────────────────── */
export function Pronto() {
  const { sessao } = useSessao();
  const [conta, setConta] = useState<MinhaConta | null>(null);
  const atestado = new URLSearchParams(window.location.search).get('atestado') === '1';
  useEffect(() => {
    const client = getSupabaseClient();
    if (client && sessao) void minhaConta(client, sessao.user.id).then(setConta).catch(() => setConta(null));
  }, [sessao]);
  return (
    <Passo titulo="A tua conta está pronta" acao={<Botao fixo onClick={() => window.location.assign('/hoje')}>Ir para a app</Botao>}>
      {conta?.aEsperaEncarregado && <Nota>A ligação ao teu {t('responsavel')} fica à espera da autorização do teu encarregado.</Nota>}
      {atestado && <Nota>Antes do primeiro treino, o teu {t('responsavel')} precisa do atestado médico. Já recebeu o aviso, sem ver as tuas respostas.</Nota>}
      <p className="lv-legenda">O teu plano e {g(t('sessao', { plural: true }), 'as tuas', 'os teus')} aparecem no Hoje assim que o teu {t('responsavel')} os atribuir.</p>
      <p className="lv-legenda">Ainda não tens {t('responsavel')}? <a className="lc-link" href="/sozinho">Começa sozinho</a>, de graça, e liga-te a um quando quiseres.</p>
    </Passo>
  );
}
