import type { ExpenseWithSplits, Settlement, SplitInput, SuggestedTransfer } from './types';

/**
 * Converts a rupee string (e.g. "1,234.50", "99", "₹50.5") to integer paise
 * without using floating-point arithmetic.
 */
export function toPaise(rupeesString: string): number {
  const cleaned = rupeesString.replace(/[₹,\s]/g, '');
  if (!cleaned) {
    throw new Error('Amount is required');
  }

  // Normalize leading decimal like ".50" -> "0.50"
  const normalized = cleaned.startsWith('.') ? `0${cleaned}` : cleaned;
  const match = normalized.match(/^(\d+)(?:\.(\d{1,2}))?$/);

  if (!match) {
    throw new Error('Enter a valid amount with up to 2 decimal places');
  }

  const wholeRupees = Number.parseInt(match[1], 10);
  const paiseDigits = (match[2] ?? '').padEnd(2, '0');
  const fractionalPaise = Number.parseInt(paiseDigits, 10);

  return wholeRupees * 100 + fractionalPaise;
}

/**
 * Formats integer paise as Indian Rupee currency with Indian digit grouping,
 * e.g. 123450 -> "₹1,234.50", 10000000 -> "₹1,00,000.00".
 */
export function formatINR(paise: number): string {
  if (!Number.isFinite(paise)) {
    return '₹0.00';
  }

  const truncated = Math.trunc(paise);
  const isNegative = truncated < 0;
  const absPaise = Math.abs(truncated);
  const rupees = Math.floor(absPaise / 100);
  const remainder = absPaise % 100;

  const formattedRupees = new Intl.NumberFormat('en-IN').format(rupees);
  const formattedPaise = String(remainder).padStart(2, '0');

  return `${isNegative ? '-' : ''}₹${formattedRupees}.${formattedPaise}`;
}

/**
 * Splits an integer paise total as evenly as possible across userIds,
 * distributing any remainder 1 paisa at a time so the sum matches exactly.
 */
export function splitEqually(totalPaise: number, userIds: string[]): SplitInput[] {
  if (userIds.length === 0) return [];
  const base = Math.floor(totalPaise / userIds.length);
  const remainder = totalPaise % userIds.length;

  return userIds.map((user_id, index) => ({
    user_id,
    share_paise: base + (index < remainder ? 1 : 0),
  }));
}

/**
 * Computes net integer-paise balance for each member ID.
 * Positive = owed money, Negative = owes money.
 */
export function computeNetBalances(
  memberIds: string[],
  expenses: ExpenseWithSplits[],
  settlements: Settlement[],
): Record<string, number> {
  const balances: Record<string, number> = {};
  for (const id of memberIds) {
    balances[id] = 0;
  }

  for (const expense of expenses) {
    balances[expense.paid_by] = (balances[expense.paid_by] ?? 0) + Number(expense.amount_paise);
    for (const split of expense.splits) {
      balances[split.user_id] = (balances[split.user_id] ?? 0) - Number(split.share_paise);
    }
  }

  for (const settlement of settlements) {
    const amount = Number(settlement.amount_paise);
    balances[settlement.from_user] = (balances[settlement.from_user] ?? 0) + amount;
    balances[settlement.to_user] = (balances[settlement.to_user] ?? 0) - amount;
  }

  return balances;
}

/**
 * Simplifies net member balances into a minimal list of settle-up transfers.
 */
export function simplifyDebts(balances: Record<string, number>): SuggestedTransfer[] {
  const creditors: Array<{ userId: string; amount: number }> = [];
  const debtors: Array<{ userId: string; amount: number }> = [];

  for (const [userId, rawNet] of Object.entries(balances)) {
    const net = Math.trunc(rawNet);
    if (net > 0) {
      creditors.push({ userId, amount: net });
    } else if (net < 0) {
      debtors.push({ userId, amount: -net });
    }
  }

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transfers: SuggestedTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const transfer = Math.min(debtor.amount, creditor.amount);

    if (transfer > 0) {
      transfers.push({
        from_user: debtor.userId,
        to_user: creditor.userId,
        amount_paise: transfer,
      });
    }

    debtor.amount -= transfer;
    creditor.amount -= transfer;

    if (debtor.amount === 0) i += 1;
    if (creditor.amount === 0) j += 1;
  }

  return transfers;
}
