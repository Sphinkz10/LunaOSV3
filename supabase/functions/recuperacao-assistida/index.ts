// LunaOS · Recuperação assistida (tarefa 25)
// A pessoa entra com "Tenho um código": email + código de uso único gerado pela
// gerência (30 min) + palavra-passe nova. O código é validado na base de dados
// (_redeem_recovery_code: uso único, 5 erros bloqueiam e avisam a gerência);
// só depois se muda a palavra-passe com a chave de serviço, que nunca sai
// deste servidor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const resposta = (status: number, corpo: Record<string, unknown>) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta(405, { erro: 'método' });

  let email = '', codigo = '', password = '';
  try {
    ({ email, codigo, password } = await req.json());
  } catch {
    return resposta(400, { erro: 'pedido inválido' });
  }
  if (!email || !codigo || !password || password.length < 10) {
    return resposta(400, { erro: 'Email, código e uma palavra-passe com pelo menos 10 caracteres.' });
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data: userId, error } = await admin.rpc('_redeem_recovery_code', { _email: email, _code: codigo });
  if (error) {
    if (/codigo_bloqueado/.test(error.message)) {
      return resposta(423, { erro: 'Este código ficou bloqueado depois de 5 tentativas. Pede um novo à gerência.' });
    }
    return resposta(400, { erro: 'Código inválido ou expirado.' });
  }
  if (!userId) return resposta(400, { erro: 'Código errado.' });

  const { error: e2 } = await admin.auth.admin.updateUserById(userId as string, { password });
  if (e2) return resposta(500, { erro: 'Não foi possível mudar a palavra-passe.' });
  return resposta(200, { ok: true });
});
