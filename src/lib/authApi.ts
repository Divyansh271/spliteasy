import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { requireSupabase } from './supabase';
import type { AuthUser, Profile } from './types';

function mapAuthError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'Something went wrong. Please try again.';

  const msg = raw.toLowerCase();

  if (msg.includes('invalid login credentials') || msg.includes('invalid_credentials')) {
    return 'Incorrect email or password. Please try again.';
  }
  if (msg.includes('already registered') || msg.includes('user_already_exists')) {
    return 'This email is already registered. Try logging in instead.';
  }
  if (msg.includes('at least 6 characters') || msg.includes('weak_password')) {
    return 'Password must be at least 6 characters long.';
  }
  if (msg.includes('invalid email') || msg.includes('unable to validate email')) {
    return 'Please enter a valid email address.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Please verify your email address from the confirmation link before logging in.';
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('load failed')) {
    return 'Network error. Check your internet connection and try again.';
  }

  return raw;
}

export function extractAuthUser(user: User, profile?: Profile | null): AuthUser {
  const email = user.email ?? '';
  const metadataName =
    typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';
  const emailPrefix = email.includes('@') ? email.split('@')[0] : 'Member';
  const name = profile?.name?.trim() || metadataName || emailPrefix;

  return {
    id: user.id,
    email,
    name,
  };
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) {
    throw new Error(mapAuthError(error));
  }
  return data.session;
}

export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void,
): () => void {
  const {
    data: { subscription },
  } = requireSupabase().auth.onAuthStateChange(callback);

  return () => {
    subscription.unsubscribe();
  };
}

export async function signInWithPassword(email: string, password: string): Promise<Session | null> {
  const cleanEmail = email.trim();
  if (!cleanEmail) {
    throw new Error('Please enter your email address.');
  }
  if (!password) {
    throw new Error('Please enter your password.');
  }

  try {
    const { data, error } = await requireSupabase().auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      throw new Error(mapAuthError(error));
    }

    return data.session;
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export interface SignUpResult {
  session: Session | null;
  needsEmailConfirmation: boolean;
}

export async function signUpWithEmail(
  name: string,
  email: string,
  password: string,
): Promise<SignUpResult> {
  const cleanName = name.trim();
  const cleanEmail = email.trim();

  if (!cleanName) {
    throw new Error('Please enter your display name.');
  }
  if (!cleanEmail) {
    throw new Error('Please enter your email address.');
  }
  if (password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  try {
    const { data, error } = await requireSupabase().auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: { name: cleanName },
      },
    });

    if (error) {
      throw new Error(mapAuthError(error));
    }

    return {
      session: data.session,
      needsEmailConfirmation: Boolean(data.user && !data.session),
    };
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function signOut(): Promise<void> {
  try {
    const { error } = await requireSupabase().auth.signOut();
    if (error) {
      throw new Error(mapAuthError(error));
    }
  } catch (err) {
    throw new Error(mapAuthError(err));
  }
}

export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, name, created_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(mapAuthError(error));
  }

  return data;
}
