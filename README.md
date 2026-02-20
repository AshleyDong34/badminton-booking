# EUBC Badminton Signup

Next.js app for EUBC badminton session booking, waitlists, admin operations, and Club Champs tournament management.

## What the website does right now

### Public site

- `/`: Shows upcoming sessions grouped by day, booking counts, waitlist counts, refresh button, and bulletin popups (Club rules + Useful info).
- `/sessions/[id]`: Booking form with live availability, membership/taster checks, waitlist fallback, and confirmation email trigger.
- `/cancel?token=...`: Cancels a booking from email link and auto-promotes next waitlisted player when applicable.
- `/club-champs`, `/club-champs/pairings`, `/club-champs/pools`, `/club-champs/knockout`: Public tournament views (only visible when enabled in settings).

### Admin site

- `/signin`: Magic-link admin login (restricted to pending/current admin emails).
- `/admin`: Dashboard with session capacity and waitlist overview.
- `/admin/sessions`: Create/manage sessions, split upcoming/past sessions, export attendance for selected past sessions.
- `/admin/sessions/[id]`: Move people between signed up/waitlist, remove signups.
- `/admin/sessions/[id]/attendance`: Mark attendance per player.
- `/admin/settings`: Weekly quota, same-day multi-booking, booking window, public visibility toggles, bulletin content.
- `/admin/whitelist`: Upload membership list via CSV/XLSX (email/student id).
- `/admin/first-time`: Manage first-time (taster) records.
- `/admin/admins`: Invite/remove admins.
- `/admin/club-champs/*`: 6-step tournament workflow (pair entries, seeding, pools, knockout setup, knockout matches, export/finalize/reset).

## Stack

- Next.js 16 (App Router), React 19, TypeScript
- Supabase (Auth + Postgres)
- Tailwind CSS 4
- Resend API (transactional emails)
- ExcelJS (exports/import parsing)

## Environment variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

RESEND_API_KEY=...
RESEND_FROM=...

# Optional but recommended for correct redirect/cancel links
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# or
SITE_URL=https://eubcbadminton.co.uk
```

## Supabase prerequisites

This app expects these tables:

- `settings`
- `sessions`
- `signups`
- `student_whitelist`
- `first_time_signups`
- `admins`
- `pending_admin_emails`
- `club_champs_pairs`
- `club_champs_pool_matches`
- `club_champs_knockout_matches`

And these RPC functions:

- `insert_signup_guarded`
- `cancel_signup_by_token`

Important: schema/migrations are not included in this repo, so your Supabase project must already have these objects.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Notes

- Admin routes are protected by middleware + server-side admin checks.
- Club Champs public pages are hidden unless `club_champs_public_enabled` is true.
- Session booking visibility can be disabled globally via settings.
