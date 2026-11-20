import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AddExpenseModal } from '../components/AddExpenseModal';
import { useCurrentUser } from '../components/AuthGate';
import { Avatar } from '../components/Avatar';
import { Layout } from '../components/Layout';
import { SettleUpModal } from '../components/SettleUpModal';
import {
  deleteExpense,
  deleteSettlement,
  listGroupExpenses,
  listGroupSettlements,
} from '../lib/expensesApi';
import { getGroupById, getGroupMembers } from '../lib/groupsApi';
import { computeNetBalances, formatINR, simplifyDebts } from '../lib/money';
import type {
  ExpenseWithSplits,
  Group,
  GroupMemberProfile,
  Settlement,
} from '../lib/types';

type DetailTab = 'expenses' | 'balances' | 'members';

type ActivityItem =
  | { kind: 'expense'; created_at: string; expense: ExpenseWithSplits }
  | { kind: 'settlement'; created_at: string; settlement: Settlement };

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const currentUser = useCurrentUser();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMemberProfile[]>([]);
  const [expenses, setExpenses] = useState<ExpenseWithSplits[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DetailTab>('expenses');
  const [copied, setCopied] = useState(false);

  const [expandedItemKey, setExpandedItemKey] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [settlePreset, setSettlePreset] = useState<{
    open: boolean;
    fromUser?: string;
    toUser?: string;
    amountPaise?: number;
  }>({ open: false });

  const loadDetail = useCallback(async () => {
    if (!id) {
      setError('Invalid group link.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [groupRow, memberRows, expenseRows, settlementRows] = await Promise.all([
        getGroupById(id),
        getGroupMembers(id),
        listGroupExpenses(id),
        listGroupSettlements(id),
      ]);

      if (!groupRow) {
        setError('Group not found or you are no longer a member.');
        setGroup(null);
      } else {
        setGroup(groupRow);
        setMembers(memberRows);
        setExpenses(expenseRows);
        setSettlements(settlementRows);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load group.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refreshActivity = useCallback(async () => {
    if (!id) return;
    setActionError(null);
    try {
      const [expenseRows, settlementRows] = await Promise.all([
        listGroupExpenses(id),
        listGroupSettlements(id),
      ]);
      setExpenses(expenseRows);
      setSettlements(settlementRows);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to refresh activity.');
    }
  }, [id]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const memberNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) {
      map.set(m.user_id, m.name);
    }
    return map;
  }, [members]);

  const getLabelName = (userId: string): string => {
    if (userId === currentUser.id) return 'You';
    return memberNameMap.get(userId) ?? 'Former member';
  };

  const netBalances = useMemo(() => {
    const ids = members.map((m) => m.user_id);
    return computeNetBalances(ids, expenses, settlements);
  }, [members, expenses, settlements]);

  const suggestedTransfers = useMemo(
    () => simplifyDebts(netBalances),
    [netBalances],
  );

  const activityFeed = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [
      ...expenses.map(
        (expense): ActivityItem => ({
          kind: 'expense',
          created_at: expense.created_at,
          expense,
        }),
      ),
      ...settlements.map(
        (settlement): ActivityItem => ({
          kind: 'settlement',
          created_at: settlement.created_at,
          settlement,
        }),
      ),
    ];

    items.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    return items;
  }, [expenses, settlements]);

  const myBalancePaise = netBalances[currentUser.id] ?? 0;

  const handleCopyCode = async () => {
    if (!group) return;
    try {
      await navigator.clipboard.writeText(group.join_code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const key = `exp-${expenseId}`;
    setActionError(null);
    setDeletingKey(key);
    try {
      await deleteExpense(expenseId);
      setConfirmDeleteKey(null);
      setExpandedItemKey(null);
      await refreshActivity();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete expense.');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDeleteSettlement = async (settlementId: string) => {
    const key = `set-${settlementId}`;
    setActionError(null);
    setDeletingKey(key);
    try {
      await deleteSettlement(settlementId);
      setConfirmDeleteKey(null);
      setExpandedItemKey(null);
      await refreshActivity();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not delete settlement.');
    } finally {
      setDeletingKey(null);
    }
  };

  return (
    <Layout title={group ? group.name : 'Group'} backTo="/">
      {loading ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="h-6 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-3 h-10 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
          </div>
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="h-4 w-28 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="mt-4 space-y-3">
              <div className="h-14 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
              <div className="h-14 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70" />
            </div>
          </div>
        </div>
      ) : error || !group ? (
        <div className="rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xs dark:border-red-900/60 dark:bg-slate-900">
          <p className="text-sm text-red-700 dark:text-red-300">{error ?? 'Group unavailable.'}</p>
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
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Back to groups
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Group Summary & Primary Actions */}
          <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                  {group.name}
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {members.length} {members.length === 1 ? 'member' : 'members'}
                  <span aria-hidden="true"> · </span>
                  Code{' '}
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {group.join_code}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleCopyCode()}
                className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap"
              >
                {copied ? 'Code copied' : 'Copy code'}
              </button>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              {myBalancePaise > 0 ? (
                <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  You are owed{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {formatINR(myBalancePaise)}
                  </span>
                </p>
              ) : myBalancePaise < 0 ? (
                <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
                  You owe{' '}
                  <span className="font-mono font-semibold tabular-nums">
                    {formatINR(-myBalancePaise)}
                  </span>
                </p>
              ) : (
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  You are settled up in this group
                </p>
              )}

              <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(true)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 whitespace-nowrap"
                >
                  Add expense
                </button>
                <button
                  type="button"
                  disabled={members.length < 2}
                  onClick={() => setSettlePreset({ open: true })}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 dark:focus-visible:ring-offset-slate-900 dark:disabled:border-slate-800 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 whitespace-nowrap"
                >
                  Settle up
                </button>
              </div>
            </div>
          </section>

          {actionError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
            >
              {actionError}
            </div>
          )}

          {/* Segmented Navigation Tabs */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'expenses'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Activity ({activityFeed.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('balances')}
              className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'balances'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Balances ({suggestedTransfers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('members')}
              className={`min-h-[40px] rounded-lg px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'members'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-slate-100'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              Members ({members.length})
            </button>
          </div>

          {/* Activity Tab (Expenses + Settlements) */}
          {activeTab === 'expenses' && (
            <section aria-label="Group activity">
              {activityFeed.length === 0 ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white px-5 py-9 text-center shadow-xs dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    No expenses yet
                  </h3>
                  <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500 dark:text-slate-400">
                    Add your first shared expense to start tracking who owes whom.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowAddExpense(true)}
                    className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Add expense
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
                  {activityFeed.map((item) => {
                    if (item.kind === 'settlement') {
                      const s = item.settlement;
                      const key = `set-${s.id}`;
                      const isExpanded = expandedItemKey === key;
                      const isConfirming = confirmDeleteKey === key;
                      const isDeleting = deletingKey === key;

                      return (
                        <li key={key}>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedItemKey(isExpanded ? null : key);
                              setConfirmDeleteKey(null);
                            }}
                            className="flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                {getLabelName(s.from_user)} paid {getLabelName(s.to_user)}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                                Settlement
                                {s.created_at ? ` · ${formatShortDate(s.created_at)}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-sm font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                              {formatINR(s.amount_paise)}
                            </span>
                          </button>

                          {isExpanded && (
                            <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                              {isConfirming ? (
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    Delete this settlement?
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteKey(null)}
                                      disabled={isDeleting}
                                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteSettlement(s.id)}
                                      disabled={isDeleting}
                                      className="inline-flex min-h-[36px] items-center rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                    >
                                      {isDeleting ? 'Deleting...' : 'Confirm delete'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(key)}
                                    className="inline-flex min-h-[36px] items-center rounded-lg px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                                  >
                                    Delete settlement
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    }

                    const e = item.expense;
                    const key = `exp-${e.id}`;
                    const isExpanded = expandedItemKey === key;
                    const isConfirming = confirmDeleteKey === key;
                    const isDeleting = deletingKey === key;

                    const mySplit = e.splits.find((sp) => sp.user_id === currentUser.id);
                    const mySharePaise = mySplit ? mySplit.share_paise : 0;
                    const netEffectPaise =
                      (e.paid_by === currentUser.id ? e.amount_paise : 0) - mySharePaise;

                    return (
                      <li key={key}>
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedItemKey(isExpanded ? null : key);
                            setConfirmDeleteKey(null);
                          }}
                          className="flex min-h-[68px] w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {e.description}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                              Paid by {getLabelName(e.paid_by)}
                              {e.created_at ? ` · ${formatShortDate(e.created_at)}` : ''}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="font-mono text-sm font-semibold text-slate-900 tabular-nums dark:text-slate-100">
                              {formatINR(e.amount_paise)}
                            </p>
                            <p
                              className={`mt-0.5 font-mono text-xs font-medium tabular-nums ${
                                netEffectPaise > 0
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : netEffectPaise < 0
                                    ? 'text-rose-700 dark:text-rose-400'
                                    : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              {netEffectPaise > 0
                                ? `Lent ${formatINR(netEffectPaise)}`
                                : netEffectPaise < 0
                                  ? `Owe ${formatINR(-netEffectPaise)}`
                                  : 'Not involved'}
                            </p>
                          </div>
                        </button>

                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                            <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                              Split breakdown
                            </p>
                            <ul className="mt-2 space-y-1.5">
                              {e.splits.map((sp) => (
                                <li
                                  key={sp.user_id}
                                  className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300"
                                >
                                  <span className="truncate">{getLabelName(sp.user_id)}</span>
                                  <span className="font-mono font-medium tabular-nums">
                                    {formatINR(sp.share_paise)}
                                  </span>
                                </li>
                              ))}
                            </ul>

                            <div className="mt-3.5 border-t border-slate-200/70 pt-3 dark:border-slate-700">
                              {isConfirming ? (
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                    Delete this expense?
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteKey(null)}
                                      disabled={isDeleting}
                                      className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteExpense(e.id)}
                                      disabled={isDeleting}
                                      className="inline-flex min-h-[36px] items-center rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                                    >
                                      {isDeleting ? 'Deleting...' : 'Confirm delete'}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between">
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    To edit, delete and re-add.
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteKey(key)}
                                    className="inline-flex min-h-[36px] items-center rounded-lg px-3 text-xs font-semibold text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* Balances & Settle-Up Tab */}
          {activeTab === 'balances' && (
            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
              <section
                aria-labelledby="settle-plan-heading"
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-7"
              >
                <h3
                  id="settle-plan-heading"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Suggested settle-up
                </h3>

                {suggestedTransfers.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    Everyone is settled up! No payments needed.
                  </p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {suggestedTransfers.map((tr) => (
                      <li
                        key={`${tr.from_user}-${tr.to_user}`}
                        className="flex min-h-[60px] items-center justify-between gap-3 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800 dark:text-slate-200">
                            <span className="font-semibold">{getLabelName(tr.from_user)}</span>
                            {' owes '}
                            <span className="font-semibold">{getLabelName(tr.to_user)}</span>
                          </p>
                          <p className="mt-0.5 font-mono text-sm font-semibold text-emerald-700 tabular-nums dark:text-emerald-400">
                            {formatINR(tr.amount_paise)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setSettlePreset({
                              open: true,
                              fromUser: tr.from_user,
                              toUser: tr.to_user,
                              amountPaise: tr.amount_paise,
                            })
                          }
                          className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-emerald-600 bg-emerald-50 px-3.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60 whitespace-nowrap"
                        >
                          Settle
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section
                aria-labelledby="net-balances-heading"
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-5"
              >
                <h3
                  id="net-balances-heading"
                  className="text-base font-semibold text-slate-900 dark:text-slate-100"
                >
                  Net balances
                </h3>

                <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {members.map((m) => {
                    const net = netBalances[m.user_id] ?? 0;
                    const isYou = m.user_id === currentUser.id;
                    return (
                      <li
                        key={m.user_id}
                        className="flex min-h-[52px] items-center justify-between gap-3 py-2.5"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar name={m.name} size="sm" />
                          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {isYou ? `${m.name} (You)` : m.name}
                          </span>
                        </div>
                        <span
                          className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                            net > 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : net < 0
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {net > 0
                            ? `+${formatINR(net)}`
                            : net < 0
                              ? formatINR(net)
                              : 'Settled'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
              <section
                aria-labelledby="members-heading"
                className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-7"
              >
                <div className="flex items-center justify-between">
                  <h3 id="members-heading" className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Group members
                  </h3>
                  <span className="text-xs font-medium text-slate-500 tabular-nums dark:text-slate-400">
                    {members.length}
                  </span>
                </div>

                {members.length === 0 ? (
                  <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No members found.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {members.map((member) => {
                      const isYou = member.user_id === currentUser.id;
                      return (
                        <li
                          key={member.user_id}
                          className="flex min-h-[52px] items-center gap-3 py-2.5"
                        >
                          <Avatar name={member.name} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                              {member.name}
                              {isYou && (
                                <span className="ml-1.5 text-xs font-normal text-emerald-700 dark:text-emerald-400">
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

              <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 lg:col-span-5">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Invite friends
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Anyone with this code can join from their Groups tab.
                </p>
                <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-700 dark:bg-slate-800/70">
                  <span className="font-mono text-lg font-semibold tracking-widest text-slate-900 dark:text-slate-100">
                    {group.join_code}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyCode()}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-3.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </section>
            </div>
          )}

          <AddExpenseModal
            open={showAddExpense}
            groupId={group.id}
            members={members}
            currentUserId={currentUser.id}
            onClose={() => setShowAddExpense(false)}
            onAdded={refreshActivity}
          />

          <SettleUpModal
            open={settlePreset.open}
            groupId={group.id}
            members={members}
            currentUserId={currentUser.id}
            initialFromUser={settlePreset.fromUser}
            initialToUser={settlePreset.toUser}
            initialAmountPaise={settlePreset.amountPaise}
            onClose={() => setSettlePreset({ open: false })}
            onSettled={refreshActivity}
          />
        </div>
      )}
    </Layout>
  );
}
