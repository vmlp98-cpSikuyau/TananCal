# TananCal

Keep every group in sync. Shared calendar, events, activities, equipment and food planning for friends, families, clubs and teams.

Vite + React + TypeScript on the front end; Supabase (Auth, Postgres + RLS, Realtime, Storage) as the only backend.

## Run locally

1. Create a Supabase project (or reuse a dedicated one) and run `supabase/migrations/20261111000000_init.sql` in the SQL editor
   (or `supabase db push` with the CLI).
2. `copy .env.local.example .env.local` and fill in the Project URL and the **publishable/anon** key. Never use the `service_role` key.
3. In Supabase → Authentication → URL Configuration, set Site URL to `http://localhost:5173` and add `http://localhost:5173/**` to Redirect URLs.
   For quick local testing you can turn off "Confirm email" under Providers → Email; keep it on for production.
4. `npm install` then `npm run dev` and open http://localhost:5173.

Other scripts: `npm run build`, `npm run typecheck`, `npm test`.

## Structure

```
src/features/{auth,profile,groups,events,equipment,food,calendar,overview,settings}
src/components   shared UI (Modal, Toast, Avatar, ExportDialog, …)
src/lib          supabase client, data hooks, realtime, utils, export
src/styles       tokens (navy/tan/cream, dark default), base, components
supabase/migrations   schema, RLS, RPCs, realtime, storage
```

## Security model (summary)

RLS is on every table. `group_members` and `group_invites` are read-only from the client; invites, role changes,
removals, leaving, ownership transfer and account deletion go through `security definer` RPCs. Unverified emails cannot read
group data. `anon` has no table access. Assignees must belong to the same group (composite foreign keys).
