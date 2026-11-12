import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  recovery: boolean;
  verified: boolean;
  clearRecovery: () => void;
}

const Ctx = createContext<AuthState>({
  session: null, user: null, loading: true, recovery: false, verified: false, clearRecovery: () => {},
});
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      recovery,
      verified: Boolean(session?.user?.email_confirmed_at),
      clearRecovery: () => setRecovery(false),
    }),
    [session, loading, recovery],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with that email already exists. Try signing in.';
  if (m.includes('email not confirmed')) return 'Please verify your email first. Check your inbox for the confirmation link.';
  if (m.includes('password') && (m.includes('weak') || m.includes('at least') || m.includes('should contain'))) return 'That password is too weak. Use at least 8 characters.';
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('same password') || m.includes('different from the old')) return 'Choose a password different from your current one.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Cannot reach the server. Check your connection.';
  return message;
}
