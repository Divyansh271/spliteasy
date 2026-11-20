export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'spliteasy-theme';

export function getStoredTheme(): ThemePreference {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
  return 'light';
}

export function resolveIsDark(pref: ThemePreference): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function syncDocumentClass(isDark: boolean): void {
  const root = document.documentElement;
  root.classList.toggle('dark', isDark);
  root.style.colorScheme = isDark ? 'dark' : 'light';
}

export function applyTheme(pref: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    // Ignore storage access errors
  }
  syncDocumentClass(resolveIsDark(pref));
}

export function initTheme(): () => void {
  const pref = getStoredTheme();
  syncDocumentClass(resolveIsDark(pref));

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const handleChange = () => {
    if (getStoredTheme() === 'system') {
      syncDocumentClass(media.matches);
    }
  };

  media.addEventListener('change', handleChange);
  return () => {
    media.removeEventListener('change', handleChange);
  };
}
