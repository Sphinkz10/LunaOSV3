import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { avisoSubscricao, fetchSubscricao, useAuthStore, type Subscricao } from '@luna/core';
import { Info, Warning } from '@luna/icons';
import { getSupabaseClient } from '../lib/supabase';

// Uma leitura por organização a cada minuto chega para a barra (a página G-47 lê sempre)
const cache = new Map<string, { em: number; s: Subscricao }>();
export const esquecerSubscricao = () => cache.clear();

/** Barra de aviso da subscrição (J32, J34): fim do experimental, graça e só leitura. */
export function AvisoSubscricao() {
  const scope = useAuthStore((s) => s.scope);
  const [s, setS] = useState<Subscricao | null>(null);
  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !scope) return;
    const c = cache.get(scope.orgId);
    if (c && Date.now() - c.em < 60_000) { setS(c.s); return; }
    let vivo = true;
    void fetchSubscricao(client, scope).then((x) => { cache.set(scope.orgId, { em: Date.now(), s: x }); if (vivo) setS(x); }).catch(() => undefined);
    return () => { vivo = false; };
  }, [scope]);
  const aviso = s && avisoSubscricao(s);
  if (!aviso) return null;
  const Icone = aviso.tom === 'info' ? Info : Warning;
  return (
    <p className={`lg-aviso-sub lg-aviso-sub--${aviso.tom}`} role="status">
      <Icone size={16} aria-hidden />
      <span>{aviso.texto}</span>
      {s.gere && <Link to="/settings/subscricao">Subscrição</Link>}
    </p>
  );
}
