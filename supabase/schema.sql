-- ============================================================================
-- SplitEasy Database Schema, RLS Policies, Triggers & RPCs
-- Run this entire script in the Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. Tables
-- ----------------------------------------------------------------------------

-- Public user profiles linked 1:1 with auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Expense-sharing groups
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  join_code text unique not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Many-to-many membership join table
create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- Group expenses (all monetary amounts stored as integer paise)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null check (char_length(trim(description)) > 0),
  amount_paise bigint not null check (amount_paise > 0),
  paid_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Per-member shares for each expense
create table if not exists public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete restrict,
  share_paise bigint not null check (share_paise >= 0),
  primary key (expense_id, user_id)
);

-- Recorded settlements between two group members
create table if not exists public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  from_user uuid not null references public.profiles(id) on delete restrict,
  to_user uuid not null references public.profiles(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  created_at timestamptz not null default now()
);

-- Helpful indexes for membership and group queries
create index if not exists idx_group_members_user_id on public.group_members(user_id);
create index if not exists idx_expenses_group_id on public.expenses(group_id);
create index if not exists idx_settlements_group_id on public.settlements(group_id);

-- ----------------------------------------------------------------------------
-- 3. Auth User -> Profile Trigger
-- Automatically creates a profiles row whenever a new user signs up.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  display_name text;
begin
  display_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Member'
  );

  insert into public.profiles (id, name)
  values (new.id, display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. Membership Helper (SECURITY DEFINER)
-- Used in RLS policies so group_members never queries itself recursively.
-- ----------------------------------------------------------------------------
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = gid
      and user_id = auth.uid()
  );
$$;

revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Enable Row Level Security (RLS) on ALL tables
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.settlements enable row level security;

-- ----------------------------------------------------------------------------
-- 6. RLS Policies
-- ----------------------------------------------------------------------------

-- PROFILES:
-- Users can read their own profile or profiles of users who share a group.
-- Users can update only their own profile.
drop policy if exists "profiles_select_own_or_shared_group" on public.profiles;
create policy "profiles_select_own_or_shared_group"
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.group_members gm
      where gm.user_id = profiles.id
        and public.is_group_member(gm.group_id)
    )
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- GROUPS:
-- Members can select groups they belong to.
-- No direct insert/update/delete from clients (creation happens via RPC).
drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member"
  on public.groups
  for select
  to authenticated
  using (public.is_group_member(id));

-- GROUP_MEMBERS:
-- Members can view fellow memberships in groups they belong to.
-- Uses is_group_member(group_id) to avoid infinite self-recursion.
-- No direct insert (joining happens via RPC). Users may delete their own row to leave.
drop policy if exists "group_members_select_member" on public.group_members;
create policy "group_members_select_member"
  on public.group_members
  for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "group_members_delete_self" on public.group_members;
create policy "group_members_delete_self"
  on public.group_members
  for delete
  to authenticated
  using (user_id = auth.uid());

-- EXPENSES:
-- Full CRUD restricted to members of the expense's group.
drop policy if exists "expenses_select_member" on public.expenses;
create policy "expenses_select_member"
  on public.expenses
  for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "expenses_insert_member" on public.expenses;
create policy "expenses_insert_member"
  on public.expenses
  for insert
  to authenticated
  with check (public.is_group_member(group_id));

drop policy if exists "expenses_update_member" on public.expenses;
create policy "expenses_update_member"
  on public.expenses
  for update
  to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists "expenses_delete_member" on public.expenses;
create policy "expenses_delete_member"
  on public.expenses
  for delete
  to authenticated
  using (public.is_group_member(group_id));

-- EXPENSE_SPLITS:
-- Full CRUD restricted to members of the parent expense's group.
drop policy if exists "expense_splits_select_member" on public.expense_splits;
create policy "expense_splits_select_member"
  on public.expense_splits
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_splits_insert_member" on public.expense_splits;
create policy "expense_splits_insert_member"
  on public.expense_splits
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_splits_update_member" on public.expense_splits;
create policy "expense_splits_update_member"
  on public.expense_splits
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id)
    )
  )
  with check (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id)
    )
  );

drop policy if exists "expense_splits_delete_member" on public.expense_splits;
create policy "expense_splits_delete_member"
  on public.expense_splits
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.expenses e
      where e.id = expense_id
        and public.is_group_member(e.group_id)
    )
  );

-- SETTLEMENTS:
-- Full CRUD restricted to members of the settlement's group.
drop policy if exists "settlements_select_member" on public.settlements;
create policy "settlements_select_member"
  on public.settlements
  for select
  to authenticated
  using (public.is_group_member(group_id));

drop policy if exists "settlements_insert_member" on public.settlements;
create policy "settlements_insert_member"
  on public.settlements
  for insert
  to authenticated
  with check (public.is_group_member(group_id));

drop policy if exists "settlements_update_member" on public.settlements;
create policy "settlements_update_member"
  on public.settlements
  for update
  to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id));

drop policy if exists "settlements_delete_member" on public.settlements;
create policy "settlements_delete_member"
  on public.settlements
  for delete
  to authenticated
  using (public.is_group_member(group_id));

-- ----------------------------------------------------------------------------
-- 7. RPC Functions (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Creates a group with a random 6-character uppercase alphanumeric join_code
-- (retrying on collision), adds the caller as a member, and returns the group.
create or replace function public.create_group(name text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  clean_name text := trim(coalesce(name, ''));
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate_code text;
  new_group public.groups;
  attempts int := 0;
  i int;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(clean_name) = 0 then
    raise exception 'Group name is required';
  end if;

  -- Backfill profile row if user signed up before trigger was installed
  insert into public.profiles (id, name)
  select
    u.id,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Member'
    )
  from auth.users u
  where u.id = caller_id
  on conflict (id) do nothing;

  loop
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'Could not generate a unique join code, please try again';
    end if;

    candidate_code := '';
    for i in 1..6 loop
      candidate_code := candidate_code || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;

    begin
      insert into public.groups (name, join_code, created_by)
      values (clean_name, candidate_code, caller_id)
      returning * into new_group;
      exit;
    exception
      when unique_violation then
        -- Collision on join_code; loop and generate a fresh code
        null;
    end;
  end loop;

  insert into public.group_members (group_id, user_id)
  values (new_group.id, caller_id)
  on conflict (group_id, user_id) do nothing;

  return new_group;
end;
$$;

revoke all on function public.create_group(text) from public;
grant execute on function public.create_group(text) to authenticated;

-- Joins a group by case-insensitive join code. Succeeds idempotently if already
-- a member, or raises 'Invalid join code' if not found.
create or replace function public.join_group_by_code(code text)
returns public.groups
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  clean_code text := upper(trim(coalesce(code, '')));
  target_group public.groups;
begin
  if caller_id is null then
    raise exception 'Authentication required';
  end if;

  if char_length(clean_code) = 0 then
    raise exception 'Invalid join code';
  end if;

  select *
  into target_group
  from public.groups g
  where upper(g.join_code) = clean_code
  limit 1;

  if not found then
    raise exception 'Invalid join code';
  end if;

  -- Backfill profile row if user signed up before trigger was installed
  insert into public.profiles (id, name)
  select
    u.id,
    coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
      'Member'
    )
  from auth.users u
  where u.id = caller_id
  on conflict (id) do nothing;

  insert into public.group_members (group_id, user_id)
  values (target_group.id, caller_id)
  on conflict (group_id, user_id) do nothing;

  return target_group;
end;
$$;

revoke all on function public.join_group_by_code(text) from public;
grant execute on function public.join_group_by_code(text) to authenticated;

-- Returns (user_id, name) for all members of a group, only if caller is a member.
create or replace function public.get_group_members(gid uuid)
returns table (user_id uuid, name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not public.is_group_member(gid) then
    raise exception 'Not a member of this group';
  end if;

  return query
  select gm.user_id, p.name
  from public.group_members gm
  join public.profiles p on p.id = gm.user_id
  where gm.group_id = gid
  order by gm.joined_at asc;
end;
$$;

revoke all on function public.get_group_members(uuid) from public;
grant execute on function public.get_group_members(uuid) to authenticated;
