import { useEffect, useState, type FormEvent } from 'react';
import { addExpense } from '../lib/expensesApi';
import { formatINR, splitEqually, toPaise } from '../lib/money';
import type { GroupMemberProfile, SplitInput } from '../lib/types';

interface AddExpenseModalProps {
  open: boolean;
  groupId: string;
  members: GroupMemberProfile[];
  currentUserId: string;
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}

type SplitMode = 'equal' | 'exact';

export function AddExpenseModal({
  open,
  groupId,
  members,
  currentUserId,
  onClose,
  onAdded,
}: AddExpenseModalProps) {
  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paidBy, setPaidBy] = useState(currentUserId);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exactInputs, setExactInputs] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDescription('');
    setAmountInput('');
    setPaidBy(
      members.some((m) => m.user_id === currentUserId)
        ? currentUserId
        : (members[0]?.user_id ?? currentUserId),
    );
    setSplitMode('equal');
    setSelectedIds(members.map((m) => m.user_id));
    setExactInputs(
      Object.fromEntries(members.map((m) => [m.user_id, ''])),
    );
    setError(null);
  }, [open, members, currentUserId]);

  if (!open) return null;

  let parsedAmountPaise: number | null = null;
  if (amountInput.trim()) {
    try {
      const p = toPaise(amountInput);
      if (p > 0) parsedAmountPaise = p;
    } catch {
      parsedAmountPaise = null;
    }
  }

  const equalPreviewMap = new Map<string, number>();
  if (parsedAmountPaise !== null && selectedIds.length > 0) {
    for (const s of splitEqually(parsedAmountPaise, selectedIds)) {
      equalPreviewMap.set(s.user_id, s.share_paise);
    }
  }

  let exactTotalPaise = 0;
  let exactHasInvalid = false;
  const exactParsedMap = new Map<string, number>();
  for (const m of members) {
    const raw = (exactInputs[m.user_id] ?? '').trim();
    if (!raw) {
      exactParsedMap.set(m.user_id, 0);
      continue;
    }
    try {
      const p = toPaise(raw);
      exactParsedMap.set(m.user_id, p);
      exactTotalPaise += p;
    } catch {
      exactHasInvalid = true;
    }
  }

  const toggleMember = (userId: string) => {
    setSelectedIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError('Please enter a description.');
      return;
    }

    let amountPaise: number;
    try {
      amountPaise = toPaise(amountInput);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Enter a valid amount.');
      return;
    }

    if (amountPaise <= 0) {
      setError('Amount must be greater than ₹0.00.');
      return;
    }

    let splits: SplitInput[];
    if (splitMode === 'equal') {
      if (selectedIds.length === 0) {
        setError('Select at least one person to split with.');
        return;
      }
      splits = splitEqually(amountPaise, selectedIds);
    } else {
      if (exactHasInvalid) {
        setError('Check the individual split amounts for formatting errors.');
        return;
      }
      if (exactTotalPaise !== amountPaise) {
        const diff = amountPaise - exactTotalPaise;
        setError(
          diff > 0
            ? `Split shares are short by ${formatINR(diff)}.`
            : `Split shares exceed the total by ${formatINR(-diff)}.`,
        );
        return;
      }
      splits = members.map((m) => ({
        user_id: m.user_id,
        share_paise: exactParsedMap.get(m.user_id) ?? 0,
      }));
    }

    setSubmitting(true);
    try {
      await addExpense({
        groupId,
        description: description.trim(),
        amountPaise,
        paidBy,
        splits,
      });
      await onAdded();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const remainingExactPaise =
    parsedAmountPaise !== null ? parsedAmountPaise - exactTotalPaise : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-expense-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs sm:items-center sm:p-4"
    >
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-xl sm:rounded-2xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h2 id="add-expense-title" className="text-base font-semibold text-slate-900">
            Add expense
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden" noValidate>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                {error}
              </div>
            )}

            <div>
              <label htmlFor="expense-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
                Description
              </label>
              <input
                id="expense-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Dinner, Cab fare, Groceries"
                maxLength={100}
                disabled={submitting}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="expense-amount" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Amount (₹)
                </label>
                <input
                  id="expense-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  placeholder="0.00"
                  disabled={submitting}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>

              <div>
                <label htmlFor="expense-payer" className="mb-1.5 block text-sm font-medium text-slate-700">
                  Paid by
                </label>
                <select
                  id="expense-payer"
                  value={paidBy}
                  onChange={(e) => setPaidBy(e.target.value)}
                  disabled={submitting}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.user_id === currentUserId ? `${m.name} (You)` : m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">Split</span>
                <div className="inline-flex rounded-xl bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setSplitMode('equal')}
                    className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                      splitMode === 'equal'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Equal
                  </button>
                  <button
                    type="button"
                    onClick={() => setSplitMode('exact')}
                    className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                      splitMode === 'exact'
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Exact amounts
                  </button>
                </div>
              </div>

              {splitMode === 'equal' ? (
                <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                  {members.map((m) => {
                    const checked = selectedIds.includes(m.user_id);
                    const preview = equalPreviewMap.get(m.user_id);
                    return (
                      <label
                        key={m.user_id}
                        className="flex min-h-[48px] cursor-pointer items-center justify-between gap-3 px-3.5 py-2 hover:bg-slate-50"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleMember(m.user_id)}
                            disabled={submitting}
                            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="truncate text-sm font-medium text-slate-800">
                            {m.user_id === currentUserId ? `${m.name} (You)` : m.name}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs font-medium text-slate-600 tabular-nums">
                          {checked && preview !== undefined ? formatINR(preview) : '₹0.00'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                    {members.map((m) => (
                      <div
                        key={m.user_id}
                        className="flex min-h-[52px] items-center justify-between gap-3 px-3.5 py-2"
                      >
                        <label
                          htmlFor={`exact-${m.user_id}`}
                          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800"
                        >
                          {m.user_id === currentUserId ? `${m.name} (You)` : m.name}
                        </label>
                        <div className="flex w-32 shrink-0 items-center rounded-lg border border-slate-300 bg-white px-2.5 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20">
                          <span className="text-xs text-slate-400">₹</span>
                          <input
                            id={`exact-${m.user_id}`}
                            type="text"
                            inputMode="decimal"
                            value={exactInputs[m.user_id] ?? ''}
                            onChange={(e) =>
                              setExactInputs((prev) => ({
                                ...prev,
                                [m.user_id]: e.target.value,
                              }))
                            }
                            placeholder="0.00"
                            disabled={submitting}
                            className="h-9 w-full bg-transparent pl-1 text-right font-mono text-sm text-slate-900 focus:outline-none"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {remainingExactPaise !== null && !exactHasInvalid && (
                    <p
                      className={`text-right font-mono text-xs font-medium tabular-nums ${
                        remainingExactPaise === 0
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {remainingExactPaise === 0
                        ? `Matched total (${formatINR(exactTotalPaise)})`
                        : remainingExactPaise > 0
                          ? `Remaining to assign: ${formatINR(remainingExactPaise)}`
                          : `Over total by: ${formatINR(-remainingExactPaise)}`}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 px-5 py-3.5 pb-safe">
            <button
              type="submit"
              disabled={submitting}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving expense...' : 'Save expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
