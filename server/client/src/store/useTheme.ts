import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

interface ThemeState {
  theme: ThemeMode;
  initialized: boolean;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const storageKey = 'origami:theme';

const getPreferredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light';
  }
  const stored = window.localStorage.getItem(storageKey) as ThemeMode | null;
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  return prefersDark ? 'dark' : 'light';
};

const applyTheme = (theme: ThemeMode) => {
  if (typeof document === 'undefined') {
    return;
  }
  const root = document.documentElement;
  root.dataset.theme = theme;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
};

export const useTheme = create<ThemeState>((set, get) => ({
  theme: 'light',
  initialized: false,
  setTheme(theme) {
    set({ theme, initialized: true });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, theme);
    }
    applyTheme(theme);
  },
  toggleTheme() {
    const next = get().theme === 'light' ? 'dark' : 'light';
    get().setTheme(next);
  }
}));

if (typeof window !== 'undefined') {
  const initial = getPreferredTheme();
  useTheme.getState().setTheme(initial);
}
