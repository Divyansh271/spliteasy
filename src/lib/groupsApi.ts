import { supabase } from './supabase';
import type { Group, GroupMemberProfile } from './types';

function mapGroupError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Something went wrong. Please try again.';

  const msg = raw.toLowerCase();

  if (msg.includes('invalid join code')) {
    return 'Invalid join code. Double-check the 6-character code and try again.';
  }
  if (msg.includes('group name is required')) {
    return 'Please enter a group name.';
  }
  if (msg.includes('not a member')) {
    return 'You do not have access to this group.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Network error. Check your internet connection and try again.';
  }

  return raw;
}

export async function listMyGroups(): Promise<Group[]> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, join_code, created_by, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(mapGroupError(error));
    }

    return data ?? [];
  } catch (err) {
    throw new Error(mapGroupError(err));
  }
}

export async function getGroupById(groupId: string): Promise<Group | null> {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, join_code, created_by, created_at')
      .eq('id', groupId)
      .maybeSingle();

    if (error) {
      throw new Error(mapGroupError(error));
    }

    return data;
  } catch (err) {
    throw new Error(mapGroupError(err));
  }
}

export async function createGroup(name: string): Promise<Group> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Please enter a group name.');
  }

  try {
    const { data, error } = await supabase.rpc('create_group', { name: trimmed });

    if (error) {
      throw new Error(mapGroupError(error));
    }

    if (!data) {
      throw new Error('Could not create group. Please try again.');
    }

    return data as Group;
  } catch (err) {
    throw new Error(mapGroupError(err));
  }
}

export async function joinGroupByCode(code: string): Promise<Group> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) {
    throw new Error('Please enter a join code.');
  }

  try {
    const { data, error } = await supabase.rpc('join_group_by_code', { code: trimmed });

    if (error) {
      throw new Error(mapGroupError(error));
    }

    if (!data) {
      throw new Error('Invalid join code.');
    }

    return data as Group;
  } catch (err) {
    throw new Error(mapGroupError(err));
  }
}

export async function getGroupMembers(groupId: string): Promise<GroupMemberProfile[]> {
  try {
    const { data, error } = await supabase.rpc('get_group_members', { gid: groupId });

    if (error) {
      throw new Error(mapGroupError(error));
    }

    return (data ?? []) as GroupMemberProfile[];
  } catch (err) {
    throw new Error(mapGroupError(err));
  }
}
