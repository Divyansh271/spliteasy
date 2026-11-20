import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  extractAuthUser,
  getMyProfile,
  getSession,
  onAuthStateChange,
} from '../lib/authApi';
import type { AuthUser } from '../lib/types';
import { Login } from '../pages/Login';

const AuthUserContext = createContext<AuthUser | null>(null);

export function useCurrentUser(): AuthUser {
  const user = useContext(AuthUserContext);
  if (!user) {
    throw new Error('useCurrentUser must be used inside AuthGate');
  }
  return user;
}

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function syncUserFromSession(nextSession: Session | null) {
      if (!active) return;
      setSession(nextSession);

      if (!nextSession?.user) {
        setAuthUser(null);
        setLoading(false);
        return;
      }

      // Immediately populate fallback user so UI does not stall on profile fetch
      setAuthUser(extractAuthUser(nextSession.user));

      try {
        const profile = await getMyProfile(nextSession.user.id);
        if (active) {
          setAuthUser(extractAuthUser(nextSession.user, profile));
        }
      } catch {
        // Fallback metadata/email prefix remains active if profile row isn't ready yet
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    getSession()
      .then((initialSession) => {
        void syncUserFromSession(initialSession);
      })
      .catch((err) => {
        if (active) {
          setInitError(err instanceof Error ? err.message : 'Could not verify session.');
          setLoading(false);
        }
      });

    const unsubscribe = onAuthStateChange((_event, nextSession) => {
      void syncUserFromSession(nextSession);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div
          aria-label="Loading"
          className="h-9 w-9 animate-spin rounded-full border-3 border-emerald-600 border-t-transparent dark:border-emerald-400 dark:border-t-transparent"
        />
        <p className="mt-3 text-sm font-medium text-slate-500 dark:text-slate-400">
          Loading SplitEasy...
        </p>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center dark:bg-slate-950">
        <div className="w-full max-w-sm rounded-2xl border border-red-200 bg-white p-6 shadow-xs dark:border-red-900/60 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Connection issue
          </h2>
          <p className="mt-2 text-sm text-red-700 dark:text-red-300">{initError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!session || !authUser) {
    return <Login />;
  }

  return (
    <AuthUserContext.Provider value={authUser}>
      {children}
    </AuthUserContext.Provider>
  );
}
