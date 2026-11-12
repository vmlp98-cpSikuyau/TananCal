import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { useDb, useMyProfile, useRun } from '../../lib/data';
import type { Prefs } from '../../lib/types';

export type Theme = 'dark' | 'light';

export function getTheme(): Theme {
  try { return localStorage.getItem('tanancal-theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}
export function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('tanancal-theme', t); } catch { /* storage unavailable */ }
}

const NOTIFS: { key: keyof Prefs; label: string; hint: string; defaultOn: boolean }[] = [
  { key: 'notify_invites', label: 'Group invitations', hint: 'Alert me when someone invites me to a group.', defaultOn: true },
  { key: 'notify_declines', label: 'Declined invitations', hint: 'Alert me when someone declines an invite I sent.', defaultOn: true },
  { key: 'notify_changes', label: 'New events from others', hint: 'Alert me when a group member plans a new event.', defaultOn: false },
  { key: 'notify_reminders', label: 'Event reminders', hint: 'Remind me about 1 hour before an event starts (while TananCal is open).', defaultOn: false },
];

export function SettingsPage() {
  const { user } = useAuth();
  const me = useMyProfile();
  const db = useDb();
  const run = useRun();
  const [theme, setTheme] = useState<Theme>(getTheme());
  useEffect(() => applyTheme(theme), [theme]);

  if (!me || !user) return null;
  const prefs = me.prefs ?? {};

  async function toggle(key: keyof Prefs, value: boolean) {
    await run(async () => {
      const { error } = await supabase.from('profiles').upsert({
        user_id: user!.id, display_name: me!.display_name, emoji: me!.emoji, avatar_url: me!.avatar_url,
        visibility: me!.visibility, prefs: { ...prefs, [key]: value },
      });
      if (error) throw error;
      await db.refresh('profiles');
    });
  }

  return (
    <div className="page narrow">
      <div className="page-head"><h1>Settings</h1></div>

      <section className="card">
        <h2>Appearance</h2>
        <div className="seg" role="radiogroup" aria-label="Theme">
          {(['dark', 'light'] as Theme[]).map((t) => (
            <button key={t} role="radio" aria-checked={theme === t} className={`seg-btn${theme === t ? ' active' : ''}`} onClick={() => setTheme(t)}>
              {t === 'dark' ? 'Dark (default)' : 'Light'}
            </button>
          ))}
        </div>
        <p className="muted small">Remembered on this device.</p>
      </section>

      <section className="card">
        <h2>Notifications</h2>
        <ul className="list">
          {NOTIFS.map((n) => (
            <li key={n.key} className="list-item">
              <div className="grow"><strong>{n.label}</strong><div className="muted small">{n.hint}</div></div>
              <label className="switch">
                <input type="checkbox" role="switch" checked={prefs[n.key] ?? n.defaultOn} onChange={(e) => toggle(n.key, e.target.checked)} />
                <span className="sr-only">{n.label}</span>
                <span className="switch-track" aria-hidden="true" />
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Session</h2>
        <button className="btn" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </section>
    </div>
  );
}
