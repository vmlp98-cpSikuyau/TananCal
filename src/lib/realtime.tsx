import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { REALTIME_TABLES, useMyProfile, type TableName } from './data';
import { useAuth } from '../features/auth/AuthProvider';
import { useToast } from '../components/Toast';
import type { Prefs } from './types';

const OnlineCtx = createContext(true);
export const useOnline = () => useContext(OnlineCtx);

/** Subscribes to Postgres changes, refreshes cached queries, shows an offline indicator, and raises opt-in notifications. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user, verified } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMyProfile();
  const [online, setOnline] = useState(true);

  // Latest prefs/user without re-subscribing on every change.
  const prefsRef = useRef<Prefs>({});
  prefsRef.current = me?.prefs ?? {};
  const emailRef = useRef('');
  emailRef.current = user?.email?.toLowerCase() ?? '';
  const uidRef = useRef('');
  uidRef.current = user?.id ?? '';

  useEffect(() => {
    if (!user || !verified) return;
    const timers = new Map<string, number>();
    const refresh = (t: TableName) => {
      window.clearTimeout(timers.get(t));
      timers.set(t, window.setTimeout(() => qc.invalidateQueries({ queryKey: [t] }), 150));
    };

    let wasDown = false;
    let channel = supabase.channel(`tanancal-${user.id}`);
    for (const table of REALTIME_TABLES) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        refresh(table);
        if (table === 'group_members') refresh('profiles');

        const row = (payload.new ?? {}) as Record<string, unknown>;
        const prefs = prefsRef.current;
        if (table === 'group_invites') {
          if (payload.eventType === 'INSERT' && String(row.email).toLowerCase() === emailRef.current && prefs.notify_invites !== false) {
            toast.push('You have a new group invitation.', 'info');
          }
          if (payload.eventType === 'UPDATE' && row.status === 'declined' && row.invited_by === uidRef.current && prefs.notify_declines !== false) {
            toast.push(`${String(row.email)} declined your invitation.`, 'info');
          }
        }
        if (table === 'events' && payload.eventType === 'INSERT' && row.created_by !== uidRef.current && prefs.notify_changes === true) {
          toast.push(`New event: ${String(row.name)}`, 'info');
        }
      });
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setOnline(true);
        if (wasDown) {
          wasDown = false;
          qc.invalidateQueries(); // resync after reconnect
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        wasDown = true;
        setOnline(false);
      }
    });

    const goOffline = () => { wasDown = true; setOnline(false); };
    const goOnline = () => qc.invalidateQueries();
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      supabase.removeChannel(channel);
    };
  }, [user, verified, qc, toast]);

  return <OnlineCtx.Provider value={online}>{children}</OnlineCtx.Provider>;
}
