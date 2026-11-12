import type { Assignable, Group, GroupMember, ManualMember, Person, Profile } from './types';

export function initial(name: string | undefined | null): string {
  const c = (name ?? '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

export function personKey(userId?: string | null, manualId?: string | null): string {
  if (userId) return `u:${userId}`;
  if (manualId) return `m:${manualId}`;
  return '';
}

export function splitPersonKey(key: string): { user: string | null; manual: string | null } {
  if (key.startsWith('u:')) return { user: key.slice(2), manual: null };
  if (key.startsWith('m:')) return { user: null, manual: key.slice(2) };
  return { user: null, manual: null };
}

export function memberName(m: GroupMember, profiles: Map<string, Profile>): string {
  return profiles.get(m.user_id)?.display_name || m.display_name || 'Member';
}

export function peopleOf(
  groupId: string,
  members: GroupMember[],
  manual: ManualMember[],
  profiles: Map<string, Profile>,
): Person[] {
  const real: Person[] = members
    .filter((m) => m.group_id === groupId)
    .map((m) => ({ key: `u:${m.user_id}`, name: memberName(m, profiles), userId: m.user_id }));
  const man: Person[] = manual
    .filter((m) => m.group_id === groupId)
    .map((m) => ({ key: `m:${m.id}`, name: m.name, manual: true }));
  return [...real, ...man].sort((a, b) => a.name.localeCompare(b.name));
}

export function personName(people: Person[], key: string): string {
  return people.find((p) => p.key === key)?.name ?? '';
}

export function assigneeKey(a: Assignable): string {
  return personKey(a.assignee_user_id, a.assignee_manual_id);
}

export function assigneePatch(key: string): Assignable {
  const { user, manual } = splitPersonKey(key);
  return { assignee_user_id: user, assignee_manual_id: manual };
}

export function errorMessage(e: unknown): string {
  if (!e) return 'Something went wrong.';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message;
  return m || 'Something went wrong.';
}

/** Stable accent colour per group, used on the calendar. */
const PALETTE = ['#B8936A', '#5B9BD5', '#7FB77E', '#D98E73', '#A98BD6', '#E0C04F', '#4FB3B3', '#D679A4'];
export function groupColor(groups: Group[], id: string): string {
  const idx = [...groups].sort((a, b) => a.created_at.localeCompare(b.created_at)).findIndex((g) => g.id === id);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length];
}

export function isValidEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}
