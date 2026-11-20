-- =====================================================================
-- SplitEasy migration #2: expenses + settle-up
-- Run once in Supabase -> SQL Editor (after the original schema.sql).
--
-- Idea: clients can no longer INSERT/UPDATE expenses, splits or
-- settlements directly. They must go through the RPCs below, which
-- validate everything in ONE transaction (splits add up to the total,
-- everyone involved is a group member, etc).
-- Deleting stays allowed for group members (RLS delete policies stay).
-- Editing an expense = delete it and add it again.
-- =====================================================================


-- 1. Lock direct writes (reads and deletes stay as they were)
drop policy if exists "expenses_insert"           on public.expenses;
drop policy if exists "expenses_update"           on public.expenses;
drop policy if exists "expenses_insert_member"    on public.expenses;
drop policy if exists "expenses_update_member"    on public.expenses;
drop policy if exists "splits_insert"             on public.expense_splits;
drop policy if exists "splits_update"             on public.expense_splits;
drop policy if exists "expense_splits_insert_member" on public.expense_splits;
drop policy if exists "expense_splits_update_member" on public.expense_splits;
drop policy if exists "settlements_insert"        on public.settlements;
drop policy if exists "settlements_update"        on public.settlements;
drop policy if exists "settlements_insert_member" on public.settlements;
drop policy if exists "settlements_update_member" on public.settlements;


-- 2. add_expense: creates the expense + all its splits atomically
--    p_splits looks like: [{"user_id": "<uuid>", "share_paise": 3334}, ...]
--    Returns the new expense id.
create or replace function public.add_expense(
  p_group_id      uuid,
  p_description   text,
  p_amount_paise  bigint,
  p_paid_by       uuid,
  p_splits        jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id       uuid;
  s            jsonb;
  split_uid    uuid;
  split_share  bigint;
  total        bigint := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  if p_description is null or char_length(trim(p_description)) = 0 then
    raise exception 'Description is required';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_paid_by
  ) then
    raise exception 'Payer is not in this group';
  end if;
  if p_splits is null or jsonb_typeof(p_splits) <> 'array' or jsonb_array_length(p_splits) = 0 then
    raise exception 'At least one split is required';
  end if;

  -- no person listed twice
  if (select count(distinct x->>'user_id') from jsonb_array_elements(p_splits) x)
       <> jsonb_array_length(p_splits) then
    raise exception 'A person appears twice in the split';
  end if;

  -- validate every split and add up the shares
  for s in select * from jsonb_array_elements(p_splits) loop
    split_uid   := (s->>'user_id')::uuid;
    split_share := (s->>'share_paise')::bigint;

    if split_share is null or split_share < 0 then
      raise exception 'Invalid share amount';
    end if;
    if not exists (
      select 1 from public.group_members
      where group_id = p_group_id and user_id = split_uid
    ) then
      raise exception 'Someone in the split is not in this group';
    end if;

    total := total + split_share;
  end loop;

  if total <> p_amount_paise then
    raise exception 'Shares (% paise) must add up to the amount (% paise)', total, p_amount_paise;
  end if;

  insert into public.expenses (group_id, description, amount_paise, paid_by)
  values (p_group_id, trim(p_description), p_amount_paise, p_paid_by)
  returning id into new_id;

  insert into public.expense_splits (expense_id, user_id, share_paise)
  select new_id, (e->>'user_id')::uuid, (e->>'share_paise')::bigint
  from jsonb_array_elements(p_splits) e
  where (e->>'share_paise')::bigint > 0;

  return new_id;
end;
$$;


-- 3. record_settlement: "from_user paid to_user this amount"
create or replace function public.record_settlement(
  p_group_id      uuid,
  p_from_user     uuid,
  p_to_user       uuid,
  p_amount_paise  bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_group_member(p_group_id) then
    raise exception 'Not a member of this group';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_from_user = p_to_user then
    raise exception 'Cannot settle with yourself';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_from_user)
     or not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_to_user) then
    raise exception 'Both people must be in this group';
  end if;

  insert into public.settlements (group_id, from_user, to_user, amount_paise)
  values (p_group_id, p_from_user, p_to_user, p_amount_paise)
  returning id into new_id;

  return new_id;
end;
$$;


-- 4. Permissions: logged-in users only
revoke execute on function public.add_expense(uuid, text, bigint, uuid, jsonb) from public, anon;
revoke execute on function public.record_settlement(uuid, uuid, uuid, bigint)  from public, anon;
grant  execute on function public.add_expense(uuid, text, bigint, uuid, jsonb) to authenticated;
grant  execute on function public.record_settlement(uuid, uuid, uuid, bigint)  to authenticated;

-- 5. Refresh PostgREST schema cache so the new RPCs are immediately callable
notify pgrst, 'reload schema';
