// LunaOS · Calendário do PT em iCal, só de leitura (tarefa 29 parte A, AUD-18).
// GET /functions/v1/ical?t=<código>. O código é a única chave: gerar um novo
// em G-11 invalida o antigo. Sem "mostrar o nome", nenhum nome sai daqui.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.46.1';

const dt = (iso: string) => iso.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

Deno.serve(async (req) => {
  const t = new URL(req.url).searchParams.get('t') ?? '';
  if (!/^[0-9a-f]{64}$/.test(t)) return new Response('Não encontrado', { status: 404 });
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await admin.rpc('_calendar_events', { _token: t });
  if (error) return new Response('Erro', { status: 500 });
  const agora = dt(new Date().toISOString());
  const linhas = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LunaOS//Horario//PT', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:LunaOS',
    ...((data ?? []) as { uid: string; inicio: string; fim: string; titulo: string; local: string }[]).flatMap((e) => [
      'BEGIN:VEVENT', `UID:${e.uid}@lunaos`, `DTSTAMP:${agora}`, `DTSTART:${dt(new Date(e.inicio).toISOString())}`, `DTEND:${dt(new Date(e.fim).toISOString())}`,
      `SUMMARY:${esc(e.titulo)}`, ...(e.local ? [`LOCATION:${esc(e.local)}`] : []), 'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return new Response(linhas.join('\r\n'), { headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' } });
});
