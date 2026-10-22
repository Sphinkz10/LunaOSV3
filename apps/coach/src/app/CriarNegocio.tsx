import { useState, type FormEvent } from 'react';
import { reclamarConviteDeAtleta, toast } from '@luna/core';
import { Botao, Campo, Chip, Nota } from '@luna/ui/v3';
import { getSupabaseClient } from '../lib/supabase';
import { signOutEverywhere } from './session';

export const CHAVE_CONVITE_ATLETA = 'luna.convite-atleta';
/** Guarda o convite de um atleta (?convite_atleta=…) até a organização existir. */
export function guardarConviteDeAtleta(): void {
  const t = new URLSearchParams(window.location.search).get('convite_atleta');
  if (t) { try { localStorage.setItem(CHAVE_CONVITE_ATLETA, t); } catch { /* sem armazenamento */ } }
}

/**
 * Primeiro uso de um treinador (J32, X-04 mínimo): sem organização, cria o
 * seu negócio e começa o período experimental de 30 dias. Se chegou por
 * convite de um atleta, o atleta fica ligado logo.
 */
export function CriarNegocio() {
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<'solo_coach' | 'studio'>('solo_coach');
  const [aCriar, setACriar] = useState(false);
  const criar = async (e: FormEvent) => {
    e.preventDefault();
    const client = getSupabaseClient();
    if (!client || !nome.trim()) return;
    setACriar(true);
    try {
      const { data, error } = await client.rpc('create_organization', { _name: nome.trim(), _type: tipo });
      if (error) throw error;
      let token: string | null = null;
      try { token = localStorage.getItem(CHAVE_CONVITE_ATLETA); } catch { /* idem */ }
      if (token && data) {
        await reclamarConviteDeAtleta(client, data as string, token).catch(() => undefined);
        try { localStorage.removeItem(CHAVE_CONVITE_ATLETA); } catch { /* idem */ }
      }
      window.location.assign('/today');
    } catch (err) {
      toast({ variant: 'danger', title: 'Não foi possível criar', description: err instanceof Error ? err.message : undefined });
      setACriar(false);
    }
  };
  return (
    <main className="lv-root lg-entrar">
      <section className="lg-entrar__destaque" aria-hidden>
        <span className="lv-sobretitulo">LunaOS Gestão</span>
        <p className="lg-entrar__frase">O teu trabalho com cada cliente, num só sítio.</p>
      </section>
      <section className="lg-entrar__form">
      <form className="lg-entrar__campos" onSubmit={(e) => void criar(e)}>
        <h1 className="lv-titulo-ecra" style={{ margin: 0 }}>Cria o teu negócio</h1>
        <p className="lv-legenda" style={{ margin: 0 }}>30 dias para experimentar, sem cartão. Depois escolhes o plano.</p>
        <div className="lg-ficha__metricas" role="radiogroup" aria-label="Tipo">
          <Chip role="radio" aria-checked={tipo === 'solo_coach'} ativo={tipo === 'solo_coach'} onClick={() => setTipo('solo_coach')}>PT independente</Chip>
          <Chip role="radio" aria-checked={tipo === 'studio'} ativo={tipo === 'studio'} onClick={() => setTipo('studio')}>Estúdio com equipa</Chip>
        </div>
        <Campo rotulo={tipo === 'solo_coach' ? 'Nome que os clientes veem' : 'Nome do estúdio'} placeholder={tipo === 'solo_coach' ? 'Ex.: Tomás Reis PT' : 'Ex.: Estúdio Alvalade'}
          value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Nota>Se trabalhas num ginásio que já usa o LunaOS, pede antes o convite a quem gere a equipa.</Nota>
        <Botao type="submit" fixo aCarregar={aCriar} disabled={!nome.trim()}>Começar</Botao>
        <button type="button" className="lg-entrar__link" onClick={() => void signOutEverywhere(getSupabaseClient())}>Sair</button>
      </form>
      </section>
    </main>
  );
}
