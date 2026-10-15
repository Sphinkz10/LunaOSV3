import { Avatar } from '../primitives/Avatar';
import { Badge } from '../primitives/Badge';

export interface Booking { id: string; athlete: string; time: string; type: string; status: 'pending'|'confirmed'|'cancelled'; }
export function BookingCard({ b }: { b: Booking }) {
  const v = b.status === 'confirmed' ? 'success' : b.status === 'pending' ? 'warning' : 'danger';
  const label = b.status === 'confirmed' ? 'Confirmada' : b.status === 'pending' ? 'Pendente' : 'Cancelada';
  return (
    <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', minWidth: 0, containerType: 'inline-size' }}>
      <Avatar name={b.athlete} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong style={{ display: 'block', fontSize: 'var(--fs-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.athlete}</strong>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>{b.time} · {b.type}</span>
      </div>
      <Badge variant={v}>{label}</Badge>
    </div>
  );
}
