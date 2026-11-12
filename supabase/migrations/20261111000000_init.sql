-- TananCal — initial schema, RLS, RPCs, realtime, storage.
-- Normalised tables (no JSONB blob) so concurrent edits to different items never collide.

-- ───────────────────────── utilities ─────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  emoji        text check (emoji is null or char_length(emoji) <= 16),
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 500),
  visibility   text not null default 'groups' check (visibility in ('public', 'groups', 'private')),
  prefs        jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Phone lives in its own table so it is readable only by its owner.
create table public.profile_contacts (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  phone      text check (phone is null or char_length(phone) <= 32),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger profile_contacts_updated before update on public.profile_contacts
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)), 80)
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── groups & membership ─────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 100),
  emoji       text not null default '📅' check (char_length(emoji) <= 16),
  description text not null default '' check (char_length(description) <= 1000),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.group_members (
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  display_name text not null default '',
  joined_at    timestamptz not null default now(),
  primary key (group_id, user_id)
);
create unique index group_members_one_owner on public.group_members (group_id) where role = 'owner';
create index group_members_user_idx on public.group_members (user_id);

create table public.group_invites (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  email        text not null check (char_length(email) <= 254),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  expires_at   timestamptz not null default (now() + interval '14 days')
);
create index group_invites_group_idx on public.group_invites (group_id);
create index group_invites_email_idx on public.group_invites (lower(email));
create unique index group_invites_one_pending on public.group_invites (group_id, lower(email)) where status = 'pending';

create table public.manual_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, group_id)
);
create index manual_members_group_idx on public.manual_members (group_id);

create trigger groups_updated before update on public.groups
  for each row execute function public.set_updated_at();

-- ───────────────────────── authorization helpers ─────────────────────────
create or replace function public.is_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_verified() and exists (
    select 1 from public.group_members m where m.group_id = gid and m.user_id = auth.uid());
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_verified() and exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

create or replace function public.is_group_owner(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_verified() and exists (
    select 1 from public.group_members m
    where m.group_id = gid and m.user_id = auth.uid() and m.role = 'owner');
$$;

create or replace function public.has_pending_invite(gid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_verified() and exists (
    select 1 from public.group_invites i
    where i.group_id = gid and i.status = 'pending' and i.expires_at > now()
      and lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.shares_group_with(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = uid);
$$;

-- The creator becomes the owner.
create or replace function public.handle_new_group()
returns trigger language plpgsql security definer set search_path = '' as $$
declare dn text;
begin
  select p.display_name into dn from public.profiles p where p.user_id = new.created_by;
  insert into public.group_members (group_id, user_id, role, display_name)
  values (new.id, new.created_by, 'owner', coalesce(dn, ''));
  return new;
end $$;

create trigger on_group_created after insert on public.groups
  for each row when (new.created_by is not null) execute function public.handle_new_group();

-- ───────────────────────── planning tables ─────────────────────────
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 200),
  description text not null default '' check (char_length(description) <= 4000),
  location    text not null default '' check (char_length(location) <= 200),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at >= starts_at),
  unique (id, group_id)
);
create index events_group_start_idx on public.events (group_id, starts_at);

create table public.activities (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null,
  group_id         uuid not null,
  name             text not null check (char_length(btrim(name)) between 1 and 200),
  description      text not null default '' check (char_length(description) <= 4000),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  leader_user_id   uuid,
  leader_manual_id uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (ends_at >= starts_at),
  check (leader_user_id is null or leader_manual_id is null),
  foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade,
  foreign key (group_id, leader_user_id) references public.group_members (group_id, user_id) on delete set null (leader_user_id),
  foreign key (leader_manual_id, group_id) references public.manual_members (id, group_id) on delete set null (leader_manual_id)
);
create index activities_event_idx on public.activities (event_id);
create index activities_group_idx on public.activities (group_id);

create table public.food (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null,
  event_id           uuid,
  name               text not null check (char_length(btrim(name)) between 1 and 200),
  meal_at            timestamptz not null,
  assignee_user_id   uuid,
  assignee_manual_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (assignee_user_id is null or assignee_manual_id is null),
  unique (id, group_id),
  foreign key (group_id) references public.groups (id) on delete cascade,
  foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade,
  foreign key (group_id, assignee_user_id) references public.group_members (group_id, user_id) on delete set null (assignee_user_id),
  foreign key (assignee_manual_id, group_id) references public.manual_members (id, group_id) on delete set null (assignee_manual_id)
);
create index food_group_meal_idx on public.food (group_id, meal_at);
create index food_event_idx on public.food (event_id);

create table public.ingredients (
  id                 uuid primary key default gen_random_uuid(),
  food_id            uuid not null,
  group_id           uuid not null,
  name               text not null check (char_length(btrim(name)) between 1 and 200),
  assignee_user_id   uuid,
  assignee_manual_id uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (assignee_user_id is null or assignee_manual_id is null),
  foreign key (food_id, group_id) references public.food (id, group_id) on delete cascade,
  foreign key (group_id, assignee_user_id) references public.group_members (group_id, user_id) on delete set null (assignee_user_id),
  foreign key (assignee_manual_id, group_id) references public.manual_members (id, group_id) on delete set null (assignee_manual_id)
);
create index ingredients_food_idx on public.ingredients (food_id);
create index ingredients_group_idx on public.ingredients (group_id);

create table public.equipment (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null,
  event_id           uuid,
  name               text not null check (char_length(btrim(name)) between 1 and 200),
  assignee_user_id   uuid,
  assignee_manual_id uuid,
  food_id            uuid,
  packed             boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (assignee_user_id is null or assignee_manual_id is null),
  foreign key (group_id) references public.groups (id) on delete cascade,
  foreign key (event_id, group_id) references public.events (id, group_id) on delete cascade,
  foreign key (food_id, group_id) references public.food (id, group_id) on delete set null (food_id),
  foreign key (group_id, assignee_user_id) references public.group_members (group_id, user_id) on delete set null (assignee_user_id),
  foreign key (assignee_manual_id, group_id) references public.manual_members (id, group_id) on delete set null (assignee_manual_id)
);
create index equipment_group_idx on public.equipment (group_id);
create index equipment_event_idx on public.equipment (event_id);
create index equipment_food_idx on public.equipment (food_id);

create trigger events_updated before update on public.events
  for each row execute function public.set_updated_at();
create trigger activities_updated before update on public.activities
  for each row execute function public.set_updated_at();
create trigger food_updated before update on public.food
  for each row execute function public.set_updated_at();
create trigger ingredients_updated before update on public.ingredients
  for each row execute function public.set_updated_at();
create trigger equipment_updated before update on public.equipment
  for each row execute function public.set_updated_at();

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles         enable row level security;
alter table public.profile_contacts enable row level security;
alter table public.groups           enable row level security;
alter table public.group_members    enable row level security;
alter table public.group_invites    enable row level security;
alter table public.manual_members   enable row level security;
alter table public.events           enable row level security;
alter table public.activities       enable row level security;
alter table public.food             enable row level security;
alter table public.ingredients      enable row level security;
alter table public.equipment        enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid())
         or visibility = 'public'
         or (visibility = 'groups' and public.shares_group_with(user_id)));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy contacts_all on public.profile_contacts for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy groups_select on public.groups for select to authenticated
  using (created_by = (select auth.uid()) or public.is_group_member(id) or public.has_pending_invite(id));
create policy groups_insert on public.groups for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_verified());
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_admin(id)) with check (public.is_group_admin(id));
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_group_owner(id));

-- group_members / group_invites: read-only from the client; writes go through RPCs.
create policy members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy invites_select on public.group_invites for select to authenticated
  using (public.is_group_admin(group_id)
         or (public.is_verified() and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))));

create policy manual_all on public.manual_members for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy events_all on public.events for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy activities_all on public.activities for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy food_all on public.food for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy ingredients_all on public.ingredients for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));
create policy equipment_all on public.equipment for all to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

-- ───────────────────────── RPCs (privileged actions) ─────────────────────────
create or replace function public.send_group_invite(p_group_id uuid, p_email text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only the owner or an admin can invite people.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'Enter a valid email address.';
  end if;
  if exists (
    select 1 from public.group_members m join auth.users u on u.id = m.user_id
    where m.group_id = p_group_id and lower(u.email) = v_email) then
    raise exception 'That person is already a member of this group.';
  end if;
  update public.group_invites set status = 'cancelled', responded_at = now()
   where group_id = p_group_id and lower(email) = v_email and status = 'pending' and expires_at <= now();
  if exists (select 1 from public.group_invites
             where group_id = p_group_id and lower(email) = v_email and status = 'pending') then
    raise exception 'A pending invitation for that email already exists.';
  end if;
  insert into public.group_invites (group_id, email, invited_by)
  values (p_group_id, v_email, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.respond_group_invite(p_invite_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.group_invites;
  dn text;
begin
  if not public.is_verified() then
    raise exception 'Verify your email address first.';
  end if;
  select * into inv from public.group_invites where id = p_invite_id for update;
  if not found or lower(inv.email) <> lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'Invitation not found.';
  end if;
  if inv.status <> 'pending' then
    raise exception 'This invitation has already been answered or cancelled.';
  end if;
  if inv.expires_at <= now() then
    update public.group_invites set status = 'cancelled', responded_at = now() where id = inv.id;
    raise exception 'This invitation has expired.';
  end if;
  if p_accept then
    select p.display_name into dn from public.profiles p where p.user_id = auth.uid();
    insert into public.group_members (group_id, user_id, role, display_name)
    values (inv.group_id, auth.uid(), 'member', coalesce(dn, ''))
    on conflict (group_id, user_id) do nothing;
    update public.group_invites set status = 'accepted', responded_at = now() where id = inv.id;
  else
    update public.group_invites set status = 'declined', responded_at = now() where id = inv.id;
  end if;
end $$;

create or replace function public.cancel_group_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare gid uuid;
begin
  select group_id into gid from public.group_invites where id = p_invite_id;
  if gid is null or not public.is_group_admin(gid) then
    raise exception 'Invitation not found.';
  end if;
  update public.group_invites set status = 'cancelled', responded_at = now()
   where id = p_invite_id and status = 'pending';
end $$;

create or replace function public.set_group_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the owner can change admin roles.';
  end if;
  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role.';
  end if;
  update public.group_members set role = p_role
   where group_id = p_group_id and user_id = p_user_id and role <> 'owner';
  if not found then
    raise exception 'Member not found or is the owner.';
  end if;
end $$;

create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare target text;
begin
  if not public.is_group_admin(p_group_id) then
    raise exception 'Only the owner or an admin can remove members.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'Use "Leave group" to remove yourself.';
  end if;
  select role into target from public.group_members where group_id = p_group_id and user_id = p_user_id;
  if target is null then
    raise exception 'Member not found.';
  end if;
  if target = 'owner' then
    raise exception 'The owner cannot be removed.';
  end if;
  if target = 'admin' and not public.is_group_owner(p_group_id) then
    raise exception 'Only the owner can remove an admin.';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end $$;

create or replace function public.leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r text;
begin
  select role into r from public.group_members where group_id = p_group_id and user_id = auth.uid();
  if r is null then
    raise exception 'You are not a member of this group.';
  end if;
  if r = 'owner' then
    raise exception 'Transfer ownership before leaving, or delete the group.';
  end if;
  delete from public.group_members where group_id = p_group_id and user_id = auth.uid();
end $$;

create or replace function public.transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Only the owner can transfer ownership.';
  end if;
  if p_new_owner = auth.uid() then
    raise exception 'You already own this group.';
  end if;
  if not exists (select 1 from public.group_members where group_id = p_group_id and user_id = p_new_owner) then
    raise exception 'The new owner must be a member of the group.';
  end if;
  update public.group_members set role = 'admin' where group_id = p_group_id and user_id = auth.uid();
  update public.group_members set role = 'owner' where group_id = p_group_id and user_id = p_new_owner;
end $$;

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;
  if exists (select 1 from public.group_members where user_id = auth.uid() and role = 'owner') then
    raise exception 'Transfer ownership of, or delete, the groups you own before deleting your account.';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- ───────────────────────── function privileges ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'is_verified()', 'is_group_member(uuid)', 'is_group_admin(uuid)', 'is_group_owner(uuid)',
    'has_pending_invite(uuid)', 'shares_group_with(uuid)',
    'send_group_invite(uuid,text)', 'respond_group_invite(uuid,boolean)', 'cancel_group_invite(uuid)',
    'set_group_member_role(uuid,uuid,text)', 'remove_group_member(uuid,uuid)', 'leave_group(uuid)',
    'transfer_group_ownership(uuid,uuid)', 'delete_my_account()'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Trigger-only functions must not be callable through the API.
revoke all on function public.handle_new_user()  from public, anon, authenticated;
revoke all on function public.handle_new_group() from public, anon, authenticated;
revoke all on function public.set_updated_at()   from public, anon, authenticated;

-- anon has no table access at all.
revoke all on all tables in schema public from anon;

-- ───────────────────────── realtime ─────────────────────────
alter publication supabase_realtime add table
  public.groups, public.group_members, public.group_invites, public.manual_members,
  public.events, public.activities, public.food, public.ingredients, public.equipment;

-- ───────────────────────── avatar storage ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
