# TananCal — Software Requirements Specification (SRS)

Version 1.0 · 2026-11-11 · Status: Draft for a ground-up rebuild on Supabase

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for **TananCal**, a shared group-planning web application. It captures (a) the idea and product vision, (b) what the existing prototype already does, and (c) what a clean rebuild on Supabase must do, including user accounts, invitations, and secure shared data.

### 1.2 The idea
> **"Keep every group in sync."**
> Friends, families, clubs and teams plan together in one place. A *group* has a shared calendar of events. Each event can have activities, equipment that someone must bring, and food/meals with ingredients, and each of those can be assigned to a member. Everyone sees the same plan, live.

Typical use cases: a weekend camping trip (who brings the tent, who cooks Saturday dinner), a family reunion, a sports season, a club retreat.

### 1.3 Scope
In scope: account registration/sign-in, groups, membership and invitations, events/activities/equipment/food planning, calendar views, profile and settings, data export, realtime sync, responsive web UI.
Out of scope for v1: native mobile apps, payments, chat/messaging, third-party calendar sync (Google/iCal import), file/photo uploads, push notifications (listed as future work).

### 1.4 Definitions
| Term | Meaning |
|---|---|
| Group | A shared workspace with members and a plan |
| Owner | The user who created the group; full control |
| Admin | A member the owner promoted; can invite/remove members and edit group details |
| Member | Can view and edit the group's shared plan |
| Manual member | A named person in a group without an account (e.g. a child), used for assignments |
| Event | A dated item on the group calendar |
| Activity | A scheduled sub-item inside an event |
| RLS | PostgreSQL Row Level Security |

### 1.5 Current state (analysis of the existing code)
The prototype is a static site (HTML/CSS/vanilla JS, no build step) using Supabase for auth, storage and realtime.

| Area | Existing implementation |
|---|---|
| Files | `index.html`, `css/` (tokens, base, responsive, auth), `js/` (state, utils, auth, cloud, modals, pages, export, bind, main), `config.js`, `supabase-setup.sql` |
| Auth | Supabase email + password; sign-in / create-account toggle on one screen; display name captured on sign-up |
| Pages | Overview, Groups (with tabs Events / Equipment / Food / Members), Calendar (month and week views), Profile, Settings (theme) |
| Planning | Events with start/end; activities within events; equipment assigned to a member; food with meal time, assigned member, ingredients; manual members |
| Collaboration | Invite by email; invitee accepts/declines from a banner; owner/admin roles; remove members; realtime refresh |
| Export | JSON backup, CSV exports |
| Data model | `groups`, `group_members`, `group_invites`, and **`group_content` — one JSONB blob per group** holding all events, equipment, food and manual members |
| Security | RLS on all tables; helper functions `is_group_member/admin/owner`; RPCs `send_group_invite`, `respond_group_invite`, `set_group_member_role`, `remove_group_member`; a trigger makes the creator the owner |
| Local state | Whole app state also cached in `localStorage` |

**Known weaknesses to fix in the rebuild**
1. The JSONB blob is synced as a whole: two people editing at once overwrite each other (last write wins) and nothing can be queried or permissioned per item.
2. App state lives in global variables; the code is split into files but not into modules.
3. Profile data (phone, emoji, visibility) is local only and not stored per account.
4. No password reset, email-verification handling or account deletion flow.
5. Output is built with string-concatenated HTML (higher XSS risk, hard to test).
6. No automated tests, no migrations history, no environment separation.

---

## 2. Overall Description

### 2.1 Product perspective
A browser-based single-page application talking directly to Supabase (Auth, Postgres, Realtime). There is no custom server in v1; all authorization is enforced in the database through RLS and RPC functions.

```
 Browser (SPA)  ──HTTPS──►  Supabase
   UI / state                ├─ Auth (email+password, JWT)
   supabase-js               ├─ Postgres + RLS + RPC functions
                             └─ Realtime (row change events)
```

### 2.2 User classes
| Class | Description |
|---|---|
| Visitor | Not signed in; may only see the sign-in / register screen |
| Member | Signed in; belongs to ≥1 group |
| Admin | Member with invite/remove rights |
| Owner | Creator of a group; can delete it and manage admins |
| Invitee | Signed-in user with a pending invitation |

### 2.3 Operating environment
Modern evergreen browsers (Chrome, Edge, Firefox, Safari) on desktop and mobile; hosted as static files (Vercel, Netlify or Supabase-adjacent static hosting); Supabase free tier is sufficient for launch.

### 2.4 Constraints & assumptions
- Only the **publishable/anon key** may ship to the browser; the `service_role` key must never be exposed.
- All data access control must be enforced by RLS, never by client code alone.
- Users have internet access (the app is online-first).
- Email delivery uses Supabase's built-in mailer for dev; a custom SMTP provider is required for production volume.

---

## 3. Functional Requirements

Priority: **M** = must (v1), **S** = should, **C** = could (later).

### 3.1 Accounts & authentication
| ID | Requirement | P |
|---|---|---|
| FR-A1 | A visitor can create an account with email, password (min 8 chars) and display name | M |
| FR-A2 | A user can sign in with email and password and sign out | M |
| FR-A3 | The system sends an email-verification link; unverified users cannot access group data | M |
| FR-A4 | A user can request a password-reset email and set a new password | M |
| FR-A5 | A profile row is created automatically for every new auth user (DB trigger) | M |
| FR-A6 | A user can edit display name, avatar emoji, phone (optional) and profile visibility | M |
| FR-A7 | A user can change their email and password while signed in | S |
| FR-A8 | A user can delete their account; owned groups must be transferred or deleted first | S |
| FR-A9 | Sessions persist across reloads and refresh tokens automatically | M |
| FR-A10 | Sign-in with Google/Apple (OAuth) | C |
| FR-A11 | Show clear errors (wrong password, existing email, weak password, rate limited) | M |

### 3.2 Groups
| ID | Requirement | P |
|---|---|---|
| FR-G1 | A signed-in user can create a group with name (1–100 chars), emoji and description | M |
| FR-G2 | The creator automatically becomes the owner (trigger) | M |
| FR-G3 | A user sees only groups they belong to (plus groups with a pending invite for them) | M |
| FR-G4 | Owner/admin can edit group name, emoji and description | M |
| FR-G5 | Only the owner can delete a group; deletion cascades to all its data after a confirmation step | M |
| FR-G6 | A member can leave a group (the owner cannot leave without transferring ownership) | S |
| FR-G7 | Owner can transfer ownership to another member | S |

### 3.3 Membership & invitations
| ID | Requirement | P |
|---|---|---|
| FR-M1 | Owner/admin can invite a person by email | M |
| FR-M2 | An invitee who signs up or signs in with that email sees a banner to accept or decline | M |
| FR-M3 | Accepting adds the user as a member; declining records the response | M |
| FR-M4 | Owner/admin can cancel a pending invite | M |
| FR-M5 | Duplicate pending invites and inviting existing members are rejected with a clear message | M |
| FR-M6 | Only the owner can promote a member to admin or demote an admin | M |
| FR-M7 | Owner/admin can remove ordinary members; admins cannot remove the owner or other admins | M |
| FR-M8 | Any member can add *manual members* (named people without accounts) for assignment purposes | M |
| FR-M9 | Shareable invite link / code (no email needed) | C |
| FR-M10 | Invitations expire after 14 days | S |

### 3.4 Planning (events, activities, equipment, food)
| ID | Requirement | P |
|---|---|---|
| FR-P1 | Any member can create, edit and delete **events**: name, description, location, start, end | M |
| FR-P2 | An event can contain **activities** with name, start, end and notes | M |
| FR-P3 | Any member can add **equipment** items with an assignee (member or manual member) and a packed/not-packed status | M |
| FR-P4 | Equipment may be linked to a food item (e.g. "pan" for "pancakes") | S |
| FR-P5 | Any member can add **food** items with meal date/time, assignee and an **ingredient** list (each ingredient optionally assigned) | M |
| FR-P6 | Assignees can be real members or manual members | M |
| FR-P7 | Validation: end ≥ start; required fields present; text length limits | M |
| FR-P8 | Event detail view shows its activities, linked equipment and food | M |
| FR-P9 | Comments or notes thread per event | C |
| FR-P10 | Recurring events | C |
| FR-P11 | Attendance RSVP (going / maybe / no) per event | S |

### 3.5 Calendar & overview
| ID | Requirement | P |
|---|---|---|
| FR-C1 | Calendar page with **month** and **week** views, previous/next/today navigation | M |
| FR-C2 | Calendar can show events from all groups, colour-coded or labelled by group, and filter by group | M |
| FR-C3 | Clicking an event opens its detail view | M |
| FR-C4 | Overview page shows the next upcoming events across groups and quick stats (groups, events) | M |
| FR-C5 | A quick-add control creates an event from any page | M |
| FR-C6 | Day view / agenda list | C |

### 3.6 Realtime collaboration
| ID | Requirement | P |
|---|---|---|
| FR-R1 | Changes by one member appear for other open sessions within ~2 seconds without reload | M |
| FR-R2 | Membership and invitation changes also propagate live | M |
| FR-R3 | Concurrent edits to *different* items must never overwrite each other (requires per-item rows, see §5) | M |
| FR-R4 | On connection loss the UI shows an offline indicator and recovers/resyncs on reconnect | S |

### 3.7 Settings, export & misc
| ID | Requirement | P |
|---|---|---|
| FR-S1 | Light and dark theme, remembered per user/device | M |
| FR-S2 | Export a group as JSON backup and CSV (events, equipment, food) | S |
| FR-S3 | Toast notifications for actions and errors | M |
| FR-S4 | Email or in-app reminders before events | C |
| FR-S5 | Import a previous JSON backup | C |

---

## 4. External Interface Requirements

### 4.1 User interface
- Dark navy/tan/cream brand theme (current tokens: navy `#0B1E36`, tan `#B8936A`, cream `#EFE3D3`), Roboto font, light and dark modes.
- Top bar with logo, navigation (Overview, Groups, Calendar, Profile, Settings), quick-add and avatar.
- Sign-in / register as a full-screen gate; invitation banner at top of app; modal dialogs for all create/edit forms.
- Responsive: usable from 360 px phones to desktop; nav collapses and scrolls on small screens.
- Accessibility target: WCAG 2.1 AA (labels on inputs, focus management in modals, colour contrast, keyboard operable).

### 4.2 Software interfaces
- **Supabase Auth** (email/password; later OAuth).
- **Supabase Postgres** via PostgREST and RPC (`supabase-js` v2).
- **Supabase Realtime** (postgres_changes) for live updates.
- Configuration through `config.js` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`); in a build-based rebuild, via `.env` / `import.meta.env`.

### 4.3 Communications
HTTPS/WSS only. Auth emails via Supabase SMTP.

---

## 5. Data Requirements (target model)

The rebuild **replaces the single JSONB blob with normalized tables** so items can be edited concurrently, queried, and secured individually.

```
auth.users (Supabase)
   │1
   ├──1 profiles(user_id PK, display_name, emoji, phone, visibility, created_at)
   │
groups(id, name, emoji, description, created_by, created_at)
   ├──* group_members(group_id, user_id, role[owner|admin|member], display_name, joined_at)  PK(group_id,user_id)
   ├──* group_invites(id, group_id, email, status[pending|accepted|declined|cancelled], invited_by, created_at, responded_at, expires_at)
   ├──* manual_members(id, group_id, name)
   ├──* events(id, group_id, name, description, location, starts_at, ends_at, created_by, created_at, updated_at)
   │      └──* activities(id, event_id, name, starts_at, ends_at, notes)
   ├──* equipment(id, group_id, event_id?, name, assignee_user_id?, assignee_manual_id?, food_id?, packed, created_at)
   └──* food(id, group_id, event_id?, name, meal_at, assignee_user_id?, assignee_manual_id?)
          └──* ingredients(id, food_id, name, assignee_user_id?, assignee_manual_id?)
```

Rules:
- All primary keys are `uuid` (`gen_random_uuid()`); every table has `created_at`; mutable tables have `updated_at` maintained by trigger.
- `on delete cascade` from `groups` to all children; deleting an auth user removes memberships.
- An assignee is *either* a user or a manual member, never both (check constraint).
- Index on foreign keys, `(group_id, starts_at)` for events, and `lower(email)` for invites.
- Schema managed with **versioned migrations** (Supabase CLI), not a one-off script.

### 5.1 Security model (RLS)
| Table | Read | Write |
|---|---|---|
| profiles | own row; others only if visibility allows | own row |
| groups | members + invitees | insert: any signed-in user (own `created_by`); update: owner/admin; delete: owner |
| group_members | members of the same group | via RPC only (invite accept, role change, remove) |
| group_invites | admins of group; invitee by email claim | via RPC only |
| events, activities, equipment, food, ingredients, manual_members | members of the group | members of the group |

Helper functions `is_group_member / is_group_admin / is_group_owner` are `security definer`, execute granted to `authenticated` only. Invitation and role changes go through RPCs so privilege rules cannot be bypassed from the client. `anon` has no access to any table.

---

## 6. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Security | RLS enabled on every table; no `service_role` key in client; secrets only in env |
| NFR-2 | Security | Escape/sanitise all user text rendered into the DOM (prevent XSS); prefer `textContent` or a templating library |
| NFR-3 | Security | Passwords handled only by Supabase Auth; enforce min length 8; rate-limit auth endpoints; CAPTCHA optional |
| NFR-4 | Privacy | Only email, display name and optional phone stored; users can export and delete their data |
| NFR-5 | Performance | First meaningful paint < 2 s on 4G; list queries < 300 ms for groups with 500 events; realtime latency < 2 s |
| NFR-6 | Scalability | Fits Supabase free tier for ≲ 500 users; schema and indexes support growth to tens of thousands of rows per group set |
| NFR-7 | Reliability | Optimistic UI with rollback on failure; no silent data loss; clear error toasts |
| NFR-8 | Usability | Core task (create event) in ≤ 3 interactions; consistent form patterns |
| NFR-9 | Compatibility | Last 2 versions of Chrome, Edge, Firefox, Safari; iOS Safari and Android Chrome |
| NFR-10 | Maintainability | Modular code (ES modules or framework components), one responsibility per file, linting + formatting (ESLint/Prettier), no business logic in markup |
| NFR-11 | Testability | Unit tests for utilities/state, integration tests for RLS (pgTAP or SQL tests), E2E smoke tests (Playwright) |
| NFR-12 | Accessibility | WCAG 2.1 AA |
| NFR-13 | Observability | Client error logging; Supabase logs/advisors reviewed before launch |

---

## 7. Recommended Architecture for the Rebuild

| Concern | Recommendation |
|---|---|
| Front end | Vite + a small framework (React or Svelte) **or** vanilla ES modules; TypeScript preferred |
| Structure | `src/features/{auth,groups,events,food,equipment,calendar,profile}`, `src/lib/supabase.ts`, `src/components`, `src/styles` |
| State | One store per feature; server state cached (e.g. TanStack Query) with realtime invalidation |
| Backend | Supabase only: migrations in `supabase/migrations`, RPCs for privileged actions |
| Config | `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| Hosting | Vercel/Netlify for static build; Supabase project for backend; separate dev and prod projects |
| CI | Lint, type-check, tests, and migration check on every push |

---

## 8. Setup & Deployment Requirements (Supabase)

1. Create a Supabase project; copy Project URL and anon/publishable key.
2. Apply migrations (tables, triggers, RLS, RPCs).
3. Auth settings: enable email provider; set **Site URL** and **Redirect URLs** to the hosted address and `http://localhost:*` for dev; enable email confirmation for production; configure custom SMTP.
4. Enable Realtime on the planning tables.
5. Add the env vars to the host; deploy the static build.
6. Run Supabase security and performance advisors; fix all warnings before launch.

---

## 9. Acceptance Criteria (v1)

1. A new visitor can register, verify their email, sign in, reset a forgotten password and sign out.
2. A user creates a group, invites a second user by email; the second user accepts and sees the group.
3. Both users add events, activities, equipment and food; each sees the other's changes live, and simultaneous edits to different items are not lost.
4. A user who is not a member cannot read or write any row of that group (verified by RLS tests).
5. Only the owner can delete a group or change admin roles; admins can invite/remove ordinary members.
6. Calendar month/week views show events from the selected groups.
7. The app works on a 375 px-wide phone and on desktop, in light and dark themes.
8. No secret keys appear in the shipped client code.

---

## 10. Roadmap

| Phase | Deliverable |
|---|---|
| 0 | Supabase project, migrations, RLS tests |
| 1 | Auth (register, verify, sign in, reset), profiles |
| 2 | Groups, membership, invitations |
| 3 | Events and calendar with realtime |
| 4 | Activities, equipment, food, ingredients, assignments |
| 5 | Export, settings, accessibility and polish |
| 6 | Reminders/notifications, invite links, OAuth, offline support |

## 11. Open Questions
1. Should users be able to belong to unlimited groups, and should groups be public/discoverable?
2. Is a framework (React/Svelte) acceptable, or must it stay dependency-free vanilla JS?
3. Do you want reminders by email, push, or both?
4. Should equipment/food always belong to an event, or can they exist at group level?
