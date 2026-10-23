import { useState, type FormEvent } from 'react';
import { COMO_TRABALHO, MODALIDADES_REGISTO, PLANOS, criarNegocio, reclamarConviteDeAtleta, toast, type ComoTrabalho } from '@luna/core';
import { Botao, Campo, Chip, Nota } from '@luna/ui/v3';
import { Buildings, User, UsersThree } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';
import './gestao.css';

export const CHAVE_CONVITE_ATLETA = 'luna.convite-atleta';
/** Guarda o convite de um atleta (?convite_atleta=…) até a organização existir. */
export function guardarConviteDeAtleta(): void {
  const t = new URLSearchParams(window.location.search).get('convite_atleta');
  if (t) { try { localStorage.setItem(CHAVE_CONVITE_ATLETA, t); } catch { /* sem armazenamento */ } }
}

const ICONE: Record<ComoTrabalho, typeof User> = { solo_coach: User, studio: UsersThree, gym: Buildings };

/**
 * X-04 · Criar conta de treinador (J32), passos 2 a 4 (o 1 é a conta, que se
 * reaproveita se a pessoa já for atleta): como trabalhas e desporto, nome e
 * unidade, convidar. Começa o período experimental de 30 dias; se chegou por
 * convite de um atleta, o atleta fica ligado logo.
 */
export function CriarNegocio() {
  const [passo, setPasso] = useState<2 | 3 | 4>(2);
  const [como, setComo] = useState<ComoTrabalho>('solo_coach');
  const [modalidades, setModalidades] = useState<string[]>(['fitness']);
  const [nome, setNome] = useState('');
  const [unidade, setUnidade] = useState('');
  const [aCriar, setACriar] = useState(false);
  const [atletaLigado, setAtletaLigado] = useState(false);
  const plano = COMO_TRABALHO.find((c) => c.id === como)!.plano;
  const alternar = (id: string) => setModalidades((m) => (m.includes(id) ? (m.length > 1 ? m.filter((x) => x !== id) : m) : [...m, id]));

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !nome.trim()) return;
    setACriar(true);
    try {
      const org = await criarNegocio(client, { nome, como, modalidades, unidade: como === 'solo_coach' ? undefined : unidade });
      let token: string | null = null;
      try { token = localStorage.getItem(CHAVE_CONVITE_ATLETA); } catch { /* idem */ }
      if (token) {
        const ok = await reclamarConviteDeAtleta(client, org, token).then(() => true).catch(() => false);
        setAtletaLigado(ok);
        try { localStorage.removeItem(CHAVE_CONVITE_ATLETA); } catch { /* idem */ }
      }
      setPasso(4);
    } catch (err) {
      toast({ variant: 'danger', title: 'Não foi possível criar', description: err instanceof Error ? err.message : undefined });
    } finally { setACriar(false); }
  };
  const ir = (para: string) => window.location.assign(para);

  return (
    <main className="lv-root lg-entrar">
      <section className="lg-entrar__destaque lg-entrar__destaque--registo" aria-hidden>
        <span className="lg-entrar__marca">Período experimental</span>
        <p className="lg-entrar__frase">Começa hoje.<br />Paga quando fizer sentido.</p>
        <p className="lg-entrar__lead">Os teus clientes usam a app de graça. Pagas por treinador quando o período experimental acabar.</p>
      </section>
      <section className="lg-entrar__form">
        <div className="lg-logo"><span className="lg-logo__lua" aria-hidden /><span className="lg-logo__texto">LunaOS</span></div>
        <span className="lv-sobretitulo">Passo {passo} de 4</span>
        {passo === 2 && (
          <div className="lg-entrar__campos">
            <h1 className="lv-titulo-ecra" style={{ margin: 0 }}>Como trabalhas?</h1>
            <div role="radiogroup" aria-label="Como trabalhas" className="lg-registo__opcoes">
              {COMO_TRABALHO.map((c) => {
                const Icone = ICONE[c.id];
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={como === c.id} className={`lg-registo__opcao${como === c.id ? ' lg-registo__opcao--ativa' : ''}`} onClick={() => setComo(c.id)}>
                    <span className="lc-lista__icone"><Icone size={18} aria-hidden /></span>
                    <span className="lv-linha-lista__corpo"><span className="lv-linha-lista__titulo">{c.titulo}</span><span className="lv-legenda">{c.texto}</span></span>
                    <span className="lv-pill">{PLANOS[c.plano].nome}</span>
                  </button>
                );
              })}
            </div>
            <span className="lv-sobretitulo">Desporto</span>
            <div className="lg-ficha__metricas" role="group" aria-label="Desporto">
              {MODALIDADES_REGISTO.map((m) => (
                <Chip key={m.id} aria-pressed={modalidades.includes(m.id)} ativo={modalidades.includes(m.id)} onClick={() => alternar(m.id)}>
                  {m.nome}{m.pronta ? '' : ' · em breve'}
                </Chip>
              ))}
            </div>
            {modalidades.some((m) => !MODALIDADES_REGISTO.find((x) => x.id === m)?.pronta) && (
              <Nota>Ficas na lista de espera dessas modalidades e começas com a configuração de fitness. Não bloqueia nada.</Nota>
            )}
            <Botao fixo onClick={() => setPasso(3)}>Continuar</Botao>
            <p className="lv-legenda" style={{ margin: 0, textAlign: 'center' }}>Já tens conta de atleta? Usa a mesma e ganhas o papel de treinador.</p>
          </div>
        )}
        {passo === 3 && (
          <form className="lg-entrar__campos" onSubmit={(e) => void criar(e)}>
            <h1 className="lv-titulo-ecra" style={{ margin: 0 }}>{como === 'solo_coach' ? 'Como te chamam os clientes?' : 'Nome e unidade'}</h1>
            <p className="lv-legenda" style={{ margin: 0 }}>30 dias para experimentar, sem cartão. Plano sugerido: {PLANOS[plano].nome}.</p>
            <Campo rotulo={como === 'solo_coach' ? 'Nome que os clientes veem' : como === 'gym' ? 'Nome do ginásio' : 'Nome do estúdio ou box'}
              placeholder={como === 'solo_coach' ? 'Ex.: Tomás Reis PT' : 'Ex.: Estúdio Alvalade'} value={nome} onChange={(e) => setNome(e.target.value)} required />
            {como !== 'solo_coach' && (
              <Campo rotulo="Primeira unidade" placeholder="Ex.: Alvalade" value={unidade} onChange={(e) => setUnidade(e.target.value)} />
            )}
            <Nota>Se trabalhas num sítio que já usa o LunaOS, pede antes o convite a quem gere a equipa.</Nota>
            <Botao type="submit" fixo aCarregar={aCriar} disabled={!nome.trim()}>Começar o período experimental</Botao>
            <button type="button" className="lg-entrar__link" onClick={() => setPasso(2)}>Voltar</button>
          </form>
        )}
        {passo === 4 && (
          <div className="lg-entrar__campos">
            <h1 className="lv-titulo-ecra" style={{ margin: 0 }}>{como === 'gym' ? 'Ginásio criado' : 'Convida quem vai trabalhar contigo'}</h1>
            {atletaLigado && <Nota>O atleta que te convidou já está ligado a ti.</Nota>}
            {como === 'gym' ? (
              <>
                <p className="lv-legenda" style={{ margin: 0 }}>Agora as unidades, salas e a equipa. O primeiro uso completo do ginásio chega na fase seguinte.</p>
                <Botao fixo onClick={() => ir('/settings/ginasio')}>Configurar o ginásio</Botao>
              </>
            ) : (
              <>
                <p className="lv-legenda" style={{ margin: 0 }}>Os clientes usam a app de graça e são ilimitados.</p>
                <Botao fixo onClick={() => ir('/clients?novo=1')}>Acrescentar clientes</Botao>
                {como === 'studio' && <Botao variante="secundario" onClick={() => ir('/settings/equipa')}>Convidar a equipa</Botao>}
              </>
            )}
            <button type="button" className="lg-entrar__link" onClick={() => ir('/today')}>Fazer isto mais tarde</button>
          </div>
        )}
        {passo !== 4 && <button type="button" className="lg-entrar__link" onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</button>}
      </section>
    </main>
  );
}
