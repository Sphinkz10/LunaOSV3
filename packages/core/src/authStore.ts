import { create } from 'zustand';
import type { MyOrgRow } from './types/database';

/**
 * Sessão da Gestão. Os papéis vêm só de Membership (my_orgs); a conta em si não
 * tem papel. Sem organização ativa → 'noRole' (a app do treinador recusa).
 */
export type AuthStatus = 'loading' | 'signedIn' | 'signedOut' | 'noRole' | 'notConfigured' | 'error';

/** Âmbito de todas as consultas: a organização escolhida no seletor. */
export interface OrgScope {
  orgId: string;
  orgName: string;
  orgType: MyOrgRow['type'];
  membershipId: string;
  timezone: string;
  theme: string;
  roles: string[];
  permissions: string[];
  /** Carteira toda (clients.read_all) ou só os clientes de que é responsável. */
  canSeeAllClients: boolean;
  readOnly: boolean;
}

export interface AuthState {
  userId: string | null;
  status: AuthStatus;
  error: string | null;
  orgs: MyOrgRow[];
  scope: OrgScope | null;
  modules: string[];
  /** Nome e foto da própria pessoa (cartão no fundo do menu). */
  me: { name: string; avatarUrl: string | null } | null;
  setMe: (me: { name: string; avatarUrl: string | null } | null) => void;
  signIn: (userId: string, orgs: MyOrgRow[], activeOrgId?: string | null, modules?: string[]) => void;
  setModules: (modules: string[]) => void;
  selectOrg: (orgId: string) => void;
  signOut: () => void;
  setNotConfigured: () => void;
  setError: (message: string) => void;
}

export function toScope(o: MyOrgRow): OrgScope {
  return {
    orgId: o.org_id,
    orgName: o.name,
    orgType: o.type,
    membershipId: o.membership_id,
    timezone: o.timezone,
    theme: o.theme,
    roles: o.roles,
    permissions: o.permissions,
    canSeeAllClients: o.permissions.includes('clients.read_all'),
    readOnly: o.subscription_status === 'read_only' || o.subscription_status === 'cancelled',
  };
}

const signedOut = { userId: null, orgs: [] as MyOrgRow[], scope: null, modules: [] as string[], error: null, me: null };

export const useAuthStore = create<AuthState>((set, get) => ({
  ...signedOut,
  status: 'loading',
  signIn: (userId, orgs, activeOrgId, modules = []) => {
    const active = orgs.find((o) => o.org_id === activeOrgId) ?? orgs[0];
    set({
      userId, orgs, modules, error: null,
      scope: active ? toScope(active) : null,
      status: active ? 'signedIn' : 'noRole',
    });
  },
  setModules: (modules) => set({ modules }),
  setMe: (me) => set({ me }),
  selectOrg: (orgId) => {
    const o = get().orgs.find((x) => x.org_id === orgId);
    if (o) set({ scope: toScope(o), modules: [] });
  },
  signOut: () => set({ ...signedOut, status: 'signedOut' }),
  setNotConfigured: () => set({ ...signedOut, status: 'notConfigured' }),
  setError: (message) => set({ ...signedOut, status: 'error', error: message }),
}));

/** Tem esta permissão na organização ativa? (a autorização real é sempre no servidor) */
export function hasPerm(scope: OrgScope | null, perm: string): boolean {
  return !!scope && scope.permissions.includes(perm);
}

/** O módulo está ligado pelo serviço de direitos? Desligado = não aparece. */
export function hasModule(modules: string[], module: string): boolean {
  return modules.includes(module);
}
