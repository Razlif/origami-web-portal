import { useEffect } from 'react';
import { useTheme } from '../store/useTheme';

const SunIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden focusable="false">
    <path
      d="M12 5a1 1 0 0 1-1-1V2.75a1 1 0 0 1 2 0V4a1 1 0 0 1-1 1Zm0 17a1 1 0 0 1-1-1v-1.25a1 1 0 1 1 2 0V21a1 1 0 0 1-1 1Zm9-10a1 1 0 0 1-1 1h-1.25a1 1 0 1 1 0-2H20a1 1 0 0 1 1 1ZM6.25 12a1 1 0 0 1-1 1H4a1 1 0 0 1 0-2h1.25a1 1 0 0 1 1 1Zm12.728-6.364a1 1 0 0 1 0 1.414l-.884.884a1 1 0 0 1-1.414-1.414l.884-.884a1 1 0 0 1 1.414 0ZM7.32 18.293a1 1 0 0 1 0 1.414l-.884.884a1 1 0 1 1-1.414-1.414l.884-.884a1 1 0 0 1 1.414 0Zm12.387 1.414-.884-.884a1 1 0 0 1 1.414-1.414l.884.884a1 1 0 1 1-1.414 1.414ZM6.436 6.436l-.884-.884A1 1 0 0 1 6.966 4.14l.884.884A1 1 0 1 1 6.436 6.436Zm5.564 2.064a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z"
      className="fill-current"
    />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden focusable="false">
    <path
      d="M20.227 15.734a1 1 0 0 0-1.086-.21 6.5 6.5 0 0 1-8.665-8.665 1 1 0 0 0-.946-1.333 8.5 8.5 0 1 0 10.944 10.944 1 1 0 0 0-.247-1.736Z"
      className="fill-current"
    />
  </svg>
);

export const ThemeToggle = () => {
  const { theme, toggleTheme, initialized } = useTheme();

  useEffect(() => {
    if (!initialized) {
      useTheme.getState().setTheme(theme);
    }
  }, [initialized, theme]);

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="flex items-center gap-2 rounded-full border border-slate-300 bg-surface px-3 py-1 text-xs font-semibold text-muted transition hover:border-primary/60 hover:text-primary dark:border-slate-600 dark:hover:border-primary/50"
    >
      {theme === 'dark' ? (
        <>
          <MoonIcon />
          <span>מצב לילה</span>
        </>
      ) : (
        <>
          <SunIcon />
          <span>מצב יום</span>
        </>
      )}
    </button>
  );
};

export default ThemeToggle;
