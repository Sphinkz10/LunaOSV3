/** 9 estados de dia (Guia §3.5/C9) — SEMPRE cor+ícone+texto (a11y, nunca só cor). */
export type DayState = 'available'|'booked'|'pending'|'blocked'|'holiday'|'dayoff'|'vacation'|'competition'|'travel';
export const DAY_META: Record<DayState, { label: string; icon: string }> = {
  available:{label:'Disponível',icon:'●'}, booked:{label:'Marcado',icon:'■'}, pending:{label:'Pendente',icon:'◐'},
  blocked:{label:'Indisponível',icon:'✕'}, holiday:{label:'Feriado',icon:'★'}, dayoff:{label:'Folga',icon:'☀'},
  vacation:{label:'Férias',icon:'✈'}, competition:{label:'Competição',icon:'🏆'}, travel:{label:'Viagem',icon:'➜'},
};
export function DayCell({ day, state, selected, onSelect }:
  { day: number; state: DayState; selected?: boolean; onSelect?: (d: number) => void }) {
  const m = DAY_META[state];
  return (
    <button onClick={() => onSelect?.(day)} aria-pressed={selected}
      aria-label={`Dia ${day}: ${m.label}`} title={m.label}
      style={{ minWidth: 'var(--touch-min)', minHeight: 'var(--touch-min)', display: 'grid', placeItems: 'center',
               gap: 2, borderRadius: 'var(--r-sm)', cursor: 'pointer',
               border: selected ? '2px solid var(--accent)' : '1px solid var(--border)',
               background: selected ? 'var(--glass)' : 'transparent', color: 'var(--text-primary)' }}>
      <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{day}</span>
      <span aria-hidden style={{ fontSize: 10, color: `var(--cal-${state})`, lineHeight: 1 }}>{m.icon}</span>
    </button>
  );
}
