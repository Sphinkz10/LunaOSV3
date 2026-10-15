import { create } from 'zustand';

export type Role = 'admin' | 'coach' | 'athlete' | 'staff';
export interface AuthState {
  userId: string | null; role: Role | null; status: 'loading' | 'signedIn' | 'signedOut';
  signIn: (userId: string, role: Role) => void; signOut: () => void;
}
export const useAuthStore = create<AuthState>((set) => ({
  userId: null, role: null, status: 'loading',
  signIn: (userId, role) => set({ userId, role, status: 'signedIn' }),
  signOut: () => set({ userId: null, role: null, status: 'signedOut' }),
}));
/** Liga ao supabase.auth.onAuthStateChange na app (P2.8 real, com o projeto). */
