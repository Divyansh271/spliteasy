import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useCurrentUser } from '../components/AuthGate';
import { Avatar } from '../components/Avatar';
import { Layout } from '../components/Layout';
import { getGroupById, getGroupMembers } from '../lib/groupsApi';
import type { Group, GroupMemberProfile } from '../lib/types';

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const currentUser = useCurrentUser();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError('Invalid group link.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [groupRow, memberRows] = await Promise.all([
        getGroupById(id),
        getGroupMembers(id),
      ]);

      if (!groupRow) {
        setError('Group not found or you are no longer a member.');
        setGroup(null);
      } else {
        setGroup(groupRow);
        setMembers(memberRows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleCopyCode = async () => {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for restricted clipboard environments
      setCopied(false);
    }
  };

  return (
    <Layout title={group ? group.name : 'Group'} backTo="/">
      {loading ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200" />
            <div className="mt-3 h-10 w-full animate-pulse rounded-xl bg-slate-100" />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200" />
            <div className="mt-4 space-y-3">
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
              <div className="h-10 w-full animate-pulse rounded-xl bg-slate-100" />
            </div>
          </div>
        </div>
      ) : error || !group ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xs">
          <p className="text-sm text-red-700">{error ?? 'Group unavailable.'}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void loadDetail()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Retry
            </button>
            <Link
              to="/"
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Back to groups
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
          <div className="space-y-5 lg:col-span-7">
            {/* Group Header & Join Code */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs">
              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                {group.name}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Share this code so friends can join the group
              </p>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <div className="min-w-0">
                  <span className="block text-xs text-slate-500">Join code</span>
                  <span className="font-mono text-lg font-semibold tracking-widest text-slate-900">
                    {group.join_code}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyCode()}
                  className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 whitespace-nowrap"
                >
                  {copied ? 'Copied' : 'Copy code'}
                </button>
              </div>
            </section>

            {/* Placeholder for Next Phase */}
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <h3 className="text-base font-semibold text-slate-900">
                Expenses coming next
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                Adding shared expenses, viewing balances, and settling up will be built here next.
              </p>
            </section>
          </div>

          {/* Members List */}
          <section
            aria-labelledby="members-heading"
            className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs lg:col-span-5"
          >
            <div className="flex items-center justify-between">
              <h3
                id="members-heading"
                className="text-base font-semibold text-slate-900"
              >
                Members
              </h3>
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {members.length}
              </span>
            </div>

            {members.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No members found.</p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {members.map((member) => {
                  const isYou = member.user_id === currentUser.id;
                  return (
                    <li
                      key={member.user_id}
                      className="flex min-h-[52px] items-center gap-3 py-2.5"
                    >
                      <Avatar name={member.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {member.name}
                          {isYou && (
                            <span className="ml-1.5 text-xs font-normal text-emerald-700">
                              (You)
                            </span>
                          )}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </Layout>
  );
}
