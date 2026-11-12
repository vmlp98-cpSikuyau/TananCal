import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { useAuth } from '../features/auth/AuthProvider';
import { useToast } from '../components/Toast';
import { errorMessage, peopleOf } from './utils';
import type {
  Activity, Equipment, EventRow, Food, Group, GroupInvite, GroupMember, Ingredient, ManualMember, Person, Prefs, Profile, Role,
} from './types';

export type TableName =
  | 'groups' | 'group_members' | 'group_invites' | 'manual_members'
  | 'events' | 'activities' | 'food' | 'ingredients' | 'equipment' | 'profiles';

export const REALTIME_TABLES: TableName[] = [
  'groups', 'group_members', 'group_invites', 'manual_members', 'events', 'activities', 'food', 'ingredients', 'equipment',
];

function useTable<T>(table: TableName) {
  const { user, verified } = useAuth();
  return useQuery({
    queryKey: [table],
    enabled: Boolean(user && verified),
    queryFn: async () => {
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

const EMPTY: never[] = [];

/** Everything the signed-in user may see, plus derived lookups. RLS does the filtering server-side. */
export function usePlan() {
  const { user } = useAuth();
  const q = {
    groups: useTable<Group>('groups'),
    members: useTable<GroupMember>('group_members'),
    invites: useTable<GroupInvite>('group_invites'),
    manual: useTable<ManualMember>('manual_members'),
    events: useTable<EventRow>('events'),
    activities: useTable<Activity>('activities'),
    food: useTable<Food>('food'),
    ingredients: useTable<Ingredient>('ingredients'),
    equipment: useTable<Equipment>('equipment'),
    profiles: useTable<Profile>('profiles'),
  };

  const groupsAll = q.groups.data ?? EMPTY;
  const members = q.members.data ?? EMPTY;
  const invites = q.invites.data ?? EMPTY;
  const manual = q.manual.data ?? EMPTY;
  const profileList = q.profiles.data ?? EMPTY;
  const uid = user?.id;

  const profiles = useMemo(() => new Map(profileList.map((p) => [p.user_id, p])), [profileList]);
  const myGroupIds = useMemo(() => new Set(members.filter((m) => m.user_id === uid).map((m) => m.group_id)), [members, uid]);
  const groups = useMemo(
    () => groupsAll.filter((g) => myGroupIds.has(g.id)).sort((a, b) => a.name.localeCompare(b.name)),
    [groupsAll, myGroupIds],
  );

  const roleIn = useCallback(
    (groupId: string): Role | null => members.find((m) => m.group_id === groupId && m.user_id === uid)?.role ?? null,
    [members, uid],
  );
  const people = useCallback(
    (groupId: string): Person[] => peopleOf(groupId, members, manual, profiles),
    [members, manual, profiles],
  );

  const myEmail = user?.email?.toLowerCase() ?? '';
  const pendingForMe = useMemo(
    () => invites.filter((i) => i.status === 'pending' && i.email.toLowerCase() === myEmail && new Date(i.expires_at) > new Date()),
    [invites, myEmail],
  );

  const loading = Object.values(q).some((x) => x.isLoading);
  const error = Object.values(q).find((x) => x.error)?.error ?? null;

  return {
    loading, error, groupsAll, groups, members, invites, manual, profiles, myGroupIds, pendingForMe, roleIn, people,
    events: q.events.data ?? EMPTY,
    activities: q.activities.data ?? EMPTY,
    food: q.food.data ?? EMPTY,
    ingredients: q.ingredients.data ?? EMPTY,
    equipment: q.equipment.data ?? EMPTY,
    uid,
  };
}

/** Insert / update / delete helpers that throw on error and refresh the affected query. */
export function useDb() {
  const qc = useQueryClient();
  return useMemo(() => {
    const refresh = (t: TableName) => qc.invalidateQueries({ queryKey: [t] });
    return {
      async insert<T extends object>(table: TableName, row: T | T[]) {
        const { data, error } = await supabase.from(table).insert(row as never).select();
        if (error) throw error;
        await refresh(table);
        return (data ?? []) as Record<string, unknown>[];
      },
      async update(table: TableName, id: string, patch: object) {
        const { error } = await supabase.from(table).update(patch as never).eq('id', id);
        if (error) throw error;
        await refresh(table);
      },
      async remove(table: TableName, id: string) {
        const { error } = await supabase.from(table).delete().eq('id', id);
        if (error) throw error;
        await refresh(table);
      },
      async rpc(fn: string, args: Record<string, unknown>) {
        const { data, error } = await supabase.rpc(fn, args);
        if (error) throw error;
        await Promise.all((['groups', 'group_members', 'group_invites'] as TableName[]).map(refresh));
        return data;
      },
      refresh,
    };
  }, [qc]);
}

/** Runs an async action, toasting success or the error. Returns true on success. */
export function useRun() {
  const toast = useToast();
  return useCallback(
    async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
      try {
        await fn();
        if (success) toast.push(success, 'success');
        return true;
      } catch (e) {
        toast.push(errorMessage(e), 'error');
        return false;
      }
    },
    [toast],
  );
}

export function useMyProfile(): Profile | null {
  const { user } = useAuth();
  const { profiles } = usePlan();
  if (!user) return null;
  return (
    profiles.get(user.id) ?? {
      user_id: user.id,
      display_name: (user.user_metadata?.display_name as string) || user.email?.split('@')[0] || '',
      emoji: null,
      avatar_url: null,
      visibility: 'groups',
      prefs: {} as Prefs,
    }
  );
}
