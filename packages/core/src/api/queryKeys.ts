/** Query keys canónicas (Guia §7.1). Uma entidade = uma família; invalidação cirúrgica. */
export const qk = {
  bookings: { all: ['bookings'] as const, month: (iso: string) => ['bookings', { month: iso }] as const,
              day: (iso: string) => ['bookings', { day: iso }] as const, upcoming: ['bookings', 'upcoming'] as const },
  clients: { all: ['clients'] as const, detail: (id: string) => ['clients', id] as const,
              summary: ['clients', 'summary'] as const },
  kpis: { today: ['kpis', 'today'] as const },
  notifications: { unread: ['notifications', 'unread'] as const },
  waitlist: { all: ['waitlist'] as const },
  sessions: { detail: (id: string) => ['sessions', id] as const },
  settings: { user: ['settings', 'user'] as const },
} as const;
