import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { createGroup, joinGroupByCode, listMyGroups } from '../lib/groupsApi';
import type { Group } from '../lib/types';

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function Groups() {
  const navigate = useNavigate();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await listMyGroups();
      setGroups(data);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load groups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!newGroupName.trim()) {
      setCreateError('Please enter a group name.');
      return;
    }

    setCreating(true);
    try {
      const group = await createGroup(newGroupName);
      setNewGroupName('');
      navigate(`/group/${group.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create group.');
    } finally {
      setCreating(false);
    }
  };

  const handleJoinGroup = async (e: FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    if (!joinCode.trim()) {
      setJoinError('Please enter a join code.');
      return;
    }

    setJoining(true);
    try {
      const group = await joinGroupByCode(joinCode);
      setJoinCode('');
      navigate(`/group/${group.id}`);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Invalid join code.');
    } finally {
      setJoining(false);
    }
  };

  return (
    <Layout title="SplitEasy">
      <div className="grid gap-6 lg:grid-cols-12 lg:items-start">
        {/* Primary Groups List */}
        <section className="lg:col-span-7" aria-labelledby="groups-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2
              id="groups-heading"
              className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100"
            >
              Your groups
            </h2>
            {!loading && !loadError && groups.length > 0 && (
              <span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
                {groups.length} {groups.length === 1 ? 'group' : 'groups'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3.5 border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-slate-800"
                >
                  <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-36 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
                    <div className="h-3 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="rounded-2xl border border-red-200 bg-white p-5 text-center shadow-xs dark:border-red-900/60 dark:bg-slate-900">
              <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchGroups()}
                className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Try again
              </button>
            </div>
          ) : groups.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-9 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
              <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                No groups yet
              </h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                Create a new group for a trip or apartment, or join one using a 6-character code.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {groups.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/group/${group.id}`}
                    className="flex min-h-[68px] items-center gap-3.5 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-100 dark:hover:bg-slate-800/70 dark:active:bg-slate-800"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-sm font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                      {group.name.trim().slice(0, 1).toUpperCase() || 'G'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {group.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        Code{' '}
                        <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                          {group.join_code}
                        </span>
                        {group.created_at ? (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span>Created {formatShortDate(group.created_at)}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <svg
                      className="h-5 w-5 shrink-0 text-slate-400 dark:text-slate-500"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Create & Join Forms */}
        <div className="space-y-4 lg:col-span-5">
          <section
            aria-labelledby="create-group-heading"
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <h2
              id="create-group-heading"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Create group
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Start a fresh group and share its join code with friends.
            </p>

            {createError && (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
              >
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="mt-3 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              <label htmlFor="create-group-name" className="sr-only">
                Group name
              </label>
              <input
                id="create-group-name"
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Goa Trip, Flat 4B"
                maxLength={60}
                disabled={creating}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={creating}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900 whitespace-nowrap"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </form>
          </section>

          <section
            aria-labelledby="join-group-heading"
            className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
          >
            <h2
              id="join-group-heading"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Join with code
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Enter a 6-character code shared by a group member.
            </p>

            {joinError && (
              <div
                role="alert"
                className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
              >
                {joinError}
              </div>
            )}

            <form onSubmit={handleJoinGroup} className="mt-3 flex flex-col gap-2.5 sm:flex-row lg:flex-col">
              <label htmlFor="join-group-code" className="sr-only">
                Join code
              </label>
              <input
                id="join-group-code"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={10}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                disabled={joining}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-base uppercase tracking-wider text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={joining}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-5 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 dark:focus-visible:ring-offset-slate-900 whitespace-nowrap"
              >
                {joining ? 'Joining...' : 'Join'}
              </button>
            </form>
          </section>
        </div>
      </div>
    </Layout>
  );
}
