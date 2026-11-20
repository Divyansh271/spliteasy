import { useEffect, useState, type FormEvent } from 'react';
import { recordSettlement } from '../lib/expensesApi';
import { toPaise } from '../lib/money';
import type { GroupMemberProfile } from '../lib/types';

interface SettleUpModalProps {
  open: boolean;
  groupId: string;
  members: GroupMemberProfile[];
  currentUserId: string;
  initialFromUser?: string;
  initialToUser?: string;
  initialAmountPaise?: number;
  onClose: () => void;
  onSettled: () => Promise<void> | void;
}

function paiseToInput(paise?: number): string {
  if (!paise || paise <= 0) return '';
  const rupees = Math.floor(paise / 100);
  const rem = paise % 100;
  return `${rupees}.${String(rem).padStart(2, '0')}`;
}

export function SettleUpModal({
  open,
  groupId,
  members,
  currentUserId,
  initialFromUser,
  initialToUser,
  initialAmountPaise,
  onClose,
  onSettled,
}: SettleUpModalProps) {
  const [fromUser, setFromUser] = useState(currentUserId);
  const [toUser, setToUser] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const defaultFrom =
      initialFromUser ||
      (members.some((m) => m.user_id === currentUserId)
        ? currentUserId
        : (members[0]?.user_id ?? ''));
    const fallbackTo =
      members.find((m) => m.user_id !== defaultFrom)?.user_id ?? '';
    setFromUser(defaultFrom);
    setToUser(initialToUser || fallbackTo);
    setAmountInput(paiseToInput(initialAmountPaise));
    setError(null);
  }, [open, members, currentUserId, initialFromUser, initialToUser, initialAmountPaise]);

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fromUser || !toUser) {
      setError('Please select both members.');
      return;
    }
    if (fromUser === toUser) {
      setError('Cannot settle with yourself. Pick two different people.');
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

    setSubmitting(true);
    try {
      await recordSettlement({
        groupId,
        fromUser,
        toUser,
        amountPaise,
      });
      await onSettled();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record settlement.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settle-up-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-xs dark:bg-black/70 sm:items-center sm:p-4"
    >
      <div className="flex w-full max-w-md flex-col rounded-t-3xl bg-white shadow-xl dark:border dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />

        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h2 id="settle-up-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Record settlement
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4 pb-safe" noValidate>
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/50 dark:text-red-300"
            >
              {error}
            </div>
          )}

          <div>
            <label htmlFor="settle-from" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Who paid
            </label>
            <select
              id="settle-from"
              value={fromUser}
              onChange={(e) => setFromUser(e.target.value)}
              disabled={submitting}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_id === currentUserId ? `${m.name} (You)` : m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="settle-to" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Paid to
            </label>
            <select
              id="settle-to"
              value={toUser}
              onChange={(e) => setToUser(e.target.value)}
              disabled={submitting}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            >
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user_id === currentUserId ? `${m.name} (You)` : m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="settle-amount" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
              Amount (₹)
            </label>
            <input
              id="settle-amount"
              type="text"
              inputMode="decimal"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              placeholder="0.00"
              disabled={submitting}
              className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-base text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900"
          >
            {submitting ? 'Recording...' : 'Record payment'}
          </button>
        </form>
      </div>
    </div>
  );
}
