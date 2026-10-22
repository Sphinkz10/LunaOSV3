import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProgressoInicio, PASSOS_INICIO, type ProgressoInicio } from '@luna/core';
import { Botao } from '@luna/ui/v3';
import { CheckCircle, Circle } from '@luna/icons';
import { useScope } from './ModuleLayout';
import { getSupabaseClient } from '../lib/supabase';

const CHAVE = 'luna.paraComecar.fechado';

/**
 * G-01 "Para começar": os cinco passos que põem um PT a trabalhar. Cada passo
 * fica feito sozinho quando a coisa existe; some quando estão todos ou quando
 * se fecha (fica fechado neste aparelho).
 */
export function ParaComecar() {
  const scope = useScope();
  const navigate = useNavigate();
  const [p, setP] = useState<ProgressoInicio | null>(null);
  const [fechado, setFechado] = useState(() => { try { return localStorage.getItem(`${CHAVE}.${scope.orgId}`) === '1'; } catch { return false; } });
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || fechado || !scope.membershipId) return;
    void fetchProgressoInicio(client, scope, scope.membershipId).then(setP).catch(() => setP(null));
  }, [scope, fechado]);
  if (fechado || !p || p.feitos.length >= p.total) return null;
  const fechar = () => { try { localStorage.setItem(`${CHAVE}.${scope.orgId}`, '1'); } catch { /* sem armazenamento: fecha só agora */ } setFechado(true); };
  return (
    <section className="lv-lista" aria-label="Para começar">
      <div className="lv-lista__cabeca">
        <h2 className="lv-titulo-cartao" style={{ margin: 0 }}>Para começar · {p.feitos.length} de {p.total}</h2>
        <Botao variante="secundario" onClick={fechar}>Fechar</Botao>
      </div>
      {PASSOS_INICIO.map((s) => {
        const feito = p.feitos.includes(s.id);
        const Icone = feito ? CheckCircle : Circle;
        return (
          <button key={s.id} type="button" className="lv-linha-lista" disabled={feito} onClick={() => navigate(s.rota)}>
            <Icone size={20} aria-hidden weight={feito ? 'fill' : 'regular'} />
            <span className="lv-linha-lista__corpo">
              <span className="lv-linha-lista__titulo" style={feito ? { textDecoration: 'line-through' } : undefined}>{s.titulo}</span>
              <span className="lv-legenda">{feito ? 'Feito' : s.texto}</span>
            </span>
          </button>
        );
      })}
    </section>
  );
}
