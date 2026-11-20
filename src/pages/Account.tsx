import { useEffect, useState } from 'react';
import { useCurrentUser } from '../components/AuthGate';
import { Avatar } from '../components/Avatar';
import { Layout } from '../components/Layout';
import { signOut } from '../lib/authApi';
import {
  applyTheme,
  getStoredTheme,
  type ThemePreference,
} from '../lib/theme';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

export function Account() {
  const user = useCurrentUser();
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const ua = window.navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(ua));

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleThemeChange = (next: ThemePreference) => {
    setTheme(next);
    applyTheme(next);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign out.');
      setSigningOut(false);
    }
  };

  return (
    <Layout title="Account">
      <div className="mx-auto max-w-lg space-y-5">
        {/* Profile Card */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-4">
            <Avatar name={user.name} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
                {user.name}
              </h2>
              <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                {user.email}
              </p>
            </div>
          </div>
        </section>

        {/* Appearance / Dark Mode */}
        <section
          aria-labelledby="appearance-heading"
          className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
        >
          <h3
            id="appearance-heading"
            className="text-base font-semibold text-slate-900 dark:text-slate-100"
          >
            Appearance
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Choose Light, Dark, or follow your device setting.
          </p>

          <div
            role="radiogroup"
            aria-label="Theme preference"
            className="mt-3.5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800"
          >
            {THEME_OPTIONS.map((opt) => {
              const active = theme === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => handleThemeChange(opt.value)}
                  className={`min-h-[40px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* PWA Install Prompt */}
        {!isInstalled && (deferredPrompt || isIOS) && (
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Install SplitEasy
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Add SplitEasy to your home screen for quick, app-like access.
            </p>
            {deferredPrompt ? (
              <button
                type="button"
                onClick={() => void handleInstall()}
                className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Install app
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowIOSGuide((prev) => !prev)}
                className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
              >
                {showIOSGuide ? 'Hide install steps' : 'How to install on iPhone / iPad'}
              </button>
            )}
            {showIOSGuide && (
              <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-300">
                <li>Tap the Share button in Safari.</li>
                <li>Scroll down and tap Add to Home Screen.</li>
              </ol>
            )}
          </section>
        )}

        {/* Sign Out */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/50 dark:focus-visible:ring-offset-slate-900"
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </section>
      </div>
    </Layout>
  );
}
