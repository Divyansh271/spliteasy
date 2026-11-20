export interface Profile {
  id: string;
  name: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  join_code: string;
  created_by: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface GroupMemberProfile {
  user_id: string;
  name: string;
}

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount_paise: number;
  paid_by: string;
  created_at: string;
}

export interface ExpenseSplit {
  expense_id: string;
  user_id: string;
  share_paise: number;
}

export interface ExpenseWithSplits extends Expense {
  splits: ExpenseSplit[];
}

export interface SplitInput {
  user_id: string;
  share_paise: number;
}

export interface Settlement {
  id: string;
  group_id: string;
  from_user: string;
  to_user: string;
  amount_paise: number;
  created_at: string;
}

export interface SuggestedTransfer {
  from_user: string;
  to_user: string;
  amount_paise: number;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}
