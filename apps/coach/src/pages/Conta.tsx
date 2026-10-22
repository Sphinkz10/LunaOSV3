import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  fetchEntradas, fetchPerfil, guardarPerfil, guardarPreferencias, listarFatores, mudarPalavraPasse, removerFator,
  definirConsentimentoAnalise, fetchConsentimentoAnalise, meuCodigoDeTreinador, terminarOutrasSessoes, toast, useAuthStore,
  type Entrada, type FatorAtivo, type Perfil, type Preferencias,
} from '@luna/core';
import { Avatar, Botao, Campo, Chip, Esqueleto, EstadoPagina, Interruptor, Janela, Nota } from '@luna/ui/v3';
import { ChartLineUp, LockKey, ShieldCheck, SignOut } from '@luna/icons';
import { CoachShell } from '../app/CoachShell';
import { useScope } from '../app/ModuleLayout';
import { signOutEverywhere } from '../app/session';
import { getSupabaseClient } from '../lib/supabase';

const PAPEL: Record<string, string> = {
  owner: 'Dono', admin: 'Gerência', manager: 'Gerência', coach: 'PT', instructor: 'Instrutor', reception: 'Receção',
  physio: 'Fisioterapia', nutritionist: 'Nutrição',
};
const TEMAS: { id: NonNullable<Preferencias['tema']>; nome: string }[] = [
  { id: 'oceano', nome: 'Oceano' }, { id: 'ouro', nome: 'Ouro' }, { id: 'limao', nome: 'Limão' },
];
const FUSOS = ['Europe/Lisbon', 'Atlantic/Madeira', 'Atlantic/Azores', 'Europe/Madrid', 'Europe/London', 'America/Sao_Paulo'];
const quando = (iso: string) => new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * A minha conta (G-00, Figma 180:2): perfil, segurança, sessões abertas e
 * preferências. A conta é de cada pessoa; o papel continua a ser dado pela
 * gerência em Equipa (G-44). As preferências seguem a pessoa entre aparelhos.
 */
export function Conta() {
  const scope = useScope();
  const userId = useAuthStore((s) => s.userId) ?? '';
  const me = useAuthStore((s) => s.me);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [fatores, setFatores] = useState<FatorAtivo[]>([]);
  const [entradas, setEntradas] = useState<Entrada[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editar, setEditar] = useState(false);
  const [palavra, setPalavra] = useState(false);
  const [ativar2f, setAtivar2f] = useState<{ id: string; qr: string } | null>(null);

  const carregar = useCallback(() => {
    const client = getSupabaseClient();
    if (!client || !userId) return;
    setErro(null);
    void Promise.all([fetchPerfil(client, userId), listarFatores(client), fetchEntradas(client)])
      .then(([p, f, e]) => { setPerfil(p.perfil); setPrefs(p.prefs); setFatores(f); setEntradas(e); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Erro'));
  }, [userId]);
  useEffect(() => carregar(), [carregar]);

  /** Grava logo cada preferência; o tema e a densidade mudam a página já. */
  const mudarPref = async (p: Partial<Preferencias>) => {
    const client = getSupabaseClient();
    if (!client || !prefs) return;
    const antes = prefs;
    setPrefs({ ...prefs, ...p });
    if ('tema' in p || 'density' in p) {
      useAuthStore.getState().setMe(me ? { ...me, tema: p.tema !== undefined ? p.tema : me.tema, densidade: p.density ?? me.densidade } : me);
    }
    try { await guardarPreferencias(client, userId, p); }
    catch (e) {
      setPrefs(antes);
      toast({ variant: 'danger', title: 'Não foi possível guardar', description: e instanceof Error ? e.message : undefined });
    }
  };

  const terminarOutras = async () => {
    const client = getSupabaseClient();
    if (!client) return;
    try { await terminarOutrasSessoes(client); toast({ variant: 'success', title: 'As outras sessões foram terminadas', description: 'Este aparelho continua com sessão aberta.' }); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível terminar as outras sessões', description: e instanceof Error ? e.message : undefined }); }
  };

  const mudar2f = async (ligar: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    if (ligar) {
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `LunaOS ${new Date().toISOString().slice(0, 10)}` });
      if (error || !data) { toast({ variant: 'danger', title: 'Não foi possível preparar os dois passos', description: error?.message }); return; }
      setAtivar2f({ id: data.id, qr: data.totp.qr_code });
      return;
    }
    if (scope.permissions.includes('health.read')) {
      toast({ variant: 'warning', title: 'O teu papel exige dois passos', description: 'Quem vê dados de saúde não pode desligar a verificação em dois passos.' });
      return;
    }
    try { for (const f of fatores) await removerFator(client, f.id); toast({ variant: 'success', title: 'Verificação em dois passos desligada' }); carregar(); }
    catch (e) { toast({ variant: 'danger', title: 'Não foi possível desligar', description: e instanceof Error ? e.message : 'Confirma primeiro o código da app.' }); }
  };

  const papeis = scope.roles.map((r) => PAPEL[r] ?? r).join(' · ');

  return (
    <CoachShell headStrong="A minha conta" headSub={scope.orgName} legado={false}>
      <div className="lv-root lg-conta">
        {erro ? <EstadoPagina tipo="erro" titulo="Não foi possível carregar" texto={erro} acao={{ rotulo: 'Tentar de novo', onClick: carregar }} />
          : !perfil || !prefs ? <div className="lv-lista"><Esqueleto /></div>
          : (
            <div className="lg-conta__grelha">
              <div className="lg-conta__coluna">
                <h2 className="lv-sobretitulo">Perfil</h2>
                <section className="lv-lista" aria-label="Perfil">
                  <div className="lg-conta__eu">
                    <Avatar nome={perfil.nome} foto={me?.avatarUrl} tamanho={48} />
                    <span>
                      <span className="lv-linha-lista__titulo">{perfil.nome}</span>
                      <span className="lv-legenda" style={{ display: 'block' }}>{papeis} · {scope.orgName}</span>
                    </span>
                  </div>
                  <dl className="lg-conta__dados">
                    <dt>Email</dt><dd>{perfil.email ?? '—'}</dd>
                    <dt>Telemóvel</dt><dd>{perfil.telefone ?? '—'}</dd>
                    <dt>Papel</dt><dd>{papeis} · dado pela gerência</dd>
                  </dl>
                  <div><Botao variante="secundario" onClick={() => setEditar(true)}>Editar perfil</Botao></div>
                </section>

                <h2 className="lv-sobretitulo">Segurança</h2>
                <section className="lv-lista" aria-label="Segurança">
                  <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <LockKey size={18} aria-hidden />
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">Palavra-passe</span>
                      <span className="lv-legenda">Pelo menos 10 caracteres</span>
                    </span>
                    <Botao variante="secundario" onClick={() => setPalavra(true)}>Mudar</Botao>
                  </div>
                  <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <ShieldCheck size={18} aria-hidden />
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">Verificação em dois passos</span>
                      <span className="lv-legenda">{fatores.length > 0 ? 'App de autenticação' : 'Desligada'}</span>
                    </span>
                    <Interruptor rotulo="Verificação em dois passos" ligado={fatores.length > 0} onMudar={(v) => void mudar2f(v)} />
                  </div>
                  <AnaliseConta />
                  <CodigoTreinador />
                </section>
              </div>

              <div className="lg-conta__coluna">
                <h2 className="lv-sobretitulo">Sessões abertas</h2>
                <section className="lv-lista" aria-label="Sessões abertas">
                  <div className="lv-linha-lista" style={{ cursor: 'default' }}>
                    <span className="lg-conta__ponto lg-conta__ponto--ativo" aria-hidden />
                    <span className="lv-linha-lista__corpo">
                      <span className="lv-linha-lista__titulo">Este aparelho</span>
                      <span className="lv-legenda">agora</span>
                    </span>
                  </div>
                  {entradas.slice(1, 6).map((e) => (
                    <div key={e.id} className="lv-linha-lista" style={{ cursor: 'default' }}>
                      <span className="lg-conta__ponto" aria-hidden />
                      <span className="lv-linha-lista__corpo">
                        <span className="lv-linha-lista__titulo">{e.aparelho ?? 'Aparelho'}</span>
                        <span className="lv-legenda">{quando(e.em)}{e.sucesso ? '' : ' · tentativa falhada'}</span>
                      </span>
                    </div>
                  ))}
                  <Botao variante="secundario" onClick={() => void terminarOutras()}>Terminar as outras</Botao>
                </section>
                <Botao variante="secundario" icone={SignOut} onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</Botao>
              </div>

              <div className="lg-conta__coluna">
                <h2 className="lv-sobretitulo">Preferências</h2>
                <div className="lg-conta__prefs">
                  <label className="lv-campo">
                    <span className="lv-campo-rotulo">Idioma</span>
                    <select className="lv-campo-input" value={prefs.language} onChange={(e) => void mudarPref({ language: e.target.value })}>
                      <option value="pt-PT">Português (Portugal)</option>
                      <option value="en">English</option>
                    </select>
                  </label>
                  <label className="lv-campo">
                    <span className="lv-campo-rotulo">Fuso</span>
                    <select className="lv-campo-input" value={perfil.fuso} onChange={(e) => {
                      const client = getSupabaseClient();
                      const fuso = e.target.value;
                      setPerfil({ ...perfil, fuso });
                      if (client) void guardarPerfil(client, userId, { nome: perfil.nome, telefone: perfil.telefone, fuso });
                    }}>
                      {[...new Set([perfil.fuso, ...FUSOS])].map((f) => <option key={f} value={f}>{f.split('/').pop()!.replace('_', ' ')}</option>)}
                    </select>
                  </label>
                  <label className="lv-campo">
                    <span className="lv-campo-rotulo">Formato de data</span>
                    <select className="lv-campo-input" value={prefs.date_format} onChange={(e) => void mudarPref({ date_format: e.target.value })}>
                      <option value="DD/MM/YYYY">16/10/2025</option>
                      <option value="YYYY-MM-DD">2025-10-16</option>
                      <option value="D MMM YYYY">16 out 2025</option>
                    </select>
                  </label>
                  <label className="lv-campo">
                    <span className="lv-campo-rotulo">Primeiro dia</span>
                    <select className="lv-campo-input" value={prefs.week_start} onChange={(e) => void mudarPref({ week_start: Number(e.target.value) })}>
                      <option value={1}>Segunda</option>
                      <option value={0}>Domingo</option>
                    </select>
                  </label>
                </div>
                <h2 className="lv-sobretitulo">Tema</h2>
                <div className="lg-conta__temas" role="radiogroup" aria-label="Tema">
                  {TEMAS.map((t) => (
                    <button key={t.id} type="button" role="radio" aria-checked={(prefs.tema ?? scope.theme) === t.id}
                      className="lg-conta__tema" onClick={() => void mudarPref({ tema: t.id })}>
                      <span aria-hidden data-tema={t.id} className="lg-conta__amostra"><i /><i /></span>{t.nome}
                    </button>
                  ))}
                </div>
                {prefs.tema && <button type="button" className="lg-link" onClick={() => void mudarPref({ tema: null })}>Usar o tema da organização</button>}
                <h2 className="lv-sobretitulo">Densidade</h2>
                <div style={{ display: 'flex', gap: 'var(--espaco-8)' }}>
                  <Chip ativo={prefs.density !== 'compact'} onClick={() => void mudarPref({ density: 'comfortable' })}>Normal</Chip>
                  <Chip ativo={prefs.density === 'compact'} onClick={() => void mudarPref({ density: 'compact' })}>Compacta</Chip>
                </div>
              </div>
            </div>
          )}
      </div>

      {perfil && <EditarPerfil aberta={editar} perfil={perfil} onFechar={() => setEditar(false)}
        onGuardado={(p) => { setPerfil(p); if (me) useAuthStore.getState().setMe({ ...me, name: p.nome }); }} userId={userId} />}
      <MudarPalavra aberta={palavra} onFechar={() => setPalavra(false)} />
      <Ativar2f pedido={ativar2f} onFechar={() => setAtivar2f(null)} onAtivado={() => { setAtivar2f(null); carregar(); }} />
    </CoachShell>
  );
}

function EditarPerfil({ aberta, perfil, userId, onFechar, onGuardado }: {
  aberta: boolean; perfil: Perfil; userId: string; onFechar: () => void; onGuardado: (p: Perfil) => void;
}) {
  const [nome, setNome] = useState(perfil.nome);
  const [telefone, setTelefone] = useState(perfil.telefone ?? '');
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (aberta) { setNome(perfil.nome); setTelefone(perfil.telefone ?? ''); } }, [aberta, perfil]);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !nome.trim()) return;
    setAGravar(true);
    try {
      await guardarPerfil(client, userId, { nome: nome.trim(), telefone: telefone.trim() || null, fuso: perfil.fuso });
      onGuardado({ ...perfil, nome: nome.trim(), telefone: telefone.trim() || null });
      toast({ variant: 'success', title: 'Perfil guardado' });
      onFechar();
    } catch (err) { toast({ variant: 'danger', title: 'Não foi possível guardar', description: err instanceof Error ? err.message : undefined }); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Editar perfil" sub="O email muda-se com a gerência, porque é com ele que entras.">
      <form onSubmit={(e) => void guardar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Nome" value={nome} onChange={(e) => setNome(e.target.value)} required autoComplete="name" />
        <Campo rotulo="Telemóvel" value={telefone} onChange={(e) => setTelefone(e.target.value)} inputMode="tel" autoComplete="tel" />
        <Botao type="submit" aCarregar={aGravar}>Guardar</Botao>
      </form>
    </Janela>
  );
}

function MudarPalavra({ aberta, onFechar }: { aberta: boolean; onFechar: () => void }) {
  const [nova, setNova] = useState('');
  const [repetir, setRepetir] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { if (aberta) { setNova(''); setRepetir(''); setErro(null); } }, [aberta]);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client) return;
    if (nova !== repetir) { setErro('As duas palavras-passe não são iguais.'); return; }
    setAGravar(true); setErro(null);
    try { await mudarPalavraPasse(client, nova); toast({ variant: 'success', title: 'Palavra-passe mudada' }); onFechar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Não foi possível mudar.'); }
    finally { setAGravar(false); }
  };
  return (
    <Janela aberta={aberta} onFechar={onFechar} titulo="Mudar palavra-passe">
      <form onSubmit={(e) => void guardar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Campo rotulo="Nova palavra-passe" type="password" value={nova} onChange={(e) => setNova(e.target.value)} autoComplete="new-password" minLength={10} required ajuda="Pelo menos 10 caracteres" />
        <Campo rotulo="Repetir" type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} autoComplete="new-password" required erro={erro} />
        <Botao type="submit" aCarregar={aGravar}>Mudar palavra-passe</Botao>
      </form>
    </Janela>
  );
}

function Ativar2f({ pedido, onFechar, onAtivado }: { pedido: { id: string; qr: string } | null; onFechar: () => void; onAtivado: () => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { setCodigo(''); setErro(null); }, [pedido]);
  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !pedido) return;
    setAGravar(true); setErro(null);
    const { error } = await client.auth.mfa.challengeAndVerify({ factorId: pedido.id, code: codigo });
    setAGravar(false);
    if (error) { setErro('Código errado ou expirado.'); return; }
    toast({ variant: 'success', title: 'Verificação em dois passos ligada' });
    onAtivado();
  };
  return (
    <Janela aberta={!!pedido} onFechar={onFechar} titulo="Ligar verificação em dois passos">
      <form onSubmit={(e) => void confirmar(e)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--espaco-12)' }}>
        <Nota>Lê o código com uma app de autenticação (Google Authenticator, 1Password, Authy) e escreve os 6 dígitos.</Nota>
        {pedido && <img src={pedido.qr} alt="Código QR para a app de autenticação" width={180} height={180} style={{ alignSelf: 'center' }} />}
        <Campo rotulo="Código de 6 dígitos" value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric" autoComplete="one-time-code" required erro={erro} />
        <Botao type="submit" aCarregar={aGravar} disabled={codigo.length !== 6}>Ligar</Botao>
      </form>
    </Janela>
  );
}

/** Análise anónima (T28): quem recusa fica fora de qualquer métrica individual. */
function AnaliseConta() {
  const [sim, setSim] = useState<boolean | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    void fetchConsentimentoAnalise(client).then(setSim).catch(() => setSim(null));
  }, []);
  if (sim === null) return null;
  const mudar = (v: boolean) => {
    const client = getSupabaseClient();
    if (!client) return;
    setSim(v);
    void definirConsentimentoAnalise(client, v).catch(() => { setSim(!v); toast({ variant: 'danger', title: 'Não foi possível mudar' }); });
  };
  return (
    <div className="lv-linha-lista" style={{ cursor: 'default' }}>
      <ChartLineUp size={18} aria-hidden />
      <span className="lv-linha-lista__corpo">
        <span className="lv-linha-lista__titulo">Ajudar a melhorar a LunaOS</span>
        <span className="lv-legenda">Contamos o uso sem nomes, notas nem dados de saúde</span>
      </span>
      <Interruptor rotulo="Ajudar a melhorar a LunaOS" ligado={sim} onMudar={mudar} />
    </div>
  );
}

/** O código que os atletas usam para pedir para treinar contigo (C-27). */
function CodigoTreinador() {
  const scope = useAuthStore((st) => st.scope);
  const [codigo, setCodigo] = useState<string | null>(null);
  const pedir = (novo: boolean) => {
    const client = getSupabaseClient();
    if (!client || !scope) return;
    void meuCodigoDeTreinador(client, scope, novo).then(setCodigo).catch(() => setCodigo(null));
  };
  useEffect(() => { pedir(false); }, [scope?.orgId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!codigo) return null;
  return (
    <div className="lv-linha-lista" style={{ cursor: 'default' }}>
      <span className="lv-linha-lista__corpo">
        <span className="lv-linha-lista__titulo">O teu código de treinador: <b>{codigo}</b></span>
        <span className="lv-legenda">Quem treina sozinho na app usa-o para pedir para treinar contigo. Aceitas na Inbox.</span>
      </span>
      <Botao variante="secundario" onClick={() => pedir(true)}>Gerar outro</Botao>
    </div>
  );
}
