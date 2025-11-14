import { create } from 'zustand';
import api, { registerUnauthorizedHandler, setApiToken } from '../services/api';
import type { PortalUser, UserRole } from '../types';
import useWidgets, { clearPagesCache } from './useWidgets';

const SESSION_STORAGE_KEY = 'origami:session';

interface StoredSession {
  token: string;
  user: PortalUser | null;
}

const readStoredSession = (): StoredSession | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.token) {
      return { token: parsed.token, user: parsed.user ?? null };
    }
  } catch (error) {
    console.warn('Unable to read stored session', error);
  }
  return null;
};

const persistSession = (session: StoredSession | null) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (session && session.token) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch (error) {
    console.warn('Unable to persist session', error);
  }
};

interface SessionState {
  isAuthenticated: boolean;
  role: UserRole | null;
  token: string | null;
  user: PortalUser | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  fetchProfile: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => {
  const stored = readStoredSession();
  if (stored?.token) {
    setApiToken(stored.token);
  }
  return {
    isAuthenticated: Boolean(stored?.token),
    role: stored?.user?.role ?? null,
    token: stored?.token ?? null,
    user: stored?.user ?? null,
    async login(username, password) {
      try {
        const response = await api.post('/auth/login', { username, password });
        const { token, user } = response.data as { token: string; user: PortalUser };
        setApiToken(token);
        persistSession({ token, user });
        set({ isAuthenticated: true, role: user.role, token, user });
        return true;
      } catch (error) {
        console.error('Login failed', error);
        setApiToken(null);
        persistSession(null);
        set({ isAuthenticated: false, role: null, token: null, user: null });
        return false;
      }
    },
    logout() {
      setApiToken(null);
      persistSession(null);
      clearPagesCache();
      useWidgets.getState().reset();
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
        persistSession({ token, user });
      } catch (error) {
        console.error('Failed to fetch session', error);
        get().logout();
      }
    }
  };
});

registerUnauthorizedHandler(() => {
  useSession.getState().logout();
});
