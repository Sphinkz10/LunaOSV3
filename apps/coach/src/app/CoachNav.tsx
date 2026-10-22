import { Barbell, CalendarBlank, ChatCircle, ClipboardText, Gear, Heartbeat, Sun, Users, Wallet,
  type IconComponent } from '@luna/icons';
import { vocab } from '../lib/vocab';

/**
 * Os 11 destinos da Gestão (docs/00-produto.md). Cada pessoa vê só os do papel
 * (permissões) e dos direitos da organização (módulos), no máximo 8.
 * `pronto: false` = o ecrã ainda não existe nesta versão; nunca aparece no menu
 * (regra: nunca um botão que leva a um ecrã vazio).
 */
interface Destino {
  to: string;
  label: string;
  icone: IconComponent;
  module: string;
  /** Basta uma destas permissões (vazio = todos os papéis). */
  perms: string[];
  pronto: boolean;
}

export const DESTINOS: Destino[] = [
  { to: '/today', label: 'Hoje', icone: Sun, module: 'today', perms: [], pronto: true },
  { to: '/clients', label: vocab.pessoa({ plural: true, maiuscula: true }), icone: Users, module: 'clients',
    perms: ['clients.read_all', 'clients.read_own'], pronto: true },
  { to: '/schedule', label: 'Horário', icone: CalendarBlank, module: 'schedule',
    perms: ['schedule.read_all', 'schedule.write'], pronto: true },
  { to: '/training/biblioteca', label: 'Treino', icone: Barbell, module: 'training', perms: ['training.write'], pronto: true },
  { to: '/assessment', label: 'Avaliação', icone: ClipboardText, module: 'assessment', perms: ['training.write', 'health.read'], pronto: true },
  { to: '/health', label: 'Saúde', icone: Heartbeat, module: 'health', perms: ['health.read'], pronto: false },
  { to: '/messages', label: 'Mensagens', icone: ChatCircle, module: 'messages', perms: [], pronto: false },
  { to: '/business', label: 'Negócio', icone: Wallet, module: 'business', perms: ['org.manage', 'schedule.read_all'], pronto: false },
  { to: '/reports', label: 'Relatórios', icone: ClipboardText, module: 'reports', perms: ['org.manage', 'clients.read_own'], pronto: false },
  { to: '/documents', label: 'Documentos', icone: ClipboardText, module: 'documents', perms: ['org.manage', 'schedule.read_all', 'health.read'], pronto: false },
  { to: '/settings', label: 'Definições', icone: Gear, module: 'settings', perms: ['org.manage', 'team.manage'], pronto: true },
];

export interface NavItem { to: string; label: string; icone: IconComponent }

/** Destinos que esta pessoa vê: ligados pelos direitos, permitidos pelo papel e já construídos. */
export function navItems(modules: string[], permissions?: string[]): NavItem[] {
  return DESTINOS
    .filter((d) => d.pronto && modules.includes(d.module))
    .filter((d) => !permissions || d.perms.length === 0 || d.perms.some((p) => permissions.includes(p)))
    .slice(0, 8)
    .map(({ to, label, icone }) => ({ to, label, icone }));
}
