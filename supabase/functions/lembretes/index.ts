// LunaOS · Lembretes 24 h e 2 h antes das sessões (tarefa 29 parte A, AUD-16).
// Chamada de 5 em 5 minutos pelo agendador do Supabase (pg_cron ou Scheduled
// Functions) com a chave de serviço. As regras (ligar, desligar, SMS) e as
// horas de silêncio estão na função _enviar_lembretes da base de dados.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return new Response('Sem permissão', { status: 401 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('_enviar_lembretes', {});
  if (error) return new Response(JSON.stringify({ erro: error.message }), { status: 500 });
  return new Response(JSON.stringify({ enviados: data }), { headers: { 'Content-Type': 'application/json' } });
});
