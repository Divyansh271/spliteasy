import { NavLink } from 'react-router-dom';

export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md pb-safe dark:border-slate-800 dark:bg-slate-900/95"
    >
      <div className="mx-auto grid h-14 max-w-4xl grid-cols-2">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill={isActive ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={isActive ? 1.8 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Groups</span>
            </>
          )}
        </NavLink>

        <NavLink
          to="/account"
          className={({ isActive }) =>
            `flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors whitespace-nowrap ${
              isActive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill={isActive ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={isActive ? 1.8 : 2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>Account</span>
            </>
          )}
        </NavLink>
      </div>
    </nav>
  );
}
