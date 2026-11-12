import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useDb, useMyProfile, usePlan, useRun } from '../lib/data';
import { useOnline } from '../lib/realtime';
import { Avatar } from './Avatar';
import { Logo } from './Logo';
import { useToast } from './Toast';
import { EventFormModal } from '../features/events/EventFormModal';
import { Modal } from './Modal';
import type { EventRow } from '../lib/types';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/groups', label: 'Groups' },
  { to: '/calendar', label: 'Calendar' },
  { to: '/profile', label: 'Profile' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const me = useMyProfile();
  const online = useOnline();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const [created, setCreated] = useState<EventRow | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useReminders();

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [menu]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="TananCal home">
          <Logo size={30} /><span className="brand-name">TananCal</span>
        </NavLink>
        <nav className="nav" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="topbar-right">
          <button className="btn btn-primary btn-quick" onClick={() => setQuick(true)} aria-label="Quick add event">+ <span className="hide-sm">Event</span></button>
          <div className="menu-wrap" ref={menuRef}>
            <button className="avatar-btn" aria-haspopup="menu" aria-expanded={menu} aria-label="Account menu" onClick={() => setMenu((m) => !m)}>
              <Avatar name={me?.display_name ?? ''} emoji={me?.emoji} url={me?.avatar_url} size={36} />
            </button>
            {menu && (
              <div className="menu" role="menu">
                <div className="menu-name">{me?.display_name}</div>
                <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); navigate('/profile'); }}>Go to Profile</button>
                <button role="menuitem" className="menu-item" onClick={() => { setMenu(false); navigate('/settings'); }}>Settings</button>
                <button role="menuitem" className="menu-item" onClick={() => supabase.auth.signOut()}>Sign out</button>
              </div>
            )}
          </div>
        </div>
      </header>

      {!online && <div className="offline-bar" role="alert">You are offline. Changes from others will appear when the connection returns.</div>}
      <InvitationBanner />
      <main id="main"><Outlet /></main>

      {quick && <EventFormModal onClose={() => setQuick(false)} onSaved={(ev, isNew) => isNew && setCreated(ev)} />}
      {created && (
        <Modal
          title="Event created"
          onClose={() => setCreated(null)}
          footer={
            <>
              <button className="btn" onClick={() => setCreated(null)}>Not now</button>
              <button className="btn btn-primary" onClick={() => { const e = created; setCreated(null); navigate(`/groups/${e.group_id}/events/${e.id}`); }}>View in group</button>
            </>
          }
        >
          <p><strong>{created.name}</strong> was added. Do you want to see it in the group screen?</p>
        </Modal>
      )}
    </>
  );
}

function InvitationBanner() {
  const { pendingForMe, groupsAll } = usePlan();
  const db = useDb();
  const run = useRun();
  if (!pendingForMe.length) return null;
  return (
    <div className="invite-banner" role="region" aria-label="Group invitations">
      {pendingForMe.map((i) => {
        const g = groupsAll.find((x) => x.id === i.group_id);
        return (
          <div key={i.id} className="invite-row">
            <span>You are invited to join <strong>{g ? `${g.emoji} ${g.name}` : 'a group'}</strong>.</span>
            <span className="row-gap">
              <button className="btn btn-primary btn-small" onClick={() => run(async () => { await db.rpc('respond_group_invite', { p_invite_id: i.id, p_accept: true }); await Promise.all((['events', 'activities', 'equipment', 'food', 'ingredients', 'manual_members', 'profiles'] as const).map((t) => db.refresh(t))); }, 'You joined the group')}>Accept</button>
              <button className="btn btn-small" onClick={() => run(() => db.rpc('respond_group_invite', { p_invite_id: i.id, p_accept: false }), 'Invitation declined')}>Decline</button>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** In-app reminder ~1h before an event starts (only if the user enabled it). */
function useReminders() {
  const { events, groups } = usePlan();
  const me = useMyProfile();
  const toast = useToast();
  const enabled = me?.prefs?.notify_reminders === true;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const mine = useRef(new Set<string>());
  mine.current = new Set(groups.map((g) => g.id));

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const now = Date.now();
      for (const e of eventsRef.current) {
        if (!mine.current.has(e.group_id)) continue;
        const start = new Date(e.starts_at).getTime();
        const key = `tanancal-reminded-${e.id}-${e.starts_at}`;
        if (start > now && start - now <= 60 * 60 * 1000) {
          try {
            if (sessionStorage.getItem(key)) continue;
            sessionStorage.setItem(key, '1');
          } catch { /* ignore */ }
          toast.push(`Starting soon: ${e.name}`, 'info');
        }
      }
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [enabled, toast]);
}
