import { create } from 'zustand';
import api, { registerUnauthorizedHandler, setApiToken } from '../services/api';
import type { PortalUser, UserRole } from '../types';

interface SessionState {
  isAuthenticated: boolean;
  role: UserRole | null;
  token: string | null;
  user: PortalUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  isAuthenticated: false,
  role: null,
  token: null,
  user: null,
  async login(username, password) {
    try {
      const response = await api.post('/auth/login', { username, password });
      const { token, user } = response.data as { token: string; user: PortalUser };
      setApiToken(token);
      set({ isAuthenticated: true, role: user.role, token, user });
      return true;
    } catch (error) {
      console.error('Login failed', error);
      setApiToken(null);
      set({ isAuthenticated: false, role: null, token: null, user: null });
      return false;
    }
  },
  logout() {
    setApiToken(null);
    set({ isAuthenticated: false, role: null, token: null, user: null });
  },
  async fetchProfile() {
    const token = get().token;
    if (!token) {
      return;
    }
    try {
      const response = await api.get('/auth/me');
      const { user } = response.data as { user: PortalUser };
      set({ user, role: user.role, isAuthenticated: true });
    } catch (error) {
      console.error('Failed to fetch session', error);
      get().logout();
    }
  }
}));

registerUnauthorizedHandler(() => {
  useSession.getState().logout();
});
