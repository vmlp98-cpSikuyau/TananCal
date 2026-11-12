export type Role = 'owner' | 'admin' | 'member';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';
export type Visibility = 'public' | 'groups' | 'private';

export interface Prefs {
  notify_invites?: boolean;
  notify_declines?: boolean;
  notify_changes?: boolean;
  notify_reminders?: boolean;
}

export interface Profile {
  user_id: string;
  display_name: string;
  emoji: string | null;
  avatar_url: string | null;
  visibility: Visibility;
  prefs: Prefs;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  description: string;
  created_by: string | null;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  role: Role;
  display_name: string;
  joined_at: string;
}

export interface GroupInvite {
  id: string;
  group_id: string;
  email: string;
  status: InviteStatus;
  invited_by: string | null;
  created_at: string;
  responded_at: string | null;
  expires_at: string;
}

export interface ManualMember {
  id: string;
  group_id: string;
  name: string;
}

export interface Assignable {
  assignee_user_id: string | null;
  assignee_manual_id: string | null;
}

export interface EventRow {
  id: string;
  group_id: string;
  name: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  created_by: string | null;
}

export interface Activity {
  id: string;
  event_id: string;
  group_id: string;
  name: string;
  description: string;
  starts_at: string;
  ends_at: string;
  leader_user_id: string | null;
  leader_manual_id: string | null;
}

export interface Food extends Assignable {
  id: string;
  group_id: string;
  event_id: string | null;
  name: string;
  meal_at: string;
}

export interface Ingredient extends Assignable {
  id: string;
  food_id: string;
  group_id: string;
  name: string;
}

export interface Equipment extends Assignable {
  id: string;
  group_id: string;
  event_id: string | null;
  name: string;
  food_id: string | null;
  packed: boolean;
}

/** A person who can be assigned something: a real member or a manual one. */
export interface Person {
  key: string; // "u:<uuid>" | "m:<uuid>"
  name: string;
  userId?: string;
  manual?: boolean;
}
