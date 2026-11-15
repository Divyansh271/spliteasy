import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BottomNav } from './BottomNav';

interface LayoutProps {
  title?: string;
  backTo?: string;
  children: ReactNode;
}

export function Layout({ title = 'SplitEasy', backTo, children }: LayoutProps) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-13 max-w-4xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-2">
            {backTo ? (
              <Link
                to={backTo}
                aria-label="Back to groups"
                className="-ml-2 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </Link>
            ) : (
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-xs font-bold text-white">
                S
              </span>
            )}
            <h1 className="truncate text-base font-semibold tracking-tight text-slate-900">
              {title}
            </h1>
          </div>
        </div>
      </header>

      {!isOnline && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs font-medium text-amber-900"
        >
          You are offline. Changes will require an internet connection.
        </div>
      )}

      <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-5">{children}</main>

      <BottomNav />
    </div>
  );
}
