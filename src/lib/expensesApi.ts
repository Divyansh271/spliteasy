import { requireSupabase } from './supabase';
import type { ExpenseSplit, ExpenseWithSplits, Settlement, SplitInput } from './types';

function mapExpenseError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Something went wrong. Please try again.';

  const msg = raw.toLowerCase();

  if (msg.includes('not a member') || msg.includes('row-level security')) {
    return 'You do not have permission to modify expenses in this group.';
  }
  if (msg.includes('description is required')) {
    return 'Please enter a description.';
  }
  if (msg.includes('amount must be greater than zero')) {
    return 'Amount must be greater than ₹0.00.';
  }
  if (msg.includes('cannot settle with yourself')) {
    return 'Choose two different people to record a settlement.';
  }
  if (msg.includes('foreign key')) {
    return 'One of the selected people is not a valid member of this group.';
  }
  if (msg.includes('check constraint')) {
    return 'Amount must be greater than ₹0.00.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Network error. Check your internet connection and try again.';
  }

  return raw;
}

interface RawExpenseRow {
  id: string;
  group_id: string;
  description: string;
  amount_paise: number | string;
  paid_by: string;
  created_at: string;
  expense_splits?: Array<{
    expense_id: string;
    user_id: string;
    share_paise: number | string;
  }>;
}

export async function listGroupExpenses(groupId: string): Promise<ExpenseWithSplits[]> {
  try {
    const { data, error } = await requireSupabase()
      .from('expenses')
      .select(
        'id, group_id, description, amount_paise, paid_by, created_at, expense_splits(expense_id, user_id, share_paise)',
      )
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(mapExpenseError(error));
    }

    return ((data ?? []) as RawExpenseRow[]).map((row) => ({
      id: row.id,
      group_id: row.group_id,
      description: row.description,
      amount_paise: Number(row.amount_paise),
      paid_by: row.paid_by,
      created_at: row.created_at,
      splits: (row.expense_splits ?? []).map(
        (split): ExpenseSplit => ({
          expense_id: split.expense_id,
          user_id: split.user_id,
          share_paise: Number(split.share_paise),
        }),
      ),
    }));
  } catch (err) {
    throw new Error(mapExpenseError(err));
  }
}

export async function listGroupSettlements(groupId: string): Promise<Settlement[]> {
  try {
    const { data, error } = await requireSupabase()
      .from('settlements')
      .select('id, group_id, from_user, to_user, amount_paise, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(mapExpenseError(error));
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      group_id: row.group_id,
      from_user: row.from_user,
      to_user: row.to_user,
      amount_paise: Number(row.amount_paise),
      created_at: row.created_at,
    }));
  } catch (err) {
    throw new Error(mapExpenseError(err));
  }
}

export interface AddExpenseParams {
  groupId: string;
  description: string;
  amountPaise: number;
  paidBy: string;
  splits: SplitInput[];
}

export async function addExpense(params: AddExpenseParams): Promise<string> {
  // 1. Validate inputs strictly before sending any request
  const cleanDescription = params.description.trim();
  if (!cleanDescription) {
    throw new Error('Please enter a description.');
  }
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error('Amount must be greater than ₹0.00.');
  }
  if (!params.paidBy) {
    throw new Error('Please select who paid.');
  }
  if (!Array.isArray(params.splits) || params.splits.length === 0) {
    throw new Error('Select at least one person to split this expense with.');
  }

  const seenUsers = new Set<string>();
  let totalShares = 0;

  for (const split of params.splits) {
    if (!split.user_id) {
      throw new Error('Invalid member in split.');
    }
    if (seenUsers.has(split.user_id)) {
      throw new Error('Each person can only appear once in the split.');
    }
    seenUsers.add(split.user_id);

    if (!Number.isInteger(split.share_paise) || split.share_paise < 0) {
      throw new Error('Each share must be a valid non-negative amount.');
    }
    totalShares += split.share_paise;
  }

  if (totalShares !== params.amountPaise) {
    throw new Error('Split shares must add up exactly to the total amount.');
  }

  const supabase = requireSupabase();

  // 2. Insert the expense row and retrieve its generated id
  let expenseId: string;
  try {
    const { data: expenseRow, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        group_id: params.groupId,
        description: cleanDescription,
        amount_paise: params.amountPaise,
        paid_by: params.paidBy,
      })
      .select('id')
      .single();

    if (expenseError || !expenseRow) {
      throw new Error(mapExpenseError(expenseError ?? 'Could not save expense.'));
    }
    expenseId = String(expenseRow.id);
  } catch (err) {
    throw new Error(mapExpenseError(err));
  }

  // 3. Insert non-zero splits; if this fails, clean up the expense row first
  const nonZeroSplits = params.splits
    .filter((s) => s.share_paise > 0)
    .map((s) => ({
      expense_id: expenseId,
      user_id: s.user_id,
      share_paise: s.share_paise,
    }));

  try {
    const { error: splitsError } = await supabase
      .from('expense_splits')
      .insert(nonZeroSplits);

    if (splitsError) {
      throw splitsError;
    }

    return expenseId;
  } catch (err) {
    await supabase.from('expenses').delete().eq('id', expenseId);
    throw new Error(mapExpenseError(err));
  }
}

export async function deleteExpense(expenseId: string): Promise<void> {
  try {
    const { error } = await requireSupabase().from('expenses').delete().eq('id', expenseId);

    if (error) {
      throw new Error(mapExpenseError(error));
    }
  } catch (err) {
    throw new Error(mapExpenseError(err));
  }
}

export interface RecordSettlementParams {
  groupId: string;
  fromUser: string;
  toUser: string;
  amountPaise: number;
}

export async function recordSettlement(params: RecordSettlementParams): Promise<string> {
  if (!Number.isInteger(params.amountPaise) || params.amountPaise <= 0) {
    throw new Error('Amount must be greater than ₹0.00.');
  }
  if (!params.fromUser || !params.toUser) {
    throw new Error('Please select both members.');
  }
  if (params.fromUser === params.toUser) {
    throw new Error('Choose two different people to record a settlement.');
  }

  try {
    const { data, error } = await requireSupabase()
      .from('settlements')
      .insert({
        group_id: params.groupId,
        from_user: params.fromUser,
        to_user: params.toUser,
        amount_paise: params.amountPaise,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(mapExpenseError(error ?? 'Could not record settlement.'));
    }

    return String(data.id);
  } catch (err) {
    throw new Error(mapExpenseError(err));
  }
}

export async function deleteSettlement(settlementId: string): Promise<void> {
  try {
    const { error } = await requireSupabase()
      .from('settlements')
      .delete()
      .eq('id', settlementId);

    if (error) {
      throw new Error(mapExpenseError(error));
    }
  } catch (err) {
    throw new Error(mapExpenseError(err));
  }
}
