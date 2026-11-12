import { useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabase';
import { friendlyAuthError, useAuth } from './AuthProvider';
import { isValidEmail } from '../../lib/utils';
import { Logo } from '../../components/Logo';

type Mode = 'signin' | 'signup' | 'forgot';

export function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function switchMode(m: Mode) {
    setMode(m);
    setError('');
    setNotice('');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');
    if (!isValidEmail(email)) return setError('Enter a valid email address.');
    if (mode !== 'forgot' && password.length < 8) return setError('Password must be at least 8 characters.');
    if (mode === 'signup' && !name.trim()) return setError('Enter your display name.');
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setNotice('Account created. We sent a verification link to your email. Open it, then sign in.');
          setMode('signin');
          setPassword('');
        }
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        setNotice('If an account exists for that email, a reset link is on its way.');
      }
    } catch (err) {
      setError(friendlyAuthError((err as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="card auth-card" onSubmit={submit} noValidate>
        <div className="auth-brand">
          <Logo size={56} />
          <h1>TananCal</h1>
          <p className="muted">Keep every group in sync.</p>
        </div>
        <h2>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}</h2>

        {mode === 'signup' && (
          <label className="field">
            <span>Display name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required />
          </label>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </label>
        {mode !== 'forgot' && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              required
            />
            {mode === 'signup' && <small className="muted">At least 8 characters.</small>}
          </label>
        )}

        {error && <div className="form-error" role="alert">{error}</div>}
        {notice && <div className="form-notice" role="status">{notice}</div>}

        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
        </button>

        <div className="auth-links">
          {mode === 'signin' && (
            <>
              <button type="button" className="link" onClick={() => switchMode('forgot')}>Forgot password?</button>
              <button type="button" className="link" onClick={() => switchMode('signup')}>Create an account</button>
            </>
          )}
          {mode !== 'signin' && (
            <button type="button" className="link" onClick={() => switchMode('signin')}>Back to sign in</button>
          )}
        </div>
      </form>
    </main>
  );
}

/** Shown after following a password-reset email link. */
export function ResetPasswordScreen() {
  const { clearRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(friendlyAuthError(error.message));
    clearRecovery();
  }

  return (
    <main className="auth-screen">
      <form className="card auth-card" onSubmit={submit}>
        <div className="auth-brand"><Logo size={56} /><h1>TananCal</h1></div>
        <h2>Choose a new password</h2>
        <label className="field"><span>New password</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
        </label>
        <label className="field"><span>Confirm password</span>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        {error && <div className="form-error" role="alert">{error}</div>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
      </form>
    </main>
  );
}

/** Signed in but email not verified yet (e.g. after an email change). */
export function VerifyScreen() {
  const { user } = useAuth();
  const [sent, setSent] = useState(false);
  async function resend() {
    if (!user?.email) return;
    await supabase.auth.resend({ type: 'signup', email: user.email });
    setSent(true);
  }
  return (
    <main className="auth-screen">
      <div className="card auth-card">
        <div className="auth-brand"><Logo size={56} /><h1>Verify your email</h1></div>
        <p>We sent a confirmation link to <strong>{user?.email}</strong>. Open it to unlock your groups.</p>
        {sent && <div className="form-notice">Verification email sent again.</div>}
        <button className="btn btn-primary btn-block" onClick={resend}>Resend email</button>
        <button className="btn btn-block" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>
    </main>
  );
}
